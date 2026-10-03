// Orbit-frame capture for the PRESENT-mode video background.
// Boots the town headless at a chosen tier/time, flies __setCam around a
// 360° orbit one angle-step per captured frame, writes PNGs, then ffmpeg
// assembles them into town/deck/town-orbit.mp4 (seamless loop).
// Usage: node .verify/orbit-capture.mjs [frames] [tier] [time]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FRAMES = +(process.argv[2] || 360);
const TIER = process.argv[3] || 'high';
const TIME = process.argv[4] || 'golden';
const OUT = '.verify/orbit-frames';
const MP4 = 'town/deck/town-orbit.mp4';
// noao: GTAO is a fullscreen CPU pass under SwiftShader — ~half the frame
// cost — and invisible at aerial distance (buildings carry baked skirts)
const URL = `http://127.0.0.1:8778/?view=aerial&time=${TIME}&q=${TIER}&still=1&noao=1`;

// world-space orbit: centre on the town's mass, radius/height from the
// authored aerial preset so framing matches what the live app ships with
const CX = -18.6, CY = 0, CZ = -24.8, RH = 560, H = 385;

const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://localhost:9223');
for (const p of browser.contexts()[0].pages()) await p.close().catch(() => {}); // free the renderer
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 720 });
console.log('[cap] goto', URL);
await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
// __ready can take several minutes under SwiftShader — poll patiently
for (let i = 0; i < 600; i++) {
  const r = await page.evaluate('window.__ready === true').catch(() => false);
  if (r) break;
  if (i % 30 === 29) console.log(`[cap] still loading… ${i + 1}s`);
  await sleep(1000);
}
if (!(await page.evaluate('window.__ready === true'))) throw new Error('never ready');
console.log('[cap] ready — fx:', await page.evaluate('JSON.stringify({tier:__fx.tier,tris:__fx.tris,calls:__fx.calls})'));

// hide every overlay but keep the canvas' ancestor chain, then pin it full-viewport
await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  Array.from(document.body.children).forEach(el => {
    if (el !== c && !el.contains(c)) el.style.display = 'none';
  });
  document.body.style.cssText += ';margin:0;background:#000;overflow:hidden';
  c.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;z-index:1';
})()`);

// lock the adaptive governor, then render at 1x — output IS 1280x720;
// higher ratios only burn SwiftShader time, MSAA still handles edges
await page.evaluate('window.__setRatio(1)');
// shadow maps re-render every frame for a static sun — bake once, skip the
// second full-scene raster for the remaining frames
await page.evaluate('window.__renderer.shadowMap.autoUpdate = true');

// per-frame render counter: the app ticks via requestAnimationFrame
await page.evaluate(`window.__fc = 0; (function fc(){ window.__fc++; requestAnimationFrame(fc); })()`);
const clip = await page.evaluate(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return {x:0,y:0,width:Math.round(r.width),height:Math.round(r.height)}; })()`);
console.log('[cap] clip', JSON.stringify(clip));

// screencast: the compositor pushes every presented frame without stalling
// the page (page.screenshot costs ~22s of readback under SwiftShader)
const cdp = await page.context().newCDPSession(page);
let latest = null, scCount = 0;
cdp.on('Page.screencastFrame', ev => {
  latest = Buffer.from(ev.data, 'base64'); scCount++;
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

// 2nd presented frame after setCam is guaranteed to show the new angle —
// a frame pushed right after the eval can still be the pre-move present
const frameWait = async () => {
  const c0 = scCount;
  for (let k = 0; k < 240; k++) {
    await sleep(250);
    if (scCount >= c0 + 2) return;
  }
};

const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  const a = (f / FRAMES) * Math.PI * 2;
  const px = CX + RH * Math.cos(a), pz = CZ + RH * Math.sin(a);
  await page.evaluate(`window.__setCam(${px}, ${H}, ${pz}, ${CX}, ${CY}, ${CZ})`);
  await frameWait();
  if (!latest) { f--; await sleep(500); continue; }
  fs.writeFileSync(`${OUT}/f${String(f).padStart(3, '0')}.jpg`, latest);
  if (f === 0) await page.evaluate('window.__renderer.shadowMap.autoUpdate = false');
  if (f === 0 || (f + 1) % 60 === 0)
    console.log(`[cap] f${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await cdp.send('Page.stopScreencast').catch(() => {});
console.log('[cap] frames done in', ((Date.now() - t0) / 1000).toFixed(0), 's — encoding');
await browser.close().catch(() => {});

fs.mkdirSync(path.dirname(MP4), { recursive: true });
execFileSync('ffmpeg', ['-y', '-framerate', '24', '-i', `${OUT}/f%03d.jpg`,
  '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720',
  '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MP4],
  { stdio: 'inherit' });
console.log('[cap] wrote', MP4, (fs.statSync(MP4).size / 1e6).toFixed(1) + 'MB');
