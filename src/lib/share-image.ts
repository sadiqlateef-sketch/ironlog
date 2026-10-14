// Draws a workout summary as a 1080 × 1350 image (the size feeds and stories
// crop well) for the Share button. Browser only.

export interface ShareCard {
  title: string;
  date: string;
  stats: { label: string; value: string }[]; // 4 tiles
  records: number;
  lines: { name: string; detail: string; record: boolean }[];
}

const W = 1080;
const H = 1350;
const PAD = 84;

export async function drawWorkoutCard(card: ShareCard): Promise<Blob> {
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // Backdrop: the app's deep navy with two soft glows.
  g.fillStyle = "#07080f";
  g.fillRect(0, 0, W, H);
  glow(g, 160, 120, 700, "rgba(42,70,216,0.55)");
  glow(g, W - 80, H - 200, 760, "rgba(106,47,214,0.45)");

  let y = PAD + 20;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#84a8ff";
  g.font = `800 34px ${font}`;
  g.letterSpacing = "6px";
  g.fillText("IRONLOG", PAD, y);
  g.letterSpacing = "0px";

  y += 96;
  g.fillStyle = "#f5f7ff";
  g.font = `800 76px ${font}`;
  y = wrap(g, card.title, PAD, y, W - PAD * 2, 84, 2);
  g.fillStyle = "#a3aacb";
  g.font = `500 36px ${font}`;
  g.fillText(card.date, PAD, y + 10);
  y += 50;

  if (card.records > 0) {
    y += 26;
    const label = `🏆  ${card.records} New Record${card.records === 1 ? "" : "s"}`;
    g.font = `800 34px ${font}`;
    const w = g.measureText(label).width + 56;
    g.fillStyle = "rgba(255,207,92,0.16)";
    round(g, PAD, y, w, 64, 32);
    g.fill();
    g.fillStyle = "#ffcf5c";
    g.fillText(label, PAD + 28, y + 44);
    y += 64;
  }

  // Stat tiles, two by two.
  y += 44;
  const tileW = (W - PAD * 2 - 24) / 2;
  const tileH = 168;
  card.stats.slice(0, 4).forEach((s, i) => {
    const x = PAD + (i % 2) * (tileW + 24);
    const ty = y + Math.floor(i / 2) * (tileH + 24);
    g.fillStyle = "rgba(255,255,255,0.07)";
    round(g, x, ty, tileW, tileH, 32);
    g.fill();
    g.fillStyle = "#a3aacb";
    g.font = `700 28px ${font}`;
    g.fillText(s.label.toUpperCase(), x + 36, ty + 58);
    g.fillStyle = "#f5f7ff";
    g.font = `800 64px ${font}`;
    g.fillText(s.value, x + 36, ty + 132);
  });
  y += tileH * 2 + 24 + 72;

  // Exercises with their best set.
  const room = Math.floor((H - PAD - y) / 66);
  const shown = card.lines.length > room ? card.lines.slice(0, room - 1) : card.lines;
  for (const l of shown) {
    g.font = `700 36px ${font}`;
    const detailW = g.measureText(l.detail).width;
    g.fillStyle = l.record ? "#ffcf5c" : "#f5f7ff";
    g.textAlign = "right";
    g.fillText(l.detail, W - PAD, y);
    g.textAlign = "left";
    g.font = `600 36px ${font}`;
    g.fillText(ellipsis(g, `${l.record ? "🏆 " : ""}${l.name}`, W - PAD * 2 - detailW - 32), PAD, y);
    y += 66;
  }
  if (shown.length < card.lines.length) {
    g.fillStyle = "#a3aacb";
    g.font = `500 32px ${font}`;
    g.fillText(`+ ${card.lines.length - shown.length} more`, PAD, y);
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), "image/png"));
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function ellipsis(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Draws text wrapped to at most `lines` lines (the last one trimmed) and returns the y after it. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number): number {
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    const last = out.length ? out[out.length - 1] : null;
    if (last != null && g.measureText(`${last} ${w}`).width <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  const kept = out.slice(0, lines);
  if (out.length > lines) kept[lines - 1] = out.slice(lines - 1).join(" ");
  kept.forEach((l, i) => g.fillText(ellipsis(g, l, max), x, y + i * lh));
  return y + (kept.length - 1) * lh + lh - 20;
}
