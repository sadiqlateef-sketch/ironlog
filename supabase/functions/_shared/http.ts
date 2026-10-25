// Request plumbing shared by the Edge Functions: CORS, JSON replies, and a
// Supabase client that acts AS the signed-in user (so Row Level Security applies).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Server is missing ${name}`);
  return v;
}

/** The caller's own client (RLS enforced) plus their user id. */
export async function userClient(req: Request): Promise<{ db: SupabaseClient; userId: string }> {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new HttpError(401, "Sign in first");
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) throw new HttpError(401, "Sign in first");
  return { db, userId: data.user.id };
}

/** Service-role client, only for writing the ai_usage log. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}
