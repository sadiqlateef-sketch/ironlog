import { NativeModules } from "react-native";

export interface TileStatePayload {
  hasActiveWorkout: boolean;
  workoutName?: string;
  exerciseName?: string;
  setIndexText?: string;
  targetWeightText?: string;
  targetRepsText?: string;
  isRestActive?: boolean;
  restSecondsRemaining?: number;
  totalRestSeconds?: number;
  restPercent?: number;
  heartRate?: number;
}

const { IronLogTile } = NativeModules;

export const tileBridge = {
  update(payload: TileStatePayload): void {
    if (!IronLogTile?.updateTileState) return;
    try {
      IronLogTile.updateTileState(JSON.stringify(payload));
    } catch {}
  },

  clear(): void {
    if (!IronLogTile?.clearTileState) return;
    try {
      IronLogTile.clearTileState();
    } catch {}
  },
};
