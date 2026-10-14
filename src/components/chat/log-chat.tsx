"use client";

// Log a workout by telling Claude about it, typed or spoken. Each message goes
// to the same import-workout Edge Function as a photo import, with the whole
// chat so far, so later messages can add to or correct earlier ones. Claude
// answers with what it understood; you check it on the same review screen as
// an import before anything is saved.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ClipboardCheck, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { Review, Saved, showWeight, toDraft, type Draft } from "@/components/import/import-screen";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useSlot } from "@/hooks/use-slot";
import { canDictate, startDictation, type Dictation } from "@/lib/speech";
import type { UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";
import { listExercises, readWorkout, type ImportedWorkout } from "@/lib/workout-api";

interface Message {
  id: number;
  from: "you" | "claude";
  text: string;
  workout?: ImportedWorkout;
}

const GREETING =
  "Tell me what you did and I'll log it. For example: “Squat 3x5 at 225, bench 185 for 8, 8 and 7, then rows 4x10 at 135.” You can add or fix things in another message, and you'll check it all before it's saved.";

let nextId = 1;
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The chat as one text: a single message as is, several numbered so Claude reads them in order. */
export function chatText(said: string[]): string {
  return said.length === 1 ? said[0] : said.map((t, i) => `Message ${i + 1}: ${t}`).join("\n");
}

export function LogChat() {
  const { unit } = useAuth();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: "claude", text: GREETING }]);
  const [step, setStep] = useState<"chat" | "review" | "saved">("chat");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftFor, setDraftFor] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const latest = [...messages].reverse().find((m) => m.workout);

  function review() {
    if (!latest?.workout) return;
    // Going back to the chat and straight into review again keeps your edits.
    if (draftFor !== latest.id || !draft) {
      setDraft(toDraft(latest.workout, unit));
      setDraftFor(latest.id);
    }
    setStep("review");
  }

  function reset() {
    setMessages([{ id: 0, from: "claude", text: GREETING }]);
    setDraft(null);
    setDraftFor(null);
    setSavedId(null);
    setStep("chat");
  }

  if (step === "saved") return <Saved onAnother={reset} sessionId={savedId} anotherLabel="Log another" />;
  if (step === "review" && draft && latest?.workout) {
    return (
      <Review
        draft={draft}
        setDraft={setDraft}
        unit={unit}
        sourceUnit={latest.workout.source_unit}
        onBack={() => setStep("chat")}
        onSaved={(id) => {
          setSavedId(id);
          setStep("saved");
        }}
      />
    );
  }
  return <Chat messages={messages} setMessages={setMessages} unit={unit} latestId={latest?.id ?? null} onReview={review} />;
}

