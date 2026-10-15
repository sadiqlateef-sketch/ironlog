// /functions/v1/gym-calendar: puts gym workouts on your Google Calendar.
//
// POST { action } from the app (signed in):
//   "status"      is a calendar connected, and which one
//   "connect"     the Google sign-in link to open ({ return_to: "app" | "web" })
//   "calendars"   calendars you can add events to
//   "choose"      save which calendar to use ({ calendar_id })
//   "disconnect"  forget the Google sign-in
//   "sync"        add every finished gym workout longer than 30 minutes
//                 (last 14 days) that isn't on the calendar yet
// GET ?code&state is where Google sends you back after signing in, so this
// function checks the caller itself instead of requiring a JWT.
// GET ?page=home|privacy|terms are the public pages Google's sign-in screen
// links to (it needs them before the app can be published).

import { adminClient, corsHeaders, handle, HttpError, json, userClient } from "../_shared/http.ts";
import {
  accessToken,
  authUrl,
  buildEvent,
  defaultCalendar,
  exchangeCode,
  GoogleError,
  insertEvent,
  listCalendars,
  MIN_GYM_MINUTES,
  minutesOf,
  signState,
  verifyState,
  type GymWorkout,
} from "../_shared/google.ts";

const APP_RETURN = "com.ironlog.app://gym-calendar";

function env(name: string): string | null {
  return Deno.env.get(name) || null;
}

function creds() {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new HttpError(503, "Google Calendar isn't set up on the server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).");
  return { clientId, clientSecret };
}

function redirectUri(): string {
  return env("GOOGLE_REDIRECT_URI") ?? `${env("SUPABASE_URL")}/functions/v1/gym-calendar`;
}

function stateKey(): string {
  const k = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) throw new HttpError(500, "Server is missing SUPABASE_SERVICE_ROLE_KEY");
  return `gym-calendar:${k}`;
}

type Connection = { user_id: string; google_email: string | null; refresh_token: string; calendar_id: string | null; calendar_name: string | null };

