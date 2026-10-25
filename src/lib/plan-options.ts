// Choices shared by the welcome steps and the program builder.

import type { PlanInput } from "@/lib/workout-api";
import type { Tables } from "@/types/database";
import { activeKit } from "@/lib/kit";

export const GOALS = [
  { v: "strength", l: "Strength", d: "Lift heavier on the big lifts" },
  { v: "hypertrophy", l: "Muscle", d: "Build size" },
  { v: "powerbuilding", l: "Both", d: "Strength and size together" },
  { v: "general", l: "General fitness", d: "Stay strong and healthy" },
] as const;

export const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "kettlebell", "band", "trap_bar", "ez_bar", "smith_machine"] as const;
export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbells", machine: "Machines", cable: "Cables", kettlebell: "Kettlebells",
  band: "Bands", trap_bar: "Trap bar", ez_bar: "EZ bar", smith_machine: "Smith machine",
};

export const DEFAULT_EQUIPMENT = ["barbell", "dumbbell", "machine", "cable"];

/** The program builder's starting answers: yours from the welcome steps, else sensible defaults. */
export function planDefaults(profile: Tables<"users"> | null): PlanInput {
  return {
    provider: "gemini",
    goal: profile?.training_goal ?? "strength",
    methodology: "auto",
    days_per_week: profile?.training_days_per_week ?? 4,
    weeks: 8,
    session_minutes: 60,
    experience: "intermediate",
    // What your current place has (your gym, unless you switched to another kit).
    equipment: profile ? [...activeKit(profile).equipment] : DEFAULT_EQUIPMENT,
    notes: "",
  };
}
