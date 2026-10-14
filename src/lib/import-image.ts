// Shrink photos and screenshots before sending them to Claude: big phone
// photos are 5-10 MB, but Claude reads text just as well at ~1500 px, and
// small uploads are quicker on gym Wi-Fi. Very tall screenshots (a whole
// workout scrolled into one image) are cut into readable pieces first.

import type { ImportInput } from "@/lib/workout-api";

const LONG_EDGE = 1568; // Claude's sweet spot; bigger images are scaled down anyway
const MAX_PIECES = 8;
const TALL = 2.2; // height / width above which a screenshot is cut up
const PIECE = 1.5; // each piece is at most this tall relative to its width

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Older WebViews: fall back to an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Top offsets and height of each piece, overlapping a little so no row is cut in half. */
export function pieceRows(width: number, height: number): { y: number; h: number }[] {
  if (height / width <= TALL) return [{ y: 0, h: height }];
  const h = Math.round(width * PIECE);
  const step = Math.round(h * 0.9);
  const rows: { y: number; h: number }[] = [];
  for (let y = 0; y < height; y += step) {
    rows.push({ y, h: Math.min(h, height - y) });
    if (y + h >= height) break;
  }
  return rows;
}

function encode(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): string {
  const scale = Math.min(1, LONG_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export async function prepareImages(files: File[]): Promise<ImportInput["images"]> {
  const out: ImportInput["images"] = [];
  for (const file of files) {
    let img;
    try {
      img = await decode(file);
    } catch {
      throw new Error(`Couldn't open ${file.name || "that photo"}. Try a JPG or PNG screenshot.`);
    }
    for (const { y, h } of pieceRows(img.width, img.height)) {
      out.push({ media_type: "image/jpeg", data: encode(img, 0, y, img.width, h) });
    }
    if ("close" in img && typeof img.close === "function") img.close();
  }
  if (out.length > MAX_PIECES) {
    throw new Error("That's a lot of pictures for one workout. Try up to 4 screenshots at a time.");
  }
  return out;
}
