// JavaScript side of VoiceModule.kt. Without the native module (the browser
// preview, tests) voice simply isn't offered.
import { NativeModules } from "react-native";

interface VoiceNative {
  isAvailable(): Promise<boolean>;
  listen(prompt: string): Promise<string | null>;
}

const native: VoiceNative | undefined = NativeModules.IronlogVoice;

export async function canListen(): Promise<boolean> {
  return native ? native.isAvailable().catch(() => false) : false;
}

/** Opens the watch's "Speak now" screen. Resolves with what was heard, or null. */
export async function listen(prompt: string): Promise<string | null> {
  if (!native) return null;
  return native.listen(prompt).catch(() => null);
}
