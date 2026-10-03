// Orbit-frame patch — re-captures ONLY flagged torn frames.
// Replays the same deterministic trajectory as orbit-capture2.mjs but steps
// non-flagged frames with draw=false (sim advances, no render), so each
// flagged frame is re-rendered at its exact sim time. Captured frames wait
// for TWO screencast frames so the compositor has settled past the present
// that produced the tear.
// Usage: node .verify/orbit-patch.mjs 21,26,113,... [tier] [time]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const PATCH = new Set(process.argv[2].split(',').map(Number));
const TIER = process.argv[3] || 'high';
const TIME = process.argv[4] || 'golden';
const FRAMES = 480;
const OUT = '.verify/orbit-frames2';
const URL = `http://127.0.0.1:8778/?view=aerial&time=${TIME}&q=${TIER}&still=1&noao=1`;

const CX = -18.6, CY = 0, CZ = -24.8, RH = 560, H = 385;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.connectOverCDP('http://localhost:9223');
for (const p of browser.contexts()[0].pages()) await p.close().catch(() => {});
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1920, height: 1080 });
console.log('[patch] goto', URL, 'frames', [...PATCH].join(','));
await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 600; i++) {
  if (await page.evaluate('window.__ready === true').catch(() => false)) break;
  if (i % 30 === 29) console.log(`[patch] still loading… ${i + 1}s`);
  await sleep(1000);
}
if (!(await page.evaluate('window.__ready === true'))) throw new Error('never ready');

await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  Array.from(document.body.children).forEach(el => {
    if (el !== c && !el.contains(c)) el.style.display = 'none';
  });
  document.body.style.cssText += ';margin:0;background:#000;overflow:hidden';
  c.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;z-index:1';
})()`);
await page.evaluate('window.__setRatio(1)');
await page.evaluate('window.__setPaused(true)');
await page.evaluate('window.__lockShadow = true');
await page.evaluate('window.__setCam(0, 900, 1, 0, 0, 0)');
await page.evaluate('window.__step(20, 1/60)');
console.log('[patch] shadow baked, sim stepped');

const cdp = await page.context().newCDPSession(page);
let latest = null, scCount = 0;
cdp.on('Page.screencastFrame', ev => {
  latest = Buffer.from(ev.data, 'base64'); scCount++;
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

const t0 = Date.now();
let done = 0;
for (let f = 0; f < FRAMES; f++) {
  const a = (f / FRAMES) * Math.PI * 2;
  const px = CX + RH * Math.cos(a), pz = CZ + RH * Math.sin(a);
  const draw = PATCH.has(f);
  const c0 = scCount;
  await page.evaluate(
    `window.__setCam(${px}, ${H}, ${pz}, ${CX}, ${CY}, ${CZ}); window.__step(1, 1/24, ${draw})`);
  if (!draw) continue;
  // two screencast frames: the first can still be a mid-present composite
  for (let k = 0; k < 240 && scCount < c0 + 2; k++) await sleep(250);
  if (!latest) { console.log(`[patch] f${f} NO FRAME`); continue; }
  fs.writeFileSync(`${OUT}/f${String(f).padStart(3, '0')}.jpg`, latest);
  console.log(`[patch] f${f} recaptured (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  done++;
}
await cdp.send('Page.stopScreencast').catch(() => {});
console.log(`[patch] ${done}/${PATCH.size} frames recaptured in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close().catch(() => {});
