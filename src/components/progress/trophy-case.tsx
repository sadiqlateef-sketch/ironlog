"use client";

import { useMemo, useState } from "react";
import { Crown, Dumbbell, Flame, Lock, Shield, Sparkles, Trophy as TrophyIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { evaluateTrophies, type Trophy, type TrophyCategory, type TrophyTier } from "@/lib/trophies";
import { weekStreak } from "@/lib/stats";
import type { StatsData } from "@/components/progress/overview";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<TrophyTier, { border: string; glow: string; fill: string; text: string }> = {
  bronze: {
    border: "border-amber-700/60",
    glow: "rgba(180, 83, 9, 0.25)",
    fill: "from-amber-900/40 to-amber-700/20",
    text: "text-amber-500",
  },
  silver: {
    border: "border-slate-400/60",
    glow: "rgba(148, 163, 184, 0.25)",
    fill: "from-slate-700/40 to-slate-400/20",
    text: "text-slate-300",
  },
  gold: {
    border: "border-yellow-500/70",
    glow: "rgba(234, 179, 8, 0.35)",
    fill: "from-yellow-600/40 via-amber-500/20 to-yellow-400/10",
    text: "text-yellow-400",
  },
  platinum: {
    border: "border-cyan-400/70",
    glow: "rgba(34, 211, 238, 0.35)",
    fill: "from-cyan-600/40 via-sky-400/20 to-teal-400/10",
    text: "text-cyan-300",
  },
  diamond: {
    border: "border-violet-400/80",
    glow: "rgba(167, 139, 250, 0.45)",
    fill: "from-violet-600/40 via-purple-500/20 to-fuchsia-400/10",
    text: "text-violet-300",
  },
};

export function TrophyCaseCard({ data }: { data: StatsData }) {
  const [filter, setFilter] = useState<"all" | TrophyCategory>("all");
  const [inspected, setInspected] = useState<Trophy | null>(null);

  const streak = useMemo(() => weekStreak(data.sessions, data.now), [data.sessions, data.now]);
  const trophies = useMemo(
    () => evaluateTrophies(data.sessions, data.sets, data.exercises, data.total, streak),
    [data.sessions, data.sets, data.exercises, data.total, streak],
  );

  const filtered = filter === "all" ? trophies : trophies.filter((t) => t.category === filter);
  const unlockedCount = trophies.filter((t) => t.unlocked).length;

  const renderIcon = (name: Trophy["iconName"], className?: string) => {
    switch (name) {
      case "crown":
        return <Crown className={className} />;
      case "flame":
        return <Flame className={className} />;
      case "dumbbell":
        return <Dumbbell className={className} />;
      case "shield":
        return <Shield className={className} />;
      case "sparkles":
        return <Sparkles className={className} />;
      default:
        return <TrophyIcon className={className} />;
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-4 p-5 border-border/80 shadow-lg" data-testid="trophy-case-card">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <TrophyIcon className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary-text">
                Iron Milestones
              </span>
              <h2 className="text-xl font-black tracking-tight text-foreground">Trophy Case</h2>
            </div>
          </div>

          <span className="num text-xs font-bold px-3 py-1 rounded-full bg-secondary text-foreground/90 border border-border/60">
            {unlockedCount} / {trophies.length} Earned
          </span>
        </header>

        {/* Category Pill Switcher */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-secondary p-1 no-scrollbar text-xs">
          {(["all", "strength", "consistency", "milestone", "volume"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold capitalize transition-all whitespace-nowrap",
                filter === cat
                  ? "bg-foreground text-background shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Trophies Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((t) => {
            const style = TIER_STYLES[t.tier];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setInspected(t)}
                className={cn(
                  "relative flex flex-col items-center justify-between p-3.5 rounded-2xl border text-center transition-all duration-300 active:scale-95",
                  t.unlocked
                    ? `bg-gradient-to-b ${style.fill} ${style.border} shadow-md`
                    : "bg-secondary/30 border-border/40 opacity-70 hover:opacity-100",
                )}
                style={{
                  boxShadow: t.unlocked ? `0 4px 20px ${style.glow}` : undefined,
                }}
              >
                {/* Tier Tag */}
                <span
                  className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                    t.unlocked ? `${style.text} bg-black/40` : "text-muted-foreground bg-secondary",
                  )}
                >
                  {t.tier}
                </span>

                {/* 3D-styled Emblem Icon */}
                <div className="my-2.5 relative flex items-center justify-center">
                  <div
                    className={cn(
                      "size-12 rounded-2xl flex items-center justify-center border shadow-inner transition-transform",
                      t.unlocked
                        ? `bg-gradient-to-br ${style.fill} ${style.border} ${style.text}`
                        : "bg-secondary text-muted-foreground border-border",
                    )}
                  >
                    {t.unlocked ? renderIcon(t.iconName, "size-6") : <Lock className="size-5" />}
                  </div>
                </div>

                <div className="w-full">
                  <span className="block font-bold text-xs truncate text-foreground">{t.title}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">{t.subtitle}</span>
                </div>

                {/* Progress bar for locked trophies */}
                {!t.unlocked && (
                  <div className="w-full mt-2">
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${t.progressPct}%` }}
                      />
                    </div>
                    <span className="block text-[9px] font-semibold text-muted-foreground mt-0.5 num">
                      {t.currentLabel} / {t.targetLabel}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Trophy Inspect Dialog */}
      <Dialog open={!!inspected} onOpenChange={(o) => !o && setInspected(null)}>
        <DialogContent className="max-w-xs text-center">
          {inspected && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <div
                className={cn(
                  "size-16 rounded-3xl flex items-center justify-center border shadow-lg bg-gradient-to-br",
                  TIER_STYLES[inspected.tier].fill,
                  TIER_STYLES[inspected.tier].border,
                  TIER_STYLES[inspected.tier].text,
                )}
              >
                {renderIcon(inspected.iconName, "size-8")}
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {inspected.tier} Milestone
                </span>
                <DialogTitle className="text-xl font-black mt-1.5">{inspected.title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {inspected.description}
                </DialogDescription>
              </div>

              <div className="w-full bg-secondary/50 rounded-2xl p-3 border border-border/60 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className={cn("font-bold", inspected.unlocked ? "text-success" : "text-amber-400")}>
                  {inspected.unlocked ? "Unlocked" : `${inspected.progressPct}% Complete`}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
