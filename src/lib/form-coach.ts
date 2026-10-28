// AI Form Coach & Biomechanics Knowledge Engine.
//
// Provides movement-specific setup checklists, eccentric/concentric tempo targets,
// bottom/depth checkpoints, and common fault corrections for major compound and accessory movements.

export interface FormCheckpoint {
  phase: "setup" | "eccentric" | "bottom" | "concentric" | "lockout";
  title: string;
  cue: string;
  biomechanicRationale: string;
}

export interface CommonFault {
  fault: string;
  correction: string;
  riskArea: string;
}

export interface ExerciseFormCues {
  category: "squat" | "bench" | "deadlift" | "overhead_press" | "row" | "pullup" | "generic";
  patternName: string;
  targetDepthOrRom: string;
  recommendedTempo: string; // e.g. "3-1-1-0"
  tempoBreakdown: {
    eccentricSeconds: number;
    pauseBottomSeconds: number;
    concentricSeconds: number;
    pauseTopSeconds: number;
  };
  checkpoints: FormCheckpoint[];
  commonFaults: CommonFault[];
}

const SQUAT_CUES: ExerciseFormCues = {
  category: "squat",
  patternName: "Squat Pattern",
  targetDepthOrRom: "Hip crease below top of knee (below parallel)",
  recommendedTempo: "3-1-1-0",
  tempoBreakdown: {
    eccentricSeconds: 3,
    pauseBottomSeconds: 1,
    concentricSeconds: 1,
    pauseTopSeconds: 0,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Root & Stance",
      cue: "Tripod foot: balance evenly across heel, big toe, and pinky toe. Flare toes 15-30°.",
      biomechanicRationale: "Creates maximum torque in hip socket and stable base of support.",
    },
    {
      phase: "eccentric",
      title: "Controlled Descent",
      cue: "Hips back, knees out in line with second toe. Maintain 360° intra-abdominal brace.",
      biomechanicRationale: "Prevents femoral internal rotation and maintains neutral spinal alignment.",
    },
    {
      phase: "bottom",
      title: "Depth Checkpoint",
      cue: "Break parallel without lumbar flexion ('butt wink'). Pause momentarily without relaxing tension.",
      biomechanicRationale: "Maximizes quad and glute hypertrophy through complete stretch under load.",
    },
    {
      phase: "concentric",
      title: "Drive from Midfoot",
      cue: "Drive the floor away. Keep chest and hips rising at the identical angle.",
      biomechanicRationale: "Avoids shifting the moment arm exclusively into the lower back (good-morning fault).",
    },
  ],
  commonFaults: [
    {
      fault: "Knee Cave (Valgus Collapse)",
      correction: "Screw your feet into the floor outward to activate the glute medius.",
      riskArea: "MCL and patellar tendon strain",
    },
    {
      fault: "Heels Lifting off Ground",
      correction: "Improve ankle dorsiflexion or elevate heels on small plates/squat shoes.",
      riskArea: "Excessive shear stress on anterior knees",
    },
  ],
};

const BENCH_CUES: ExerciseFormCues = {
  category: "bench",
  patternName: "Horizontal Press",
  targetDepthOrRom: "Bar touches lower sternum without bouncing",
  recommendedTempo: "2-1-1-0",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 1,
    concentricSeconds: 1,
    pauseTopSeconds: 0,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Scapular Retraction & Arch",
      cue: "Pinch shoulder blades together and down ('tuck into back pockets'). Plant feet firmly.",
      biomechanicRationale: "Stabilizes the glenohumeral joint and protects the rotator cuff under load.",
    },
    {
      phase: "eccentric",
      title: "Tucked Bar Path",
      cue: "Lower bar toward lower chest. Keep elbows tucked at 45-70° rather than flared at 90°.",
      biomechanicRationale: "Reduces anterior shoulder impingement and maximizes pectoral fiber alignment.",
    },
    {
      phase: "bottom",
      title: "Chest Touch Pause",
      cue: "Touch shirt softly. Keep forearms completely vertical perpendicular to floor.",
      biomechanicRationale: "Transfers force through wrists directly into bar without rotational wrist torque.",
    },
    {
      phase: "concentric",
      title: "Leg Drive & J-Curve",
      cue: "Push floor away with legs and press bar slightly back toward the rack uprights.",
      biomechanicRationale: "Natural curved bar path aligns with the clavicular line at top lockout.",
    },
  ],
  commonFaults: [
    {
      fault: "90° Elbow Flare",
      correction: "Tuck elbows slightly toward ribcage; imagine bending the bar like a horseshoe.",
      riskArea: "Subacromial impingement & rotator cuff tears",
    },
    {
      fault: "Bouncing off Ribcage",
      correction: "Pause 1 full second on the chest to eliminate stretch reflex dependency.",
      riskArea: "Sternum bruising & reduced pec hypertrophy",
    },
  ],
};

