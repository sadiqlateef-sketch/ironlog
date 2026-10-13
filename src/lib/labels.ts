import type { EquipmentType, MuscleGroup } from "@/types/database";

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  upper_back: "Upper back",
  lats: "Lats",
  lower_back: "Lower back",
  traps: "Traps",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  abductors: "Abductors",
  calves: "Calves",
  neck: "Neck",
};

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  machine: "Machine",
  cable: "Cable",
  bodyweight: "Bodyweight",
  band: "Band",
  smith_machine: "Smith machine",
  ez_bar: "EZ bar",
  trap_bar: "Trap bar",
  other: "Other",
};

/** Broad groups for the filter chips, so the list isn't 20 chips wide. */
export const MUSCLE_FILTERS: { label: string; muscles: MuscleGroup[] }[] = [
  { label: "Chest", muscles: ["chest"] },
  { label: "Back", muscles: ["upper_back", "lats", "lower_back", "traps"] },
  { label: "Shoulders", muscles: ["front_delts", "side_delts", "rear_delts"] },
  { label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { label: "Legs", muscles: ["quads", "hamstrings", "glutes", "adductors", "abductors", "calves"] },
  { label: "Core", muscles: ["abs", "obliques"] },
];

/** Bars you'd load with plates. */
export const PLATE_LOADED: EquipmentType[] = ["barbell", "trap_bar", "ez_bar", "smith_machine"];