async function getConnection(userId: string): Promise<Connection | null> {
  const { data, error } = await adminClient().from("calendar_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data;
}

/** A fresh Google access token; a revoked sign-in is forgotten so the app shows "Connect" again. */
async function tokenFor(conn: Connection): Promise<string> {
  try {
    return await accessToken(conn.refresh_token, creds());
  } catch (e) {
    if (e instanceof GoogleError && e.status === 401) {
      await adminClient().from("calendar_connections").delete().eq("user_id", conn.user_id);
      throw new HttpError(409, "Google Calendar was disconnected. Connect it again in Settings.");
    }
    throw e;
  }
}

// ---------- Google sends you back here ----------

function backToApp(returnTo: "app" | "web", result: "connected" | "error", message: string): Response {
  if (returnTo === "app") {
    return new Response(null, { status: 302, headers: { Location: `${APP_RETURN}?result=${result}` } });
  }
  // Supabase serves function pages as plain text, so keep it to a sentence.
  return new Response(`${message}\n`, { status: result === "connected" ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function callback(url: URL): Promise<Response> {
  const who = await verifyState(url.searchParams.get("state") ?? "", stateKey());
  if (!who) return backToApp("web", "error", "That sign-in link expired. Go back to Ironlog and tap Connect Google Calendar again.");
  const code = url.searchParams.get("code");
  if (!code) return backToApp(who.returnTo, "error", "Google Calendar wasn't connected. Go back to Ironlog to try again.");
  try {
    const c = creds();
    const t = await exchangeCode(code, redirectUri(), c);
    const existing = await getConnection(who.userId);
    const refresh = t.refreshToken ?? existing?.refresh_token;
    if (!refresh) throw new Error("Google didn't send a refresh token");
    // Start on a workout calendar if you have one; you can change it in the app.
    let calendar = existing?.calendar_id ? { id: existing.calendar_id, name: existing.calendar_name ?? existing.calendar_id } : null;
    if (!calendar) calendar = defaultCalendar(await listCalendars(t.accessToken).catch(() => []));
    const { error } = await adminClient().from("calendar_connections").upsert({
      user_id: who.userId,
      google_email: t.email,
      refresh_token: refresh,
      calendar_id: calendar?.id ?? null,
      calendar_name: calendar?.name ?? null,
    });
    if (error) throw error;
    return backToApp(who.returnTo, "connected", "Google Calendar is connected. You can close this tab and go back to Ironlog.");
  } catch (e) {
    console.error(e);
    return backToApp(who.returnTo, "error", "Google Calendar wasn't connected. Go back to Ironlog to try again.");
  }
}

// ---------- Adding workouts ----------

async function sync(userId: string, db: Awaited<ReturnType<typeof userClient>>["db"]): Promise<{ added: number }> {
  const conn = await getConnection(userId);
  if (!conn?.calendar_id) return { added: 0 };

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: sessions, error } = await db
    .from("workout_sessions")
    .select("id, name, start_time, end_time, volume")
    .eq("at_gym", true)
    .is("calendar_event_id", null)
    .not("end_time", "is", null)
    .gte("start_time", since)
    .order("start_time");
  if (error) throw new HttpError(500, error.message);
  const due = (sessions ?? []).filter((s) => minutesOf(s) > MIN_GYM_MINUTES);
  if (!due.length) return { added: 0 };

  const [{ data: profile }, { data: sets }] = await Promise.all([
    db.from("users").select("gym_name, unit_system").eq("id", userId).single(),
    db
      .from("workout_sets")
      .select("session_id, exercise_order, exercises(name)")
      .in("session_id", due.map((s) => s.id))
      .eq("is_completed", true)
      .order("exercise_order"),
  ]);

  const token = await tokenFor(conn);
  let added = 0;
  for (const s of due) {
    const mine = (sets ?? []).filter((x) => x.session_id === s.id);
    const names = [...new Set(mine.map((x) => (x.exercises as unknown as { name: string } | null)?.name).filter((n): n is string => !!n))];
    const workout: GymWorkout = { id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time!, volume_kg: Number(s.volume) || 0, sets: mine.length, exercises: names };
    const eventId = await insertEvent(token, conn.calendar_id, buildEvent(workout, { gymName: profile?.gym_name ?? null, unit: profile?.unit_system ?? "imperial" }));
    const { error: upErr } = await db.from("workout_sessions").update({ calendar_event_id: eventId }).eq("id", s.id);
    if (upErr) throw new HttpError(500, upErr.message);
    added++;
  }
  return { added };
}

// ---------- Public pages for Google's sign-in screen ----------

const PAGES: Record<string, string> = {
  home: `Ironlog

Ironlog is a personal strength-training log: workouts, sets, progress charts
and a Wear OS watch companion. It's a private app built for its owner.

Google Calendar: if you connect it, Ironlog adds gym workouts longer than
30 minutes to the calendar you choose. Nothing else is read or changed.

Privacy policy: ?page=privacy   Terms: ?page=terms
Contact: sadiq.lateef@gmail.com
`,
  privacy: `Ironlog privacy policy

What Ironlog stores: your account email, the workouts you log, and (only if
you save one) your gym's location. It's kept in Ironlog's database and is
never sold or shared.

Location: the app checks your phone's location only while a workout is open,
to tell whether you're at your gym. Only "at the gym: yes/no" is saved for
each workout. There is no background tracking.

Google Calendar: when you connect it, Ironlog asks Google for permission to
see your list of calendars and to add events. It uses that only to add your
gym workouts to the calendar you pick. It doesn't read your other events.
Google user data is used in line with the Google API Services User Data
Policy, including its Limited Use requirements.

Disconnecting: tap Disconnect in Settings > Gym & calendar, or remove Ironlog
at https://myaccount.google.com/connections. Either one revokes access, and
the stored Google sign-in is deleted.

Deleting your data or questions: email sadiq.lateef@gmail.com.
`,
  terms: `Ironlog terms of service

Ironlog is a personal project provided as is, without warranties. It is a
training log, not medical advice: check with a qualified professional before
starting or changing an exercise program. You're responsible for how you use
it. Questions: sadiq.lateef@gmail.com.
`,
};

function page(name: string): Response {
  const body = PAGES[name];
  return new Response(body ?? "Not found\n", { status: body ? 200 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// ---------- Router ----------

const post = handle(async (req) => {
  const { db, userId } = await userClient(req);
  const body = await req.json().catch(() => ({}));
  switch (body?.action) {
    case "status": {
      const conn = await getConnection(userId);
      return json({
        configured: !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")),
        connected: !!conn,
        email: conn?.google_email ?? null,
        calendar_id: conn?.calendar_id ?? null,
        calendar_name: conn?.calendar_name ?? null,
      });
    }
    case "connect": {
      const state = await signState(userId, body.return_to === "app" ? "app" : "web", stateKey());
      return json({ url: authUrl(creds().clientId, redirectUri(), state) });
    }
    case "calendars": {
      const conn = await getConnection(userId);
      if (!conn) throw new HttpError(409, "Connect Google Calendar first.");
      return json({ calendars: await listCalendars(await tokenFor(conn)) });
    }
    case "choose": {
      const conn = await getConnection(userId);
      if (!conn) throw new HttpError(409, "Connect Google Calendar first.");
      const cal = (await listCalendars(await tokenFor(conn))).find((c) => c.id === body.calendar_id);
      if (!cal) throw new HttpError(400, "You can't add events to that calendar.");
      const { error } = await adminClient().from("calendar_connections").update({ calendar_id: cal.id, calendar_name: cal.name }).eq("user_id", userId);
      if (error) throw new HttpError(500, error.message);
      return json({ calendar_id: cal.id, calendar_name: cal.name });
    }
    case "disconnect": {
      const conn = await getConnection(userId);
      if (conn) {
        // Tell Google too, so Ironlog disappears from your account's connected apps.
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" }).catch(() => {});
        await adminClient().from("calendar_connections").delete().eq("user_id", userId);
      }
      return json({ connected: false });
    }
    case "sync":
      try {
        return json(await sync(userId, db));
      } catch (e) {
        if (e instanceof GoogleError) throw new HttpError(502, `Google Calendar: ${e.message}`);
        throw e;
      }
    default:
      throw new HttpError(400, "Unknown action");
  }
});

Deno.serve(async (req) => {
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const name = url.searchParams.get("page");
      if (name) return page(name);
      return await callback(url);
    } catch (e) {
      console.error(e);
      return new Response("Something went wrong. Go back to Ironlog and try again.\n", { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
  }
  return post(req);
});
