// 1) export the static deck to PDF (print CSS = one page per slide)
// 2) live-verify the expanded 13-slide in-app deck
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.connectOverCDP('http://localhost:9223');
const ctx = b.contexts()[0];

// — PDF —
const dp = await ctx.newPage();
await dp.goto('http://127.0.0.1:8778/deck/index.html', { waitUntil: 'load', timeout: 60000 });
await dp.waitForFunction(() => [...document.images].every(i => i.complete) || true, { timeout: 30000 }).catch(() => {});
await sleep(3000);   // bg images are CSS — give them a moment
const n = await dp.evaluate('document.querySelectorAll(".slide").length');
console.log('[pdf] static slides:', n);
const cdp = await ctx.newCDPSession(dp);
const pdf = await cdp.send('Page.printToPDF', {
  landscape: true, printBackground: true, preferCSSPageSize: true,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
fs.writeFileSync('Havenbrook-Presentation.pdf', Buffer.from(pdf.data, 'base64'));
console.log('[pdf] wrote Havenbrook-Presentation.pdf', (fs.statSync('Havenbrook-Presentation.pdf') / 1e6).toFixed(1) + 'MB');
await dp.close();

// — in-app deck —
const pg = await ctx.newPage();
await pg.setViewportSize({ width: 1280, height: 720 });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_RESET')) errs.push(m.text()); });
await pg.goto('http://127.0.0.1:8778/?view=aerial&q=med&still=1', { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 600; i++) { if (await pg.evaluate('window.__ready === true').catch(() => false)) break; await sleep(1000); }
console.log('[deck] ready:', await pg.evaluate('window.__ready'));
await pg.evaluate('window.__deck.start()');
await sleep(5000);
console.log('[deck] open:', await pg.evaluate('JSON.stringify({n:__deck.n,i:__deck.i,paused:__paused(),playing:!document.querySelector("#uiDeck .bgvid").paused})'));
await pg.screenshot({ path: '.verify/deck13-title.png' });
// step to the demographics slide (i=2)
for (const k of [1, 2]) { await pg.evaluate('window.__deck.next()'); await sleep(1500); }
console.log('[deck] demographics:', await pg.evaluate('JSON.stringify({i:__deck.i,h1:document.querySelector("#uiDeck .cap h1")?.textContent,calls:__renderer.info.render.calls})'));
await pg.screenshot({ path: '.verify/deck13-demo.png' });
// jump near the end: layout(8), tradeoffs(9), ledger(10), close(11), refs(12)
await pg.evaluate('for(let k=0;k<6;k++) window.__deck.next()');
await sleep(1500);
console.log('[deck] tradeoffs:', await pg.evaluate('JSON.stringify({i:__deck.i,h1:document.querySelector("#uiDeck .cap h1")?.textContent})'));
await pg.screenshot({ path: '.verify/deck13-trade.png' });
await pg.evaluate('for(let k=0;k<3;k++) window.__deck.next()');
await sleep(1500);
console.log('[deck] references:', await pg.evaluate('JSON.stringify({i:__deck.i,h1:document.querySelector("#uiDeck .cap h1")?.textContent})'));
await pg.screenshot({ path: '.verify/deck13-refs.png' });
// past-last exits
await pg.evaluate('window.__deck.next()');
await sleep(2500);
console.log('[deck] after-last:', await pg.evaluate('JSON.stringify({on:__deck.on,calls:__renderer.info.render.calls})'));
console.log('[deck] errors:', errs.length ? errs.slice(0, 5) : 'none');
await pg.close(); process.exit(0);
