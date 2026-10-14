// The one place the Claude API is called from. The API key lives only in the
// Edge Function's secrets (ANTHROPIC_API_KEY), never in the app.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { adminClient, HttpError } from "./http.ts";

export const MODEL = "claude-opus-5-5";

/** Calls per user per rolling 24 hours, to protect your API bill. */
export const DAILY_LIMIT: Record<UsageKind, number> = { generate_plan: 5, adjust_session: 20, import_workout: 20 };
type UsageKind = "generate_plan" | "adjust_session" | "import_workout";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    throw new HttpError(503, "AI features need an Anthropic API key on the server (see README).");
  }
  // ANTHROPIC_BASE_URL is honoured by the SDK, which the tests use to point at a mock.
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export async function checkDailyLimit(userId: string, kind: UsageKind): Promise<void> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await adminClient()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= DAILY_LIMIT[kind]) {
    throw new HttpError(429, "You've hit today's AI limit. Try again tomorrow.");
  }
}

/**
 * One structured-output request. Returns the parsed object, or throws an
 * HttpError the app can show. Every attempt is logged to ai_usage.
 */
export async function askStructured<S extends z.ZodType>(opts: {
  userId: string;
  kind: UsageKind;
  system: string;
  /** Text, or content blocks when sending images (images first, then the text). */
  prompt: string | Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<z.infer<S>> {
  const anthropic = getClient();
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let ok = false;
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens,
      // Server-side fallback: if a safety classifier declines, the API retries
      // on Anthropic's recommended model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      // The system prompt never changes, so cache it.
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.prompt }],
    });
    usage = response.usage;
    if (response.stop_reason === "refusal") {
      throw new HttpError(422, "Claude couldn't help with that request. Try rewording your notes.");
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new HttpError(502, "Claude's answer was incomplete. Please try again.");
    }
    ok = true;
    return response.parsed_output as z.infer<S>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "The server's Anthropic API key is invalid.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude API error (${e.status ?? "network"}). Try again.`);
    throw e;
  } finally {
    await adminClient().from("ai_usage").insert({
      user_id: opts.userId,
      kind: opts.kind,
      model: MODEL,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      ok,
    });
  }
}
