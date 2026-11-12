#!/usr/bin/env node
/**
 * Record a LinkedIn-ready walkthrough of PuneVerse.
 * Starts on the loading screen, flies key places, cycles Sunrise → Midday →
 * Golden hour → Night.
 *
 *   node tools/scene-shots/linkedin-reel.mjs [baseUrl]
 *
 * Writes docs/screenshots/scene/puneverse-linkedin.mp4
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const BASE = process.argv[2] || "http://127.0.0.1:5173/";
const OUT_DIR = path.resolve("docs/screenshots/scene");
const FRAMES = path.join(OUT_DIR, "_reel-frames");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 8;
const W = 1920;
const H = 1080;

const TOUR = [
  { wait: 2500, time: 17.6, label: "Pune centre · Golden hour" },
  { place: "Shaniwar Wada", wait: 4500, time: 17.6 },
  { place: "Dagdusheth Ganpati", wait: 4000, time: 12.5 },
  { place: "Swargate", wait: 4500, time: 12.5 },
  { place: "Parvati", wait: 4200, time: 6.75 },
  { place: "Taljai", wait: 4200, time: 6.75 },
  { place: "Mundhwa Bridge", wait: 4500, time: 17.6 },
  { place: "Bund Garden Bridge", wait: 4200, time: 17.6 },
  { place: "Koregaon Park", wait: 4000, time: 20.5 },
  { place: "Deccan", wait: 4000, time: 20.5 },
  { place: "Nehru Stadium", wait: 4200, time: 12.5 },
  { place: "Sinhgad Fort", wait: 4800, time: 17.6 },
  { wait: 4000, time: 17.6, pose: { x: -350, y: 150, dist: 2200, pitch: 28, bearing: 25 } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findFfmpeg() {
  try {
    return require("ffmpeg-static");
  } catch {
    for (const p of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}\n${err.slice(-800)}`))));
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

let frame = 0;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

async function shot() {
  const file = path.join(FRAMES, `f_${String(frame).padStart(5, "0")}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 });
  frame++;
}

/**
 * Emit `ms` worth of frames at FPS. Each grab is real (so fly-to motion
 * shows); if Chrome is slower than FPS we still emit the right count so the
 * LinkedIn clip duration matches the tour script.
 */
async function recordFor(ms) {
  const target = Math.max(1, Math.round((ms / 1000) * FPS));
  const start = frame;
  while (frame - start < target) {
    await shot();
  }
}

console.log("open", BASE);
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });

console.log("recording loading screen…");
const loadProbe = page.waitForFunction(
  () => window.__pvStore?.getState().ready || window.__pvStore?.getState().loadError,
  { timeout: 180000 },
);
// Keep grabbing until ready (or timeout).
const loadTicker = (async () => {
  while (true) {
    const ready = await page.evaluate(() => !!(window.__pvStore?.getState().ready || window.__pvStore?.getState().loadError)).catch(() => true);
    if (ready) break;
    await shot();
    await sleep(Math.round(1000 / FPS));
  }
})();
await loadProbe;
await loadTicker;

const err = await page.evaluate(() => window.__pvStore.getState().loadError);
if (err) {
  console.error("load error:", err);
  console.error(logs.slice(-40).join("\n"));
  await browser.close();
  process.exit(1);
}

await page.evaluate(() => {
  window.__pvStore.getState().setDetail("ultra");
  window.__pvStore.getState().setAboutOpen(false);
});
await recordFor(1500);

const presets = await page.evaluate(() => window.__pvStore.getState().manifest?.presets || []);
console.log("presets", presets.length);

async function flyTo(label) {
  const hit = presets.find((p) => p.label === label);
  if (!hit) {
    console.warn("skip missing place", label);
    return false;
  }
  await page.evaluate((p) => window.__pvStore.getState().requestFlyTo(p), hit);
  return true;
}

for (const step of TOUR) {
  if (step.time != null) {
    await page.evaluate((h) => window.__pvStore.getState().setTimeOfDay(h), step.time);
  }
  if (step.place) {
    console.log("fly", step.place, "time", step.time, "frames so far", frame);
    await flyTo(step.place);
  } else if (step.pose) {
    console.log("pose close", "frames so far", frame);
    await page.evaluate((pose) => window.__pvEngine.setView(pose), step.pose);
  } else {
    console.log("hold", step.label);
  }
  await recordFor(step.wait);
}

await browser.close();
console.log("total frames", frame, `~${(frame / FPS).toFixed(1)}s`);

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error("ffmpeg not found — frames at", FRAMES);
  process.exit(2);
}

const mp4 = path.join(OUT_DIR, "puneverse-linkedin.mp4");
await run(ffmpeg, [
  "-y",
  "-framerate",
  String(FPS),
  "-i",
  path.join(FRAMES, "f_%05d.jpg"),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-profile:v",
  "high",
  "-movflags",
  "+faststart",
  "-crf",
  "19",
  "-vf",
  `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
  mp4,
]);

const st = fs.statSync(mp4);
console.log("wrote", mp4, `${(st.size / 1e6).toFixed(1)} MB`);
fs.writeFileSync(path.join(OUT_DIR, "linkedin-reel.log"), logs.join("\n"));
// Keep a handful of stills for LinkedIn image posts; drop the bulk frame dump.
for (const keep of [0, Math.floor(frame * 0.25), Math.floor(frame * 0.5), Math.floor(frame * 0.75), frame - 1]) {
  const src = path.join(FRAMES, `f_${String(keep).padStart(5, "0")}.jpg`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT_DIR, `linkedin-still-${keep}.jpg`));
}
fs.rmSync(FRAMES, { recursive: true, force: true });
