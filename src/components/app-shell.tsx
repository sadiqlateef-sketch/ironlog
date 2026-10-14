"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ChartLine, Dumbbell, House, ListChecks } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { RestTimerBar } from "@/components/rest-timer-bar";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/workout/", label: "Workout", icon: Dumbbell },
  { href: "/progress/", label: "Progress", icon: ChartLine },
  { href: "/exercises/", label: "Exercises", icon: ListChecks },
];

/** Signed-in layout: page content, rest timer, and the bottom tab bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session === null) router.replace("/login/");
  }, [session, router]);

  if (!session) {
    return (
      <div className="text-muted-foreground grid flex-1 place-items-center text-sm">Loading…</div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-40">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <RestTimerBar />
        <nav className="mx-auto max-w-md px-3 pb-3">
          <ul className="glass-strong grid grid-cols-4 rounded-3xl">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href.slice(0, -1));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex flex-col items-center gap-1 py-3 text-xs font-semibold",
                      active ? "text-primary-text" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={active ? 2.4 : 2} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
