// Offline-first writes. Every change the watch makes is saved to the queue on
// the watch first, then sent to the server in order. With no signal (a basement
// gym), changes wait and go out once the watch is back online.
//
// Each operation is safe to send twice: new sets carry their own id, and heart
// rate rows are unique per session + second, so a retry never duplicates data.

export interface HrRow {
  session_id: string;
  recorded_at: string;
  bpm: number;
}

export interface NewSetRow {
  id: string;
  client_id: string;
  session_id: string;
  exercise_id: string;
  exercise_order: number;
  set_number: number;
  set_type: "warmup" | "normal" | "drop" | "failure";
  superset_group: number | null;
  weight: number;
  reps: number;
}

export type Op =
  | { kind: "addSet"; row: NewSetRow }
  | { kind: "complete"; setId: string; weight: number; reps: number; at: string }
  | { kind: "uncomplete"; setId: string }
  | { kind: "hr"; rows: HrRow[] }
  | { kind: "finish"; sessionId: string; at: string };

/** ok: done. retry: offline or server hiccup, keep it. drop: the server refused it for good. */
export type Outcome = "ok" | "retry" | "drop";

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class OpQueue {
  private ops: Op[] | null = null;
  private flushing: Promise<number> | null = null;
  private listeners = new Set<(pending: number) => void>();

  private kv: KeyValue;
  private send: (op: Op) => Promise<Outcome>;
  private key: string;

  constructor(kv: KeyValue, send: (op: Op) => Promise<Outcome>, key = "ironlog.queue") {
    this.kv = kv;
    this.send = send;
    this.key = key;
  }

  private async all(): Promise<Op[]> {
    if (!this.ops) {
      try {
        this.ops = JSON.parse((await this.kv.getItem(this.key)) ?? "[]") as Op[];
      } catch {
        this.ops = [];
      }
    }
    return this.ops;
  }

  private async save(): Promise<void> {
    await this.kv.setItem(this.key, JSON.stringify(this.ops ?? []));
    this.listeners.forEach((l) => l(this.ops?.length ?? 0));
  }

  /** Called with the number of changes still waiting to be sent. */
  onChange(listener: (pending: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async pending(): Promise<number> {
    return (await this.all()).length;
  }

  /** Save a change, then try to send everything. Never throws. */
  async push(op: Op): Promise<number> {
    const ops = await this.all();
    // Heart rate arrives often: merge with a waiting batch rather than growing the queue.
    const last = ops[ops.length - 1];
    if (op.kind === "hr" && last?.kind === "hr") last.rows.push(...op.rows);
    else ops.push(op);
    await this.save();
    return this.flush();
  }

  /** Send waiting changes in order, stopping at the first one that must be retried. Returns how many are left. */
  flush(): Promise<number> {
    if (!this.flushing) {
      this.flushing = this.drain().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async drain(): Promise<number> {
    const ops = await this.all();
    while (ops.length) {
      let outcome: Outcome;
      try {
        outcome = await this.send(ops[0]);
      } catch {
        outcome = "retry";
      }
      if (outcome === "retry") break;
      ops.shift();
      await this.save();
    }
    return ops.length;
  }
}

/* eslint-disable no-bitwise -- setting UUID version bits */
/** Random v4 UUID for ids made on the watch (uses the secure generator when there is one). */
export function uuid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Decide whether a failed request is worth retrying. */
export function classify(error: { status?: number; code?: string; message?: string } | null): Outcome {
  if (!error) return "ok";
  const status = error.status ?? 0;
  // No status = never reached the server (offline). 408/429/5xx = try again later.
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 401) return "retry"; // session expired; it refreshes, then we resend
  return "drop";
}
