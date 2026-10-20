import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * What a screen shows before there's anything in it: what goes here, and the
 * one thing to do next, so a blank screen is never a dead end.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  /** Usually one Button (asChild Link is fine). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass flex flex-col items-center gap-3 rounded-2xl px-5 py-7 text-center", className)} data-testid="empty-state">
      <div className="bg-primary/15 text-primary-text grid size-14 place-items-center rounded-full">
        <Icon className="size-7" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-base font-bold">{title}</p>
        {children && <div className="text-muted-foreground text-sm">{children}</div>}
      </div>
      {action && <div className="flex w-full flex-col gap-2">{action}</div>}
    </div>
  );
}