const DEADLIFT_CUES: ExerciseFormCues = {
  category: "deadlift",
  patternName: "Hinge Pattern",
  targetDepthOrRom: "From floor to full hip and knee extension",
  recommendedTempo: "2-0-1-0",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 0,
    concentricSeconds: 1,
    pauseTopSeconds: 0,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Bar Over Midfoot",
      cue: "Bar 1 inch from shins. Pull slack out of the barbell until clicking sound ('heavy hands').",
      biomechanicRationale: "Eliminates sudden shock loading and establishes pre-tension in the posterior chain.",
    },
    {
      phase: "setup",
      title: "Lat Engagement",
      cue: "Squeeze oranges in armpits to lock lats. Shoulders directly over or slightly in front of bar.",
      biomechanicRationale: "Lats pull bar inward close to body, reducing the spinal moment arm.",
    },
    {
      phase: "concentric",
      title: "Leg Press the Floor",
      cue: "Push floor away until bar reaches knees, then drive hips forward to meet the bar.",
      biomechanicRationale: "Ensures quads initiate the break off the floor before glutes execute lockout.",
    },
    {
      phase: "lockout",
      title: "Tall Lockout",
      cue: "Squeeze glutes tight. Stand tall without leaning backward or hyperextending lumbar spine.",
      biomechanicRationale: "Protects lumbar facet joints and discs from shear compression.",
    },
  ],
  commonFaults: [
    {
      fault: "Hips Shooting Up Early",
      correction: "Lower hips slightly and maintain the exact back angle until bar passes knees.",
      riskArea: "Extreme lower back (L4-S1) spinal torque",
    },
    {
      fault: "Bar Drifting Forward",
      correction: "Keep bar dragging lightly against shins and thighs throughout entire ascent.",
      riskArea: "Severe leverage penalty & spinal shear",
    },
  ],
};

const OHP_CUES: ExerciseFormCues = {
  category: "overhead_press",
  patternName: "Vertical Press",
  targetDepthOrRom: "Full lockout overhead with ears aligned past biceps",
  recommendedTempo: "2-1-1-0",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 1,
    concentricSeconds: 1,
    pauseTopSeconds: 0,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Rigid Pillar",
      cue: "Squeeze glutes, quads, and abs completely rigid. Forearms perfectly vertical under the bar.",
      biomechanicRationale: "Creates an unyielding kinetic chain without energy dissipation.",
    },
    {
      phase: "concentric",
      title: "Clear the Face",
      cue: "Pull chin back like making a double chin. Press straight up in a vertical path.",
      biomechanicRationale: "Allows a straight line of force rather than looping around the nose.",
    },
    {
      phase: "lockout",
      title: "Head Through Window",
      cue: "Push head forward once bar clears forehead. Shrug up into the bar at top lockout.",
      biomechanicRationale: "Upwardly rotates scapula to safely accommodate the humeral head.",
    },
  ],
  commonFaults: [
    {
      fault: "Extreme Backward Lean",
      correction: "Squeeze glutes harder and brace abs as if preparing to take a punch.",
      riskArea: "Lumbar hyperextension & facet irritation",
    },
  ],
};

