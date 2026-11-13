// What a failed camera scan means. Capacitor rejects native calls with a plain
// object ({ message, code }), not an Error, so the message is read off either.
// Backing out of the scanner (back button or X) must count as a cancel.

/** The message on whatever the scanner rejected with ("" when there is none). */
export function scanErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/**
 * True when the person backed out of the scanner, or the scan simply came back
 * empty. A result lost because Android stopped the app also counts: that scan
 * arrives later through the app-restored event instead.
 */
export function isScanCancel(e: unknown): boolean {
  const message = scanErrorMessage(e).trim();
  if (message === "") return true;
  return /cancel|result was lost/i.test(message);
}
