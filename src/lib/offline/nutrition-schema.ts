// Is the server ready for a food table or column yet?
//
// New food tables ship as migrations that may not be deployed when the app
// update lands. A change sent to a table the server doesn't have is refused,
// and a refused change stops every food change queued behind it. So kitchen
// items are only queued once a quick look (`select <column> limit 0`) shows
// the server has the table; until then they stay on this phone. Columns added
// to existing tables (entry status, food prices) are left out of what is sent
// while the server lacks them.
//
// Answers are remembered for SCHEMA_CACHE_MS. "Can't tell" (offline, a server
// hiccup) is never remembered and counts as "not ready".

import { getSupabase, isLocalBackend } from "../supabase/client.ts";
import { kvGet, kvSet } from "./kv.ts";
import type { NOp } from "./nutrition-outbox.ts";

export const SCHEMA_KEY = "nutrition-schema";
/** How long a probe answer is trusted before asking the server again. */
export const SCHEMA_CACHE_MS = 24 * 60 * 60 * 1000;

/** Columns added to tables that already existed, and the column whose probe stands for them. */
export const NEW_COLUMNS = {
  foods: { probe: "price_cents", columns: ["price_cents", "price_amount"] },
  food_entries: { probe: "status", columns: ["status"] },
} as const;

type Cache = Record<string, { ok: boolean; at: number }>;

export interface SchemaDeps {
  kv: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<boolean> };
  /** Read zero rows of one column; only the error matters. */
  probe(table: string, column: string): Promise<{ error: { message: string } | null }>;
  now?: () => number;
  /** The local test backend stores any table, so it is always ready. */
  alwaysReady?: () => boolean;
}

/** The server's way of saying a table or column doesn't exist. */
export function isMissingSchema(message: string): boolean {
  return /Could not find the table|relation .* does not exist|Could not find the '\w+' column|column .* does not exist|schema cache/i.test(
    message,
  );
}

export function createSchemaGate(deps: SchemaDeps) {
  const now = deps.now ?? (() => Date.now());

  async function check(table: string, column: string): Promise<boolean> {
    if (deps.alwaysReady?.()) return true;
    const key = `${table}.${column}`;
    const cache = (await deps.kv.get<Cache>(SCHEMA_KEY)) ?? {};
    const hit = cache[key];
    if (hit && now() - hit.at < SCHEMA_CACHE_MS) return hit.ok;
    let res: { error: { message: string } | null };
    try {
      res = await deps.probe(table, column);
    } catch {
      return false;
    }
    let ok: boolean;
    if (!res.error) ok = true;
    else if (isMissingSchema(res.error.message)) ok = false;
    else return false;
    const fresh = (await deps.kv.get<Cache>(SCHEMA_KEY)) ?? {};
    await deps.kv.set(SCHEMA_KEY, { ...fresh, [key]: { ok, at: now() } });
    return ok;
  }

  return {
    probeTable: (table: string) => check(table, "id"),
    probeColumn: (table: string, column: string) => check(table, column),
    /** Forget every answer (after a deploy, or for a manual "check again"). */
    forget: async () => {
      await deps.kv.set(SCHEMA_KEY, {});
    },
  };
}

export type SchemaGate = ReturnType<typeof createSchemaGate>;

function omit(row: Record<string, unknown>, cols: readonly string[]): Record<string, unknown> {
  const out = { ...row };
  for (const c of cols) delete out[c];
  return out;
}

/** The change as the server can take it: new columns dropped while the server lacks them. */
export async function shapeOp(gate: Pick<SchemaGate, "probeColumn">, op: NOp): Promise<NOp> {
  if (op.table !== "foods" && op.table !== "food_entries") return op;
  if (op.kind === "delete") return op;
  const spec = NEW_COLUMNS[op.table];
  const touches =
    op.kind === "insert" ? true : spec.columns.some((c) => Object.prototype.hasOwnProperty.call(op.patch, c));
  if (!touches) return op;
  if (await gate.probeColumn(op.table, spec.probe)) return op;
  if (op.kind === "insert") return { ...op, rows: op.rows.map((r) => omit(r, spec.columns)) };
  return { ...op, patch: omit(op.patch, spec.columns) };
}

// ---------- The app's instance ----------

interface ProbeChain {
  limit(n: number): PromiseLike<{ error: { message: string } | null }>;
}

export const schemaGate = createSchemaGate({
  kv: { get: kvGet, set: kvSet },
  probe: async (table, column) =>
    await (getSupabase().from(table as "foods") as unknown as { select(c: string): ProbeChain }).select(column).limit(0),
  alwaysReady: isLocalBackend,
});

export const shapeForServer = (op: NOp): Promise<NOp> => shapeOp(schemaGate, op);
