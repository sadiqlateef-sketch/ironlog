// Calorie banking: the week's energy goal as one budget. Eating under the goal
// on earlier days raises today's allowance (and over lowers it), spread over
// the days left, never by more than the user's cap (% of today's goal).
// Days whose energy isn't fully known are left out and reported, never guessed.
// Pure, no app imports.

export interface DayEaten {
  energy: number;
  /** Every entry's energy is known. */
  complete: boolean;
}

/** Sum of the week's daily energy goals (days without a goal count 0). */
export function weekBudget(goalByDay: Readonly<Record<string, number | null>>): number {
  return Object.values(goalByDay).reduce<number>((s, g) => s + (g ?? 0), 0);
}

export interface Banked {
  /** kcal under goal (positive) or over (negative) on the days counted. */
  banked: number;
  counted: string[];
  /** Days before today left out because their energy isn't fully known. */
  incomplete: string[];
}

/** Balance of the days in the week before `today`. Days with nothing logged are left out too. */
export function bankedSoFar(
  goalByDay: Readonly<Record<string, number | null>>,
  eatenByDay: Readonly<Record<string, DayEaten | undefined>>,
  today: string,
): Banked {
  const out: Banked = { banked: 0, counted: [], incomplete: [] };
  for (const day of Object.keys(goalByDay).sort()) {
    if (day >= today) continue;
    const goal = goalByDay[day];
    const eaten = eatenByDay[day];
    if (goal == null || !eaten) continue;
    if (!eaten.complete) {
      out.incomplete.push(day);
      continue;
    }
    out.banked += goal - eaten.energy;
    out.counted.push(day);
  }
  out.banked = Math.round(out.banked);
  return out;
}

export interface Allowance {
  goal: number;
  boost: number;
  allowance: number;
  banked: number;
  /** The boost was cut to the cap. */
  capped: boolean;
  incomplete: string[];
}

/** Today's energy allowance. With banking off (or no goal today) it is just today's goal. */
export function todayAllowance(
  goalByDay: Readonly<Record<string, number | null>>,
  eatenByDay: Readonly<Record<string, DayEaten | undefined>>,
  today: string,
  banking: { on: boolean; maxBoostPct: number },
): Allowance | null {
  const goal = goalByDay[today];
  if (goal == null) return null;
  const b = bankedSoFar(goalByDay, eatenByDay, today);
  if (!banking.on) return { goal, boost: 0, allowance: goal, banked: b.banked, capped: false, incomplete: b.incomplete };
  const left = Object.keys(goalByDay).filter((d) => d >= today && goalByDay[d] != null).length || 1;
  const raw = b.banked / left;
  const cap = (goal * Math.max(0, banking.maxBoostPct)) / 100;
  const boost = Math.round(Math.max(-cap, Math.min(cap, raw)));
  return {
    goal,
    boost,
    allowance: Math.max(0, goal + boost),
    banked: b.banked,
    capped: Math.abs(raw) > cap + 1e-9,
    incomplete: b.incomplete,
  };
}

/** The Monday-to-Sunday week (as "YYYY-MM-DD" days) that `day` falls in. */
export function weekDays(day: string): string[] {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const back = (date.getDay() + 6) % 7;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(y, m - 1, d - back + i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}
