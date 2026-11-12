#!/usr/bin/env node
/**
 * Visual proof + performance harness for the 3D scene.
 * Drives local Google Chrome (headless, GPU via ANGLE/Metal) against the dev server.
 *
 *   node tools/scene-shots/capture.mjs [baseUrl] [only1,only2]
 *
 * Writes docs/screenshots/scene/<view>.png and docs/screenshots/scene/perf.json.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://127.0.0.1:5199/";
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const OUT = path.resolve("docs/screenshots/scene");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const VIEWS = [
  { name: "01-launch", hour: 16.9 },
  { name: "02-neighbourhood", hour: 16.9, pose: { x: -150, y: -250, dist: 650, pitch: 30, bearing: 205 } },
  { name: "03-street-facade", hour: 16.2, pose: { x: -165, y: -690, dist: 45, pitch: 4, bearing: 0 } },
  { name: "04-hills-trees", hour: 16.9, pose: { x: -846, y: -2461, dist: 1500, pitch: 14, bearing: 200 } },
  { name: "05-river-bridge", hour: 16.9, pose: { x: -120, y: 280, dist: 420, pitch: 20, bearing: 250 } },
  { name: "06-flyover-metro-traffic", hour: 16.9, pose: { x: -2790, y: -1320, dist: 210, pitch: 17, bearing: 70 } },
  { name: "07-night-city", hour: 20.5 },
  { name: "08-golden-hour", hour: 17.6, pose: { x: -1300, y: -700, dist: 1300, pitch: 22, bearing: 40 } },
  { name: "09-about-heights", hour: 16.9, about: true },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false", "--window-size=1280,800"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

const t0 = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__pvStore?.getState().ready || window.__pvStore?.getState().loadError, { timeout: 120000 });
const loadMs = Date.now() - t0;
const err = await page.evaluate(() => window.__pvStore.getState().loadError);
if (err) {
  console.error("load error:", err);
  console.error(logs.join("\n"));
  await browser.close();
  process.exit(1);
}
const gpu = await page.evaluate(() => {
  const gl = window.__pvEngine.renderer.getContext();
  const e = gl.getExtension("WEBGL_debug_renderer_info");
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
await page.evaluate(() => window.__pvStore.getState().setDetail("high"));
await new Promise((r) => setTimeout(r, 2500));

const perf = { gpu, loadMs, views: {} };
for (const v of VIEWS) {
  if (ONLY && !ONLY.has(v.name)) continue;
  await page.evaluate((v) => {
    const st = window.__pvStore.getState();
    st.setAboutOpen(!!v.about);
    st.setTimeOfDay(v.hour);
    if (v.pose) window.__pvEngine.setView(v.pose);
    else window.__pvEngine.setView({ x: -350, y: 150, dist: 1900, pitch: 31, bearing: 22 });
  }, v);
  await new Promise((r) => setTimeout(r, 3500));
  const m = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const E = window.__pvEngine;
        const info = E.renderer.info;
        let f = 0;
        const t = performance.now();
        const step = () => {
          f++;
          if (performance.now() - t < 2000) requestAnimationFrame(step);
          else
            resolve({
              fps: +((f * 1000) / (performance.now() - t)).toFixed(1),
              heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
              calls: info.render.calls,
              triangles: info.render.triangles,
              readout: window.__pvStore.getState().readout,
            });
        };
        requestAnimationFrame(step);
      }),
  );
  perf.views[v.name] = m;
  await page.screenshot({ path: path.join(OUT, `${v.name}.png`) });
  console.log(v.name, JSON.stringify(m));
}
fs.writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(perf, null, 2));
fs.writeFileSync(path.join(OUT, "console.log"), logs.join("\n"));
console.log("gpu", gpu, "load ms", loadMs);
await browser.close();
