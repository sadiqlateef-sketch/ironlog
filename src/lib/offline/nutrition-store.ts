// The food diary, kept on the phone so logging never waits on signal.
//
// Every write goes to the phone's copy first, is queued in the nutrition outbox,
// and is sent straight away when there's signal. While anything is still waiting
// the phone's copy is the truth; once the outbox is empty the server is, and
// reads refresh the phone's copy (a failed or offline read falls back to it).

import { getSupabase } from "../supabase/client.ts";
import { kvGet, kvSet } from "./kv.ts";
import {
  discardPendingNutrition,
  enqueueNutrition,
  flushNutrition,
  hasNutritionPending,
  type CollectionTable,
  type NOp,
  type Table,
} from "./nutrition-outbox.ts";
import { schemaGate } from "./nutrition-schema.ts";
import { normalizePrefs } from "../nutrition/day.ts";
import {
  entryToRow,
  foodToRow,
  rowToEntry,
  rowToFood,
  type DiaryEntry,
  type EntryUnit,
  type Food,
  type NutritionPrefs,
} from "../nutrition/diary-types.ts";
import { recomputeEntry } from "../nutrition/entry-math.ts";
import { STAPLES, STAPLES_VERSION, stapleFoodsToSeed, type StapleSeed } from "../nutrition/staples.ts";
import { pushRecentScan, type RecentScan } from "../nutrition/quick-log.ts";
import type { Tables } from "../../types/database.ts";

/** Fired on window whenever diary data changes (Home and the diary listen). */
export const NUTRITION_EVENT = "ironlog:nutrition";

export const MAX_FOODS = 500;
export const MAX_RECENTS = 40;

export interface RecentFood {
  /** food id, or "name:<lowercase name>" when the food has none. */
  key: string;
  foodId: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unit: EntryUnit;
}

export interface ReadQuery {
  table: Table;
  columns: string;
  eq?: Record<string, unknown>;
  order?: { col: string; asc: boolean };
  limit?: number;
  /** Return one row (or null) instead of a list. */
  single?: boolean;
}

export interface StoreDeps {
  kv: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<boolean> };
  outbox: {
    enqueue(...ops: NOp[]): Promise<void>;
    flush(): Promise<boolean>;
    hasPending(): Promise<boolean>;
    /** Drop every waiting change; returns the dropped changes. */
    discardPending(): Promise<NOp[]>;
  };
  db: { read(q: ReadQuery): Promise<{ data: unknown; error: { message: string } | null }> };
  userId: () => Promise<string>;
  now?: () => Date;
  newId?: () => string;
  staples?: { list: readonly StapleSeed[]; version: number };
  /** Does the server have this table yet? Always yes when absent. */
  schema?: { probeTable(table: string): Promise<boolean>; probeColumn(table: string, column: string): Promise<boolean> };
}

/** What kitchen collections (nutrition-collections.ts) share with the diary store: one lock, one commit. */
export interface StoreInternals {
  locked<T>(fn: () => Promise<T>): Promise<T>;
  commit(...ops: NOp[]): Promise<void>;
  /** Tell listeners the phone's copy changed (commit already does). */
  changed(): void;
  tryRead(q: ReadQuery): Promise<unknown | undefined>;
  kv: StoreDeps["kv"];
  outbox: StoreDeps["outbox"];
  /** Bumped on every commit; a read that saw it change is stale. */
  writes(): number;
  newId(): string;
  now(): Date;
  schema: NonNullable<StoreDeps["schema"]>;
  /** Called by discardWaiting for each collection table the dropped changes touched, with the ids they added. */
  onDiscard(table: CollectionTable, reload: (added: Set<string>) => Promise<void>): void;
}

export type EntryPatch = Partial<
  Pick<DiaryEntry, "quantity" | "unit" | "mealId" | "mealName" | "note" | "eatenAt" | "foodDay">
>;

