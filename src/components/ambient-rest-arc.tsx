"use client";

interface AmbientRestArcProps {
  remainingSeconds: number;
  totalSeconds: number;
  onAddThirtySeconds?: () => void;
  onSkip?: () => void;
}

export function AmbientRestArc({
  remainingSeconds,
  totalSeconds,
  onAddThirtySeconds,
  onSkip,
}: AmbientRestArcProps) {
  if (remainingSeconds <= 0 || totalSeconds <= 0) return null;

  const progress = Math.min(1, Math.max(0, (totalSeconds - remainingSeconds) / totalSeconds));
  const percent = Math.round(progress * 100);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed bottom-0 inset-x-0 pointer-events-none z-40 flex flex-col items-center">
      {/* Floating Center Rest Badge */}
      <div className="pointer-events-auto mb-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-emerald-500/40 backdrop-blur-md shadow-lg shadow-emerald-950/40">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-mono font-bold text-white">
          Rest: {formatTime(remainingSeconds)}
        </span>
        <span className="text-[10px] text-neutral-400 font-mono">({percent}%)</span>

        {onAddThirtySeconds && (
          <button
            type="button"
            onClick={onAddThirtySeconds}
            className="text-[10px] font-mono font-medium text-emerald-400 hover:text-emerald-300 ml-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60"
          >
            +30s
          </button>
        )}

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 ml-0.5 px-1 rounded"
          >
            ✕
          </button>
        )}
      </div>

      {/* Ambient Bottom Arc Bar */}
      <div className="w-full h-1.5 bg-neutral-950 relative overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 ease-linear shadow-[0_0_12px_rgba(16,185,129,0.8)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
