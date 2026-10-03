// Reshoot the static deck's hero images at 1920x1080, high tier, deterministic
// stepping — replaces the stale pre-shrink 720p shots the PDF embeds.
// Poses mirror the in-app SLIDES cameras (layout coords scaled by __ws).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const POSES = [
  ['01-cover',    [620, 520, 690, -60, 0, -70]],
  ['02-plan',     [60, 780, 560, -20, 0, -60]],
  ['03-campus',   [230, 110, -40, 40, 16, -250]],
  ['04-wellness', [300, 110, -620, 20, 26, -440]],
  ['05-preserve', [-270, 150, 430, -500, 8, 190]],
  ['06-park',     [330, 130, 330, 575, 6, 130]],
  ['07-senior',   [640, 100, -330, 520, 12, -550]],
  ['08-close',    [620, 540, 720, -60, 0, -60]],
];

const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const poses = ONLY.length ? POSES.filter(([n]) => ONLY.includes(n)) : POSES;
if (!poses.length) { console.error('no matching poses'); process.exit(1); }

const browser = await chromium.connectOverCDP('http://localhost:9223');
const page = await browser.contexts()[0].newPage();
await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto('http://127.0.0.1:8778/?view=aerial&time=golden&q=high&still=1&noao=1', { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 600; i++) {
  if (await page.evaluate('window.__ready === true').catch(() => false)) break;
  await sleep(1000);
}
if (!(await page.evaluate('window.__ready === true'))) throw new Error('never ready');
console.log('[shots] ready');
await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  Array.from(document.body.children).forEach(el => {
    if (el !== c && !el.contains(c)) el.style.display = 'none';
  });
  document.body.style.cssText += ';margin:0;background:#000;overflow:hidden';
  c.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;z-index:1';
})()`);
await page.evaluate('window.__setRatio(1); window.__setPaused(true); window.__lockShadow = true;');
await page.evaluate('window.__setCam(0, 900, 1, 0, 0, 0); window.__step(20, 1/60)');

const cdp = await page.context().newCDPSession(page);
let latest = null, scCount = 0;
cdp.on('Page.screencastFrame', ev => {
  latest = Buffer.from(ev.data, 'base64'); scCount++;
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

for (const [name, cam] of poses) {
  const c0 = scCount;
  for (let i = 0; i < 4; i++) {
    await page.evaluate(`window.__setCam(...(${JSON.stringify(cam)}).map(v=>v*window.__ws)); window.__step(1, 1/24)`);
    await sleep(350);
  }
  for (let k = 0; k < 240 && scCount < c0 + 3; k++) await sleep(250);
  fs.writeFileSync(`town/deck/shots/${name}.jpg`, latest);
  console.log('[shots]', name, 'captured');
}
await cdp.send('Page.stopScreencast').catch(() => {});
await page.close();
console.log('[shots] done');
process.exit(0);
