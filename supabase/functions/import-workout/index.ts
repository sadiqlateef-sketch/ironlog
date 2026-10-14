// POST /functions/v1/import-workout
// Body: ImportRequest (see _shared/import.ts): screenshots or photos as base64,
// and/or pasted text. Returns the workout Claude read, with each exercise
// matched to your library. Nothing is saved here: the app shows it for review
// and saves it as a finished workout once you confirm.

import type Anthropic from "@anthropic-ai/sdk";
import { askStructured, checkDailyLimit } from "../_shared/claude.ts";
import { handle, HttpError, json, userClient } from "../_shared/http.ts";
import { buildImportPrompt, IMPORT_SYSTEM_PROMPT, ImportRequest, importSchema, toImportedWorkout, type LibraryExercise } from "../_shared/import.ts";
import type { UnitSystem } from "../_shared/units.ts";

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const parsed = ImportRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Add a photo or some text, then try again. Photos must be under 4 MB.");
    const input = parsed.data;
    await checkDailyLimit(userId, "import_workout");

    const [{ data: profile }, { data: exercises, error: exErr }] = await Promise.all([
      db.from("users").select("unit_system").eq("id", userId).single(),
      db.from("exercises").select("id, slug, name, aliases, equipment, created_by"),
    ]);
    if (exErr || !exercises?.length) throw new HttpError(500, "Couldn't load the exercise library.");
    const library = exercises as LibraryExercise[];
    const unit: UnitSystem = profile?.unit_system ?? "imperial";
    const today = input.today ?? new Date().toISOString().slice(0, 10);

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...input.images.map((img): Anthropic.Beta.BetaContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })),
      { type: "text", text: buildImportPrompt(library, today, input.text) },
    ];

    const answer = await askStructured({
      userId,
      kind: "import_workout",
      system: IMPORT_SYSTEM_PROMPT,
      prompt: content,
      schema: importSchema,
      effort: "medium",
      maxTokens: 16000,
    });

    const workout = toImportedWorkout(answer, { library, unit, today });
    if (!answer.is_workout || workout.exercises.length === 0) {
      throw new HttpError(422, "Couldn't find any sets in that. Try a clearer photo, or type the workout in.");
    }
    return json(workout);
  }),
);
