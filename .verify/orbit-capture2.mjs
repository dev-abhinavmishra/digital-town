// Orbit-frame capture v2 — deterministic stepping edition.
// Fixes vs v1: (a) __step advances the sim exactly 1/24s per captured frame so
// cloud-shadow decals, cars and waves can't jump between frames (the dark
// flashes); (b) __lockShadow bakes one whole-town shadow instead of letting
// the tracking box smear under the orbit; (c) 1920x1080 at ratio 1 (native
// 1080p); (d) 480 frames over a full 360° = 20s loop, half the v1 speed.
// Usage: node .verify/orbit-capture2.mjs [frames] [tier] [time]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FRAMES = +(process.argv[2] || 480);
const TIER = process.argv[3] || 'high';
const TIME = process.argv[4] || 'golden';
const OUT = '.verify/orbit-frames2';
const MP4 = 'town/deck/town-orbit.mp4';
const URL = `http://127.0.0.1:8778/?view=aerial&time=${TIME}&q=${TIER}&still=1&noao=1`;

const CX = -18.6, CY = 0, CZ = -24.8, RH = 560, H = 385;

const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9223');
for (const p of browser.contexts()[0].pages()) await p.close().catch(() => {});
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1920, height: 1080 });
console.log('[cap2] goto', URL);
await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 600; i++) {
  if (await page.evaluate('window.__ready === true').catch(() => false)) break;
  if (i % 30 === 29) console.log(`[cap2] still loading… ${i + 1}s`);
  await sleep(1000);
}
if (!(await page.evaluate('window.__ready === true'))) throw new Error('never ready');
console.log('[cap2] ready — fx:', await page.evaluate('JSON.stringify({tier:__fx.tier,tris:__fx.tris,calls:__fx.calls})'));

await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  Array.from(document.body.children).forEach(el => {
    if (el !== c && !el.contains(c)) el.style.display = 'none';
  });
  document.body.style.cssText += ';margin:0;background:#000;overflow:hidden';
  c.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;z-index:1';
})()`);
await page.evaluate('window.__setRatio(1)');

// deterministic mode: park the RAF loop, bake the whole-town shadow once,
// then every captured frame is exactly one manual step (dt = 1/24)
await page.evaluate('window.__setPaused(true)');
await page.evaluate('window.__lockShadow = true');
await page.evaluate('window.__setCam(0, 900, 1, 0, 0, 0)');  // overhead → full-town shadow box
await page.evaluate('window.__step(20, 1/60)');             // bake shadow + settle sim
console.log('[cap2] shadow baked, sim stepped');

const clip = await page.evaluate(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return {x:0,y:0,width:Math.round(r.width),height:Math.round(r.height)}; })()`);
console.log('[cap2] clip', JSON.stringify(clip));

const cdp = await page.context().newCDPSession(page);
let latest = null, scCount = 0;
cdp.on('Page.screencastFrame', ev => {
  latest = Buffer.from(ev.data, 'base64'); scCount++;
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

// resume: skip frames already on disk so a rerun continues where it stopped
const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  const fp = `${OUT}/f${String(f).padStart(3, '0')}.jpg`;
  if (fs.existsSync(fp)) continue;
  const a = (f / FRAMES) * Math.PI * 2;
  const px = CX + RH * Math.cos(a), pz = CZ + RH * Math.sin(a);
  const c0 = scCount;
  await page.evaluate(`window.__setCam(${px}, ${H}, ${pz}, ${CX}, ${CY}, ${CZ}); window.__step(1, 1/24)`);
  for (let k = 0; k < 240 && scCount <= c0; k++) await sleep(250);   // wait for the stepped present
  if (!latest) { f--; await sleep(500); continue; }
  fs.writeFileSync(fp, latest);
  if (f === 0 || (f + 1) % 48 === 0)
    console.log(`[cap2] f${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await cdp.send('Page.stopScreencast').catch(() => {});
const got = fs.readdirSync(OUT).filter(x => /^f\d+\.jpg$/.test(x)).length;
console.log(`[cap2] ${got}/${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (got < FRAMES) { console.log('[cap2] INCOMPLETE — rerun to resume'); process.exit(2); }
await browser.close().catch(() => {});

fs.mkdirSync(path.dirname(MP4), { recursive: true });
execFileSync('ffmpeg', ['-y', '-framerate', '24', '-i', `${OUT}/f%03d.jpg`,
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
  '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MP4],
  { stdio: 'inherit' });
console.log('[cap2] wrote', MP4, (fs.statSync(MP4).size / 1e6).toFixed(1) + 'MB');
