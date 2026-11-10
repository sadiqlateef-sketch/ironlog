/**
 * Deterministically derives an exercise's base movement variation group
 * from its metadata (name, primary_muscle, aliases). Returns null if the
 * base movement cannot be determined with certainty.
 */
export function deriveVariationGroup(exercise: {
  name: string;
  primary_muscle?: string;
  aliases?: string[] | null;
}): string | null {
  const name = exercise.name;
  const muscle = exercise.primary_muscle;
  const aliases = exercise.aliases ?? [];
  const hasAlias = (a: string) => aliases.includes(a);

  // Bench press variants (chest)
  if (muscle === "chest" && (/\b(bench press|chest press)\b/i.test(name) || hasAlias("Bench Press"))) return "bench-press";
  // Squat variants (quads)
  if (muscle === "quads" && (/\bsquat\b/i.test(name) || hasAlias("Squat"))) return "squat";
  // Deadlift variants
  if (/\bdeadlift\b/i.test(name) || hasAlias("Deadlift")) return "deadlift";
  // Overhead press variants (shoulders)
  if (muscle === "shoulders" && (/\b(overhead press|shoulder press|military press)\b/i.test(name) || hasAlias("Overhead Press"))) return "overhead-press";
  // Row variants (upper back / lats)
  if ((muscle === "upper_back" || muscle === "lats") && (/\b(bent[ -]over row|barbell row|dumbbell row|cable row|t-bar row|pendlay row|seated row|inverted row|row)\b/i.test(name) || hasAlias("Row"))) return "row";
  // Pull-up / chin-up variants (lats)
  if (muscle === "lats" && (/\b(pull[ -]?up|chin[ -]?up|lat pull[ -]?down)\b/i.test(name) || hasAlias("Pull-Up"))) return "pull-up";
  // Dip variants
  if (/\bdips?\b/i.test(name) || hasAlias("Dip")) return "dip";
  // Lunge variants (quads / glutes)
  if ((muscle === "quads" || muscle === "glutes") && (/\blunges?\b/i.test(name) || hasAlias("Lunge"))) return "lunge";
  // Hip thrust / glute bridge variants (glutes)
  if (muscle === "glutes" && (/\b(hip thrust|glute bridge)\b/i.test(name) || hasAlias("Hip Thrust"))) return "hip-thrust";
  // Bicep curl variants (biceps)
  if (muscle === "biceps" && (/\b(biceps? curl|hammer curl|preacher curl|concentration curl|curl)\b/i.test(name) || hasAlias("Bicep Curl"))) return "biceps-curl";
  // Triceps extension / pushdown variants (triceps)
  if (muscle === "triceps" && (/\b(triceps? extension|pushdown|skull[ -]?crusher|kickback)\b/i.test(name) || hasAlias("Triceps Pushdown"))) return "triceps-extension";
  // Lateral raise variants (shoulders)
  if (muscle === "shoulders" && (/\b(lateral raise|side raise)\b/i.test(name) || hasAlias("Lateral Raise"))) return "lateral-raise";
  // Chest fly variants (chest)
  if (muscle === "chest" && (/\b(chest fly|pec fly|cable fly|dumbbell fly|flyes?)\b/i.test(name) || hasAlias("Chest Fly"))) return "chest-fly";
  // Calf raise variants (calves)
  if (muscle === "calves" && (/\bcalf raise\b/i.test(name) || hasAlias("Calf Raise"))) return "calf-raise";
  // Leg curl variants (hamstrings)
  if (muscle === "hamstrings" && (/\bleg curl\b/i.test(name) || hasAlias("Leg Curl"))) return "leg-curl";
  // Leg extension variants (quads)
  if (muscle === "quads" && (/\bleg extension\b/i.test(name) || hasAlias("Leg Extension"))) return "leg-extension";

  return null;
}

// Exercise Substitution Engine:
// Generates contextual, biomechanically-sound rationales for swapping lifts.

import type { Exercise } from "./workout-api.ts";
import { MUSCLE_LABELS } from "./labels.ts";

export interface SwapExplanation {
  exercise: Exercise;
  badge: string;
  tags: string[];
  rationale: string;
  jointImpact: "lower" | "similar" | "higher";
}

/**
 * Analyzes an exercise substitution and produces physiological insight
 * detailing why it's a good alternative and how it alters stimulus/joint stress.
 */
export function explainSubstitution(original: Exercise, candidate: Exercise): SwapExplanation {
  const tags: string[] = [];
  let badge = "Alternative";
  let rationale = `Targets ${MUSCLE_LABELS[candidate.primary_muscle]} with ${candidate.equipment}.`;
  let jointImpact: "lower" | "similar" | "higher" = "similar";

  const isSameGroup = Boolean(original.variation_group && candidate.variation_group && original.variation_group === candidate.variation_group);
  if (isSameGroup) {
    tags.push("Direct Variant");
  }

  const origIsBarbell = original.equipment === "barbell";
  const candIsBarbell = candidate.equipment === "barbell";
  const candIsMachine = candidate.equipment === "machine" || candidate.equipment === "cable";
  const candIsDumbbell = candidate.equipment === "dumbbell";

  // Check joint stress delta
  if (origIsBarbell && (candIsMachine || candIsDumbbell)) {
    jointImpact = "lower";
    tags.push("Joint-Friendly");
    if (candIsDumbbell) {
      badge = "Natural Path";
      tags.push("Deep Stretch", "Stabilizers");
      rationale = "Allows free wrist rotation and a deeper active stretch with reduced shoulder/elbow strain.";
    } else {
      badge = "Targeted Isolation";
      tags.push("Low Spinal Load", "Constant Tension");
      rationale = "Keeps continuous tension throughout the full curve while eliminating axial spinal loading.";
    }
  } else if (!origIsBarbell && candIsBarbell) {
    jointImpact = "higher";
    badge = "Max Overload";
    tags.push("Max Load", "Compound Strength");
    rationale = "Allows heavier absolute loading and multi-joint systemic strength building.";
  } else if (candidate.mechanic === "isolation" && original.mechanic === "compound") {
    badge = "Direct Focus";
    tags.push("Pure Target Bias");
    rationale = `Isolates the ${MUSCLE_LABELS[candidate.primary_muscle]} without taxing secondary helper muscles.`;
  } else if (candidate.mechanic === "compound" && original.mechanic === "isolation") {
    badge = "Systemic Power";
    tags.push("Compound Movement");
    rationale = "Recruits multiple joint angles and helper muscles for greater overall caloric and hormonal stimulus.";
  } else {
    badge = "Biomechanical Match";
    tags.push("Equivalent Pattern");
    rationale = `Direct biomechanical match for ${original.name} with similar motor recruitment.`;
  }

  return {
    exercise: candidate,
    badge,
    tags,
    rationale,
    jointImpact,
  };
}
