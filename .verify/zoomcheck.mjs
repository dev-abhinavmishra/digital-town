// zoomcheck.mjs — verify PRESENT mode flies the camera to each slide's buildings.
// Steps all 16 slides, waits for the last camera leg to land, then asserts
// __cam.position ≈ the authored final shot position (layout coords × 0.62).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';

const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const OUT = `${os.homedir()}/repos/Digital-Town/.verify/shots-linux`;
fs.mkdirSync(OUT, { recursive: true });
const WS = 0.62, TOL = 8;   // world units

// expected final-leg camera positions per slide (layout coords)
const EXPECT = [
  [430, 420, 770], [-380, 620, 640], [660, 150, -240], [-90, 75, -95],
  [330, 80, -360], [-360, 105, 60], [90, 45, 15], [630, 75, -330],
  [250, 95, -120], [150, 160, -240], [-330, 110, -300], [-390, 120, 660],
  [-140, 320, 620], [60, 1250, 640], [700, 480, 280], [620, 520, 690],
];
const LEGS = [2, 2, 3, 2, 3, 2, 3, 2, 3, 2, 2, 2, 2, 1, 2, 1];
const DURSUM = [18, 20, 18, 14, 18, 14, 18, 12, 18, 16, 16, 16, 18, 10, 17, 9];   // sum of leg durations per slide
const SHOT_AT = { 4: 'zoom-care', 11: 'zoom-school', 8: 'zoom-shopping', 6: 'zoom-community' };

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8778/', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 900000 });
await page.evaluate('__deck.start()');
await page.waitForFunction('window.__deck && window.__deck.on', null, { timeout: 20000 });
await page.waitForTimeout(800);

let fails = 0;
for (let k = 0; k < 16; k++) {
  // wait for the slide's camera legs to finish: __flyDone polls, bounded
  // wait for this slide's legs to finish: sum(dur) + 400ms settle between legs + margin
  await page.waitForTimeout(DURSUM[k] * 1000 + 400 * (LEGS[k] - 1) + 2500);
  const cam = await page.evaluate('({p: __cam.position.toArray(), d: __flyDone()})');
  const exp = EXPECT[k].map(v => v * WS);
  const dist = Math.hypot(cam.p[0] - exp[0], cam.p[1] - exp[1], cam.p[2] - exp[2]);
  const ok = dist <= TOL;
  if (!ok) fails++;
  const cap = await page.evaluate(() => ({
    i: __deck.i, h1: document.querySelector('#uiDeck .cap h1')?.textContent?.trim(),
  }));
  console.log(`slide ${k} ${ok ? 'OK ' : 'FAIL'} i=${cap.i} "${cap.h1}" cam=[${cam.p.map(v => v.toFixed(0))}] want=[${exp.map(v => v.toFixed(0))}] d=${dist.toFixed(1)}`);
  if (SHOT_AT[k]) await page.screenshot({ path: `${OUT}/${SHOT_AT[k]}.png` });
  if (k < 15) await page.evaluate('__deck.next()');
}
await page.evaluate('__deck.exit()');
await page.waitForTimeout(1200);
const st = await page.evaluate('({on: __deck.on, cam: __cam.position.toArray()})');
console.log('EXIT', JSON.stringify(st), 'fails:', fails, 'pageerrors:', errs.length);
await browser.close();
process.exit(fails ? 1 : 0);
