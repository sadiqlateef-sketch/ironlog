/**
 * Offline / Local Supabase mock engine for Ironlog.
 * Enables zero-cloud authentication, profile caching, exercise library browsing,
 * and workout logging when no external Supabase instance is provisioned.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEFAULT_EMAIL = "sadiq.lateef@gmail.com";

function toBase64Url(str: string): string {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }
    if (typeof btoa !== "undefined") {
      const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      );
      return btoa(utf8)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }
  } catch {
    // fallback
  }
  return "mock_b64";
}

function createJwt(email = DEFAULT_EMAIL): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email,
      exp: Math.floor(Date.now() / 1000) + 315360000,
      app_metadata: { provider: "email" },
      user_metadata: { name: "Sadiq Lateef" },
    })
  );
  return `${header}.${payload}.ironlog_offline_sig`;
}

function getStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, val: T): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // quota exceeded or private mode
  }
}

const DEFAULT_PROFILE = {
  id: USER_ID,
  email: DEFAULT_EMAIL,
  display_name: "Sadiq Lateef",
  physical_stats: {},
  unit_system: "metric",
  bar_weight_kg: 20,
  available_plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  default_rest_seconds: 90,
  gym_name: "Home Gym",
  gym_lat: null,
  gym_lng: null,
  gym_radius_m: 150,
  training_goal: "strength",
  training_equipment: ["barbell", "dumbbell", "cable"],
  training_days_per_week: 4,
  onboarded_at: "2026-01-01T00:00:00.000Z",
  equipment_kits: [],
  active_kit_id: null,
  work_shifts: [],
  effort_scale: "rpe",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: new Date().toISOString(),
};

const DEFAULT_EXERCISES = [
  {
    id: "e1000000-0000-0000-0000-000000000001",
    name: "Back Squat",
    slug: "back-squat",
    primary_muscle: "quads",
    secondary_muscles: ["glutes", "adductors", "lower_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Squat", "Barbell Squat", "High-Bar Squat"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/1.jpg",
    ],
    instructions: "Set bar on rack at upper chest level. Step under bar, brace core, and squat below parallel.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000002",
    name: "Front Squat",
    slug: "front-squat",
    primary_muscle: "quads",
    secondary_muscles: ["glutes", "abs", "upper_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Barbell Front Squat"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Front_Barbell_Squat/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Front_Barbell_Squat/1.jpg",
    ],
    instructions: "Rack bar across front of shoulders. Keep elbows high and torso upright as you squat.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000003",
    name: "Conventional Deadlift",
    slug: "conventional-deadlift",
    primary_muscle: "hamstrings",
    secondary_muscles: ["glutes", "lower_back", "traps", "forearms"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Deadlift", "Barbell Deadlift"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/1.jpg",
    ],
    instructions: "Stand with feet hip-width apart. Grip barbell, pull chest up, keep spine neutral, and drive feet into ground.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000004",
    name: "Sumo Deadlift",
    slug: "sumo-deadlift",
    primary_muscle: "glutes",
    secondary_muscles: ["quads", "adductors", "hamstrings", "lower_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Sumo Pull"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Sumo_Deadlift/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Sumo_Deadlift/1.jpg",
    ],
    instructions: "Wide stance with toes pointed out. Grip inside knees and drive through heels.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000005",
    name: "Romanian Deadlift",
    slug: "romanian-deadlift",
    primary_muscle: "hamstrings",
    secondary_muscles: ["glutes", "lower_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["RDL", "Stiff-Leg Deadlift"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/1.jpg",
    ],
    instructions: "Hinge at hips pushing buttocks back with slight knee bend until deep hamstring stretch, then drive hips forward.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000006",
    name: "Bench Press",
    slug: "bench-press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Bench", "Barbell Bench Press", "Chest Press"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg",
    ],
    instructions: "Lie back on flat bench. Unrack bar with locked arms. Lower to mid-chest with control, then press upward.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000007",
    name: "Close-Grip Bench Press",
    slug: "close-grip-bench-press",
    primary_muscle: "triceps",
    secondary_muscles: ["chest", "front_delts"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["CGBP", "Close-Grip Bench"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Close-Grip_Barbell_Bench_Press/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Close-Grip_Barbell_Bench_Press/1.jpg",
    ],
    instructions: "Shoulder-width grip on barbell. Keep elbows tucked close to sides to isolate triceps.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000008",
    name: "Incline Bench Press",
    slug: "incline-bench-press",
    primary_muscle: "chest",
    secondary_muscles: ["front_delts", "triceps"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Incline Bench", "Incline Barbell Press"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip/1.jpg",
    ],
    instructions: "Lie on 30-45 degree incline bench. Lower bar to upper chest, then press back to starting lockout.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000009",
    name: "Overhead Press",
    slug: "overhead-press",
    primary_muscle: "front_delts",
    secondary_muscles: ["side_delts", "triceps", "upper_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["OHP", "Military Press", "Shoulder Press"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/1.jpg",
    ],
    instructions: "Hold barbell at clavicle height. Squeeze glutes and core, press directly overhead to full lockout.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000010",
    name: "Barbell Row",
    slug: "barbell-row",
    primary_muscle: "upper_back",
    secondary_muscles: ["lats", "biceps", "rear_delts", "lower_back"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Bent-Over Row", "Barbell Bent-Over Row"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/1.jpg",
    ],
    instructions: "Hinge forward at hips. Pull barbell towards lower sternum, keeping elbows tucked.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000011",
    name: "Pendlay Row",
    slug: "pendlay-row",
    primary_muscle: "upper_back",
    secondary_muscles: ["lats", "biceps", "rear_delts"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Dead-Stop Row"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/1.jpg",
    ],
    instructions: "Barbell returns to dead-stop on floor between every rep. Pull explosively to chest.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000012",
    name: "Hip Thrust",
    slug: "hip-thrust",
    primary_muscle: "glutes",
    secondary_muscles: ["hamstrings"],
    equipment: "barbell",
    mechanic: "compound",
    aliases: ["Glute Bridge", "Barbell Hip Thrust"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Hip_Thrust/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Hip_Thrust/1.jpg",
    ],
    instructions: "Upper back against bench. Drive hips vertically into barbell and lock out glutes at top.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000013",
    name: "Trap Bar Deadlift",
    slug: "trap-bar-deadlift",
    primary_muscle: "quads",
    secondary_muscles: ["glutes", "hamstrings", "traps"],
    equipment: "trap_bar",
    mechanic: "compound",
    aliases: ["Hex Bar Deadlift"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Trap_Bar_Deadlift/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Trap_Bar_Deadlift/1.jpg",
    ],
    instructions: "Stand inside hex bar, grab neutral handles, drive through heels keeping chest proud.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000014",
    name: "Pull-Up",
    slug: "pull-up",
    primary_muscle: "lats",
    secondary_muscles: ["biceps", "upper_back"],
    equipment: "bodyweight",
    mechanic: "compound",
    aliases: ["Pullup", "Pull-Ups"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/1.jpg",
    ],
    instructions: "Grasp bar with overhand grip wider than shoulders. Pull chin above bar, squeeze lats, lower under control.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000015",
    name: "Chin-Up",
    slug: "chin-up",
    primary_muscle: "lats",
    secondary_muscles: ["biceps"],
    equipment: "bodyweight",
    mechanic: "compound",
    aliases: ["Chinup", "Underhand Pull-Up"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Chin-Up/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Chin-Up/1.jpg",
    ],
    instructions: "Underhand grip at shoulder width. Pull chin over bar emphasizing biceps and lower lats.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000016",
    name: "Dip",
    slug: "dip",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "bodyweight",
    mechanic: "compound",
    aliases: ["Parallel Bar Dip", "Chest Dip", "Dips"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dips_-_Chest_Version/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dips_-_Chest_Version/1.jpg",
    ],
    instructions: "Lower body by bending arms until elbows reach 90 degrees, then press back up.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000017",
    name: "Dumbbell Bench Press",
    slug: "dumbbell-bench-press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "dumbbell",
    mechanic: "compound",
    aliases: ["DB Bench", "Dumbbell Press"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bench_Press/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bench_Press/1.jpg",
    ],
    instructions: "Lie on flat bench. Press dumbbells upward together while maintaining forearm verticality.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000018",
    name: "Dumbbell Row",
    slug: "dumbbell-row",
    primary_muscle: "lats",
    secondary_muscles: ["upper_back", "biceps"],
    equipment: "dumbbell",
    mechanic: "compound",
    aliases: ["DB Row", "Single-Arm Row"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/One-Arm_Dumbbell_Row/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/One-Arm_Dumbbell_Row/1.jpg",
    ],
    instructions: "One knee and hand on bench. Row dumbbell up toward hip, squeezing lat.",
    tracking: "weight_reps",
    unilateral: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000019",
    name: "Bulgarian Split Squat",
    slug: "bulgarian-split-squat",
    primary_muscle: "quads",
    secondary_muscles: ["glutes", "adductors"],
    equipment: "dumbbell",
    mechanic: "compound",
    aliases: ["Rear-Foot-Elevated Split Squat", "BSS"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/1.jpg",
    ],
    instructions: "Rear foot on bench behind you. Lower until front thigh is parallel to ground.",
    tracking: "weight_reps",
    unilateral: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000020",
    name: "Lat Pulldown",
    slug: "lat-pulldown",
    primary_muscle: "lats",
    secondary_muscles: ["biceps", "upper_back"],
    equipment: "cable",
    mechanic: "compound",
    aliases: ["Pulldown", "Cable Pulldown"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/1.jpg",
    ],
    instructions: "Sit with thighs secured under pads. Pull bar down to upper chest, leading with elbows.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000021",
    name: "Seated Cable Row",
    slug: "seated-cable-row",
    primary_muscle: "upper_back",
    secondary_muscles: ["lats", "biceps", "rear_delts"],
    equipment: "cable",
    mechanic: "compound",
    aliases: ["Cable Row", "Low Row"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/1.jpg",
    ],
    instructions: "Sit upright with neutral spine. Pull handles to abdomen and squeeze shoulder blades.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000022",
    name: "Leg Press",
    slug: "leg-press",
    primary_muscle: "quads",
    secondary_muscles: ["glutes"],
    equipment: "machine",
    mechanic: "compound",
    aliases: ["Machine Leg Press", "Sled Press"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/1.jpg",
    ],
    instructions: "Feet shoulder-width on platform. Lower sled to 90 degrees knee flexion, press without locking knees.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000023",
    name: "Lateral Raise",
    slug: "lateral-raise",
    primary_muscle: "side_delts",
    secondary_muscles: ["traps"],
    equipment: "dumbbell",
    mechanic: "isolation",
    aliases: ["Dumbbell Lateral Raise", "Side Raise", "Lateral Delt Raise"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/1.jpg",
    ],
    instructions: "Raise dumbbells outwards to side until parallel to floor, lead with elbows.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000024",
    name: "Face Pull",
    slug: "face-pull",
    primary_muscle: "rear_delts",
    secondary_muscles: ["upper_back", "traps"],
    equipment: "cable",
    mechanic: "isolation",
    aliases: ["Rope Face Pull", "Cable Face Pull"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/1.jpg",
    ],
    instructions: "Facing high pulley with rope attached, pull hands to eyes while flaring elbows high and wide.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000025",
    name: "Barbell Curl",
    slug: "barbell-curl",
    primary_muscle: "biceps",
    secondary_muscles: ["forearms"],
    equipment: "barbell",
    mechanic: "isolation",
    aliases: ["Bicep Curl", "Biceps Curl", "Standing Curl"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/1.jpg",
    ],
    instructions: "Stand tall, curl barbell towards shoulders while keeping elbows pinned to sides.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000026",
    name: "Tricep Pushdown",
    slug: "tricep-pushdown",
    primary_muscle: "triceps",
    secondary_muscles: [],
    equipment: "cable",
    mechanic: "isolation",
    aliases: ["Cable Tricep Pushdown", "Triceps Pushdown", "Cable Pushdown"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/1.jpg",
    ],
    instructions: "Attach rope or bar to high pulley. Extend elbows downwards to lock out triceps.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000027",
    name: "Leg Curl",
    slug: "leg-curl",
    primary_muscle: "hamstrings",
    secondary_muscles: [],
    equipment: "machine",
    mechanic: "isolation",
    aliases: ["Hamstring Curl", "Machine Leg Curl"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/1.jpg",
    ],
    instructions: "Lie face down or seated. Curl heels toward glutes and control the negative.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000028",
    name: "Leg Extension",
    slug: "leg-extension",
    primary_muscle: "quads",
    secondary_muscles: [],
    equipment: "machine",
    mechanic: "isolation",
    aliases: ["Quad Extension", "Machine Leg Extension"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Extensions/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Extensions/1.jpg",
    ],
    instructions: "Sit on machine with pad against shins. Extend knees to full contraction and pause.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000029",
    name: "Standing Calf Raise",
    slug: "standing-calf-raise",
    primary_muscle: "calves",
    secondary_muscles: [],
    equipment: "machine",
    mechanic: "isolation",
    aliases: ["Calf Raise", "Machine Calf Raise"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/1.jpg",
    ],
    instructions: "Balls of feet on edge. Lower heels for deep calf stretch, push through toes to peak contraction.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000030",
    name: "Hanging Leg Raise",
    slug: "hanging-leg-raise",
    primary_muscle: "abs",
    secondary_muscles: ["obliques"],
    equipment: "bodyweight",
    mechanic: "isolation",
    aliases: ["Leg Raise", "Hanging Knee Raise"],
    image_urls: [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/1.jpg",
    ],
    instructions: "Hang from pull-up bar. Flex core to lift legs up to 90 degrees without swinging.",
    tracking: "weight_reps",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000031",
    name: "Treadmill Run",
    slug: "treadmill-run",
    primary_muscle: "quads",
    secondary_muscles: ["hamstrings", "calves", "glutes"],
    equipment: "machine",
    mechanic: "compound",
    aliases: ["Treadmill", "Running", "Treadmill Jog"],
    image_urls: [],
    instructions: "Run or jog on the treadmill. Log distance and time.",
    tracking: "distance_time",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "e1000000-0000-0000-0000-000000000032",
    name: "Dead Hang",
    slug: "dead-hang",
    primary_muscle: "forearms",
    secondary_muscles: ["lats"],
    equipment: "bodyweight",
    mechanic: "isolation",
    aliases: ["Bar Hang"],
    image_urls: [],
    instructions: "Hang from a pull-up bar with straight arms and relaxed shoulders. Hold for time.",
    tracking: "time",
    unilateral: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const DEFAULT_ROUTINES = [
  {
    id: "r1000000-0000-0000-0000-000000000001",
    user_id: USER_ID,
    name: "Full Body A (Squat & Bench)",
    notes: "Core heavy compound strength foundation",
    position: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "r1000000-0000-0000-0000-000000000002",
    user_id: USER_ID,
    name: "Full Body B (Deadlift & Press)",
    notes: "Posterior chain and overhead power",
    position: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const DEFAULT_ROUTINE_EXERCISES = [
  {
    id: "re100000-0000-0000-0000-000000000001",
    routine_id: "r1000000-0000-0000-0000-000000000001",
    exercise_id: "e1000000-0000-0000-0000-000000000001", // Back Squat
    position: 0,
    superset_group: null,
    target_sets: 3,
    target_reps: 5,
    target_reps_max: null,
    target_weight_kg: 100,
    target_rpe: 8,
    target_percent_1rm: null,
    warmup_sets: 2,
    rest_seconds: 120,
    notes: "Focus on hip drive and depth",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "re100000-0000-0000-0000-000000000002",
    routine_id: "r1000000-0000-0000-0000-000000000001",
    exercise_id: "e1000000-0000-0000-0000-000000000006", // Bench Press
    position: 1,
    superset_group: null,
    target_sets: 3,
    target_reps: 5,
    target_reps_max: null,
    target_weight_kg: 80,
    target_rpe: 8,
    target_percent_1rm: null,
    warmup_sets: 2,
    rest_seconds: 120,
    notes: "Pause on chest for half second",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "re100000-0000-0000-0000-000000000003",
    routine_id: "r1000000-0000-0000-0000-000000000001",
    exercise_id: "e1000000-0000-0000-0000-000000000010", // Barbell Row
    position: 2,
    superset_group: null,
    target_sets: 3,
    target_reps: 8,
    target_reps_max: null,
    target_weight_kg: 70,
    target_rpe: 8,
    target_percent_1rm: null,
    warmup_sets: 1,
    rest_seconds: 90,
    notes: "Keep spine neutral",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "re100000-0000-0000-0000-000000000004",
    routine_id: "r1000000-0000-0000-0000-000000000001",
    exercise_id: "e1000000-0000-0000-0000-000000000009", // Overhead Press
    position: 3,
    superset_group: null,
    target_sets: 3,
    target_reps: 8,
    target_reps_max: null,
    target_weight_kg: 50,
    target_rpe: 8,
    target_percent_1rm: null,
    warmup_sets: 1,
    rest_seconds: 90,
    notes: "Lockout overhead",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

function parseFilterVal(val: string): unknown {
  if (val === "null") return null;
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}

function evaluateFilter(row: Record<string, unknown>, key: string, paramValue: string): boolean {
  if (key === "select" || key === "order" || key === "limit" || key === "offset") return true;

  if (paramValue === "not.is.null") {
    return row[key] !== null && row[key] !== undefined;
  }
  if (paramValue === "is.null") {
    return row[key] === null || row[key] === undefined;
  }
  if (paramValue.startsWith("eq.")) {
    const raw = paramValue.slice(3);
    const expected = parseFilterVal(raw);
    const actual = row[key];
    if (typeof actual === "number") return actual === Number(expected);
    if (typeof actual === "boolean") return actual === (raw === "true");
    if (expected === null) return actual === null || actual === undefined;
    return String(actual ?? "") === String(expected ?? "");
  }
  if (paramValue.startsWith("neq.")) {
    const raw = paramValue.slice(4);
    const expected = parseFilterVal(raw);
    const actual = row[key];
    if (typeof actual === "number") return actual !== Number(expected);
    if (typeof actual === "boolean") return actual !== (raw === "true");
    if (expected === null) return actual !== null && actual !== undefined;
    return String(actual ?? "") !== String(expected ?? "");
  }
  if (paramValue.startsWith("in.(") && paramValue.endsWith(")")) {
    const list = paramValue
      .slice(4, -1)
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""));
    const actual = String(row[key] ?? "");
    return list.includes(actual);
  }
  if (paramValue.startsWith("gte.")) {
    const v = paramValue.slice(4);
    return (row[key] ?? "") >= v;
  }
  if (paramValue.startsWith("lte.")) {
    const v = paramValue.slice(4);
    return (row[key] ?? "") <= v;
  }
  if (paramValue.startsWith("gt.")) {
    const v = paramValue.slice(3);
    return (row[key] ?? "") > v;
  }
  if (paramValue.startsWith("lt.")) {
    const v = paramValue.slice(3);
    return (row[key] ?? "") < v;
  }
  return true;
}

function applyQuery<T extends Record<string, unknown>>(items: T[], url: URL): T[] {
  let matched = items.filter((item) => {
    for (const [k, v] of url.searchParams.entries()) {
      if (!evaluateFilter(item, k, v)) return false;
    }
    return true;
  });

  const order = url.searchParams.get("order");
  if (order) {
    const parts = order.split(",");
    matched.sort((a, b) => {
      for (const part of parts) {
        const [field, dir] = part.trim().split(".");
        const desc = dir === "desc";
        const av = a[field] as string | number | null | undefined;
        const bv = b[field] as string | number | null | undefined;
        if (av === bv) continue;
        if (av == null) return desc ? 1 : -1;
        if (bv == null) return desc ? -1 : 1;
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  const limit = url.searchParams.get("limit");
  if (limit) {
    matched = matched.slice(0, Number(limit));
  }

  return matched;
}

function recalculateSessionVolume(sessionId: string): number {
  interface MockSetRow {
    session_id?: string;
    is_completed?: boolean;
    completed_at?: string | null;
    set_type?: string;
    weight?: number;
    reps?: number;
    [k: string]: unknown;
  }
  interface MockSessionRow {
    id?: string;
    volume?: number;
    [k: string]: unknown;
  }
  const sets = getStored<MockSetRow[]>("ironlog_table_workout_sets", []);
  const sessionSets = sets.filter(
    (s) => s.session_id === sessionId && (s.is_completed || s.completed_at) && s.set_type !== "warmup"
  );
  const volume = sessionSets.reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0
  );
  const sessions = getStored<MockSessionRow[]>("ironlog_table_workout_sessions", []);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    sessions[idx] = { ...sessions[idx], volume };
    setStored("ironlog_table_workout_sessions", sessions);
  }
  return volume;
}

/**
 * Intercepts Supabase REST and Auth HTTP calls and fulfills them locally.
 */
