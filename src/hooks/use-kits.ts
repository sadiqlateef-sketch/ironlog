"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { activeKit, defaultHomeKit, homeKit, kitsOf, legacyFields, type Kit } from "@/lib/kit";

/** Your equipment kits (from your profile) and the ways to change them. */
export function useKits() {
  const { profile, updateProfile } = useAuth();
  const kits = useMemo(() => kitsOf(profile), [profile]);
  const active = useMemo(() => activeKit(profile, kits), [profile, kits]);
  const home = useMemo(() => homeKit(kits), [kits]);

  const save = useCallback(
    async (next: Kit[], activeId?: string | null) => {
      const nowActive = next.find((k) => k.id === (activeId ?? profile?.active_kit_id)) ?? next.find((k) => k.kind === "gym");
      // The watch and older screens read the bar and plates straight off the profile.
      const legacy = nowActive ? legacyFields(nowActive) : null;
      await updateProfile({
        equipment_kits: next as never,
        ...(activeId !== undefined ? { active_kit_id: activeId } : {}),
        ...(legacy ?? {}),
      });
    },
    [profile?.active_kit_id, updateProfile],
  );

  const saveKit = useCallback(
    (kit: Kit) => save(kits.some((k) => k.id === kit.id) ? kits.map((k) => (k.id === kit.id ? kit : k)) : [...kits, kit]),
    [kits, save],
  );
  const removeKit = useCallback((id: string) => save(kits.filter((k) => k.id !== id), active.id === id ? null : undefined), [kits, active.id, save]);
  const switchKit = useCallback((id: string) => save(kits, id), [kits, save]);
  /** "This place doesn't have it": hidden from swaps, plans and home workouts at this kit. */
  const markMissing = useCallback(
    (kitId: string, exerciseId: string) => {
      const kit = kits.find((k) => k.id === kitId);
      if (!kit || kit.missing.includes(exerciseId)) return Promise.resolve();
      return saveKit({ ...kit, missing: [...kit.missing, exerciseId] });
    },
    [kits, saveKit],
  );
  /** Your home kit, set up from the default the first time. */
  const ensureHome = useCallback(async () => {
    if (home) return home;
    const kit = defaultHomeKit(`home-${Date.now().toString(36)}`);
    await saveKit(kit);
    return kit;
  }, [home, saveKit]);

  return { kits, active, home, saveKit, removeKit, switchKit, markMissing, ensureHome };
}