const PREFS_KEY = "nutrition-prefs";
const FOODS_KEY = "nutrition-foods";
const RECENTS_KEY = "nutrition-recents";
const SCANS_KEY = "nutrition-scans";
const dayKey = (day: string) => `nutrition-day:${day}`;

export function createNutritionStore(deps: StoreDeps) {
  const { kv, outbox, db } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const staples = deps.staples ?? { list: STAPLES, version: STAPLES_VERSION };
  const schema = deps.schema ?? { probeTable: async () => true, probeColumn: async () => true };
  const reloaders = new Map<CollectionTable, (added: Set<string>) => Promise<void>>();

  // Changes to the phone's copy run one at a time, so two quick taps can't overwrite each other.
  let chain: Promise<unknown> = Promise.resolve();
  function locked<T>(fn: () => Promise<T>): Promise<T> {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  }
  // Counts writes, so a read that was in flight while a write happened can tell its answer is stale.
  let writes = 0;

  const changed = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(NUTRITION_EVENT));
  };

  /** Commit: queue the change, then try to send it without making the caller wait. */
  async function commit(...ops: NOp[]): Promise<void> {
    writes++;
    await outbox.enqueue(...ops);
    void outbox.flush().catch(() => {});
    changed();
  }

  async function tryRead(q: ReadQuery): Promise<unknown | undefined> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return undefined;
    try {
      const res = await db.read(q);
      return res.error ? undefined : (res.data ?? null);
    } catch {
      return undefined;
    }
  }

  // ---------- Prefs ----------

  async function loadPrefs(): Promise<NutritionPrefs> {
    const local = await kv.get<unknown>(PREFS_KEY);
    if (await outbox.hasPending()) return normalizePrefs(local);
    const before = writes;
    let uid: string;
    try {
      uid = await deps.userId();
    } catch {
      return normalizePrefs(local);
    }
    const row = await tryRead({ table: "users", columns: "nutrition_prefs", eq: { id: uid }, single: true });
    if (row === undefined || row === null) return normalizePrefs(local);
    const prefs = normalizePrefs((row as { nutrition_prefs?: unknown }).nutrition_prefs);
    return locked(async () => {
      if (writes !== before || (await outbox.hasPending())) return normalizePrefs(await kv.get<unknown>(PREFS_KEY));
      await kv.set(PREFS_KEY, prefs);
      return prefs;
    });
  }

  async function savePrefs(prefs: NutritionPrefs): Promise<NutritionPrefs> {
    const clean = normalizePrefs(prefs);
    const uid = await deps.userId();
    return locked(async () => {
      await kv.set(PREFS_KEY, clean);
      await commit({ kind: "update", table: "users", ids: [uid], patch: { nutrition_prefs: clean } });
      return clean;
    });
  }

  // ---------- Diary days ----------

  async function fetchDay(day: string): Promise<DiaryEntry[] | undefined> {
    const data = await tryRead({
      table: "food_entries",
      columns: "*",
      eq: { food_day: day },
      order: { col: "eaten_at", asc: true },
    });
    if (!Array.isArray(data)) return undefined;
    return (data as Tables<"food_entries">[]).map(rowToEntry);
  }

  /** The day as this phone has it; asks the server first when the phone has never seen the day. */
  async function dayMirror(day: string): Promise<DiaryEntry[]> {
    const local = await kv.get<DiaryEntry[]>(dayKey(day));
    if (local) return local;
    return (await fetchDay(day)) ?? [];
  }

  const byTime = (a: DiaryEntry, b: DiaryEntry) => (a.eatenAt < b.eatenAt ? -1 : a.eatenAt > b.eatenAt ? 1 : 0);

  async function listDay(day: string): Promise<DiaryEntry[]> {
    const local = await kv.get<DiaryEntry[]>(dayKey(day));
    if (await outbox.hasPending()) return local ?? [];
    const before = writes;
    const server = await fetchDay(day);
    if (!server) return local ?? [];
    return locked(async () => {
      if (writes !== before || (await outbox.hasPending())) return (await kv.get<DiaryEntry[]>(dayKey(day))) ?? [];
      await kv.set(dayKey(day), server);
      return server;
    });
  }

  async function addEntry(entry: DiaryEntry): Promise<void> {
    await locked(async () => {
      const list = await dayMirror(entry.foodDay);
      await kv.set(dayKey(entry.foodDay), [...list.filter((e) => e.id !== entry.id), entry].sort(byTime));
      if (entry.unit !== "quick") await bumpRecent(entry);
      await commit({ kind: "insert", table: "food_entries", rows: [entryToRow(entry)], days: [entry.foodDay] });
    });
  }

  /** `day` is the food day the entry is on now. Quantity or unit changes re-derive from the entry's own snapshot. */
  async function updateEntry(id: string, patch: EntryPatch, day: string): Promise<DiaryEntry | null> {
    return locked(async () => {
      const list = await dayMirror(day);
      const current = list.find((e) => e.id === id);
      if (!current) return null;
      let next = current;
      if (patch.quantity !== undefined || patch.unit !== undefined) {
        next = recomputeEntry(current, patch.quantity ?? current.quantity, patch.unit ?? current.unit);
      }
      const { quantity: _q, unit: _u, ...rest } = patch;
      void _q;
      void _u;
      next = { ...next, ...rest };
      const full = entryToRow(next);
      const columns: (keyof typeof full)[] = [];
      if (next.quantity !== current.quantity) columns.push("quantity");
      if (next.unit !== current.unit) columns.push("unit");
      if (next.grams !== current.grams) columns.push("grams");
      if (next.nutrients !== current.nutrients) columns.push("nutrients");
      if (next.mealId !== current.mealId) columns.push("meal_id");
      if (next.mealName !== current.mealName) columns.push("meal_name");
      if (next.note !== current.note) columns.push("note");
      if (next.eatenAt !== current.eatenAt) columns.push("eaten_at");
      if (next.foodDay !== current.foodDay) columns.push("food_day");
      const rowPatch: Record<string, unknown> = {};
      for (const c of columns) rowPatch[c] = full[c];

      if (next.foodDay === day) {
        await kv.set(dayKey(day), list.map((e) => (e.id === id ? next : e)).sort(byTime));
      } else {
        await kv.set(dayKey(day), list.filter((e) => e.id !== id));
        const target = await dayMirror(next.foodDay);
        await kv.set(dayKey(next.foodDay), [...target, next].sort(byTime));
      }
      if (columns.length) {
        const days = next.foodDay === day ? [day] : [day, next.foodDay];
        await commit({ kind: "update", table: "food_entries", ids: [id], patch: rowPatch, days });
      }
      return next;
    });
  }

  /** Several new entries on one day (a copied meal), queued as one change. */
  async function addEntries(day: string, entries: readonly DiaryEntry[]): Promise<void> {
    const fresh = entries.filter((e) => e.foodDay === day);
    if (!fresh.length) return;
    await locked(async () => {
      const ids = new Set(fresh.map((e) => e.id));
      const list = await dayMirror(day);
      await kv.set(dayKey(day), [...list.filter((e) => !ids.has(e.id)), ...fresh].sort(byTime));
      for (const e of fresh) if (e.unit !== "quick") await bumpRecent(e);
      await commit({ kind: "insert", table: "food_entries", rows: fresh.map(entryToRow), days: [day] });
    });
  }

  async function deleteEntry(id: string, day: string): Promise<void> {
    await locked(async () => {
      const list = await dayMirror(day);
      await kv.set(dayKey(day), list.filter((e) => e.id !== id));
      await commit({ kind: "delete", table: "food_entries", ids: [id], days: [day] });
    });
  }

  /**
   * Throw away every food change still waiting to sync and put the phone's copies
   * back in line with the server: the days, foods and settings those changes
   * touched are read again. If the server can't be read, entries and foods the
   * dropped changes added are at least taken off the phone. Returns how many
   * changes were dropped.
   */
  async function discardWaiting(): Promise<number> {
    return locked(async () => {
      const dropped = await outbox.discardPending();
      if (!dropped.length) return 0;
      writes++;
      const t = touchedBy(dropped);
      for (const day of t.days) {
        const server = await fetchDay(day);
        if (server) await kv.set(dayKey(day), server);
        else {
          const local = await kv.get<DiaryEntry[]>(dayKey(day));
          if (local) await kv.set(dayKey(day), local.filter((e) => !t.addedEntries.has(e.id)));
        }
      }
      if (t.foods) {
        const server = await fetchFoods();
        if (server) await kv.set(FOODS_KEY, server);
        else {
          const local = await kv.get<Food[]>(FOODS_KEY);
          if (local) await kv.set(FOODS_KEY, local.filter((f) => !t.addedFoods.has(f.id)));
        }
      }
      if (t.prefs) {
        try {
          const uid = await deps.userId();
          const row = await tryRead({ table: "users", columns: "nutrition_prefs", eq: { id: uid }, single: true });
          if (row) await kv.set(PREFS_KEY, normalizePrefs((row as { nutrition_prefs?: unknown }).nutrition_prefs));
        } catch {
          // Signed out: nothing to reload.
        }
      }
      for (const [table, added] of t.collections) await reloaders.get(table)?.(added);
      changed();
      return dropped.length;
    });
  }

  // ---------- Foods ----------

  async function fetchFoods(): Promise<Food[] | undefined> {
    const data = await tryRead({
      table: "foods",
      columns: "*",
      eq: { archived: false },
      order: { col: "updated_at", asc: false },
      limit: MAX_FOODS,
    });
    if (!Array.isArray(data)) return undefined;
    return (data as Tables<"foods">[]).map(rowToFood);
  }

  async function foodsMirror(): Promise<Food[]> {
    const local = await kv.get<Food[]>(FOODS_KEY);
    if (local) return local;
    return (await fetchFoods()) ?? [];
  }

  async function listFoods(): Promise<Food[]> {
    const local = await kv.get<Food[]>(FOODS_KEY);
    if (await outbox.hasPending()) return local ?? [];
    const before = writes;
    const server = await fetchFoods();
    if (!server) return local ?? [];
    return locked(async () => {
      if (writes !== before || (await outbox.hasPending())) return (await kv.get<Food[]>(FOODS_KEY)) ?? [];
      await kv.set(FOODS_KEY, server);
      return server;
    });
  }

  /** Insert or update a food. A remote food picked twice (same source and source id) reuses the first row. */
  async function saveFood(food: Food): Promise<Food> {
    return locked(async () => {
      const list = await foodsMirror();
      const sameId = list.find((f) => f.id === food.id);
      if (!sameId && food.sourceId !== null) {
        let dup = list.find((f) => f.source === food.source && f.sourceId === food.sourceId);
        if (!dup) {
          // The phone's list is capped; a food saved before may only be on the server.
          const data = await tryRead({
            table: "foods",
            columns: "*",
            eq: { source: food.source, source_id: food.sourceId },
            limit: 1,
          });
          if (Array.isArray(data) && data.length) dup = rowToFood(data[0] as Tables<"foods">);
        }
        if (dup) {
          if (!list.some((f) => f.id === dup!.id)) await kv.set(FOODS_KEY, [dup, ...list].slice(0, MAX_FOODS));
          return dup;
        }
      }
      const rest = list.filter((f) => f.id !== food.id);
      await kv.set(FOODS_KEY, [food, ...rest].slice(0, MAX_FOODS));
      if (sameId) {
        const { id: _id, ...patch } = foodToRow(food);
        void _id;
        await commit({ kind: "update", table: "foods", ids: [food.id], patch });
      } else {
        await commit({ kind: "insert", table: "foods", rows: [foodToRow(food)] });
      }
      return food;
    });
  }

  /**
   * Another food (not `exceptId`) already saved for this source and id, on the
   * phone or only on the server. Null when there is none; undefined when the
   * server couldn't be asked (offline or an error), so the answer is unknown.
   * The server keeps one food per source and id, so a food must not be changed
   * into a copy of one it already has.
   */
  async function findFoodBySource(source: Food["source"], sourceId: string, exceptId: string): Promise<Food | null | undefined> {
    const list = await foodsMirror();
    const local = list.find((f) => f.id !== exceptId && f.source === source && f.sourceId === sourceId);
    if (local) return local;
    const data = await tryRead({ table: "foods", columns: "*", eq: { source, source_id: sourceId }, limit: 2 });
    if (!Array.isArray(data)) return undefined;
    const row = (data as Tables<"foods">[]).map(rowToFood).find((f) => f.id !== exceptId);
    if (!row) return null;
    // Keep the phone's copy, so the next scan finds it without asking the server.
    await locked(async () => {
      const stored = await kv.get<Food[]>(FOODS_KEY);
      if (stored?.some((f) => f.id === row.id)) return;
      const now = stored ?? (await foodsMirror());
      await kv.set(FOODS_KEY, [row, ...now.filter((f) => f.id !== row.id)].slice(0, MAX_FOODS));
    });
    return row;
  }

  async function archiveFood(id: string): Promise<void> {
    await locked(async () => {
      const list = await foodsMirror();
      await kv.set(FOODS_KEY, list.filter((f) => f.id !== id));
      await commit({ kind: "update", table: "foods", ids: [id], patch: { archived: true } });
    });
  }

  // ---------- Recents ----------

  async function bumpRecent(entry: DiaryEntry): Promise<void> {
    const key = entry.foodId ?? `name:${entry.name.trim().toLowerCase()}`;
    const list = (await kv.get<RecentFood[]>(RECENTS_KEY)) ?? [];
    const item: RecentFood = {
      key,
      foodId: entry.foodId,
      name: entry.name,
      brand: entry.brand,
      quantity: entry.quantity,
      unit: entry.unit,
    };
    await kv.set(RECENTS_KEY, [item, ...list.filter((r) => r.key !== key)].slice(0, MAX_RECENTS));
  }

  /** The last few products found by barcode on this phone, newest first. Never synced. */
  async function listRecentScans(): Promise<RecentScan[]> {
    const list = await kv.get<RecentScan[]>(SCANS_KEY);
    return Array.isArray(list) ? list : [];
  }

  async function rememberScan(scan: RecentScan): Promise<void> {
    await locked(async () => {
      await kv.set(SCANS_KEY, pushRecentScan(await listRecentScans(), scan));
    });
  }

  async function listRecents(): Promise<RecentFood[]> {
    return (await kv.get<RecentFood[]>(RECENTS_KEY)) ?? [];
  }

  // ---------- Staples ----------

  let staplesChecked = false;

  /** Seed the staples pack once. Does nothing for an empty list or a phone that already has this version. */
  async function ensureStaples(): Promise<void> {
    if (staplesChecked) return;
    staplesChecked = true;
    if (staples.list.length === 0) return;
    const prefs = await loadPrefs();
    if (prefs.staples_version >= staples.version) return;
    const uid = await deps.userId();
    await locked(async () => {
      const list = await foodsMirror();
      const fresh = stapleFoodsToSeed(staples.list, list, newId);
      if (fresh.length) {
        await kv.set(FOODS_KEY, [...fresh, ...list].slice(0, MAX_FOODS));
        await commit({ kind: "insert", table: "foods", rows: fresh.map(foodToRow) });
      }
      const next: NutritionPrefs = { ...prefs, staples_version: staples.version };
      await kv.set(PREFS_KEY, next);
      await commit({ kind: "update", table: "users", ids: [uid], patch: { nutrition_prefs: next } });
    });
  }

  const internals: StoreInternals = {
    locked,
    commit,
    changed,
    tryRead,
    kv,
    outbox,
    writes: () => writes,
    newId,
    now: deps.now ?? (() => new Date()),
    schema,
    onDiscard: (table, reload) => void reloaders.set(table, reload),
  };

  return {
    internals,
    discardWaiting,
    loadPrefs,
    savePrefs,
    listDay,
    addEntry,
    updateEntry,
    deleteEntry,
    listFoods,
    saveFood,
    findFoodBySource,
    archiveFood,
    listRecents,
    listRecentScans,
    rememberScan,
    addEntries,
    ensureStaples,
  };
}