export async function handleMockRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!urlStr) return null;

  let url: URL;
  try {
    url = new URL(urlStr, "https://ironlog.supabase.co");
  } catch {
    return null;
  }

  const path = url.pathname;
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const accept = headers.get("accept") || "";

  // Auth endpoints
  if (path.includes("/auth/v1/token") || path.includes("/auth/v1/signup") || path.includes("/auth/v1/verify")) {
    let email = DEFAULT_EMAIL;
    if (init?.body) {
      try {
        const parsed = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as BufferSource));
        if (parsed.email) email = parsed.email.trim();
      } catch {
        // ignore
      }
    }

    const jwt = createJwt(email);
    const userObj = {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      phone: "",
      confirmed_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { name: "Sadiq Lateef" },
      identities: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify({
        access_token: jwt,
        token_type: "bearer",
        expires_in: 315360000,
        expires_at: Math.floor(Date.now() / 1000) + 315360000,
        refresh_token: "ironlog-offline-refresh-token",
        user: userObj,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (path.includes("/auth/v1/user")) {
    const userObj = {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: DEFAULT_EMAIL,
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      phone: "",
      confirmed_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { name: "Sadiq Lateef" },
      identities: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: new Date().toISOString(),
    };
    return new Response(JSON.stringify(userObj), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.includes("/auth/v1/logout") || path.includes("/auth/v1/recover") || path.includes("/auth/v1/otp")) {
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // REST API: users table
  if (path.includes("/rest/v1/users")) {
    let profile = getStored("ironlog_profile", DEFAULT_PROFILE);
    if (method === "PATCH" || method === "PUT" || method === "POST") {
      let patch = {};
      try {
        patch = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      profile = { ...profile, ...patch, updated_at: new Date().toISOString() };
      setStored("ironlog_profile", profile);
      const res = accept.includes("vnd.pgrst.object+json") ? profile : [profile];
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = accept.includes("vnd.pgrst.object+json") ? profile : [profile];
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: exercises
  if (path.includes("/rest/v1/exercises")) {
    const custom = getStored<typeof DEFAULT_EXERCISES>("ironlog_custom_exercises", []);
    const all = [...DEFAULT_EXERCISES, ...custom];

    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      const newEx = {
        id: (body.id as string) || `custom-${Date.now()}`,
        name: (body.name as string) || "Custom Exercise",
        slug: (body.slug as string) || "custom-exercise",
        primary_muscle: (body.primary_muscle as string) || "chest",
        secondary_muscles: (body.secondary_muscles as string[]) || [],
        equipment: (body.equipment as string) || "barbell",
        mechanic: (body.mechanic as string) || "compound",
        aliases: (body.aliases as string[]) || [],
        image_urls: (body.image_urls as string[]) || [],
        instructions: (body.instructions as string) || "",
        tracking: (body.tracking as string) || "weight_reps",
        unilateral: !!body.unilateral,
        created_by: USER_ID,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setStored("ironlog_custom_exercises", [...custom, newEx]);
      const res = accept.includes("vnd.pgrst.object+json") ? newEx : [newEx];
      return new Response(JSON.stringify(res), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const matched = applyQuery(all, url);
    return new Response(JSON.stringify(matched), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: routines
  if (path.includes("/rest/v1/routines")) {
    const routines = getStored("ironlog_routines", DEFAULT_ROUTINES);
    const routineExercises = getStored("ironlog_routine_exercises", DEFAULT_ROUTINE_EXERCISES);
    const custom = getStored<typeof DEFAULT_EXERCISES>("ironlog_custom_exercises", []);
    const exercises = [...DEFAULT_EXERCISES, ...custom];
    const exMap = new Map(exercises.map((e) => [e.id, e]));

    if (method === "POST" || method === "PUT") {
      let body: Record<string, unknown> | Record<string, unknown>[] = {};
      try {
        body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      const items = Array.isArray(body) ? body : [body];
      const merged = [...routines] as Array<Record<string, unknown>>;
      for (const item of items) {
        const id = (item.id as string) || `routine-${Date.now()}`;
        const idx = merged.findIndex((r) => r.id === id);
        const row = { ...item, id, updated_at: new Date().toISOString() };
        if (idx >= 0) merged[idx] = row;
        else merged.push(row);
      }
      setStored("ironlog_routines", merged);
      const res = accept.includes("vnd.pgrst.object+json") ? items[0] : items;
      return new Response(JSON.stringify(res), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const routinesWithExercises = routines.map((r: { id?: string; [k: string]: unknown }) => {
      const reList = (routineExercises as Array<{ routine_id?: string; position?: number; exercise_id?: string; [k: string]: unknown }>)
        .filter((re) => re.routine_id === r.id)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((re) => {
          const ex = re.exercise_id ? exMap.get(re.exercise_id) : undefined;
          return {
            ...re,
            exercises: ex
              ? {
                  name: ex.name,
                  equipment: ex.equipment,
                  primary_muscle: ex.primary_muscle,
                  image_urls: ex.image_urls || [],
                }
              : null,
          };
        });
      return {
        ...r,
        archived: r.archived ?? false,
        program_id: r.program_id ?? null,
        routine_exercises: reList,
      };
    });

    const matched = applyQuery(routinesWithExercises, url);

    if (accept.includes("vnd.pgrst.object+json")) {
      return new Response(JSON.stringify(matched[0] || null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(matched), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: routine_exercises
  if (path.includes("/rest/v1/routine_exercises")) {
    const routineExercises = getStored("ironlog_routine_exercises", DEFAULT_ROUTINE_EXERCISES);
    if (method === "POST" || method === "PUT") {
      let body: Record<string, unknown> | Record<string, unknown>[] = {};
      try {
        body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      const items = Array.isArray(body) ? body : [body];
      const merged = [...routineExercises] as Array<Record<string, unknown>>;
      for (const item of items) {
        const id = (item.id as string) || `re-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const idx = merged.findIndex((r) => r.id === id);
        const row = { ...item, id, updated_at: new Date().toISOString() };
        if (idx >= 0) merged[idx] = row;
        else merged.push(row);
      }
      setStored("ironlog_routine_exercises", merged);
      const res = accept.includes("vnd.pgrst.object+json") ? items[0] : items;
      return new Response(JSON.stringify(res), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const matched = applyQuery(routineExercises, url);
    return new Response(JSON.stringify(matched), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: programs
  if (path.includes("/rest/v1/programs")) {
    const programs = getStored<Array<Record<string, unknown>>>("ironlog_programs", []);
    const routines = getStored<Array<Record<string, unknown>>>("ironlog_routines", DEFAULT_ROUTINES);
    const routineExercises = getStored<Array<Record<string, unknown>>>("ironlog_routine_exercises", DEFAULT_ROUTINE_EXERCISES);
    const custom = getStored<typeof DEFAULT_EXERCISES>("ironlog_custom_exercises", []);
    const exercises = [...DEFAULT_EXERCISES, ...custom];
    const exMap = new Map(exercises.map((e) => [e.id, e]));

    if (method === "POST" || method === "PUT") {
      let body: Record<string, unknown> | Record<string, unknown>[] = {};
      try {
        body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      const items = Array.isArray(body) ? body : [body];
      const merged = [...programs];
      for (const item of items) {
        const id = (item.id as string) || `prog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const idx = merged.findIndex((p) => p.id === id);
        const row = {
          ...item,
          id,
          is_active: item.is_active ?? false,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (idx >= 0) merged[idx] = row;
        else merged.push(row);
      }
      setStored("ironlog_programs", merged);
      const res = accept.includes("vnd.pgrst.object+json") ? items[0] : items;
      return new Response(JSON.stringify(res), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE") {
      const remaining = programs.filter((p) => {
        for (const [k, v] of url.searchParams.entries()) {
          if (!evaluateFilter(p, k, v)) return true;
        }
        return false;
      });
      setStored("ironlog_programs", remaining);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fullPrograms = programs.map((p) => {
      const pRoutines = routines
        .filter((r) => r.program_id === p.id)
        .sort((a, b) => ((a.program_week as number) || 0) - ((b.program_week as number) || 0) || ((a.program_day as number) || 0) - ((b.program_day as number) || 0))
        .map((r) => {
          const reList = routineExercises
            .filter((re) => re.routine_id === r.id)
            .sort((a, b) => ((a.position as number) || 0) - ((b.position as number) || 0))
            .map((re) => {
              const ex = re.exercise_id ? exMap.get(re.exercise_id as string) : undefined;
              return {
                ...re,
                exercises: ex
                  ? {
                      name: ex.name,
                      equipment: ex.equipment,
                      primary_muscle: ex.primary_muscle,
                      image_urls: ex.image_urls || [],
                    }
                  : null,
              };
            });
          return {
            ...r,
            routine_exercises: reList,
          };
        });
      return {
        ...p,
        routines: pRoutines,
      };
    });

    const matched = applyQuery(fullPrograms, url);
    if (accept.includes("vnd.pgrst.object+json")) {
      return new Response(JSON.stringify(matched[0] || null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(matched), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: routine_adjustments
  if (path.includes("/rest/v1/routine_adjustments")) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: weekly_recaps
  if (path.includes("/rest/v1/weekly_recaps")) {
    const res = accept.includes("vnd.pgrst.object+json") ? null : [];
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // REST API: claude_links
  if (path.includes("/rest/v1/claude_links")) {
    const res = accept.includes("vnd.pgrst.object+json") ? null : [];
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // RPC Endpoints
  if (path.includes("/rest/v1/rpc/get_last_performance")) {
    let exId = url.searchParams.get("p_exercise_id");
    if (!exId && init?.body) {
      try {
        const parsed = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as BufferSource));
        exId = parsed.p_exercise_id;
      } catch {}
    }
    interface PerfSession { id: string; end_time?: string | null; start_time: string; [k: string]: unknown }
    interface PerfSet { session_id?: string; exercise_id?: string; is_completed?: boolean; completed_at?: string | null; exercise_order?: number; set_number?: number; [k: string]: unknown }
    const sessions = getStored<PerfSession[]>("ironlog_table_workout_sessions", [])
      .filter((s) => s.end_time != null)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    const allSets = getStored<PerfSet[]>("ironlog_table_workout_sets", []);
    for (const sess of sessions) {
      const matchSets = allSets.filter(
        (s) => s.session_id === sess.id && s.exercise_id === exId && (s.is_completed || s.completed_at)
      );
      if (matchSets.length > 0) {
        matchSets.sort((a, b) => (a.exercise_order || 0) - (b.exercise_order || 0) || (a.set_number || 0) - (b.set_number || 0));
        return new Response(JSON.stringify(matchSets), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.includes("/rest/v1/rpc/get_logged_exercises")) {
    interface LoggedExSet { exercise_id?: string; is_completed?: boolean; completed_at?: string | null; [k: string]: unknown }
    const allSets = getStored<LoggedExSet[]>("ironlog_table_workout_sets", []);
    const completed = allSets.filter((s) => s.is_completed || s.completed_at);
    const exIds = [...new Set(completed.map((s) => s.exercise_id))];
    return new Response(JSON.stringify(exIds.map((exercise_id) => ({ exercise_id }))), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.includes("/rest/v1/rpc/start_program")) {
    let pId = url.searchParams.get("p_id");
    if (!pId && init?.body) {
      try {
        const parsed = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as BufferSource));
        pId = parsed.p_id;
      } catch {}
    }
    const programs = getStored<Array<Record<string, unknown>>>("ironlog_programs", []);
    const updated = programs.map((p) => ({
      ...p,
      is_active: p.id === pId,
      started_at: p.id === pId ? new Date().toISOString() : p.started_at,
    }));
    setStored("ironlog_programs", updated);
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.includes("/rest/v1/rpc/stop_program")) {
    let pId = url.searchParams.get("p_id");
    if (!pId && init?.body) {
      try {
        const parsed = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as BufferSource));
        pId = parsed.p_id;
      } catch {}
    }
    const programs = getStored<Array<Record<string, unknown>>>("ironlog_programs", []);
    const updated = programs.map((p) => ({
      ...p,
      is_active: p.id === pId ? false : (p.is_active ?? false),
    }));
    setStored("ironlog_programs", updated);
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.includes("/rest/v1/rpc/program_progress")) {
    let pId = url.searchParams.get("p_program_id");
    if (!pId && init?.body) {
      try {
        const parsed = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as BufferSource));
        pId = parsed.p_program_id;
      } catch {}
    }
    const programs = getStored<Array<Record<string, unknown>>>("ironlog_programs", []);
    const prog = pId ? programs.find((p) => p.id === pId) : programs.find((p) => p.is_active);
    if (!prog) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const routines = getStored<Array<Record<string, unknown>>>("ironlog_routines", DEFAULT_ROUTINES)
      .filter((r) => r.program_id === prog.id)
      .sort((a, b) => ((a.program_week as number) || 0) - ((b.program_week as number) || 0) || ((a.program_day as number) || 0) - ((b.program_day as number) || 0));

    const sessions = getStored<Array<Record<string, unknown>>>("ironlog_table_workout_sessions", [])
      .filter((s) => s.end_time != null);
    const doneRoutineIds = routines
      .filter((r) => sessions.some((s) => s.routine_id === r.id))
      .map((r) => r.id as string);
    const nextRoutine = routines.find((r) => !doneRoutineIds.includes(r.id as string)) || routines[0];
    const total = routines.length;
    const done = doneRoutineIds.length;

    const row = {
      program_id: prog.id,
      program_name: prog.name,
      weeks: prog.weeks,
      days_per_week: prog.days_per_week,
      is_active: prog.is_active ?? false,
      total,
      done,
      done_routine_ids: doneRoutineIds,
      next_routine_id: nextRoutine?.id ?? null,
      next_routine_name: nextRoutine?.name ?? null,
      next_week: (nextRoutine?.program_week as number) ?? 1,
      next_day: (nextRoutine?.program_day as number) ?? 1,
    };
    return new Response(JSON.stringify([row]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Generic REST collections: workout_sessions, workout_sets, exercise_prefs, etc.
  if (path.startsWith("/rest/v1/")) {
    const rawTable = path.replace("/rest/v1/", "").split("?")[0];
    if (rawTable.startsWith("rpc/")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const storageKey = `ironlog_table_${rawTable}`;
    const items = getStored<Record<string, unknown>[]>(storageKey, []);

    if (method === "POST" || method === "PUT") {
      let body: Record<string, unknown> | Record<string, unknown>[] = {};
      try {
        body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }
      const incoming = Array.isArray(body) ? body : [body];
      const merged = [...items];
      for (const item of incoming) {
        const id = (item.id as string) || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const idx = merged.findIndex((r) => r.id === id);
        const row = { ...item, id, updated_at: new Date().toISOString() };
        if (idx >= 0) merged[idx] = { ...merged[idx], ...row };
        else merged.push(row);
      }
      setStored(storageKey, merged);

      if (rawTable === "workout_sets") {
        for (const item of incoming) {
          if (item.session_id) recalculateSessionVolume(item.session_id as string);
        }
      }

      const res = accept.includes("vnd.pgrst.object+json") ? incoming[0] : incoming;
      return new Response(JSON.stringify(res), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "PATCH") {
      let patch: Record<string, unknown> = {};
      try {
        patch = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
      } catch {
        // ignore
      }

      const updatedRows: Record<string, unknown>[] = [];
      const updatedAll = items.map((item) => {
        let matches = true;
        for (const [k, v] of url.searchParams.entries()) {
          if (!evaluateFilter(item, k, v)) {
            matches = false;
            break;
          }
        }
        if (matches) {
          const updated = { ...item, ...patch, updated_at: new Date().toISOString() };
          updatedRows.push(updated);
          return updated;
        }
        return item;
      });

      setStored(storageKey, updatedAll);

      if (rawTable === "workout_sessions") {
        for (const row of updatedRows) {
          if (row.end_time && row.volume == null) {
            recalculateSessionVolume(row.id as string);
          }
        }
      } else if (rawTable === "workout_sets") {
        for (const row of updatedRows) {
          if (row.session_id) recalculateSessionVolume(row.session_id as string);
        }
      }

      const res = accept.includes("vnd.pgrst.object+json") ? (updatedRows[0] || null) : updatedRows;
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE") {
      const deletedRows: Record<string, unknown>[] = [];
      const remainingRows = items.filter((item) => {
        let matches = true;
        for (const [k, v] of url.searchParams.entries()) {
          if (!evaluateFilter(item, k, v)) {
            matches = false;
            break;
          }
        }
        if (matches) {
          deletedRows.push(item);
          return false;
        }
        return true;
      });

      setStored(storageKey, remainingRows);

      if (rawTable === "workout_sessions") {
        const deletedIds = new Set(deletedRows.map((r) => r.id as string));
        const sets = getStored<Array<{ session_id?: string; [k: string]: unknown }>>("ironlog_table_workout_sets", []);
        const remainingSets = sets.filter((s) => !deletedIds.has(s.session_id as string));
        setStored("ironlog_table_workout_sets", remainingSets);
      } else if (rawTable === "workout_sets") {
        for (const row of deletedRows) {
          if (typeof row.session_id === "string") recalculateSessionVolume(row.session_id);
        }
      }

      const res = accept.includes("vnd.pgrst.object+json") ? (deletedRows[0] || null) : deletedRows;
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // GET
    const matched = applyQuery(items, url);
    if (accept.includes("vnd.pgrst.object+json")) {
      const single = matched[0] ?? null;
      return new Response(JSON.stringify(single), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(matched), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Edge functions: generate-plan
  if (path.includes("/functions/v1/generate-plan")) {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as BufferSource));
    } catch {
      // ignore
    }

    const provider = (body.provider as string) === "claude" ? "Claude" : "Gemini";
    const goal = (body.goal as string) || "strength";
    const weeks = Number(body.weeks) || 8;
    const daysPerWeek = Number(body.days_per_week) || 4;
    const methodology = (body.methodology as string) || "auto";

    const custom = getStored<typeof DEFAULT_EXERCISES>("ironlog_custom_exercises", []);
    const exercises = [...DEFAULT_EXERCISES, ...custom];

    const programId = `prog-${Date.now()}`;
    const capitalizedGoal = goal.charAt(0).toUpperCase() + goal.slice(1);
    const programName = `${provider} ${capitalizedGoal} (${weeks}w · ${daysPerWeek}d)`;
    const summary = `${provider}-designed ${weeks}-week ${methodology} plan focusing on ${goal} across ${daysPerWeek} training days per week.`;

    const newProgram = {
      id: programId,
      name: programName,
      methodology,
      summary,
      progression_rule: "Progressive overload: Add 5 lb / 2.5 kg on primary lifts when all reps in target range are completed with good form.",
      weeks,
      days_per_week: daysPerWeek,
      is_active: false,
      ai_generated: true,
      ai_metadata: { request: body, model: provider === "Gemini" ? "gemini-3.8-flash" : "claude-opus-5-5" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const storedPrograms = getStored<Array<Record<string, unknown>>>("ironlog_programs", []);
    setStored("ironlog_programs", [newProgram, ...storedPrograms]);

    const storedRoutines = getStored<Array<Record<string, unknown>>>("ironlog_routines", DEFAULT_ROUTINES);
    const storedRoutineExercises = getStored<Array<Record<string, unknown>>>("ironlog_routine_exercises", DEFAULT_ROUTINE_EXERCISES);

    const newRoutines: Array<Record<string, unknown>> = [];
    const newRoutineExercises: Array<Record<string, unknown>> = [];

    const dayFocuses = [
      { name: "Upper Body Power", exSlugs: ["barbell-bench-press", "barbell-overhead-press", "pull-up", "incline-dumbbell-press"] },
      { name: "Lower Body Strength", exSlugs: ["back-squat", "conventional-deadlift", "romanian-deadlift", "standing-calf-raise"] },
      { name: "Push Hypertrophy", exSlugs: ["dumbbell-shoulder-press", "cable-chest-fly", "triceps-pushdown", "lateral-raise"] },
      { name: "Pull & Legs", exSlugs: ["barbell-bent-over-row", "front-squat", "barbell-curl", "face-pull"] },
      { name: "Full Body Density", exSlugs: ["back-squat", "barbell-bench-press", "pull-up", "hanging-leg-raise"] },
      { name: "Conditioning & Weak Points", exSlugs: ["romanian-deadlift", "dumbbell-curl", "push-up", "cable-crunch"] },
    ];

    for (let w = 1; w <= weeks; w++) {
      for (let d = 1; d <= daysPerWeek; d++) {
        const focus = dayFocuses[(d - 1) % dayFocuses.length];
        const routineId = `routine-${programId}-w${w}-d${d}`;
        newRoutines.push({
          id: routineId,
          name: `Week ${w} · Day ${d}: ${focus.name}`,
          description: `${provider} training session targeting ${focus.name.toLowerCase()}`,
          program_id: programId,
          program_week: w,
          program_day: d,
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        focus.exSlugs.forEach((slug, idx) => {
          const ex = exercises.find((e) => e.slug === slug) || exercises[idx % exercises.length];
          newRoutineExercises.push({
            id: `re-${routineId}-${idx + 1}`,
            routine_id: routineId,
            exercise_id: ex.id,
            position: idx + 1,
            target_sets: 3 + (w > 4 ? 1 : 0),
            target_reps: 8,
            target_reps_max: 10,
            warmup_sets: idx === 0 ? 2 : 0,
            rest_seconds: 90,
            notes: idx === 0 ? "Main compound: keep tight core" : "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        });
      }
    }

    setStored("ironlog_routines", [...storedRoutines, ...newRoutines]);
    setStored("ironlog_routine_exercises", [...storedRoutineExercises, ...newRoutineExercises]);

    return new Response(JSON.stringify({ program_id: programId, program_name: programName, workouts: newRoutines.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Edge functions fallback
  if (path.includes("/functions/v1/")) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
