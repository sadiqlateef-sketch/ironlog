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
  for (const route of ["/", "/workout/", "/progress/", "/more/", "/plans/", "/exercises/", "/settings/", "/search/", "/log/", "/import/"]) {
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
