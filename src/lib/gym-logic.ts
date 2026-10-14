// Gym check-in math with no app dependencies, so it can be unit tested.

/** Workouts at the gym have to run longer than this to go on the calendar. */
export const MIN_GYM_MINUTES = 30;

export type LatLng = { lat: number; lng: number };
export type GymPlace = LatLng & { radius: number; name: string | null };

/** Straight-line distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Inside the gym circle? A fuzzy indoor fix counts if its error circle
 * reaches the gym, so a weak signal inside a big building still checks you in.
 */
export function isAtGym(here: LatLng & { accuracy?: number }, gym: GymPlace): boolean {
  const slack = Math.min(here.accuracy ?? 0, 150);
  return distanceMeters(here, gym) <= gym.radius + slack;
}

export function gymOf(profile: { gym_lat: number | null; gym_lng: number | null; gym_radius_m: number; gym_name: string | null } | null): GymPlace | null {
  if (!profile || profile.gym_lat == null || profile.gym_lng == null) return null;
  return { lat: profile.gym_lat, lng: profile.gym_lng, radius: profile.gym_radius_m, name: profile.gym_name };
}

/** Did this workout count for the calendar: at the gym and longer than 30 minutes. */
export function countsForCalendar(atGym: boolean | null, startTime: string, endTime: string | number): boolean {
  return atGym === true && (+new Date(endTime) - Date.parse(startTime)) / 60_000 > MIN_GYM_MINUTES;
}

