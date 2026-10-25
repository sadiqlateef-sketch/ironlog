import { registerPlugin } from "@capacitor/core";

export interface WatchSetLoggedData {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  isCompleted: boolean;
  rpe?: number | null;
}

export interface WatchWorkoutFinishedData {
  sessionId: string;
  endTime: string;
}

interface WearableBridgePlugin {
  sendActiveWorkoutToWatch(options: { payload: string }): Promise<{ sentToNodes: number }>;
  sendSetToWatch(options: { payload: string }): Promise<void>;
  getConnectedWatchCount(): Promise<{ count: number }>;
  addListener(eventName: "watchSetLogged", listenerFunc: (data: WatchSetLoggedData) => void): Promise<{ remove: () => void }>;
  addListener(eventName: "watchWorkoutFinished", listenerFunc: (data: WatchWorkoutFinishedData) => void): Promise<{ remove: () => void }>;
  addListener(eventName: "watchRequestedActive", listenerFunc: () => void): Promise<{ remove: () => void }>;
}

const WearableBridge = registerPlugin<WearableBridgePlugin>("WearableBridge");

export const wearableBridge = {
  isAvailable: (): boolean => typeof window !== "undefined" && "Capacitor" in window && (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform(),

  async broadcastActiveWorkout(session: unknown, sets: unknown[]): Promise<number> {
    if (!wearableBridge.isAvailable()) return 0;
    try {
      const payload = JSON.stringify({ session, sets });
      const res = await WearableBridge.sendActiveWorkoutToWatch({ payload });
      return res.sentToNodes;
    } catch {
      return 0;
    }
  },

  async broadcastSet(set: Partial<WatchSetLoggedData>): Promise<void> {
    if (!wearableBridge.isAvailable()) return;
    try {
      await WearableBridge.sendSetToWatch({ payload: JSON.stringify(set) });
    } catch {
      // ignore
    }
  },

  onSetLogged(handler: (data: WatchSetLoggedData) => void) {
    if (!wearableBridge.isAvailable()) return () => {};
    let removeFn: (() => void) | undefined;
    WearableBridge.addListener("watchSetLogged", handler).then((handle) => {
      removeFn = handle.remove;
    }).catch(() => {});
    return () => {
      if (removeFn) removeFn();
    };
  },

  onWorkoutFinished(handler: (data: WatchWorkoutFinishedData) => void) {
    if (!wearableBridge.isAvailable()) return () => {};
    let removeFn: (() => void) | undefined;
    WearableBridge.addListener("watchWorkoutFinished", handler).then((handle) => {
      removeFn = handle.remove;
    }).catch(() => {});
    return () => {
      if (removeFn) removeFn();
    };
  },

  onRequestActive(handler: () => void) {
    if (!wearableBridge.isAvailable()) return () => {};
    let removeFn: (() => void) | undefined;
    WearableBridge.addListener("watchRequestedActive", handler).then((handle) => {
      removeFn = handle.remove;
    }).catch(() => {});
    return () => {
      if (removeFn) removeFn();
    };
  },
};
