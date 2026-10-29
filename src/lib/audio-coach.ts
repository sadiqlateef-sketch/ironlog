// Whisper Voice Cues & Audio Coach Engine.
// Hands-free voice prompts for earbuds and haptic sound alerts.

export interface AudioCoachSettings {
  enabled: boolean;
  whisperMode: boolean; // Lower volume, gentle cadence
  announceNextSet: boolean;
  announceRestCountdown: boolean; // 10s and 3s warnings
  announcePr: boolean;
  volume: number; // 0.1 to 1.0
  rate: number;   // 0.8 to 1.3
}

export const DEFAULT_AUDIO_COACH_SETTINGS: AudioCoachSettings = {
  enabled: true,
  whisperMode: true,
  announceNextSet: true,
  announceRestCountdown: true,
  announcePr: true,
  volume: 0.75,
  rate: 1.05,
};

/**
 * Builds the exact speech text string for the upcoming prescribed set.
 */
export function buildNextSetSpeech(
  exerciseName: string,
  weight: number | string,
  reps: number | string,
  unit: "lb" | "kg" = "lb",
): string {
  const w = String(weight).trim();
  const r = String(reps).trim();
  if (w && Number(w) > 0) {
    return `Next up: ${exerciseName}, ${w} ${unit} for ${r} reps.`;
  }
  return `Next up: ${exerciseName}, ${r} reps.`;
}

/**
 * Builds countdown voice cue string for resting lifters.
 */
export function buildRestCountdownSpeech(secondsRemaining: number): string | null {
  if (secondsRemaining === 10) {
    return "Ten seconds remaining. Chalk up and get ready.";
  }
  if (secondsRemaining === 3) {
    return "Three, two, one. Time to lift.";
  }
  return null;
}

/**
 * Builds PR celebration audio speech announcement.
 */
export function buildPrSpeech(exerciseName: string, bestWeight: number, unit: "lb" | "kg" = "lb"): string {
  return `New personal record on ${exerciseName}! ${bestWeight} ${unit} conquered.`;
}

/**
 * Speaks an announcement through the Web Speech API if supported in the browser.
 */
export function speakCue(text: string, settings: Partial<AudioCoachSettings> = {}): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending utterances
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = settings.volume ?? DEFAULT_AUDIO_COACH_SETTINGS.volume;
    utterance.rate = settings.rate ?? DEFAULT_AUDIO_COACH_SETTINGS.rate;
    utterance.pitch = settings.whisperMode ? 0.9 : 1.0;

    // Prefer calm natural voices if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Siri") || v.name.includes("Google")),
    );
    if (naturalVoice) utterance.voice = naturalVoice;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
