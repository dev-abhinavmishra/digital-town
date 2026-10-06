// deckfly.mjs — visual pass on the 16-slide live-camera deck (:29229)
//   present   click #uiBtnDeck, dump deck state + paused-start samples at 0/8/16/23s
//   to <idx>  __deck.next() until i==idx (paused nav), dump caption
//   legshot <name> <ms-since-slide-start> — wait ms then shot + cam probe
//   watch <idx> <leg1ms,leg2ms,...>  step to idx, shot at each leg end
//   esc       Escape, wait, dump + shot
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = new URL('./shots-linux/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');

const browser = await chromium.connectOverCDP('http://127.0.0.1:29229');
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('127.0.0.1:8778/?') || p.url().includes('127.0.0.1:8778/index'));
  if (!page) { console.log('NOAPP'); process.exit(1); }
  page.setDefaultTimeout(30000);

  const cam = () => page.evaluate(() => window.__cam ? [
    +window.__cam.position.x.toFixed(1), +window.__cam.position.y.toFixed(1), +window.__cam.position.z.toFixed(1)] : null);
  const cap = () => page.evaluate(() => {
    const c = document.querySelector('#uiDeck .cap');
    return { i: window.__deck?.i, n: window.__deck?.n,
      cnt: document.querySelector('#uiDeck .cnt')?.textContent?.trim(),
      kick: c?.querySelector('.kick')?.textContent?.trim(),
      h1: c?.querySelector('h1')?.textContent?.trim(),
      nLi: c?.querySelectorAll('.pts li').length || 0,
      nStats: c?.querySelectorAll('.stats .st').length || 0,
      txt: c?.innerText?.replace(/\s+/g, ' ').slice(0, 800) };
  });
  const shot = async n => { await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }); return 'SHOT ' + n; };
  const to = async idx => {
    while ((await page.evaluate('__deck.i')) < idx) { await page.evaluate('__deck.next()'); await sleep(300); }
  };

  if (cmd === 'present') {
    const r = await page.evaluate(() => {
      const b = document.getElementById('uiBtnDeck');
      const q = b.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    });
    await page.mouse.click(r.x, r.y);
    await sleep(2500);
    console.log('OPEN', JSON.stringify(await cap()), 'cam', JSON.stringify(await cam()));
    console.log(await shot('fly-p0-cover'));
    for (const t of [0, 8000, 8000, 7000]) {
      await sleep(t);
      console.log('SAMPLE', JSON.stringify({ i: await page.evaluate('__deck.i'), cam: await cam() }));
    }
  } else if (cmd === 'watch') {
    // watch <idx> <ms1,ms2,...> — go to slide idx, screenshot after each cumulative wait
    const idx = +rest[0];
    const waits = rest[1].split(',').map(Number);
    await to(idx);
    await sleep(1200);
    console.log('SLIDE', JSON.stringify(await cap()));
    let done = 0;
    for (let k = 0; k < waits.length; k++) {
      await sleep(waits[k] - done); done = waits[k];
      console.log('LEG', k, 'cam', JSON.stringify(await cam()));
      console.log(await shot(`fly-s${idx}-leg${k}`));
    }
  } else if (cmd === 'stepall') {
    // step through every slide; log caption; shot every slide cheaply
    for (let i = 1; i <= 15; i++) {
      await page.evaluate('__deck.next()');
      await sleep(1600);
      console.log('S', JSON.stringify(await cap()));
    }
  } else if (cmd === 'cap') {
    const idx = +rest[0];
    await to(idx);
    await sleep(1600);
    console.log('CAP', idx, JSON.stringify(await cap()));
  } else if (cmd === 'esc') {
    await page.keyboard.press('Escape');
    await sleep(3500);
    console.log('EXIT', JSON.stringify(await page.evaluate(() => ({
      on: window.__deck?.on, deckOn: document.getElementById('uiDeck')?.classList.contains('on'),
      renderPaused: window.__paused?.(), calls: window.__renderer?.info?.render?.calls,
      cam: window.__cam ? [window.__cam.position.x, window.__cam.position.y, window.__cam.position.z].map(v => +v.toFixed(1)) : null,
    }))));
    console.log(await shot('fly-exit'));
  } else { console.log('unknown', cmd); }
} finally {
  await browser.close();
}
