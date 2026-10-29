// Synchronized Gym Partner Duel & Circuit Mode Engine.
// Evaluates real-time head-to-head training density, volume battle,
// and schedules seamless alternating rack turns between partners.

export interface PartnerWorkoutStats {
  userId: string;
  displayName: string;
  totalVolume: number; // in user units (lb or kg)
  completedSets: number;
  averageRpe: number;
  personalRecordsBroken: number;
  durationMinutes: number;
}

export interface DuelScore {
  userId: string;
  displayName: string;
  compositeScore: number;
  volumeScore: number;
  densityScore: number; // Volume per minute
  intensityScore: number; // RPE factor
  prBonus: number;
}

export interface DuelMatchup {
  leaderUserId: string | null;
  leaderMargin: number;
  isTied: boolean;
  scoreA: DuelScore;
  scoreB: DuelScore;
  summary: string;
}

export interface RackTurn {
  turnIndex: number;
  lifter: "Partner A" | "Partner B";
  exercise: string;
  setNumber: number;
  pacingSeconds: number; // Time allotted before switching
}

/**
 * Computes composite Duel Score rewarding volume, density, RPE effort, and PR milestones.
 */
export function evaluateDuelScore(stats: PartnerWorkoutStats): DuelScore {
  const volumeScore = Math.round(stats.totalVolume / 10);
  const minutes = Math.max(1, stats.durationMinutes);
  const density = Math.round(stats.totalVolume / minutes);
  const densityScore = Math.round(density * 2);
  const intensityScore = Math.round(stats.averageRpe * stats.completedSets * 15);
  const prBonus = stats.personalRecordsBroken * 100;

  const compositeScore = volumeScore + densityScore + intensityScore + prBonus;

  return {
    userId: stats.userId,
    displayName: stats.displayName,
    compositeScore,
    volumeScore,
    densityScore,
    intensityScore,
    prBonus,
  };
}

/**
 * Compares two partners' live workout performances and evaluates leaderboards.
 */
export function compareDuel(partnerA: PartnerWorkoutStats, partnerB: PartnerWorkoutStats): DuelMatchup {
  const scoreA = evaluateDuelScore(partnerA);
  const scoreB = evaluateDuelScore(partnerB);

  const diff = scoreA.compositeScore - scoreB.compositeScore;
  const isTied = Math.abs(diff) < 5;

  let leaderUserId: string | null = null;
  if (!isTied) {
    leaderUserId = diff > 0 ? partnerA.userId : partnerB.userId;
  }

  const leaderName = diff > 0 ? partnerA.displayName : partnerB.displayName;
  const margin = Math.abs(diff);

  const summary = isTied
    ? "Dead heat! Both lifters are matching each other rep-for-rep."
    : `${leaderName} leads by ${margin} points with superior volume and density!`;

  return {
    leaderUserId,
    leaderMargin: margin,
    isTied,
    scoreA,
    scoreB,
    summary,
  };
}

/**
 * Generates an alternating rack schedule so two lifters on the same station
 * can rotate sets without idle downtime.
 */
export function generateRackRotation(
  exerciseName: string,
  totalSets = 4,
  restPerPartnerSeconds = 90,
): RackTurn[] {
  const rotation: RackTurn[] = [];
  let turnCounter = 1;

  for (let s = 1; s <= totalSets; s++) {
    // Partner A lifts while Partner B rests
    rotation.push({
      turnIndex: turnCounter++,
      lifter: "Partner A",
      exercise: exerciseName,
      setNumber: s,
      pacingSeconds: restPerPartnerSeconds,
    });

    // Partner B lifts while Partner A rests
    rotation.push({
      turnIndex: turnCounter++,
      lifter: "Partner B",
      exercise: exerciseName,
      setNumber: s,
      pacingSeconds: restPerPartnerSeconds,
    });
  }

  return rotation;
}
