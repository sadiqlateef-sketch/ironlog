// Smoke test: clicks through the built app in a phone-sized Chrome and checks
// the main flows still work. Used as the checkpoint after every phase in FIX_PLAN.md.
//
//   npm run build            (with NO .env.local / .env.production.local, so the
//                             app runs on the local dev backend, see client.ts)
//   node scripts/smoke-test.mjs [screenshot-folder]
//
// Prints PASS/FAIL for each check and exits 1 if any check failed.
// Screenshots go to the folder you pass (default: smoke-shots/, git-ignored).

import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = path.resolve("out");
const SHOTS = path.resolve(process.argv[2] ?? "smoke-shots");
const PORT = 4399;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg" };

// Static server for the exported site (trailingSlash: /workout/ -> out/workout/index.html).
const server = createServer(async (req, res) => {
  let p = path.join(OUT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    if ((await stat(p)).isDirectory()) p = path.join(p, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream" });
    res.end(await readFile(p));
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch();
const base = `http://localhost:${PORT}`;

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // No real Open Food Facts calls: every product lookup answers "not found".
  await ctx.route(/openfoodfacts\.org/, (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"status":0}' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const text = async () => (await page.innerText("body")).replace(/\s+/g, " ");
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${label}-${n}.png`) });

  // Sign in (the local dev backend accepts any email and password).
  await page.goto(`${base}/login/`);
  await page.waitForTimeout(1500);
  await page.fill("input[type=email]", "smoke@test.local");
  await page.fill("input[type=password]", "smoke-test-123");
  await page.click("button[type=submit]");
  await page.waitForTimeout(2500);
  check(`${label}: sign in reaches the app`, !page.url().includes("/login"), page.url());
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.count()) await skip.first().click();

  // Every screen opens without a crash.
  for (const route of ["/", "/workout/", "/progress/", "/more/", "/plans/", "/exercises/", "/settings/", "/search/", "/log/", "/import/", "/food/", "/food/add/"]) {
    const before = errors.length;
    await page.goto(base + route);
    await page.waitForTimeout(1800);
    const t = await text();
    check(`${label}: ${route} opens`, errors.length === before && t.length > 40, errors.slice(before).join(" | ").slice(0, 160));
  }
  await page.goto(`${base}/`);
  await page.waitForTimeout(1500);
  await shot("home");

  // Start a planned workout, log a set, finish it.
  await page.goto(`${base}/workout/`);
  await page.waitForTimeout(2000);
  const routine = page.getByText("Full Body A (Squat & Bench)").first();
  check(`${label}: a routine is listed on Workout`, (await routine.count()) > 0);
  if (await routine.count()) {
    await routine.click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /start/i }).last().click();
    await page.waitForTimeout(2500);
  }
  check(`${label}: logger opens`, (await page.getByTestId("finish-button").count()) > 0);
  await shot("logger");
  const logSet = page.getByTestId("log-set");
  if (await logSet.count()) {
    await logSet.first().click();
    await page.waitForTimeout(1500);
  }
  check(`${label}: Log Set marks a set done`, (await page.locator("[data-testid=set-row] [aria-pressed=true], [data-testid=set-row][data-done=true]").count()) > 0 || (await text()).includes("Resting"), "looks for a done set or the rest timer");
  await shot("after-log");
  await page.getByTestId("finish-button").first().click();
  await page.waitForTimeout(1000);
  const confirmFinish = page.getByRole("dialog").getByRole("button", { name: "Finish" });
  if (await confirmFinish.count()) await confirmFinish.click();
  await page.waitForTimeout(2500);
  check(`${label}: finish summary shows`, (await page.getByTestId("finish-summary").count()) > 0);
  await shot("summary");
  const done = page.getByRole("button", { name: /done/i });
  if (await done.count()) await done.first().click();
  await page.waitForTimeout(1500);

  // The finished workout must not come back.
  await page.goto(`${base}/`);
  await page.waitForTimeout(2000);
  check(`${label}: no workout bar after finishing`, (await page.getByTestId("active-workout-bar").count()) === 0);
  await page.reload();
  await page.waitForTimeout(2000);
  await page.goto(`${base}/workout/`);
  await page.waitForTimeout(2500);
  check(`${label}: Workout tab shows the start screen after finishing`, (await page.getByTestId("finish-button").count()) === 0);
  await shot("workout-after-finish");

  // Food diary: quick add, reload, offline add, reconnect, custom food, Home card, Settings.
  await page.goto(`${base}/food/`);
  await page.waitForTimeout(2000);
  const quickAdd = async (name, kcal) => {
    await page.getByRole("button", { name: "More food options" }).click();
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("What was it?").fill(name);
    await page.getByLabel("Calories (kcal)").fill(String(kcal));
    await page.getByRole("button", { name: /^Add to / }).click();
    await page.waitForTimeout(1200);
  };
  await quickAdd("Smoke snack", 200);
  check(`${label}: food quick add is listed`, (await text()).includes("Smoke snack"));
  check(`${label}: food diary total shows 200`, (await page.getByTestId("food-total-energy").innerText()).includes("200"));
  await shot("food");
  await page.reload();
  await page.waitForTimeout(2000);
  check(`${label}: food entry survives a reload`, (await text()).includes("Smoke snack"));
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await quickAdd("Offline snack", 50);
  const offlineText = await text();
  check(`${label}: offline food entry is listed at once`, offlineText.includes("Offline snack"));
  check(`${label}: offline food sync chip shows no error`, !/couldn'?t|refused|database hasn/i.test(offlineText), offlineText.match(/\d+ food change[^.]{0,40}/)?.[0] ?? "no chip");
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(3000);
  check(`${label}: food changes finish syncing`, !/food changes? waiting/.test(await text()));
  check(`${label}: both food entries remain`, (await page.getByTestId("food-entry").count()) === 2);

  await page.goto(`${base}/food/add/`);
  await page.waitForTimeout(1500);
  await shot("food-add");
  await page.getByRole("button", { name: /Add your own food/ }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder("What is it?").fill("Smoke oats");
  for (const [lbl, v] of [["Calories (kcal)", "400"], ["Protein (g)", "10"], ["Carbs (g)", "60"], ["Fat (g)", "8"]]) await page.getByLabel(lbl).first().fill(v);
  await page.getByRole("button", { name: /Save and choose amount/ }).click();
  await page.waitForTimeout(1000);
  await page.getByLabel("Amount").fill("50");
  await page.getByRole("button", { name: /^Add to / }).click();
  await page.waitForTimeout(2500);
  check(`${label}: custom food lands in the diary`, (await text()).includes("Smoke oats"));
  check(`${label}: diary total adds the custom food (250 + 200 = 450)`, (await page.getByTestId("food-total-energy").innerText()).includes("450"));

  // Barcode on the web: no camera button, typed codes work. Codes 20... are in-store
  // numbers, never real products. 2000000000008 and 2000000000015 have valid check digits.
  const openScan = async () => {
    await page.goto(`${base}/food/add/`);
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Scan a barcode" }).click();
    await page.waitForTimeout(500);
  };
  const typeCode = async (code) => {
    await page.getByLabel("Barcode numbers").fill(code);
    await page.getByRole("button", { name: "Look up" }).click();
    await page.waitForTimeout(1200);
  };
  await openScan();
  const sheet = page.getByRole("dialog");
  check(`${label}: scan sheet has no camera button on the web`, (await sheet.getByRole("button", { name: /Scan with camera/ }).count()) === 0);
  check(`${label}: scan sheet says camera scanning is in the app`, (await sheet.innerText()).includes("Camera scanning works in the Android app"));
  await shot("scan-sheet");
  await typeCode("12ab");
  check(`${label}: a junk code shows the barcode hint`, (await sheet.innerText()).includes("doesn't look like a barcode"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check(`${label}: focus returns to the scan button`, (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Scan a barcode");
  await openScan();
  await typeCode("2000000000008");
  check(`${label}: an unknown code offers Create food`, (await sheet.innerText()).includes("No product found for 2000000000008"));
  await shot("scan-not-found");
  await sheet.getByRole("button", { name: "Create food" }).click();
  await page.waitForTimeout(600);
  check(`${label}: Create food prefills the barcode`, (await page.getByLabel("Barcode (optional)").inputValue()) === "2000000000008");
  await page.getByPlaceholder("What is it?").fill("Smoke bar");
  for (const [lbl, v] of [["Calories (kcal)", "300"], ["Protein (g)", "5"], ["Carbs (g)", "40"], ["Fat (g)", "10"]]) await page.getByLabel(lbl).first().fill(v);
  await page.getByRole("button", { name: /Save and choose amount/ }).click();
  await page.waitForTimeout(1000);
  await page.getByLabel("Amount").fill("20");
  await page.getByRole("button", { name: /^Add to / }).click();
  await page.waitForTimeout(2500);
  check(`${label}: food created from a barcode lands in the diary`, (await text()).includes("Smoke bar"));
  await openScan();
  await typeCode("02000000000008");
  check(`${label}: the same code (GTIN-14 form) finds it on the phone`, (await page.getByLabel("Amount").count()) > 0 && (await text()).includes("Smoke bar"));
  await shot("scan-local-hit");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByRole("button", { name: "Scan a barcode" }).click();
  await page.waitForTimeout(500);
  await typeCode("2000000000015");
  check(`${label}: offline lookup offers to save for later`, (await sheet.innerText()).includes("You're offline"));
  await shot("scan-offline");
  await sheet.getByRole("button", { name: "Save only" }).click();
  await page.waitForTimeout(1200);
  check(`${label}: the pending food is saved on the phone`, (await text()).includes("Unknown product (2000000000015)"));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(2500);

  await page.goto(`${base}/`);
  await page.waitForTimeout(2000);
  check(`${label}: Home shows the nutrition card`, (await page.getByTestId("home-nutrition").count()) > 0);
  await shot("home-nutrition");
  await page.goto(`${base}/settings/`);
  await page.waitForTimeout(1800);
  check(`${label}: Settings has a Nutrition section`, (await page.locator("#nutrition").count()) > 0 && (await text()).includes("day starts at"));
  await page.locator("#nutrition").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById("nutrition")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await shot("settings-nutrition");

  check(`${label}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}

try {
  await run("folded", { width: 412, height: 915 });
  await run("unfolded", { width: 884, height: 1000 });
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
