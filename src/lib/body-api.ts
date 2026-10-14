// Body tab data: measurement history and private progress photos.
// Row Level Security and the storage policies keep both to the signed-in user.

import { getSupabase } from "@/lib/supabase/client";
import { localDay, type BodyField } from "@/lib/body";
import type { Tables } from "@/types/database";

export type BodyMeasurement = Tables<"body_measurements">;
export type ProgressPhoto = { path: string; day: string; url: string };

const BUCKET = "progress-photos";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function userId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("You're signed out. Sign in again to continue.");
  return id;
}

// ---------- Measurements ----------

export async function listMeasurements(): Promise<BodyMeasurement[]> {
  return unwrap(await getSupabase().from("body_measurements").select("*").order("measured_on"));
}

/** Logs values for one day; fields left out keep what that day already had. */
export async function saveMeasurement(
  day: string,
  values: Partial<Record<BodyField, number | null>>,
): Promise<BodyMeasurement> {
  return unwrap(
    await getSupabase()
      .from("body_measurements")
      .upsert({ measured_on: day, ...values }, { onConflict: "user_id,measured_on" })
      .select()
      .single(),
  );
}

/** Clears one value from a day, and drops the day once nothing is left on it. */
export async function clearMeasurement(row: BodyMeasurement, field: BodyField): Promise<void> {
  const rest = (["weight_kg", "body_fat_pct", "waist_cm"] as const).filter((f) => f !== field && row[f] != null);
  const db = getSupabase().from("body_measurements");
  const patch: Partial<Record<BodyField, null>> = { [field]: null };
  unwrap(await (rest.length ? db.update(patch).eq("id", row.id) : db.delete().eq("id", row.id)));
}

// ---------- Progress photos ----------

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const uid = await userId();
  const storage = getSupabase().storage.from(BUCKET);
  const files = unwrap(await storage.list(uid, { limit: 500, sortBy: { column: "name", order: "desc" } }));
  const paths = files.filter((f) => f.id).map((f) => `${uid}/${f.name}`);
  if (!paths.length) return [];
  const signed = unwrap(await storage.createSignedUrls(paths, 60 * 60));
  return signed.flatMap((s) =>
    s.path && s.signedUrl ? [{ path: s.path, day: s.path.split("/")[1].slice(0, 10), url: s.signedUrl }] : [],
  );
}

/** Shrinks the photo on the phone first (long side 1600 px, JPEG) so uploads stay quick. */
export async function uploadPhoto(file: File): Promise<void> {
  const uid = await userId();
  const blob = await shrink(file);
  const name = `${localDay(new Date())}_${crypto.randomUUID().slice(0, 8)}.jpg`;
  unwrap(await getSupabase().storage.from(BUCKET).upload(`${uid}/${name}`, blob, { contentType: "image/jpeg" }));
}

export async function deletePhoto(path: string): Promise<void> {
  unwrap(await getSupabase().storage.from(BUCKET).remove([path]));
}

async function shrink(file: File, max = 1600): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file couldn't be opened as a photo. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", 0.85),
  );
}
