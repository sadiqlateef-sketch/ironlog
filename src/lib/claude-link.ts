// Your private connector link for logging workouts from a Claude chat (see
// supabase/functions/claude-connector). The secret in the link is shown once
// when it's made; the database only keeps a hash of it.

import { getSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

export type ClaudeLink = Tables<"claude_links">;

export async function getClaudeLink(): Promise<ClaudeLink | null> {
  const { data, error } = await getSupabase().from("claude_links").select("user_id, created_at, last_used_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Makes a new link (any old one stops working) and returns its full URL. */
export async function createClaudeLink(): Promise<string> {
  const { data, error } = await getSupabase().rpc("create_claude_link");
  if (error || !data) throw new Error(error?.message ?? "Couldn't make a link. Try again.");
  return connectorUrl(data);
}

/** Turns Claude's access off. */
export async function deleteClaudeLink(): Promise<void> {
  const { data: auth } = await getSupabase().auth.getUser();
  if (!auth.user) throw new Error("Sign in first");
  const { error } = await getSupabase().from("claude_links").delete().eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);
}

export function connectorUrl(secret: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/claude-connector/${secret}`;
}
