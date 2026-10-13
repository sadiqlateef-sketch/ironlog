"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { initNative } from "@/lib/native";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initNative();
  }, []);
  return (
    <AuthProvider>
      <RestTimerProvider>{children}</RestTimerProvider>
    </AuthProvider>
  );
}
