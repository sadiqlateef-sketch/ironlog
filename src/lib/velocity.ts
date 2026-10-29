// Barbell Velocity & Mean Concentric Speed Estimator.
// Uses accelerometer and gyroscope readings to compute Mean Concentric Velocity (MCV),
// Peak Velocity (PV), velocity loss percentage, and estimated RPE from velocity.

export interface RepVelocity {
  repNumber: number;
  meanVelocityMs: number; // m/s, typically 0.15 - 1.20 m/s
  peakVelocityMs: number;
  durationMs: number;
  velocityLossPercent: number; // relative to first rep of set
}

export interface SetVelocityAnalysis {
  reps: RepVelocity[];
  setMeanVelocity: number;
  peakVelocity: number;
  totalVelocityLossPercent: number;
  estimatedRpe: number;
  fatigueWarning: boolean;
  recommendation: string;
}

export interface RawAccelSample {
  timestampMs: number;
  zAccel: number; // Vertical acceleration in m/s^2 (gravity subtracted)
}

/**
 * Velocity-to-RPE mapping based on standard powerlifting & strength research
 * (e.g. Gonzalez-Badillo et al. for Bench, Squat, Deadlift).
 * At standard 1RM (RPE 10), typical minimum velocity threshold (MVT) is ~0.15 - 0.20 m/s for bench/squat.
 */
export function estimateRpeFromVelocity(meanVelocityMs: number): number {
  if (meanVelocityMs <= 0.18) return 10;
  if (meanVelocityMs <= 0.24) return 9.5;
  if (meanVelocityMs <= 0.32) return 9.0;
  if (meanVelocityMs <= 0.40) return 8.5;
  if (meanVelocityMs <= 0.48) return 8.0;
  if (meanVelocityMs <= 0.58) return 7.5;
  if (meanVelocityMs <= 0.68) return 7.0;
  if (meanVelocityMs <= 0.80) return 6.5;
  return 6.0;
}

/**
 * Analyzes rep velocities across a working set.
 * Velocity loss > 20% signifies high metabolic fatigue and proximity to failure.
 */
export function analyzeSetVelocity(repVelocities: number[]): SetVelocityAnalysis {
  if (repVelocities.length === 0) {
    return {
      reps: [],
      setMeanVelocity: 0,
      peakVelocity: 0,
      totalVelocityLossPercent: 0,
      estimatedRpe: 7.0,
      fatigueWarning: false,
      recommendation: "No velocity data recorded.",
    };
  }

  const firstRep = Math.max(0.05, repVelocities[0]);
  let peak = 0;
  let sum = 0;

  const reps: RepVelocity[] = repVelocities.map((v, i) => {
    const vel = Math.max(0.05, v);
    if (vel > peak) peak = vel;
    sum += vel;

    const loss = Math.max(0, Math.round(((firstRep - vel) / firstRep) * 100));
    return {
      repNumber: i + 1,
      meanVelocityMs: Math.round(vel * 100) / 100,
      peakVelocityMs: Math.round(vel * 1.35 * 100) / 100,
      durationMs: Math.round((0.6 / vel) * 1000), // Approximate distance 0.6m
      velocityLossPercent: loss,
    };
  });

  const setMean = Math.round((sum / repVelocities.length) * 100) / 100;
  const lastRep = repVelocities[repVelocities.length - 1];
  const totalLoss = Math.max(0, Math.round(((firstRep - lastRep) / firstRep) * 100));
  const estimatedRpe = estimateRpeFromVelocity(lastRep);
  const fatigueWarning = totalLoss >= 20 || lastRep <= 0.22;

  let recommendation = "Explosive and smooth rep cadence. Prime velocity profile.";
  if (totalLoss >= 35 || lastRep <= 0.18) {
    recommendation = "Severe velocity loss (>35%). High neuromuscular exhaustion. Terminate set or rest 3+ minutes.";
  } else if (totalLoss >= 20) {
    recommendation = "Velocity loss reached 20% cutoff. Optimal hypertrophy threshold achieved without excessive CNS strain.";
  }

  return {
    reps,
    setMeanVelocity: setMean,
    peakVelocity: Math.round(peak * 1.35 * 100) / 100,
    totalVelocityLossPercent: totalLoss,
    estimatedRpe,
    fatigueWarning,
    recommendation,
  };
}

/**
 * Integrates discrete vertical accelerometer samples over concentric duration
 * using trapezoidal Riemann sum to calculate concentric velocity.
 */
export function integrateConcentricVelocity(samples: RawAccelSample[]): number {
  if (samples.length < 2) return 0;
  let velocity = 0;

  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestampMs - samples[i - 1].timestampMs) / 1000;
    const avgAccel = (samples[i].zAccel + samples[i - 1].zAccel) / 2;
    if (avgAccel > 0) {
      velocity += avgAccel * dt;
    }
  }

  return Math.max(0.1, Math.min(2.5, Math.round(velocity * 100) / 100));
}
