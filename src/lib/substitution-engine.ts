// Exercise Substitution Engine:
// Generates contextual, biomechanically-sound rationales for swapping lifts.

import type { Exercise } from "./workout-api.ts";
import { MUSCLE_LABELS } from "./labels.ts";
import type { EquipmentType } from "../types/database";

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
