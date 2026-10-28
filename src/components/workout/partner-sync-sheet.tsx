"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Flame, HeartHandshake, LogOut, Radio, Send, Sparkles, Users, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  generateRoomCode,
  partnerSync,
  type PartnerEvent,
  type PartnerState,
} from "@/services/partnerSync";
import { formatClock } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

interface PartnerSyncSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myLifterName?: string;
}

const REACTIONS = ["🔥", "💪", "👊", "⚡", "👏"];

export function PartnerSyncSheet({ open, onOpenChange, myLifterName = "Lifter" }: PartnerSyncSheetProps) {
  const [partnerState, setPartnerState] = useState<PartnerState>(partnerSync.state);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeHostCode, setActiveHostCode] = useState(() => partnerSync.roomCode || generateRoomCode());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = partnerSync.subscribe((event: PartnerEvent) => {
      setPartnerState(partnerSync.state);

      if (event.type === "reaction" && event.payload.type === "reaction") {
        setToastMessage(`${event.senderName} sent ${event.payload.reaction.emoji}!`);
        setTimeout(() => setToastMessage(null), 3000);
      } else if (event.type === "pr_hit" && event.payload.type === "pr_hit") {
        setToastMessage(`🎉 ${event.senderName} just hit a PR on ${event.payload.pr.exerciseName}!`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    });

    return () => unsubscribe();
  }, []);

  function handleHostRoom() {
    partnerSync.joinRoom(activeHostCode, myLifterName);
    setPartnerState(partnerSync.state);
  }

  function handleJoinRoom() {
    let code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    if (!code.startsWith("IRON-")) {
      code = `IRON-${code}`;
    }
    partnerSync.joinRoom(code, myLifterName);
    setPartnerState(partnerSync.state);
  }

  function handleLeave() {
    partnerSync.leaveRoom();
    setPartnerState(partnerSync.state);
    setActiveHostCode(generateRoomCode());
  }

  function handleCopy() {
    const code = partnerSync.roomCode || activeHostCode;
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendReaction(emoji: string) {
    partnerSync.sendReaction(emoji);
    setToastMessage(`Sent ${emoji} to ${partnerState.partnerName || "partner"}`);
    setTimeout(() => setToastMessage(null), 2000);
  }

  const isConnected = partnerSync.isConnected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary-text">
                <Users className="size-4" />
              </span>
              <DialogTitle className="text-base font-bold">Live Workout Mirroring</DialogTitle>
            </div>

            {isConnected && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Paired
              </span>
            )}
          </div>
          <DialogDescription className="text-xs">
            Pair workouts with your gym partner to share live sets, rest timers, and PR celebrations.
          </DialogDescription>
        </DialogHeader>

        {/* Floating Notification Toast */}
        {toastMessage && (
          <div className="rounded-lg bg-primary/20 border border-primary/40 px-3 py-2 text-center text-xs font-semibold text-primary-text animate-in fade-in slide-in-from-top duration-200">
            {toastMessage}
          </div>
        )}

        {!isConnected ? (
          <div className="flex flex-col gap-5 py-2">
            {/* Host Section */}
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <h4 className="text-foreground text-xs font-bold uppercase tracking-wider">Host a Session</h4>
              <p className="text-muted-foreground mt-1 text-xs">
                Share this room code with your partner so they can sync up with you.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-border/80 bg-background px-3 py-2 text-center font-mono text-sm font-black tracking-widest text-primary-text">
                  {activeHostCode}
                </div>
                <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy code">
                  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </Button>
                <Button onClick={handleHostRoom}>
                  Host Room
                </Button>
              </div>
            </div>

            {/* Join Section */}
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <h4 className="text-foreground text-xs font-bold uppercase tracking-wider">Join Partner's Room</h4>
              <p className="text-muted-foreground mt-1 text-xs">
                Enter your gym partner's 4-character code or full room code:
              </p>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. 7K2X"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="flex-1 rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-sm font-bold uppercase tracking-wider"
                  maxLength={9}
                />
                <Button onClick={handleJoinRoom} disabled={!joinCodeInput.trim()}>
                  Connect
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Live Connected Partner Dashboard */
          <div className="flex flex-col gap-4 py-2">
            {/* Room info header */}
            <div className="flex items-center justify-between rounded-lg bg-background/80 border border-border/60 px-3 py-2 text-xs">
              <span className="font-mono font-bold tracking-wider text-muted-foreground">
                Room: <span className="text-primary-text font-black">{partnerSync.roomCode}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLeave}
                className="h-7 text-xs text-destructive hover:bg-destructive/15"
              >
                <LogOut className="mr-1 size-3" /> Disconnect
              </Button>
            </div>

            {/* Partner Status Card */}
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-semibold">
                  Partner: <strong className="text-foreground">{partnerState.partnerName || "Lifting Partner"}</strong>
                </span>
                {partnerState.isFinished ? (
                  <span className="text-[11px] font-bold text-muted-foreground">Finished Workout</span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                    <Radio className="size-3" /> Active Now
                  </span>
                )}
              </div>

              {/* Current Exercise & Last Set */}
              <div className="mt-3 rounded-lg bg-background/90 p-3 border border-border/50">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Current Exercise
                </p>
                <p className="text-foreground mt-0.5 text-base font-bold">
                  {partnerState.lastExercise || "Preparing next exercise..."}
                </p>

                {partnerState.lastSet && (
                  <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="text-muted-foreground">Last Logged Set:</span>
                    <span className="font-bold text-foreground">
                      Set {partnerState.lastSet.setNumber}: {partnerState.lastSet.weight}
                      {partnerState.lastSet.unit === "imperial" ? " lb" : " kg"} × {partnerState.lastSet.reps} reps
                      {partnerState.lastSet.isPr && <span className="ml-1 text-primary-text font-black">· PR! 🔥</span>}
                    </span>
                  </div>
                )}
              </div>

              {/* Active Rest Timer Bar if resting */}
              {partnerState.activeRest?.isRunning && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-400">Partner Resting</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatClock(partnerState.activeRest.secondsRemaining)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background/50">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (partnerState.activeRest.secondsRemaining /
                              Math.max(1, partnerState.activeRest.secondsTotal)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Cheers & Reactions */}
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs font-semibold">Send Fist Bump / Cheer:</span>
              <div className="flex items-center justify-around rounded-xl bg-background/80 p-2 border border-border/50">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSendReaction(emoji)}
                    className="flex size-10 items-center justify-center rounded-lg text-xl hover:bg-muted active:scale-95 transition-transform"
                    aria-label={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