/** What a list of queued changes touched on the phone: diary days, foods, settings, and the ids they added. */
export function touchedBy(ops: readonly NOp[]): {
  days: Set<string>;
  foods: boolean;
  prefs: boolean;
  addedEntries: Set<string>;
  addedFoods: Set<string>;
  /** Kitchen tables touched, each with the ids its inserts added. */
  collections: Map<CollectionTable, Set<string>>;
} {
  const out = {
    days: new Set<string>(),
    foods: false,
    prefs: false,
    addedEntries: new Set<string>(),
    addedFoods: new Set<string>(),
    collections: new Map<CollectionTable, Set<string>>(),
  };
  for (const op of ops) {
    if (op.table === "users") {
      out.prefs = true;
      continue;
    }
    if (op.table !== "foods" && op.table !== "food_entries") {
      const added = out.collections.get(op.table) ?? new Set<string>();
      out.collections.set(op.table, added);
      if (op.kind === "insert") for (const row of op.rows) if (typeof row.id === "string") added.add(row.id);
      continue;
    }
    const added = op.table === "foods" ? out.addedFoods : out.addedEntries;
    if (op.kind === "insert") {
      for (const row of op.rows) {
        if (typeof row.id === "string") added.add(row.id);
        if (op.table === "food_entries" && typeof row.food_day === "string") out.days.add(row.food_day);
      }
    }
    if (op.table === "foods") {
      out.foods = true;
      continue;
    }
    for (const d of op.days ?? []) out.days.add(d);
    if (op.kind === "update" && typeof op.patch.food_day === "string") out.days.add(op.patch.food_day);
  }
  return out;
}

