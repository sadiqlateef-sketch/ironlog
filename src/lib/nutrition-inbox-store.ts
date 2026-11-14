"use client";

// The capture inbox on this phone: the list in the offline key-value store
// (wiped at sign-out with everything else) and the photos in the app's private
// files (never synced, excluded from backups by data_extraction_rules.xml).
// In a browser the photo is kept beside the list instead.

import { Directory, Filesystem } from "@capacitor/filesystem";
import { isNative } from "@/lib/native";
import { kvDelete, kvGet, kvSet } from "@/lib/offline/kv";
import { INBOX_DIR, MAX_INBOX, makeInboxItem, normalizeInbox, orphanPhotos, photoFileFor, type InboxItem } from "@/lib/nutrition/inbox";
import type { NutritionPrefs } from "@/lib/nutrition/diary-types";
import type { Shift } from "@/lib/shifts";

const KEY = "nutrition-inbox";
const photoKey = (id: string) => `nutrition-inbox-photo:${id}`;
export const INBOX_EVENT = "ironlog:nutrition-inbox";
const MAX_SIDE = 1280;

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

const notify = () => window.dispatchEvent(new Event(INBOX_EVENT));

export async function listInbox(): Promise<InboxItem[]> {
  return normalizeInbox(await kvGet(KEY));
}

/** A smaller JPEG of the photo, as base64 without the data: prefix. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
}

export async function addToInbox(input: {
  photo: File | null;
  note: string | null;
  prefs: Pick<NutritionPrefs, "day_start" | "follow_shifts" | "post_night_start" | "meals">;
  shifts: readonly Shift[];
}): Promise<InboxItem> {
  const id = crypto.randomUUID();
  const takenAt = new Date();
  let photoPath: string | null = null;
  if (input.photo) {
    const data = await shrink(input.photo);
    if (isNative()) {
      photoPath = photoFileFor(id);
      await Filesystem.writeFile({ path: photoPath, data, directory: Directory.Data, recursive: true });
    } else {
      photoPath = `kv:${id}`;
      if (!(await kvSet(photoKey(id), data))) throw new Error("photo not saved");
    }
  }
  const item = makeInboxItem({ id, takenAt, prefs: input.prefs, shifts: input.shifts, note: input.note, photoPath });
  await locked(async () => {
    const list = await listInbox();
    if (list.length >= MAX_INBOX) throw new Error("inbox full");
    await kvSet(KEY, [...list, item]);
  });
  notify();
  return item;
}

/** The photo as a data: URL to show, or null if it is gone. */
export async function inboxPhotoUrl(item: InboxItem): Promise<string | null> {
  if (!item.photoPath) return null;
  try {
    if (item.photoPath.startsWith("kv:")) {
      const data = await kvGet<string>(photoKey(item.id));
      return data ? `data:image/jpeg;base64,${data}` : null;
    }
    if (!isNative()) return null;
    const { data } = await Filesystem.readFile({ path: item.photoPath, directory: Directory.Data });
    return typeof data === "string" ? `data:image/jpeg;base64,${data}` : null;
  } catch {
    return null;
  }
}

async function deletePhoto(item: Pick<InboxItem, "id" | "photoPath">): Promise<void> {
  if (!item.photoPath) return;
  try {
    if (item.photoPath.startsWith("kv:")) await kvDelete(photoKey(item.id));
    else if (isNative()) await Filesystem.deleteFile({ path: item.photoPath, directory: Directory.Data });
  } catch {
    // Already gone; the orphan sweep catches anything left.
  }
}

/** Remove an item and its photo (after it was logged, or when dismissed). */
export async function removeFromInbox(id: string): Promise<void> {
  const gone = await locked(async () => {
    const list = await listInbox();
    const item = list.find((i) => i.id === id) ?? null;
    if (item) await kvSet(KEY, list.filter((i) => i.id !== id));
    return item;
  });
  if (gone) {
    await deletePhoto(gone);
    notify();
  }
}

/** Delete photo files no inbox item points to (after a sign-out wiped the list). Native only. */
export async function sweepInboxPhotos(): Promise<void> {
  if (!isNative()) return;
  try {
    const { files } = await Filesystem.readdir({ path: INBOX_DIR, directory: Directory.Data });
    const orphans = orphanPhotos(await listInbox(), files.map((f) => f.name));
    for (const path of orphans) await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
  } catch {
    // No inbox folder yet.
  }
}
