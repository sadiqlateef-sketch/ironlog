"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Camera, ChevronRight, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { BodyHeatmap } from "@/components/body-heatmap";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  bmi,
  bmiCategory,
  CM_PER_IN,
  cmToFtIn,
  estimateBodyFat,
  ftInToCm,
  latestOf,
  leanMass,
  localDay,
  seriesOf,
  sparkPoints,
  waistToHeight,
  type BodyField,
} from "@/lib/body";
import {
  clearMeasurement,
  deletePhoto,
  listMeasurements,
  listPhotos,
  saveMeasurement,
  uploadPhoto,
  type BodyMeasurement,
  type ProgressPhoto,
} from "@/lib/body-api";
import { MUSCLE_LABELS } from "@/lib/labels";
import { computeRecovery, LOOKBACK_HOURS, recoveryLabel, type MuscleRecovery } from "@/lib/recovery";
import { kgToLb, lbToKg, type UnitSystem } from "@/lib/units";
import { getMuscleSets } from "@/lib/workout-api";
import type { PhysicalStats } from "@/types/database";
import { cn } from "@/lib/utils";

/** Everything on the Body tab: recovery, composition, stats and photos. */
export function BodyTab() {
  const [body, setBody] = useState<{ rows: BodyMeasurement[]; now: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    listMeasurements()
      .then((rows) => setBody({ rows, now: Date.now() }))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <RecoveryCard />
      {error && <p className="text-destructive text-sm">{error}</p>}
      {body && (
        <>
          <CompositionCard rows={body.rows} now={body.now} />
          <BodyStatsCard rows={body.rows} onChange={load} />
        </>
      )}
      <PhotosCard />
    </>
  );
}

// ---------------- Units ----------------

type FieldInfo = { label: string; unit: (u: UnitSystem) => string; show: (v: number, u: UnitSystem) => number; save: (v: number, u: UnitSystem) => number; step: string };

const FIELDS: Record<BodyField, FieldInfo> = {
  weight_kg: {
    label: "Weight",
    unit: (u) => (u === "imperial" ? "lb" : "kg"),
    show: (v, u) => (u === "imperial" ? kgToLb(v) : v),
    save: (v, u) => (u === "imperial" ? lbToKg(v) : v),
    step: "0.1",
  },
  body_fat_pct: { label: "Body fat", unit: () => "%", show: (v) => v, save: (v) => v, step: "0.1" },
  waist_cm: {
    label: "Waist",
    unit: (u) => (u === "imperial" ? "in" : "cm"),
    show: (v, u) => (u === "imperial" ? v / CM_PER_IN : v),
    save: (v, u) => (u === "imperial" ? v * CM_PER_IN : v),
    step: "0.1",
  },
};

