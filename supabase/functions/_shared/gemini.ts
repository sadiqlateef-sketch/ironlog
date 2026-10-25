// The one place the Google Gemini API is called from. The API key lives in the
// Edge Function's secrets (GEMINI_API_KEY), never in the client app.

import type { z } from "zod";
import { adminClient, HttpError } from "./http.ts";

export const GEMINI_MODEL = "gemini-3.8-flash";

/** Calls per user per rolling 24 hours, to protect your API bill. */
export const DAILY_LIMIT: Record<UsageKind, number> = { generate_plan: 10, adjust_session: 30, import_workout: 30, weekly_recap: 5 };
type UsageKind = "generate_plan" | "adjust_session" | "import_workout" | "weekly_recap";

export async function checkDailyLimitGemini(userId: string, kind: UsageKind): Promise<void> {
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
 * One structured-output request using Gemini 3.8 Flash.
 * Returns the parsed and validated object via Zod schema, or throws an HttpError.
 */
export async function askStructuredGemini<S extends z.ZodType>(opts: {
  userId: string;
  kind: UsageKind;
  system: string;
  prompt: string;
  schema: S;
}): Promise<z.infer<S>> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new HttpError(503, "Gemini features need a GEMINI_API_KEY on the server.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let ok = false;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: opts.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `${opts.prompt}\n\nRespond ONLY with a valid JSON object matching the requested schema. No code fences, no extra commentary.` }],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const msg = errBody?.error?.message ?? res.statusText;
      if (res.status === 429) throw new HttpError(429, "Gemini is busy right now. Please try again in a moment.");
      throw new HttpError(502, `Gemini error: ${msg}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new HttpError(502, "Gemini returned an empty response. Please try again.");
    }

    let parsedRaw: unknown;
    try {
      // Strip markdown code fences if model enclosed JSON
      const cleanJson = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsedRaw = JSON.parse(cleanJson);
    } catch {
      throw new HttpError(502, "Gemini did not return valid JSON. Please try again.");
    }

    const validated = opts.schema.safeParse(parsedRaw);
    if (!validated.success) {
      throw new HttpError(502, "Gemini's plan did not match the expected format. Please try again.");
    }

    ok = true;
    return validated.data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Gemini request failed: ${(e as Error).message}`);
  } finally {
    // Audit log
    await adminClient()
      .from("ai_usage")
      .insert({
        user_id: opts.userId,
        kind: opts.kind,
        model: GEMINI_MODEL,
        ok,
      });
  }
}