const ROW_CUES: ExerciseFormCues = {
  category: "row",
  patternName: "Horizontal Pull",
  targetDepthOrRom: "Bar or handle touching abdomen / lower ribcage",
  recommendedTempo: "2-0-1-1",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 0,
    concentricSeconds: 1,
    pauseTopSeconds: 1,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Hinged Torso",
      cue: "Hinge at hips with soft knees. Spine neutral at 45° angle.",
      biomechanicRationale: "Positions lats and upper back in the line of pull.",
    },
    {
      phase: "concentric",
      title: "Lead with Elbows",
      cue: "Pull elbows toward hips rather than up toward ears. Squeeze shoulder blades together.",
      biomechanicRationale: "Maximizes lat and rhomboid contraction while keeping upper traps quiet.",
    },
    {
      phase: "eccentric",
      title: "Controlled Stretch",
      cue: "Lower weight smoothly and let lats fully lengthen without rounding spine.",
      biomechanicRationale: "Capitalizes on loaded stretch for hypertrophy stimulus.",
    },
  ],
  commonFaults: [
    {
      fault: "Using Excessive Torso Momentum",
      correction: "Keep torso locked at the designated angle; do not stand up with each rep.",
      riskArea: "Loss of lat tension & lower back fatigue",
    },
  ],
};

const PULLUP_CUES: ExerciseFormCues = {
  category: "pullup",
  patternName: "Vertical Pull",
  targetDepthOrRom: "Chin over bar / chest to bar, down to dead hang",
  recommendedTempo: "2-1-1-1",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 1,
    concentricSeconds: 1,
    pauseTopSeconds: 1,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Scapular Initiation",
      cue: "Start from dead hang. Pull shoulder blades down before bending elbows.",
      biomechanicRationale: "Recruits lower traps and lats to initiate movement safely.",
    },
    {
      phase: "concentric",
      title: "Chest to Bar",
      cue: "Drive elbows down toward pockets. Bring upper chest toward the bar.",
      biomechanicRationale: "Aligns humerus with latissimus dorsi fibers for full activation.",
    },
  ],
  commonFaults: [
    {
      fault: "Kipping or Swinging",
      correction: "Cross ankles, squeeze glutes, and perform clean strict pulls.",
      riskArea: "Anterior shoulder capsule strain",
    },
  ],
};

const GENERIC_CUES: ExerciseFormCues = {
  category: "generic",
  patternName: "Isolation / Accessory",
  targetDepthOrRom: "Full active range of motion without momentum",
  recommendedTempo: "2-0-1-1",
  tempoBreakdown: {
    eccentricSeconds: 2,
    pauseBottomSeconds: 0,
    concentricSeconds: 1,
    pauseTopSeconds: 1,
  },
  checkpoints: [
    {
      phase: "setup",
      title: "Stable Foundation",
      cue: "Lock non-working joints into position to isolate the target muscle.",
      biomechanicRationale: "Eliminates synergistic momentum leakage.",
    },
    {
      phase: "eccentric",
      title: "Mindful Descent",
      cue: "Resist the eccentric load for 2-3 seconds to maximize mechanical tension.",
      biomechanicRationale: "Eccentric phase yields highest muscle fiber tension per unit fatigue.",
    },
    {
      phase: "concentric",
      title: "Peak Contraction",
      cue: "Contract target muscle hard at the peak of the movement.",
      biomechanicRationale: "Enhances mind-muscle connection and neuromuscular recruitment.",
    },
  ],
  commonFaults: [
    {
      fault: "Swinging Body Weight",
      correction: "Reduce weight by 10% and execute with a 1-second pause at peak contraction.",
      riskArea: "Tendonitis & reduced muscle recruitment",
    },
  ],
};

/**
 * Resolves comprehensive form coach cues and checkpoints for any exercise.
 */
export function getFormCues(exercise: { name?: string; slug?: string }): ExerciseFormCues {
  const text = `${exercise.slug ?? ""} ${exercise.name ?? ""}`.toLowerCase();

  if (text.includes("squat") || text.includes("leg press") || text.includes("hack")) {
    return SQUAT_CUES;
  }
  if (text.includes("bench") || text.includes("chest press") || text.includes("push up")) {
    return BENCH_CUES;
  }
  if (text.includes("deadlift") || text.includes("rdl") || text.includes("romanian")) {
    return DEADLIFT_CUES;
  }
  if (text.includes("press") && (text.includes("overhead") || text.includes("shoulder") || text.includes("military") || text.includes("ohp"))) {
    return OHP_CUES;
  }
  if (text.includes("row")) {
    return ROW_CUES;
  }
  if (text.includes("pull up") || text.includes("chin up") || text.includes("lat pull") || text.includes("pulldown")) {
    return PULLUP_CUES;
  }

  return GENERIC_CUES;
}
