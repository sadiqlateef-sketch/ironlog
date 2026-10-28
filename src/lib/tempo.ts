// Pure tempo and Time-Under-Tension (TUT) calculation helpers.
// Tempo notation follows the standard 4-digit convention:
// [Eccentric] - [Bottom Pause] - [Concentric] - [Top Pause]
// e.g. "3-1-1-0" = 3s down, 1s stretch pause, 1s up, 0s top pause = 5s per rep.

export interface ParsedTempo {
  eccentric: number;
  pauseBottom: number;
  concentric: number;
  pauseTop: number;
  secondsPerRep: number;
}

export const TEMPO_PRESETS = [
  { id: "standard", label: "Standard", tempo: "2-0-1-0", desc: "Controlled cadence (3s/rep)" },
  { id: "hypertrophy", label: "Hypertrophy", tempo: "3-1-1-0", desc: "Eccentric overload & stretch (5s/rep)" },
  { id: "pause", label: "Pause Reps", tempo: "3-2-1-0", desc: "Plateau buster (6s/rep)" },
  { id: "explosive", label: "Power", tempo: "2-0-1-0", desc: "Dynamic concentric intent" },
] as const;

/** Parse a 3 or 4 character/digit tempo string like "3-1-1-0", "3110", or "3-0-X-0" ("X" = explosive ~1s). */
export function parseTempo(tempo: string | null | undefined): ParsedTempo | null {
  if (!tempo) return null;
  const cleaned = tempo.trim().toUpperCase().replace(/[^0-9X-]/g, "");
  const parts = cleaned.includes("-") ? cleaned.split("-") : cleaned.split("");
  if (parts.length < 3 || parts.length > 4) return null;

  const parseDigit = (val: string | undefined, fallback: number) => {
    if (!val) return fallback;
    if (val === "X") return 1;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : Math.max(0, Math.min(15, n));
  };

  const eccentric = parseDigit(parts[0], 2);
  const pauseBottom = parseDigit(parts[1], 0);
  const concentric = parseDigit(parts[2], 1);
  const pauseTop = parseDigit(parts[3], 0);

  const secondsPerRep = eccentric + pauseBottom + concentric + pauseTop;
  if (secondsPerRep <= 0) return null;

  return { eccentric, pauseBottom, concentric, pauseTop, secondsPerRep };
}

/** Calculate total time-under-tension (in seconds) from tempo and completed reps. */
export function calculateTUT(tempo: string | null | undefined, reps: number): number {
  if (reps <= 0) return 0;
  const parsed = parseTempo(tempo);
  const perRep = parsed ? parsed.secondsPerRep : 3; // default controlled 3s rep
  return reps * perRep;
}

/** Format TUT seconds into a clean human string like "45s" or "1m 15s". */
export function formatTUT(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Categorize stimulus tier based on set TUT. */
export function tutStimulusCategory(seconds: number): { label: string; benefit: string; color: string } {
  if (seconds < 15) {
    return { label: "Max Strength", benefit: "Neuromuscular & ATP-PC focus", color: "text-amber-400" };
  }
  if (seconds <= 40) {
    return { label: "Functional Hypertrophy", benefit: "Optimal mechanical tension", color: "text-emerald-400" };
  }
  if (seconds <= 70) {
    return { label: "Metabolic Hypertrophy", benefit: "Metabolic stress & sarcoplasmic", color: "text-sky-400" };
  }
  return { label: "Endurance", benefit: "Mitochondrial & capillary density", color: "text-purple-400" };
}
