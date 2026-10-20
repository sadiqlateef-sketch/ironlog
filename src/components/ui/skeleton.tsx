import { cn } from "@/lib/utils";

/** A grey placeholder block, shaped like the content that's loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} />;
}

/** A stack of card-shaped placeholders, with a hidden "Loading" for screen readers. */
export function SkeletonList({ rows = 3, className, rowClassName }: { rows?: number; className?: string; rowClassName?: string }) {
  return (
    <div role="status" className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className={cn("glass flex items-center gap-3 rounded-2xl p-4", rowClassName)}>
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
