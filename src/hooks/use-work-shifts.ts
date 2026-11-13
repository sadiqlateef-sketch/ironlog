"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { normalizeShifts, type Shift } from "@/lib/shifts";

/** The user's work shifts from their profile (empty when none are set). */
export function useWorkShifts(): Shift[] {
  const { profile } = useAuth();
  return useMemo(() => normalizeShifts(profile?.work_shifts), [profile?.work_shifts]);
}
