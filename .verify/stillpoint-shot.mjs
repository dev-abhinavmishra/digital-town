// one-shot: verify the Stillpoint Hospice fascia sign renders (was hidden at s.h+1.2)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.connectOverCDP('http://localhost:9223');
for (const p of b.contexts()[0].pages()) await p.close().catch(() => {});
const pg = await b.contexts()[0].newPage();
await pg.setViewportSize({ width: 1280, height: 720 });
await pg.goto('http://127.0.0.1:8778/?view=aerial&time=golden&q=high&still=1&noao=1', { waitUntil: 'commit' });
for (let i = 0; i < 600; i++) { if (await pg.evaluate('window.__ready === true').catch(() => false)) break; await sleep(1000); }
await pg.evaluate('window.__setPaused(true)');
await pg.evaluate('window.__lockShadow = true');
const cdp = await pg.context().newCDPSession(pg);
let latest = null, sc = 0;
cdp.on('Page.screencastFrame', ev => { latest = Buffer.from(ev.data, 'base64'); sc++; cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
// hospice (712,-418) scaled .62 → (441,-259); approach from the south (front)
const c = sc;
for (let i = 0; i < 40 && sc < c + 6; i++) {
  await pg.evaluate('window.__setCam(441, 22, -150, 441, 4, -248); window.__step(1, 1/24)');
  await sleep(400);
}
fs.writeFileSync('.verify/stillpoint-sign.jpg', latest);
console.log('wrote .verify/stillpoint-sign.jpg');
process.exit(0);
