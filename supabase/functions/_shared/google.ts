// Google Calendar for gym check-ins: sign-in link, token refresh, and the
// calendar event for a finished workout. Plain fetch, no Google SDK.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

/** Workouts at the gym have to run longer than this to go on the calendar. */
export const MIN_GYM_MINUTES = 30;

export class GoogleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- Sign-in state ----------
// The state we hand Google carries the user id and an expiry, signed so the
// callback can trust which account to save the calendar to.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data))));
}

/** Where to send you after Google: back into the Android app, or a "you can close this tab" note. */
export type ReturnTo = "app" | "web";

export async function signState(userId: string, returnTo: ReturnTo, key: string, now = Date.now()): Promise<string> {
  const body = `${userId}.${now + 15 * 60_000}.${returnTo}`;
  return `${body}.${await hmac(key, body)}`;
}

/** Who started the sign-in, from a state we signed; null if it's forged or older than 15 minutes. */
export async function verifyState(state: string, key: string, now = Date.now()): Promise<{ userId: string; returnTo: ReturnTo } | null> {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, expires, returnTo, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !(Number(expires) > now) || (returnTo !== "app" && returnTo !== "web")) return null;
  const expected = await hmac(key, `${userId}.${expires}.${returnTo}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { userId, returnTo } : null;
}

export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google sends a refresh token even on a second connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// ---------- Tokens ----------

type Creds = { clientId: string; clientSecret: string };

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = the sign-in was revoked or expired; the user must reconnect.
    throw new GoogleError(body.error === "invalid_grant" ? 401 : 502, body.error_description ?? body.error ?? "Google sign-in failed");
  }
  return body;
}

export async function exchangeCode(code: string, redirectUri: string, c: Creds) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code" });
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, email: emailFromIdToken(t.id_token) };
}

export async function accessToken(refreshToken: string, c: Creds): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" })).access_token;
}

/** The id token comes straight from Google's token endpoint over TLS, so reading it without a signature check is fine. */
export function emailFromIdToken(idToken?: string): string | null {
  try {
    const payload = idToken?.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

// ---------- Calendar ----------

async function gcal(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
}

export type CalendarChoice = { id: string; name: string; primary: boolean };

/** Calendars you can add events to. */
export async function listCalendars(token: string): Promise<CalendarChoice[]> {
  const res = await gcal(token, "/users/me/calendarList?minAccessRole=writer&maxResults=250");
  if (!res.ok) throw new GoogleError(502, "Couldn't load your calendars");
  const body = await res.json();
  return (body.items ?? []).map((c: { id: string; summary?: string; summaryOverride?: string; primary?: boolean }) => ({
    id: c.id,
    name: c.summaryOverride ?? c.summary ?? c.id,
    primary: !!c.primary,
  }));
}

/** Pick a workout calendar if there is one, otherwise your main calendar. */
export function defaultCalendar(cals: CalendarChoice[]): CalendarChoice | null {
  return (
    cals.find((c) => /^workouts?$/i.test(c.name.trim())) ??
    cals.find((c) => /workout|gym|fitness|training/i.test(c.name)) ??
    cals.find((c) => c.primary) ??
    cals[0] ??
    null
  );
}

/**
 * Google lets us choose the event id (letters a-v and digits). Using the
 * workout's id means adding the same workout twice can't make two events.
 */
export function eventIdFor(sessionId: string): string {
  return `ironlog${sessionId.replace(/-/g, "").toLowerCase()}`;
}

export type GymWorkout = {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string;
  volume_kg: number;
  sets: number;
  exercises: string[];
};

export function minutesOf(w: Pick<GymWorkout, "start_time" | "end_time">): number {
  return (Date.parse(w.end_time) - Date.parse(w.start_time)) / 60_000;
}

export function buildEvent(w: GymWorkout, opts: { gymName: string | null; unit: "imperial" | "metric" }) {
  const mins = Math.round(minutesOf(w));
  const volume = opts.unit === "imperial" ? `${Math.round(w.volume_kg * 2.2046226218).toLocaleString("en-US")} lb` : `${Math.round(w.volume_kg).toLocaleString("en-US")} kg`;
  const lines = [
    `${mins} min · ${w.sets} set${w.sets === 1 ? "" : "s"} · ${volume} lifted`,
    ...(w.exercises.length ? ["", ...w.exercises.map((e) => `• ${e}`)] : []),
    "",
    "Logged with Ironlog",
  ];
  return {
    id: eventIdFor(w.id),
    summary: `Workout: ${w.name?.trim() || "Lifting"}`,
    description: lines.join("\n"),
    ...(opts.gymName ? { location: opts.gymName } : {}),
    start: { dateTime: new Date(w.start_time).toISOString() },
    end: { dateTime: new Date(w.end_time).toISOString() },
    reminders: { useDefault: false, overrides: [] },
    transparency: "opaque",
  };
}

/** Adds the event. Returns its id; an event that's already there counts as added. */
export async function insertEvent(token: string, calendarId: string, event: ReturnType<typeof buildEvent>): Promise<string> {
  const res = await gcal(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(event) });
  if (res.ok || res.status === 409) return event.id;
  const body = await res.json().catch(() => ({}));
  throw new GoogleError(res.status === 401 ? 401 : 502, body?.error?.message ?? "Couldn't add the event");
}
