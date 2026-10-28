// Live Workout Mirroring & Partner Sync Service.
//
// Allows gym partners to pair live workout sessions in real time via a 6-character room code.
// Uses Supabase Realtime broadcast channels with an automatic fallback to
// browser BroadcastChannel (for offline/local tab testing).

import { getSupabase } from "../lib/supabase/client.ts";

export type PartnerEventType =
  | "session_info"
  | "set_completed"
  | "rest_timer"
  | "pr_hit"
  | "reaction"
  | "session_finished";

export interface PartnerSetPayload {
  exerciseName: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  unit: "imperial" | "metric";
  setType?: string;
  rpe?: number | null;
  isPr?: boolean;
}

export interface PartnerRestPayload {
  secondsTotal: number;
  secondsRemaining: number;
  isRunning: boolean;
}

export interface PartnerPrPayload {
  exerciseName: string;
  weight: number;
  reps: number;
  unit: "imperial" | "metric";
  estimated1rm?: number;
}

export interface PartnerReactionPayload {
  emoji: string;
  senderName: string;
}

export interface PartnerEvent {
  id: string;
  type: PartnerEventType;
  senderName: string;
  timestamp: string;
  payload:
    | { type: "session_info"; title: string; routineId?: string }
    | { type: "set_completed"; set: PartnerSetPayload }
    | { type: "rest_timer"; rest: PartnerRestPayload }
    | { type: "pr_hit"; pr: PartnerPrPayload }
    | { type: "reaction"; reaction: PartnerReactionPayload }
    | { type: "session_finished"; totalSets: number; totalVolume: number };
}

export interface PartnerState {
  roomCode: string | null;
  partnerName: string | null;
  lastExercise: string | null;
  lastSet: PartnerSetPayload | null;
  activeRest: PartnerRestPayload | null;
  recentPr: PartnerPrPayload | null;
  lastReaction: PartnerReactionPayload | null;
  isFinished: boolean;
}

const CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let code = "IRON-";
  for (let i = 0; i < 4; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

export class PartnerSyncManager {
  private currentRoom: string | null = null;
  private myName: string = "Lifter";
  private listeners = new Set<(event: PartnerEvent) => void>();
  private broadcastChannel: BroadcastChannel | null = null;
  private supabaseChannel: any = null;
  private partnerState: PartnerState = {
    roomCode: null,
    partnerName: null,
    lastExercise: null,
    lastSet: null,
    activeRest: null,
    recentPr: null,
    lastReaction: null,
    isFinished: false,
  };

  public get state(): PartnerState {
    return { ...this.partnerState };
  }

  public get isConnected(): boolean {
    return this.currentRoom !== null;
  }

  public get roomCode(): string | null {
    return this.currentRoom;
  }

  /**
   * Initializes or connects to a partner session room.
   */
  public joinRoom(roomCode: string, lifterName: string): void {
    if (this.currentRoom === roomCode.trim().toUpperCase()) return;
    this.leaveRoom();

    const formattedCode = roomCode.trim().toUpperCase();
    this.currentRoom = formattedCode;
    this.myName = lifterName || "Lifter";
    this.partnerState.roomCode = formattedCode;

    // 1. Setup Browser BroadcastChannel (local/offline peer support)
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(`ironlog:partner:${formattedCode}`);
        this.broadcastChannel.onmessage = (e) => {
          if (e.data && e.data.senderName !== this.myName) {
            this.handleIncomingEvent(e.data);
          }
        };
      } catch (err) {
        console.warn("BroadcastChannel error:", err);
      }
    }

    // 2. Setup Supabase Realtime channel (only in client browser environment)
    if (typeof window !== "undefined") {
      try {
        const supabase = getSupabase();
        if (supabase && typeof supabase.channel === "function") {
          this.supabaseChannel = supabase.channel(`partner:${formattedCode}`, {
            config: { broadcast: { self: false } },
          });

          this.supabaseChannel
            .on("broadcast", { event: "partner_event" }, ({ payload }: { payload: PartnerEvent }) => {
              if (payload && payload.senderName !== this.myName) {
                this.handleIncomingEvent(payload);
              }
            })
            .subscribe();
        }
      } catch {
        // Supabase not available in this environment
      }
    }
  }

  /**
   * Leaves the current room and cleans up channels.
   */
  public leaveRoom(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.unsubscribe();
      } catch {}
      this.supabaseChannel = null;
    }

    this.currentRoom = null;
    this.partnerState = {
      roomCode: null,
      partnerName: null,
      lastExercise: null,
      lastSet: null,
      activeRest: null,
      recentPr: null,
      lastReaction: null,
      isFinished: false,
    };
  }

  /**
   * Subscribes to partner events. Returns an unsubscribe function.
   */
  public subscribe(fn: (event: PartnerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Broadcasts a set completion to paired partner.
   */
  public broadcastSet(set: PartnerSetPayload): void {
    this.dispatch({
      id: Math.random().toString(36).slice(2),
      type: "set_completed",
      senderName: this.myName,
      timestamp: new Date().toISOString(),
      payload: { type: "set_completed", set },
    });
  }

  /**
   * Broadcasts active rest countdown to paired partner.
   */
  public broadcastRest(rest: PartnerRestPayload): void {
    this.dispatch({
      id: Math.random().toString(36).slice(2),
      type: "rest_timer",
      senderName: this.myName,
      timestamp: new Date().toISOString(),
      payload: { type: "rest_timer", rest },
    });
  }

  /**
   * Broadcasts personal record hit to partner.
   */
  public broadcastPr(pr: PartnerPrPayload): void {
    this.dispatch({
      id: Math.random().toString(36).slice(2),
      type: "pr_hit",
      senderName: this.myName,
      timestamp: new Date().toISOString(),
      payload: { type: "pr_hit", pr },
    });
  }

  /**
   * Sends a cheer reaction to partner.
   */
  public sendReaction(emoji: string): void {
    this.dispatch({
      id: Math.random().toString(36).slice(2),
      type: "reaction",
      senderName: this.myName,
      timestamp: new Date().toISOString(),
      payload: { type: "reaction", reaction: { emoji, senderName: this.myName } },
    });
  }

  private dispatch(event: PartnerEvent): void {
    if (!this.currentRoom) return;

    // Send via BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(event);
      } catch {}
    }

    // Send via Supabase
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: "broadcast",
          event: "partner_event",
          payload: event,
        });
      } catch {}
    }
  }

  public handleIncomingEvent(event: PartnerEvent): void {
    this.partnerState.partnerName = event.senderName;

    if (event.type === "set_completed" && event.payload.type === "set_completed") {
      this.partnerState.lastExercise = event.payload.set.exerciseName;
      this.partnerState.lastSet = event.payload.set;
    } else if (event.type === "rest_timer" && event.payload.type === "rest_timer") {
      this.partnerState.activeRest = event.payload.rest;
    } else if (event.type === "pr_hit" && event.payload.type === "pr_hit") {
      this.partnerState.recentPr = event.payload.pr;
    } else if (event.type === "reaction" && event.payload.type === "reaction") {
      this.partnerState.lastReaction = event.payload.reaction;
    } else if (event.type === "session_finished") {
      this.partnerState.isFinished = true;
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }
}

// Global singleton instance
export const partnerSync = new PartnerSyncManager();