function Chat({
  messages,
  setMessages,
  unit,
  latestId,
  onReview,
}: {
  messages: Message[];
  setMessages: (fn: (m: Message[]) => Message[]) => void;
  unit: UnitSystem;
  latestId: number | null;
  onReview: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const dictation = useRef<Dictation | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const slot = useSlot("bottom-bar-slot");

  useEffect(() => {
    canDictate().then(setVoice).catch(() => {});
    listExercises()
      .then((list) => setNames(new Map(list.map((e) => [e.id, e.name]))))
      .catch(() => {});
    return () => dictation.current?.stop();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  async function send() {
    const said = text.trim();
    if (!said || busy) return;
    dictation.current?.stop();
    const all = [...messages.filter((m) => m.from === "you").map((m) => m.text), said];
    setMessages((m) => [...m, { id: nextId++, from: "you", text: said }]);
    setText("");
    setVoiceError(null);
    setBusy(true);
    try {
      const workout = await readWorkout({ images: [], text: chatText(all), today: localDate(new Date()) });
      setMessages((m) => [...m, { id: nextId++, from: "claude", text: "", workout }]);
    } catch (e) {
      const msg = (e as Error).message;
      setMessages((m) => [
        ...m,
        {
          id: nextId++,
          from: "claude",
          text: msg.startsWith("Couldn't find any sets")
            ? "I couldn't find any sets in that. Tell me each exercise with its weight and reps, like “bench 185 for 8, 8 and 7”."
            : msg,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (listening) {
      dictation.current?.stop();
      return;
    }
    setVoiceError(null);
    const before = text.trim();
    setListening(true);
    dictation.current = await startDictation({
      onText: (heard) => setText(before ? `${before} ${heard}` : heard),
      onError: setVoiceError,
      onEnd: () => {
        setListening(false);
        dictation.current = null;
      },
    });
  }

  const composer = (
    <div className="mx-auto max-w-md px-3 pb-2">
      {voiceError && (
        <p className="glass-strong text-set-warmup mb-2 rounded-2xl px-4 py-2 text-sm" role="status">
          {voiceError}
        </p>
      )}
      <form
        className="glass-strong flex items-end gap-2 rounded-3xl p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {voice && (
          <Button
            type="button"
            variant={listening ? "destructive" : "secondary"}
            size="icon"
            className="shrink-0 rounded-full"
            onClick={toggleMic}
            aria-label={listening ? "Stop listening" : "Speak your workout"}
            aria-pressed={listening}
          >
            {listening ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
          </Button>
        )}
        <label className="sr-only" htmlFor="log-chat-input">
          Your workout
        </label>
        <textarea
          id="log-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends on a keyboard; Shift+Enter adds a line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={Math.min(4, Math.max(1, text.split("\n").length, Math.ceil(text.length / 34)))}
          maxLength={4000}
          placeholder={listening ? "Listening…" : "Tell Claude your workout"}
          className="placeholder:text-muted-foreground max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
        />
        <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={!text.trim() || busy} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp className="size-5" />}
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/workout/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Tell Claude</h1>
          <p className="text-muted-foreground text-xs">Type or speak a workout you finished.</p>
        </div>
      </header>

      <ol className="flex flex-col gap-3" aria-label="Chat" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex", m.from === "you" ? "justify-end" : "justify-start")}>
            {m.from === "you" ? (
              <p className="bg-primary text-primary-foreground max-w-[85%] rounded-3xl rounded-br-md px-4 py-2.5 text-base whitespace-pre-wrap">
                {m.text}
              </p>
            ) : (
              <div className="glass max-w-[92%] rounded-3xl rounded-bl-md px-4 py-3" data-testid="claude-message">
                <p className="text-ai mb-1 flex items-center gap-1 text-xs font-semibold">
                  <Sparkles className="size-3.5" aria-hidden /> Claude
                </p>
                {m.workout ? (
                  <WorkoutSummary
                    w={m.workout}
                    unit={unit}
                    names={names}
                    current={m.id === latestId}
                    onReview={onReview}
                  />
                ) : (
                  <p className="text-sm">{m.text}</p>
                )}
              </div>
            )}
          </li>
        ))}
        {busy && (
          <li className="flex justify-start">
            <p className="glass text-muted-foreground flex items-center gap-2 rounded-3xl rounded-bl-md px-4 py-3 text-sm">
              <Loader2 className="size-4 animate-spin" /> Reading your workout…
            </p>
          </li>
        )}
      </ol>
      {/* Room so the last message clears the message box. */}
      <div ref={end} className="h-28" />

      {slot && createPortal(composer, slot)}
    </div>
  );
}

/** Same weight, reps and type in a row collapse to "3 × 5 at 225 lb". */
function setLines(sets: ImportedWorkout["exercises"][number]["sets"], unit: UnitSystem): string[] {
  const u = unit === "imperial" ? "lb" : "kg";
  const lines: string[] = [];
  for (let i = 0; i < sets.length; ) {
    const s = sets[i];
    let n = 1;
    while (i + n < sets.length && sets[i + n].weight_kg === s.weight_kg && sets[i + n].reps === s.reps && sets[i + n].set_type === s.set_type) n++;
    const load = s.weight_kg > 0 ? `${showWeight(s.weight_kg, unit)} ${u}` : "bodyweight";
    const tag = s.set_type === "warmup" ? " warm-up" : s.set_type === "drop" ? " drop" : s.set_type === "failure" ? " to failure" : "";
    lines.push(`${n > 1 ? `${n} × ` : ""}${s.reps} at ${load}${tag}`);
    i += n;
  }
  return lines;
}

function WorkoutSummary({
  w,
  unit,
  names,
  current,
  onReview,
}: {
  w: ImportedWorkout;
  unit: UnitSystem;
  names: Map<string, string>;
  current: boolean;
  onReview: () => void;
}) {
  const sets = w.exercises.reduce((n, x) => n + x.sets.length, 0);
  const unmatched = w.exercises.filter((x) => !x.exercise_id).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Got it: <span className="font-semibold">{w.title}</span>, {w.exercises.length} {w.exercises.length === 1 ? "exercise" : "exercises"} and {sets}{" "}
        {sets === 1 ? "set" : "sets"}
        {w.date && w.date !== localDate(new Date()) ? ` on ${new Date(`${w.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : ""}.
      </p>
      <ul className="flex flex-col gap-1.5">
        {w.exercises.map((x, i) => (
          <li key={i} className="text-sm">
            <span className={cn("font-semibold", !x.exercise_id && "text-set-warmup")}>
              {(x.exercise_id && names.get(x.exercise_id)) || x.name_as_written}
            </span>
            <span className="text-muted-foreground font-mono"> · {setLines(x.sets, unit).join(", ")}</span>
          </li>
        ))}
      </ul>
      {unmatched > 0 && (
        <p className="text-set-warmup text-xs">
          {unmatched === 1 ? "One exercise isn't" : `${unmatched} exercises aren't`} in your library yet. You&apos;ll pick or create {unmatched === 1 ? "it" : "them"} on the next screen.
        </p>
      )}
      {current ? (
        <>
          <Button className="mt-1" onClick={onReview}>
            <ClipboardCheck /> Check and save
          </Button>
          <p className="text-muted-foreground text-xs">Something off? Just tell me, like “bench was 185, not 175”.</p>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">Updated below.</p>
      )}
    </div>
  );
}
