"use client";

// Speak instead of type. In the Android app this uses the phone's own speech
// recognizer (through a Capacitor plugin); in a browser it uses the Web Speech
// API where the browser has one (Chrome, Edge, Safari). The words go into the
// text box so you can fix them before sending.

import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNative } from "@/lib/native";
import { explainFirst } from "@/lib/rationale";

export interface Dictation {
  /** Stop listening. Whatever was heard so far is kept. */
  stop: () => void;
}

export interface DictationHandlers {
  /** Everything heard in this listening session so far (replaces the last call). */
  onText: (text: string) => void;
  /** Listening ended, by itself or after stop(). */
  onEnd: () => void;
  /** Plain-language reason it couldn't listen. onEnd still follows. */
  onError: (message: string) => void;
}

// Minimal Web Speech API types (not in TypeScript's DOM library yet).
interface WebResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<WebResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type WebRecognitionCtor = new () => WebRecognition;

function webCtor(): WebRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: WebRecognitionCtor; webkitSpeechRecognition?: WebRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this phone or browser can turn speech into text. */
export async function canDictate(): Promise<boolean> {
  if (isNative()) {
    try {
      return (await NativeSpeech.available()).available;
    } catch {
      return false;
    }
  }
  return webCtor() !== null;
}

const lang = () => (typeof navigator !== "undefined" && navigator.language) || "en-US";

/** Start listening. Returns null if it couldn't start (onError has said why). */
export async function startDictation(h: DictationHandlers): Promise<Dictation | null> {
  return isNative() ? startNative(h) : startWeb(h);
}

async function startNative(h: DictationHandlers): Promise<Dictation | null> {
  try {
    let perm = await NativeSpeech.checkPermissions();
    if (perm.speechRecognition === "prompt" || perm.speechRecognition === "prompt-with-rationale") {
      if (!(await explainFirst("microphone"))) {
        h.onEnd();
        return null;
      }
    }
    if (perm.speechRecognition !== "granted") perm = await NativeSpeech.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      h.onError("Ironlog needs the microphone to hear you. Allow it in your phone's settings, or type instead.");
      h.onEnd();
      return null;
    }
  } catch {
    h.onError("Voice input isn't available on this phone. Type instead.");
    h.onEnd();
    return null;
  }

  const handles: PluginListenerHandle[] = [];
  let ended = false;
  let heard = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(grace);
    handles.forEach((x) => x.remove().catch(() => {}));
    if (!heard) h.onError("Didn't catch that. Tap the mic and try again.");
    h.onEnd();
  };

  handles.push(
    await NativeSpeech.addListener("partialResults", ({ matches }) => {
      const text = matches?.[0]?.trim();
      if (!text) return;
      heard = true;
      h.onText(text);
    }),
    // The phone says "stopped" a moment before it sends its final words.
    await NativeSpeech.addListener("listeningState", ({ status }) => {
      if (status === "stopped") grace = setTimeout(finish, 800);
    }),
  );

  // With partial results on, start() resolves as soon as listening begins and
  // the words arrive through the "partialResults" listener above.
  NativeSpeech.start({ language: lang(), partialResults: true, popup: false }).catch(() => finish());

  return {
    stop: () => {
      NativeSpeech.stop().catch(() => {});
      clearTimeout(grace);
      grace = setTimeout(finish, 800);
    },
  };
}

function startWeb(h: DictationHandlers): Dictation | null {
  const Ctor = webCtor();
  if (!Ctor) {
    h.onError("This browser can't listen. Type instead, or use your keyboard's mic.");
    h.onEnd();
    return null;
  }
  const r = new Ctor();
  r.lang = lang();
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    if (text.trim()) h.onText(text.trim());
  };
  r.onerror = (e) => {
    if (e.error === "aborted") return;
    h.onError(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Ironlog needs the microphone to hear you. Allow it for this site, or type instead."
        : e.error === "no-speech"
          ? "Didn't catch that. Tap the mic and try again."
          : "Voice input stopped. Tap the mic to try again, or type instead.",
    );
  };
  r.onend = () => h.onEnd();
  try {
    r.start();
  } catch {
    h.onError("Voice input isn't available right now. Type instead.");
    h.onEnd();
    return null;
  }
  return { stop: () => r.stop() };
}
