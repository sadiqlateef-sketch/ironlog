"use client";

import { useMemo } from "react";
import { Award, Compass, Dna, Share2, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeWorkoutDNA } from "@/lib/dna";
import type { StatsData } from "@/components/progress/overview";
import { cn } from "@/lib/utils";

export function WorkoutDnaCard({ data }: { data: StatsData }) {
  const dna = useMemo(
    () => computeWorkoutDNA(data.sessions, data.sets, data.exercises, data.now),
    [data.sessions, data.sets, data.exercises, data.now],
  );

  return (
    <Card className="flex flex-col gap-5 p-5 border-border/80 shadow-lg relative overflow-hidden" data-testid="workout-dna-card">
      {/* Background radial glow matching archetype */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: dna.archetype.dominantColor }}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary-text border border-primary/20">
            <Dna className="size-5" />
          </div>
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary-text">
              Training Fingerprint
            </span>
            <h2 className="text-xl font-black tracking-tight text-foreground">
              {dna.archetype.title}
            </h2>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-secondary text-foreground/80 border border-border/60">
          Archetype
        </span>
      </header>

      <p className="text-xs text-muted-foreground leading-relaxed -mt-2">
        {dna.archetype.summary}
      </p>

      {/* Center: Radial DNA Fingerprint Visualizer */}
      <div className="flex flex-col items-center justify-center py-2 relative">
        <svg viewBox="-110 -110 220 220" className="size-56 max-w-full drop-shadow-md">
          {/* Background Concentric Grid Rings */}
          {[40, 54, 68, 82].map((r) => (
            <circle
              key={r}
              cx="0"
              cy="0"
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.4"
            />
          ))}

          {/* Render Polar Arcs */}
          {dna.polarArcs.map((arc) => {
            const r = arc.radius;
            const startRad = ((arc.angleStart - 90) * Math.PI) / 180;
            const endRad = ((arc.angleEnd - 90) * Math.PI) / 180;
            const x1 = r * Math.cos(startRad);
            const y1 = r * Math.sin(startRad);
            const x2 = r * Math.cos(endRad);
            const y2 = r * Math.sin(endRad);
            const largeArc = arc.angleEnd - arc.angleStart > 180 ? 1 : 0;
            const pathData =
              arc.angleEnd - arc.angleStart >= 359.9
                ? `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0`
                : `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;

            return (
              <path
                key={arc.category}
                d={pathData}
                fill="none"
                stroke={arc.color}
                strokeWidth={arc.thickness}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            );
          })}

          {/* Center Core Badge */}
          <circle cx="0" cy="0" r="24" fill="var(--card-solid)" stroke="var(--border)" strokeWidth="2" />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            className="fill-primary-text font-black text-xs tracking-tighter"
          >
            DNA
          </text>
        </svg>

        {/* Legend pills under radial visualization */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {dna.polarArcs.map((a) => (
            <span key={a.category} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
              {a.category}
            </span>
          ))}
        </div>
      </div>

      {/* Trait Meters */}
      <div className="grid grid-cols-2 gap-2.5">
        {dna.traits.map((trait) => (
          <div key={trait.name} className="bg-secondary/40 border border-border/50 rounded-xl p-2.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground/90">{trait.name}</span>
              <span className="num font-bold text-primary-text">{trait.score}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${trait.score}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{trait.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