const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ---------------- Recovery (#54) ----------------

function RecoveryCard() {
  const [data, setData] = useState<MuscleRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setData(computeRecovery(sets)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const fatigued = (data ?? []).filter((m) => m.recovery < 90).sort((a, b) => a.recovery - b.recovery);
  const overall = data?.length ? Math.round(data.reduce((t, m) => t + m.recovery, 0) / data.length) : 100;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Muscle recovery</CardTitle>
          <CardDescription>From your hard sets over the last 5 days.</CardDescription>
        </div>
        {data && (
          <p className="text-right">
            <span className="block num text-2xl leading-none font-bold">{overall}%</span>
            <span className="text-muted-foreground text-xs">overall</span>
          </p>
        )}
      </CardHeader>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {data && (
        <>
          <BodyHeatmap data={data} />
          {fatigued.length === 0 ? (
            <p className="text-sm">Everything is recovered. Good day to train anything.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {fatigued.slice(0, 5).map((m) => (
                <li key={m.muscle} className="flex items-baseline justify-between gap-2">
                  <span>{MUSCLE_LABELS[m.muscle]}</span>
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-semibold tabular-nums">{m.recovery}%</span> ·{" "}
                    {recoveryLabel(m.recovery)}
                    {m.hoursToReady > 0 && ` · ~${m.hoursToReady} h`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">Show as table</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full tabular-nums">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left font-medium">Muscle</th>
                    <th className="text-right font-medium">Recovered</th>
                    <th className="text-right font-medium">Hard sets</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].sort((a, b) => a.recovery - b.recovery).map((m) => (
                    <tr key={m.muscle} className="border-t">
                      <td className="py-1">{MUSCLE_LABELS[m.muscle]}</td>
                      <td className="py-1 text-right">{m.recovery}%</td>
                      <td className="py-1 text-right">{m.sets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="text-muted-foreground text-xs">
            A rule-of-thumb estimate, not a medical measurement. Soreness, sleep and food matter too.
          </p>
        </>
      )}
    </Card>
  );
}

// ---------------- Body composition (#55) ----------------

function CompositionCard({ rows, now }: { rows: BodyMeasurement[]; now: number }) {
  const { profile, unit } = useAuth();
  const stats = (profile?.physical_stats ?? {}) as PhysicalStats;
  const weight = latestOf(rows, "weight_kg")?.value ?? stats.bodyweight_kg ?? null;
  const fat = latestOf(rows, "body_fat_pct");
  const waist = latestOf(rows, "waist_cm");
  const height = stats.height_cm ?? null;
  const age = stats.birth_year ? new Date(now).getFullYear() - stats.birth_year : null;

  const b = weight && height ? bmi(weight, height) : null;
  const canEstimate = b != null && age != null && (stats.sex === "male" || stats.sex === "female");
  const fatPct = fat?.value ?? (canEstimate ? estimateBodyFat(b, age, stats.sex as "male" | "female") : null);
  const lean = weight && fatPct != null ? leanMass(weight, fatPct) : null;
  const wtr = waist && height ? waistToHeight(waist.value, height) : null;
  const w = FIELDS.weight_kg;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Body composition</CardTitle>
          <CardDescription>Worked out from your latest weight, height and body fat.</CardDescription>
        </div>
        <Button asChild variant="secondary" size="icon" aria-label="Edit height, sex and birth year in Settings">
          <Link href="/settings/#about">
            <Pencil />
          </Link>
        </Button>
      </CardHeader>
      {!height || !weight ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-sm">
            {!height ? "Add your height" : "Log your weight below"} to see your BMI and lean mass.
          </p>
          {!height && (
            <Button asChild variant="secondary">
              <Link href="/settings/#about">
                <Plus /> Add your height
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          <Tile
            label="Body fat"
            value={fatPct != null ? `${one(fatPct)}%` : "–"}
            note={fat ? "measured" : fatPct != null ? "estimated" : "log it below"}
          />
          <Tile label="BMI" value={b ? one(b) : "–"} note={b ? bmiCategory(b) : ""} />
          <Tile
            label="Lean mass"
            value={lean != null ? `${Math.round(w.show(lean, unit))}` : "–"}
            note={lean != null ? w.unit(unit) : ""}
          />
        </dl>
      )}
      {wtr != null && (
        <p className="text-sm">
          Waist-to-height <span className="num font-semibold">{wtr.toFixed(2)}</span>
          <span className="text-muted-foreground"> · {wtr < 0.5 ? "under the 0.5 guideline" : "at or over the 0.5 guideline"}</span>
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        BMI reads high for muscular people, and the body fat estimate comes from BMI, age and sex. A measured body fat
        always replaces it.
      </p>
    </Card>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-secondary flex flex-col rounded-xl px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="num text-xl font-bold">{value}</dd>
      <dd className="text-muted-foreground text-xs">{note}</dd>
    </div>
  );
}

/** Height, sex and birth year (shown in Settings). */
export function AboutYouForm({ onDone }: { onDone: () => void }) {
  const { profile, unit, updateProfile } = useAuth();
  const stats = (profile?.physical_stats ?? {}) as PhysicalStats;
  const start = stats.height_cm ? cmToFtIn(stats.height_cm) : null;
  const [ft, setFt] = useState(start ? String(start.ft) : "");
  const [inch, setInch] = useState(start ? String(start.in) : "");
  const [cm, setCm] = useState(stats.height_cm ? String(Math.round(stats.height_cm)) : "");
  const [sex, setSex] = useState(stats.sex ?? "");
  const [born, setBorn] = useState(stats.birth_year ? String(stats.birth_year) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const height = unit === "imperial" ? (ft ? ftInToCm(Number(ft), Number(inch || 0)) : null) : cm ? Number(cm) : null;
    if (height != null && (height < 100 || height > 250)) return setError("That height looks off. Check it and try again.");
    const year = born ? Number(born) : null;
    if (year != null && (year < 1900 || year > new Date().getFullYear() - 10)) return setError("Check your birth year.");
    const next: PhysicalStats = { ...stats };
    if (height != null) next.height_cm = Math.round(height * 10) / 10;
    else delete next.height_cm;
    if (sex) next.sex = sex as PhysicalStats["sex"];
    else delete next.sex;
    if (year != null) next.birth_year = year;
    else delete next.birth_year;
    setBusy(true);
    try {
      await updateProfile({ physical_stats: next });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        Height
        {unit === "imperial" ? (
          <div className="grid grid-cols-2 gap-2">
            <Unit suffix="ft">
              <Input inputMode="numeric" aria-label="Height, feet" value={ft} onChange={(e) => setFt(e.target.value)} />
            </Unit>
            <Unit suffix="in">
              <Input inputMode="numeric" aria-label="Height, inches" value={inch} onChange={(e) => setInch(e.target.value)} />
            </Unit>
          </div>
        ) : (
          <Unit suffix="cm">
            <Input inputMode="numeric" aria-label="Height in centimetres" value={cm} onChange={(e) => setCm(e.target.value)} />
          </Unit>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        Sex (for the body fat estimate)
        <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Sex">
          {(["male", "female", "other"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sex === s}
              onClick={() => setSex(sex === s ? "" : s)}
              className={cn("h-10 rounded-lg text-sm font-semibold capitalize", sex === s ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Birth year
        <Input inputMode="numeric" placeholder="e.g. 1998" value={born} onChange={(e) => setBorn(e.target.value)} />
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button size="lg" disabled={busy} onClick={save}>
        Save
      </Button>
    </>
  );
}

function Unit({ suffix, children }: { suffix: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">{suffix}</span>
    </div>
  );
}

// ---------------- Body stats (#56) ----------------

function BodyStatsCard({ rows, onChange }: { rows: BodyMeasurement[]; onChange: () => void }) {
  const { unit } = useAuth();
  const [logging, setLogging] = useState(false);
  const [history, setHistory] = useState<BodyField | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Body stats</CardTitle>
          <CardDescription>Log your weight, body fat and waist to see the trend.</CardDescription>
        </div>
        <Button variant="secondary" onClick={() => setLogging(true)}>
          <Plus /> Log
        </Button>
      </CardHeader>
      <ul className="flex flex-col">
        {(Object.keys(FIELDS) as BodyField[]).map((f) => {
          const info = FIELDS[f];
          const last = latestOf(rows, f);
          const values = seriesOf(rows, f).slice(-30).map((p) => info.show(p.value, unit));
          return (
            <li key={f} className="border-t first:border-t-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left"
                onClick={() => (last ? setHistory(f) : setLogging(true))}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{info.label}</p>
                  {last ? (
                    <p className="num text-xl font-bold">
                      {one(info.show(last.value, unit))}{" "}
                      <span className="text-muted-foreground font-sans text-sm font-normal">{info.unit(unit)}</span>
                      {last.change != null && Math.abs(last.change) >= 0.05 && (
                        <span className="text-muted-foreground ml-2 font-sans text-xs font-normal">
                          {last.change > 0 ? "+" : "−"}
                          {one(Math.abs(info.show(last.change, unit)))} since{" "}
                          {new Date(`${last.since}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">Not logged yet</p>
                  )}
                </div>
                {values.length > 1 && <Sparkline values={values} label={`${info.label} trend`} />}
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
      <LogSheet open={logging} onOpenChange={setLogging} rows={rows} onSaved={onChange} />
      <HistorySheet field={history} rows={rows} onClose={() => setHistory(null)} onChange={onChange} />
    </Card>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 84;
  const h = 28;
  const pts = sparkPoints(values, w, h, 3);
  const last = pts.split(" ").at(-1)!.split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="var(--chart-1)" />
    </svg>
  );
}

function LogSheet({
  open,
  onOpenChange,
  rows,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: BodyMeasurement[];
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log body stats</DialogTitle>
          <DialogDescription>Fill in any of them. Logging again on the same day updates that day.</DialogDescription>
        </DialogHeader>
        {open && (
          <LogForm
            rows={rows}
            onDone={() => {
              onOpenChange(false);
              onSaved();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LogForm({ rows, onDone }: { rows: BodyMeasurement[]; onDone: () => void }) {
  const { unit, profile, updateProfile } = useAuth();
  const [day, setDay] = useState(() => localDay(new Date()));
  const [values, setValues] = useState<Record<BodyField, string>>({ weight_kg: "", body_fat_pct: "", waist_cm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const out: Partial<Record<BodyField, number>> = {};
    for (const f of Object.keys(FIELDS) as BodyField[]) {
      if (!values[f].trim()) continue;
      const n = Number(values[f]);
      if (!Number.isFinite(n) || n <= 0) return setError(`Check the ${FIELDS[f].label.toLowerCase()} you entered.`);
      out[f] = Math.round(FIELDS[f].save(n, unit) * 100) / 100;
    }
    if (!Object.keys(out).length) return setError("Enter at least one value.");
    setBusy(true);
    try {
      await saveMeasurement(day, out);
      // Keep the profile's bodyweight on the newest entry, for plans and the AI coach.
      const newest = latestOf(rows, "weight_kg");
      if (out.weight_kg && (!newest || day >= newest.date)) {
        await updateProfile({ physical_stats: { ...((profile?.physical_stats ?? {}) as PhysicalStats), bodyweight_kg: out.weight_kg } });
      }
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("check") ? "One of those values is outside the range Ironlog accepts. Check it and try again." : msg);
      setBusy(false);
    }
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Date
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(FIELDS) as BodyField[]).map((f) => (
          <label key={f} className="flex flex-col gap-1 text-sm">
            {FIELDS[f].label}
            <Unit suffix={FIELDS[f].unit(unit)}>
              <Input
                inputMode="decimal"
                className="pr-8"
                value={values[f]}
                onChange={(e) => setValues({ ...values, [f]: e.target.value })}
              />
            </Unit>
          </label>
        ))}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button size="lg" disabled={busy || !day} onClick={save}>
        Save
      </Button>
    </>
  );
}

function HistorySheet({
  field,
  rows,
  onClose,
  onChange,
}: {
  field: BodyField | null;
  rows: BodyMeasurement[];
  onClose: () => void;
  onChange: () => void;
}) {
  const { unit } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const info = field ? FIELDS[field] : null;
  const list = field ? rows.filter((r) => r[field] != null).sort((a, b) => b.measured_on.localeCompare(a.measured_on)) : [];

  return (
    <Dialog open={!!field} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {field && info && (
          <>
            <DialogHeader>
              <DialogTitle>{info.label} history</DialogTitle>
              <DialogDescription>Every entry, newest first.</DialogDescription>
            </DialogHeader>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <ul className="flex flex-col">
              {list.map((r, i) => {
                const v = info.show(Number(r[field]), unit);
                const prev = list[i + 1] ? info.show(Number(list[i + 1][field]), unit) : null;
                return (
                  <li key={r.id} className="flex items-center gap-2 border-t py-2 first:border-t-0">
                    <span className="flex-1 text-sm">{dayLabel(r.measured_on)}</span>
                    {prev != null && Math.abs(v - prev) >= 0.05 && (
                      <span className="text-muted-foreground text-xs">
                        {v > prev ? "+" : "−"}
                        {one(Math.abs(v - prev))}
                      </span>
                    )}
                    <span className="w-20 text-right num font-semibold">
                      {one(v)} <span className="text-muted-foreground font-sans text-xs">{info.unit(unit)}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${info.label.toLowerCase()} from ${dayLabel(r.measured_on)}`}
                      onClick={() =>
                        clearMeasurement(r, field)
                          .then(onChange)
                          .catch((e: Error) => setError(e.message))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Progress photos (#57) ----------------

function PhotosCard() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    listPhotos()
      .then(setPhotos)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(files.length);
    for (const f of Array.from(files)) {
      try {
        await uploadPhoto(f);
      } catch (e) {
        setError((e as Error).message);
      }
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    load();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Progress photos</CardTitle>
          <CardDescription>Private to your account. Only you can see them.</CardDescription>
        </div>
        <Button variant="secondary" disabled={uploading > 0} onClick={() => input.current?.click()}>
          <ImagePlus /> {uploading ? "Adding…" : "Add Media"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => add(e.target.files)}
        />
      </CardHeader>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {photos && photos.length === 0 && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="border-input text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-sm"
        >
          <Camera className="size-6" />
          Add your first photo. Same spot, same light each time makes changes easier to see.
        </button>
      )}
      {photos && photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.path}>
              <button type="button" onClick={() => setOpen(p)} className="flex w-full flex-col gap-1 text-left" aria-label={`Photo from ${dayLabel(p.day)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" loading="lazy" className="bg-secondary aspect-[3/4] w-full rounded-xl object-cover" />
                <span className="text-muted-foreground text-xs">{dayLabel(p.day)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PhotoViewer
        photo={open}
        onClose={() => setOpen(null)}
        onDeleted={() => {
          setOpen(null);
          load();
        }}
      />
    </Card>
  );
}

function PhotoViewer({ photo, onClose, onDeleted }: { photo: ProgressPhoto | null; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {photo && (
          <>
            <DialogHeader>
              <DialogTitle>{dayLabel(photo.day)}</DialogTitle>
              <DialogDescription>Progress photo</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Progress photo from ${dayLabel(photo.day)}`} className="max-h-[60dvh] w-full rounded-xl object-contain" />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button
              variant="secondary"
              className="text-destructive"
              onClick={() => {
                if (confirm !== photo.path) return setConfirm(photo.path);
                deletePhoto(photo.path)
                  .then(onDeleted)
                  .catch((e: Error) => setError(e.message));
              }}
            >
              <Trash2 /> {confirm === photo.path ? "Tap again to delete" : "Delete photo"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
