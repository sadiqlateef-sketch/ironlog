// A tiny key-value store in IndexedDB (kept by the Android WebView between
// launches), for the offline cache and the queue of unsynced workout changes.
// Falls back to memory where IndexedDB isn't available.

const DB_NAME = "ironlog-offline";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

/** Like run(), but only says whether the write went through. Without IndexedDB the memory copy is all there is, which is the documented fallback. */
function runOk(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<boolean> {
  return open().then(
    (db) =>
      new Promise<boolean>((resolve) => {
        if (!db) return resolve(true);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  const v = await run<T>("readonly", (s) => s.get(key));
  if (v !== undefined) memory.set(key, v);
  return v;
}

/** False when the phone couldn't store it (storage full or blocked). The value is still kept in memory until the app closes. */
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  memory.set(key, value);
  return runOk("readwrite", (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  await run("readwrite", (s) => s.delete(key));
}

/** Forget everything (on sign-out). */
export async function kvClear(): Promise<void> {
  memory.clear();
  await run("readwrite", (s) => s.clear());
}
