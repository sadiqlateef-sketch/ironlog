// The USDA key lives on this phone only (localStorage). It is a device secret,
// not account data: it is never put in prefs, kv, the outbox, a backup, an
// export, a log line or an error message. It is NOT cleared on sign-out on
// purpose; Settings has "Remove key".

const KEY_NAME = "ironlog.nutrition.usda-key";

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function getUsdaKey(): string {
  try {
    return storage()?.getItem(KEY_NAME)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Returns false when the phone refused to store it. */
export function setUsdaKey(key: string): boolean {
  const k = key.trim();
  if (k === "") return false;
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(KEY_NAME, k);
    return true;
  } catch {
    return false;
  }
}

export function clearUsdaKey(): void {
  try {
    storage()?.removeItem(KEY_NAME);
  } catch {
    // nothing to clear
  }
}

export function hasUsdaKey(): boolean {
  return getUsdaKey() !== "";
}

/** What the screen may show: never more than the last four characters. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k === "") return "not set";
  return `saved, ends …${k.slice(-4)}`;
}

/** Replace the key, and its URL-encoded forms, so error text can never carry it. */
export function redactKey(text: string, key: string): string {
  const k = key.trim();
  if (k === "") return text;
  const forms = new Set([k, encodeURIComponent(k), encodeURI(k)]);
  let out = text;
  for (const f of [...forms].sort((a, b) => b.length - a.length)) out = out.split(f).join("[key]");
  return out;
}
