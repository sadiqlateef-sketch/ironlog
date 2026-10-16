// Reads that still work without signal: the last good answer is kept on the
// phone and used when the server can't be reached.

import { isNetworkError } from "@/lib/offline/queue";
import { kvGet, kvSet } from "@/lib/offline/kv";

/** `fallback`: what to use offline when nothing was saved yet (otherwise it throws). */
export async function cachedRead<T>(key: string, fetch: () => Promise<T>, fallback?: T): Promise<T> {
  try {
    const fresh = await fetch();
    void kvSet(`cache:${key}`, fresh);
    return fresh;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const saved = await kvGet<T>(`cache:${key}`);
    if (saved === undefined) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
    return saved;
  }
}
