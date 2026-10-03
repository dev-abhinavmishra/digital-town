// Deck video-background verification:
//  A) happy path — mp4 plays, scene render pauses (__renderer.calls → 0)
//  B) fallback — abort the mp4 request → deck falls back to live __flyTo
import { chromium } from 'playwright-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://localhost:9223');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

console.log('[deckvid] goto …');
await page.goto('http://127.0.0.1:8778/?view=aerial&q=med&still=1', { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 480; i++) {
  if (await page.evaluate('window.__ready === true').catch(() => false)) break;
  await sleep(1000);
}
console.log('[deckvid] ready:', await page.evaluate('window.__ready'));

// sanity: scene is drawing before the deck
await page.evaluate('window.__fc0 = null; (function(){const c=document.querySelector("canvas"); return c; })()');
const callsBefore = await page.evaluate('window.__renderer.info.render.calls');
console.log('[deckvid] calls before deck:', callsBefore);

// — A) happy path —
await page.evaluate('window.__deck.start()');
await sleep(4000);
const a = await page.evaluate(`(() => {
  const v = document.querySelector('#uiDeck .bgvid');
  return { on: !!document.querySelector('#uiDeck.on'), src: v && v.currentSrc.split('/').pop(),
    playing: v && !v.paused && v.currentTime > 0, rs: v && v.readyState,
    i: window.__deck.i, calls: window.__renderer.info.render.calls }; })()`);
console.log('[deckvid] A:', JSON.stringify(a));

await page.evaluate('window.__deck.next()');
await sleep(2500);
const a2 = await page.evaluate(`(() => ({ i: window.__deck.i,
  calls: window.__renderer.info.render.calls,
  playing: !document.querySelector('#uiDeck .bgvid').paused,
  t: document.querySelector('#uiDeck .bgvid').currentTime }))()`);
console.log('[deckvid] A-next:', JSON.stringify(a2));

await page.evaluate('window.__deck.exit()');
await sleep(3500);
const a3 = await page.evaluate(`(() => ({ on: window.__deck.on,
  paused: document.querySelector('#uiDeck .bgvid').paused,
  calls: window.__renderer.info.render.calls }))()`);
console.log('[deckvid] A-exit:', JSON.stringify(a3));

// — B) fallback: block the video, live flights must take over —
await page.route('**/deck/town-orbit.mp4', r => r.abort());
await page.evaluate('window.__deck.start()');
await sleep(3000);
const b1 = await page.evaluate(`(() => {
  const v = document.querySelector('#uiDeck .bgvid');
  return { on: window.__deck.on, vidPaused: v.paused, i: window.__deck.i,
    calls: window.__renderer.info.render.calls }; })()`);
console.log('[deckvid] B (mp4 blocked):', JSON.stringify(b1));
await page.evaluate('window.__deck.next()');
await sleep(2000);
const b2 = await page.evaluate(`(() => ({ i: window.__deck.i,
  calls: window.__renderer.info.render.calls }))()`);
console.log('[deckvid] B-next:', JSON.stringify(b2));
await page.evaluate('window.__deck.exit()');
await page.unroute('**/deck/town-orbit.mp4');

console.log('[deckvid] errors:', errs.length ? errs.slice(0, 6) : 'none');
await page.close();
await browser.close().catch(() => {});