// ---------- The app's instance ----------

interface Chain {
  eq(col: string, v: unknown): Chain;
  order(col: string, o: { ascending: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  then: PromiseLike<{ data: unknown; error: { message: string } | null }>["then"];
}

const instance = createNutritionStore({
  kv: { get: kvGet, set: kvSet },
  outbox: { enqueue: enqueueNutrition, flush: flushNutrition, hasPending: hasNutritionPending, discardPending: discardPendingNutrition },
  db: {
    read: async (q) => {
      let c = (getSupabase().from(q.table) as unknown as { select(cols: string): Chain }).select(q.columns);
      for (const [k, v] of Object.entries(q.eq ?? {})) c = c.eq(k, v);
      if (q.order) c = c.order(q.order.col, { ascending: q.order.asc });
      if (q.limit) c = c.limit(q.limit);
      return q.single ? await c.maybeSingle() : await c;
    },
  },
  userId: async () => {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) throw new Error("Sign in first");
    return data.session.user.id;
  },
  schema: schemaGate,
});

export const discardWaitingFood = instance.discardWaiting;
export const loadPrefs = instance.loadPrefs;
export const savePrefs = instance.savePrefs;
export const listDay = instance.listDay;
export const addEntry = instance.addEntry;
export const updateEntry = instance.updateEntry;
export const deleteEntry = instance.deleteEntry;
export const listFoods = instance.listFoods;
export const saveFood = instance.saveFood;
export const findFoodBySource = instance.findFoodBySource;
export const archiveFood = instance.archiveFood;
export const listRecents = instance.listRecents;
export const listRecentScans = instance.listRecentScans;
export const rememberScan = instance.rememberScan;
export const addEntries = instance.addEntries;
export const ensureStaples = instance.ensureStaples;
