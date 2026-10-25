import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const { WearableBridge } = NativeModules;

export interface WatchSetPayload {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  isCompleted: boolean;
  rpe?: number | null;
}

const emitter = Platform.OS === "android" && WearableBridge ? new NativeEventEmitter(WearableBridge) : null;

export const watchBridge = {
  isAvailable: (): boolean => Platform.OS === "android" && !!WearableBridge,

  async sendSetLogged(payload: WatchSetPayload): Promise<number> {
    if (!watchBridge.isAvailable()) return 0;
    try {
      return await WearableBridge.sendSetLogged(JSON.stringify(payload));
    } catch {
      return 0;
    }
  },

  async sendWorkoutFinished(sessionId: string): Promise<number> {
    if (!watchBridge.isAvailable()) return 0;
    try {
      return await WearableBridge.sendWorkoutFinished(JSON.stringify({ sessionId, endTime: new Date().toISOString() }));
    } catch {
      return 0;
    }
  },

  async requestActiveWorkout(): Promise<number> {
    if (!watchBridge.isAvailable()) return 0;
    try {
      return await WearableBridge.requestActiveWorkout();
    } catch {
      return 0;
    }
  },

  async getConnectedPhoneCount(): Promise<number> {
    if (!watchBridge.isAvailable()) return 0;
    try {
      return await WearableBridge.getConnectedPhoneCount();
    } catch {
      return 0;
    }
  },

  onActiveWorkoutReceived(callback: (payload: any) => void) {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onActiveWorkoutReceived", (args: unknown) => callback(args));
    return () => sub.remove();
  },

  onPhoneSetLogged(callback: (payload: any) => void) {
    if (!emitter) return () => {};
    const sub = emitter.addListener("onPhoneSetLogged", (args: unknown) => callback(args));
    return () => sub.remove();
  },
};
