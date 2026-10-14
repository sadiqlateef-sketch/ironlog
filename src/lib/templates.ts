// Ready-made programs and single workouts for the Find tab. Exercises are
// named by slug so they match the built-in library.

export interface TemplateItem {
  slug: string;
  sets: number;
  reps: number;
  repsMax?: number;
  rest?: number;
  warmups?: number;
}

export interface TemplateDay {
  name: string;
  items: TemplateItem[];
}

export const CATEGORIES = [
  { key: "muscle", label: "Muscle Gain" },
  { key: "strength", label: "Strength" },
  { key: "fat-loss", label: "Fat Loss" },
  { key: "ppl", label: "Push/Pull" },
  { key: "upper-lower", label: "Upper/Lower" },
  { key: "full-body", label: "Full Body" },
  { key: "abs", label: "Abs" },
  { key: "home", label: "At Home" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

export interface Template {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  /** One day = a single workout; several = a weekly program. */
  days: TemplateDay[];
  weeks: number;
  level: "Beginner" | "Intermediate";
}

const x = (slug: string, sets: number, reps: number, repsMax?: number, rest = 120, warmups = 0): TemplateItem => ({
  slug,
  sets,
  reps,
  repsMax,
  rest,
  warmups,
});

export const TEMPLATES: Template[] = [
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    description: "The classic three-day split. Each day trains one movement family hard, with room for extra sets.",
    categories: ["muscle", "ppl"],
    weeks: 6,
    level: "Intermediate",
    days: [
      {
        name: "Push",
        items: [
          x("bench-press", 4, 6, 8, 150, 2),
          x("overhead-press", 3, 6, 10),
          x("incline-dumbbell-press", 3, 8, 12, 90),
          x("lateral-raise", 3, 12, 15, 60),
          x("triceps-pushdown", 3, 10, 15, 60),
        ],
      },
      {
        name: "Pull",
        items: [
          x("barbell-row", 4, 6, 10, 150, 1),
          x("lat-pulldown", 3, 8, 12, 90),
          x("seated-cable-row", 3, 10, 12, 90),
          x("face-pull", 3, 12, 15, 60),
          x("barbell-curl", 3, 8, 12, 60),
        ],
      },
      {
        name: "Legs",
        items: [
          x("back-squat", 4, 5, 8, 180, 2),
          x("romanian-deadlift", 3, 8, 10, 120),
          x("leg-press", 3, 10, 12, 90),
          x("leg-curl", 3, 10, 15, 60),
          x("standing-calf-raise", 4, 10, 15, 60),
        ],
      },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    description: "Four days a week, each muscle twice. A heavier day and a lighter day for each half of the body.",
    categories: ["muscle", "strength", "upper-lower"],
    weeks: 6,
    level: "Intermediate",
    days: [
      {
        name: "Upper (heavy)",
        items: [x("bench-press", 4, 4, 6, 180, 2), x("barbell-row", 4, 5, 8, 150), x("overhead-press", 3, 6, 8), x("chin-up", 3, 6, 10), x("barbell-curl", 2, 8, 12, 60)],
      },
      {
        name: "Lower (heavy)",
        items: [x("back-squat", 4, 4, 6, 180, 2), x("romanian-deadlift", 3, 6, 8, 150), x("leg-press", 3, 8, 10, 120), x("standing-calf-raise", 3, 8, 12, 60)],
      },
      {
        name: "Upper (light)",
        items: [x("incline-dumbbell-press", 3, 8, 12, 90), x("lat-pulldown", 3, 10, 12, 90), x("dumbbell-shoulder-press", 3, 10, 12, 90), x("lateral-raise", 3, 12, 15, 60), x("triceps-pushdown", 3, 10, 15, 60)],
      },
      {
        name: "Lower (light)",
        items: [x("front-squat", 3, 6, 10, 150, 1), x("hip-thrust", 3, 8, 12, 90), x("leg-extension", 3, 12, 15, 60), x("leg-curl", 3, 12, 15, 60), x("hanging-leg-raise", 3, 10, 15, 60)],
      },
    ],
  },
  {
    id: "full-body-3",
    name: "Full Body 3×",
    description: "Three short whole-body sessions a week. Great for beginners or a busy schedule.",
    categories: ["full-body", "muscle", "fat-loss"],
    weeks: 6,
    level: "Beginner",
    days: [
      { name: "Full Body A", items: [x("back-squat", 3, 6, 8, 150, 1), x("bench-press", 3, 6, 8, 150, 1), x("barbell-row", 3, 8, 10), x("plank", 3, 30, 45, 60)] },
      { name: "Full Body B", items: [x("trap-bar-deadlift", 3, 5, 8, 150, 1), x("overhead-press", 3, 6, 8), x("lat-pulldown", 3, 8, 12, 90), x("hanging-leg-raise", 3, 8, 12, 60)] },
      { name: "Full Body C", items: [x("leg-press", 3, 10, 12, 90), x("dumbbell-bench-press", 3, 8, 12, 90), x("seated-cable-row", 3, 10, 12, 90), x("lateral-raise", 3, 12, 15, 60)] },
    ],
  },
  {
    id: "strength-5x5",
    name: "Strength 5×5",
    description: "Two alternating workouts of heavy fives on the big barbell lifts. Add weight every time you hit all 25 reps.",
    categories: ["strength", "full-body"],
    weeks: 8,
    level: "Beginner",
    days: [
      { name: "Workout A", items: [x("back-squat", 5, 5, undefined, 180, 2), x("bench-press", 5, 5, undefined, 180, 2), x("barbell-row", 5, 5, undefined, 150, 1)] },
      { name: "Workout B", items: [x("back-squat", 5, 5, undefined, 180, 2), x("overhead-press", 5, 5, undefined, 180, 2), x("conventional-deadlift", 1, 5, undefined, 180, 3)] },
    ],
  },
  {
    id: "big-four",
    name: "Big Four Strength",
    description: "One main lift a day (squat, bench, deadlift, press) with a few helpers. Built for steady strength gains.",
    categories: ["strength"],
    weeks: 8,
    level: "Intermediate",
    days: [
      { name: "Squat day", items: [x("back-squat", 3, 3, 5, 180, 3), x("bulgarian-split-squat", 3, 8, 10, 90), x("leg-curl", 3, 10, 12, 60), x("hanging-leg-raise", 3, 10, 15, 60)] },
      { name: "Bench day", items: [x("bench-press", 3, 3, 5, 180, 3), x("dumbbell-row", 3, 8, 12, 90), x("close-grip-bench-press", 3, 6, 10), x("face-pull", 3, 12, 15, 60)] },
      { name: "Deadlift day", items: [x("conventional-deadlift", 3, 3, 5, 180, 3), x("front-squat", 3, 6, 8, 150), x("pull-up", 3, 6, 10, 90), x("ab-roller", 3, 8, 12, 60)] },
      { name: "Press day", items: [x("overhead-press", 3, 3, 5, 180, 3), x("incline-bench-press", 3, 6, 10, 120), x("chin-up", 3, 6, 10, 90), x("barbell-curl", 3, 8, 12, 60)] },
    ],
  },
  {
    id: "fat-loss-circuit",
    name: "Fat Loss Circuits",
    description: "Three fast-paced workouts with short rests to keep your heart rate up. Dumbbells and bodyweight only.",
    categories: ["fat-loss", "home"],
    weeks: 4,
    level: "Beginner",
    days: [
      { name: "Circuit A", items: [x("goblet-squat", 3, 12, 15, 45), x("pushups", 3, 10, 15, 45), x("dumbbell-row", 3, 10, 12, 45), x("freehand-jump-squat", 3, 12, 15, 45), x("plank", 3, 30, 45, 30)] },
      { name: "Circuit B", items: [x("dumbbell-lunges", 3, 10, 12, 45), x("dumbbell-shoulder-press", 3, 10, 12, 45), x("butt-lift-bridge", 3, 15, 20, 45), x("russian-twist", 3, 20, 30, 30)] },
      { name: "Circuit C", items: [x("dumbbell-step-ups", 3, 10, 12, 45), x("push-ups-with-feet-elevated", 3, 8, 12, 45), x("reverse-flyes", 3, 12, 15, 45), x("crunches", 3, 15, 20, 30)] },
    ],
  },
  {
    id: "abs-finisher",
    name: "10-Minute Abs",
    description: "A quick core finisher to tack onto any workout.",
    categories: ["abs", "home"],
    weeks: 1,
    level: "Beginner",
    days: [{ name: "10-Minute Abs", items: [x("hanging-leg-raise", 3, 10, 15, 45), x("crunches", 3, 15, 20, 30), x("russian-twist", 3, 20, 30, 30), x("plank", 2, 30, 60, 30)] }],
  },
  {
    id: "arm-day",
    name: "Arm Day",
    description: "Biceps and triceps supersets for a big pump.",
    categories: ["muscle"],
    weeks: 1,
    level: "Beginner",
    days: [{ name: "Arm Day", items: [x("barbell-curl", 3, 8, 12, 60), x("close-grip-bench-press", 3, 8, 10, 90), x("hammer-curls", 3, 10, 12, 60), x("ez-bar-skullcrusher", 3, 10, 12, 60), x("triceps-pushdown", 3, 12, 15, 45)] }],
  },
  {
    id: "home-dumbbell",
    name: "Home Dumbbell Full Body",
    description: "Everything you need with one pair of dumbbells.",
    categories: ["home", "full-body"],
    weeks: 1,
    level: "Beginner",
    days: [{ name: "Home Dumbbell Full Body", items: [x("goblet-squat", 3, 10, 12, 60), x("dumbbell-bench-press", 3, 8, 12, 90), x("dumbbell-row", 3, 10, 12, 60), x("seated-dumbbell-press", 3, 10, 12, 60), x("dumbbell-lunges", 2, 10, 12, 60), x("plank", 2, 30, 45, 30)] }],
  },
];
