// Body composition maths and body-stat history helpers. Pure functions, so
// they can be unit tested; everything is stored metric (kg, cm).

export const CM_PER_IN = 2.54;

export type BodyField = "weight_kg" | "body_fat_pct" | "waist_cm";

export type Measurement = {
  measured_on: string; // yyyy-mm-dd
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
};

/** Body mass index: kg / m². */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** The standard adult (WHO) BMI bands. */
export function bmiCategory(value: number): string {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy range";
  if (value < 30) return "Overweight";
  return "Obesity range";
}

/**
 * Body fat estimated from BMI, age and sex (Deurenberg 1991). A rough
 * population formula; it reads high for muscular people, so a measured value
 * always wins over it.
 */
export function estimateBodyFat(bmiValue: number, age: number, sex: "male" | "female"): number {
  const pct = 1.2 * bmiValue + 0.23 * age - 10.8 * (sex === "male" ? 1 : 0) - 5.4;
  return Math.min(60, Math.max(3, pct));
}

/** Lean body mass: everything that isn't fat. */
export function leanMass(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100);
}

/** Waist-to-height ratio; under 0.5 is the usual healthy cut-off. */
export function waistToHeight(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

/** Oldest-first points of one field, skipping days it wasn't logged. */
export function seriesOf(rows: Measurement[], field: BodyField): { date: string; value: number }[] {
  return rows
    .filter((r) => r[field] != null)
    .map((r) => ({ date: r.measured_on, value: Number(r[field]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The newest value of a field and how much it changed since the first one. */
export function latestOf(rows: Measurement[], field: BodyField) {
  const s = seriesOf(rows, field);
  if (!s.length) return null;
  const last = s[s.length - 1];
  return { value: last.value, date: last.date, change: s.length > 1 ? last.value - s[0].value : null, since: s[0].date };
}

/** Feet and inches for a height in cm, e.g. 178 → { ft: 5, in: 10 }. */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), in: total % 12 };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_IN;
}

/** Points for a small trend line, scaled into a w × h box (y grows down). */
export function sparkPoints(values: number[], w: number, h: number, pad = 2): string {
  if (!values.length) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? pad + i * step : w / 2;
      const y = hi === lo ? h / 2 : pad + (1 - (v - lo) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Local yyyy-mm-dd for a date (not UTC, so late-evening entries land on the right day). */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
