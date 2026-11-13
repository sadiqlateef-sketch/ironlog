"use client";

// Places you've named for usual meals ("work", "Campus cafe"), with where they
// are. Kept in this phone's storage only: the location is never synced or
// sent anywhere, and signing out removes it.

import type { SavedPlace } from "@/lib/nutrition/usuals";

export const PLACES_KEY = "ironlog:nutrition-places";
const MAX_PLACES = 20;

export function loadPlaces(): SavedPlace[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLACES_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is SavedPlace =>
        p && typeof p.name === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
  } catch {
    return [];
  }
}

function write(list: SavedPlace[]) {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(list.slice(0, MAX_PLACES)));
  } catch {
    // Storage full or blocked: the place just isn't remembered.
  }
}

/** Remember `name` at this spot (replaces an older spot with the same name). */
export function savePlace(name: string, at: { lat: number; lng: number }): void {
  const n = name.trim();
  if (n === "") return;
  const rest = loadPlaces().filter((p) => p.name.toLowerCase() !== n.toLowerCase());
  write([{ name: n, lat: at.lat, lng: at.lng }, ...rest]);
}

export function forgetPlace(name: string): void {
  write(loadPlaces().filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase()));
}

export function clearPlaces(): void {
  try {
    localStorage.removeItem(PLACES_KEY);
  } catch {
    // Nothing to clear.
  }
}
