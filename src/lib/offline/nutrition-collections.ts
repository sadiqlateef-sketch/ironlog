// Kitchen lists (recipes, batches, usual meals, pantry) kept on the phone the
// same way as foods: the phone's copy is changed first and the change queued in
// the nutrition outbox. They share the diary store's lock and commit, so a
// change spanning two tables (log a batch portion: new entry + fewer portions
// left) is one queued change.
//
// Schema gate: while the server doesn't have the table yet, a saved item stays
// on this phone (`localOnly`) and nothing is queued, so the outbox can't stall
// on a refusal. The first time the table is there, those items are sent.

import type { CollectionTable, NOp } from "./nutrition-outbox.ts";
import type { ReadQuery, StoreInternals } from "./nutrition-store.ts";

type Row = Record<string, unknown>;

/** An item as the phone keeps it. `localOnly`: saved here, not yet sent (the server isn't ready). */
export type Stored<T> = T & { localOnly?: boolean };

export interface CollectionSpec<T extends { id: string }> {
  table: CollectionTable;
  kvKey: string;
  toRow(item: T): Row;
  fromRow(row: Row): T;
  /** Sort order of the list; newest first when absent. */
  order?: (a: T, b: T) => number;
  /** Filter for the server read (e.g. { archived: false }). */
  eq?: Record<string, unknown>;
  limit?: number;
}

export const COLLECTION_LIMIT = 500;

function clean<T>(item: Stored<T>): T {
  const { localOnly: _l, ...rest } = item as Stored<T> & { localOnly?: boolean };
  void _l;
  return rest as T;
}

export function createCollection<T extends { id: string }>(spec: CollectionSpec<T>, internals: StoreInternals) {
  const { kv, locked, commit, changed, outbox } = internals;
  const sort = (list: Stored<T>[]): Stored<T>[] => (spec.order ? [...list].sort(spec.order) : list);

  async function fetchAll(): Promise<T[] | undefined> {
    if (!(await internals.schema.probeTable(spec.table))) return undefined;
    const q: ReadQuery = {
      table: spec.table,
      columns: "*",
      eq: spec.eq,
      order: { col: "updated_at", asc: false },
      limit: spec.limit ?? COLLECTION_LIMIT,
    };
    const data = await internals.tryRead(q);
    if (!Array.isArray(data)) return undefined;
    return (data as Row[]).map(spec.fromRow);
  }

  /** The list as this phone has it; asks the server when the phone has never seen it. */
  async function mirror(): Promise<Stored<T>[]> {
    const local = await kv.get<Stored<T>[]>(spec.kvKey);
    if (local) return local;
    return (await fetchAll()) ?? [];
  }

  /** Server items plus anything still only on the phone. */
  function merge(server: T[], local: readonly Stored<T>[]): Stored<T>[] {
    const ids = new Set(server.map((s) => s.id));
    return sort([...server, ...local.filter((i) => i.localOnly && !ids.has(i.id))]);
  }

  async function list(): Promise<Stored<T>[]> {
    const local = await kv.get<Stored<T>[]>(spec.kvKey);
    if (local?.some((i) => i.localOnly)) await promoteLocal();
    if (await outbox.hasPending()) return (await kv.get<Stored<T>[]>(spec.kvKey)) ?? [];
    const before = internals.writes();
    const server = await fetchAll();
    if (!server) return (await kv.get<Stored<T>[]>(spec.kvKey)) ?? [];
    return locked(async () => {
      const now = (await kv.get<Stored<T>[]>(spec.kvKey)) ?? [];
      if (internals.writes() !== before || (await outbox.hasPending())) return now;
      const merged = merge(server, now);
      await kv.set(spec.kvKey, merged);
      return merged;
    });
  }

  async function get(id: string): Promise<Stored<T> | null> {
    return (await mirror()).find((i) => i.id === id) ?? null;
  }

  /**
   * Put an item on the phone and return the change to queue (none while the server
   * isn't ready). Call inside `locked`, then commit the ops, possibly with others.
   */
  async function stageSave(item: T, ready: boolean): Promise<NOp[]> {
    const items = await mirror();
    const prev = items.find((i) => i.id === item.id);
    const rest = items.filter((i) => i.id !== item.id);
    if (!ready) {
      await kv.set(spec.kvKey, sort([{ ...clean(item), localOnly: true }, ...rest]));
      return [];
    }
    await kv.set(spec.kvKey, sort([clean(item), ...rest]));
    if (prev && !prev.localOnly) {
      const { id: _id, ...patch } = spec.toRow(item);
      void _id;
      return [{ kind: "update", table: spec.table, ids: [item.id], patch }];
    }
    return [{ kind: "insert", table: spec.table, rows: [spec.toRow(item)] }];
  }

  /** Take an item off the phone; returns the delete to queue (none if it never left the phone). */
  async function stageRemove(id: string): Promise<NOp[]> {
    const items = await mirror();
    const prev = items.find((i) => i.id === id);
    if (!prev) return [];
    await kv.set(spec.kvKey, items.filter((i) => i.id !== id));
    return prev.localOnly ? [] : [{ kind: "delete", table: spec.table, ids: [id] }];
  }

  async function finish(ops: NOp[]): Promise<void> {
    if (ops.length) await commit(...ops);
    else changed();
  }

  async function save(item: T): Promise<Stored<T>> {
    const ready = await internals.schema.probeTable(spec.table);
    return locked(async () => {
      await finish(await stageSave(item, ready));
      return ready ? clean(item) : { ...clean(item), localOnly: true };
    });
  }

  async function remove(id: string): Promise<void> {
    await locked(async () => finish(await stageRemove(id)));
  }

  /** Send everything saved while the server wasn't ready, once it is. Returns how many were sent. */
  async function promoteLocal(): Promise<number> {
    if (!(await internals.schema.probeTable(spec.table))) return 0;
    return locked(async () => {
      const items = (await kv.get<Stored<T>[]>(spec.kvKey)) ?? [];
      const waiting = items.filter((i) => i.localOnly);
      if (!waiting.length) return 0;
      await kv.set(spec.kvKey, items.map((i) => (i.localOnly ? clean(i) : i)));
      await commit({ kind: "insert", table: spec.table, rows: waiting.map((i) => spec.toRow(clean(i))) });
      return waiting.length;
    });
  }

  // After waiting changes are thrown away: read the list again, or at least drop what they added.
  internals.onDiscard(spec.table, async (added) => {
    const server = await fetchAll();
    const local = (await kv.get<Stored<T>[]>(spec.kvKey)) ?? [];
    if (server) await kv.set(spec.kvKey, merge(server, local));
    else await kv.set(spec.kvKey, local.filter((i) => i.localOnly || !added.has(i.id)));
  });

  return { list, get, save, remove, stageSave, stageRemove, promoteLocal, table: spec.table };
}

export type Collection<T extends { id: string }> = ReturnType<typeof createCollection<T>>;
