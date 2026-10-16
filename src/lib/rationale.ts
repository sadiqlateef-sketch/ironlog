// Explain why before Android asks for a permission. The app shows its own
// short explanation first; only "Continue" goes on to the system prompt.

export type RationaleKind = "location" | "microphone";

export const RATIONALES: Record<RationaleKind, { title: string; body: string; action: string }> = {
  location: {
    title: "Check in at your gym",
    body: "Ironlog uses your location only when a workout starts, to see if you're at your gym, so gym workouts can go on your calendar. It's never tracked in the background or shared. Android will ask you to allow location next.",
    action: "Continue",
  },
  microphone: {
    title: "Say your workout",
    body: "Ironlog listens only while the mic button is on, and your phone turns the speech into text for Claude to read. Nothing is recorded or kept. Android will ask you to allow the microphone next.",
    action: "Continue",
  },
};

type Pending = { kind: RationaleKind; resolve: (ok: boolean) => void };
let pending: Pending | null = null;
const listeners = new Set<() => void>();

export function subscribeRationale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentRationale(): Pending | null {
  return pending;
}

/** Show the explanation; resolves true if the person wants to go on to the system prompt. */
export function explainFirst(kind: RationaleKind): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = {
      kind,
      resolve: (ok) => {
        pending = null;
        listeners.forEach((l) => l());
        resolve(ok);
      },
    };
    listeners.forEach((l) => l());
  });
}
