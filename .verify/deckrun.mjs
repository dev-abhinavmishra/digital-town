// deckrun.mjs — phased driver for the 13-slide PRESENT deck on devin-remote Chrome :29229
//   present   click #uiBtnDeck, dump deck state + cover caption + h1 font-style
//   sample    sample __deck.i at ~0/7/15s to prove paused start
//   space1    press Space, wait ~14.5s, dump i + caption  (autoplay resumes)
//   space2    press Space, wait ~14.5s, dump i twice      (paused again)
//   walk      step i=2..12 via __deck.next(), dump caption per slide + shots
//   esc       press Escape, wait 3s, dump on/HUD/paused/calls + shot
//   vidstate  report .bgvid paused/currentTime + __paused()
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = new URL('./shots-linux/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [cmd] = process.argv.slice(2);

const browser = await chromium.connectOverCDP('http://127.0.0.1:29229');
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('127.0.0.1:8778/?') || p.url().includes('127.0.0.1:8778/index'));
  if (!page) { console.log('NOAPP page'); process.exit(1); }
  page.setDefaultTimeout(30000);

  const cap = () => page.evaluate(() => {
    const c = document.querySelector('#uiDeck .cap');
    const h1 = c?.querySelector('h1');
    return {
      i: window.__deck?.i, n: window.__deck?.n, on: window.__deck?.on,
      cnt: document.querySelector('#uiDeck .cnt')?.textContent?.trim(),
      kick: c?.querySelector('.kick')?.textContent?.trim(),
      h1: h1?.textContent?.trim(),
      h1Style: h1 ? getComputedStyle(h1).fontStyle : null,
      hasEm: !!c?.querySelector('h1 em'),
      txt: c?.innerText?.replace(/\s+/g, ' ').slice(0, 900),
    };
  });
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }).then(() => 'SHOT ' + n);

  if (cmd === 'present') {
    const r = await page.evaluate(() => {
      const b = document.getElementById('uiBtnDeck');
      if (!b) return null;
      const q = b.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2, label: b.textContent.trim() };
    });
    console.log('BTN', JSON.stringify(r));
    await page.mouse.click(r.x, r.y);
    await sleep(3500);
    console.log('COVER', JSON.stringify(await cap()));
    console.log(await shot('deck-p0-cover'));
    console.log('VID', JSON.stringify(await page.evaluate(() => {
      const v = document.querySelector('#uiDeck .bgvid');
      return v ? { paused: v.paused, t: +v.currentTime.toFixed(1), renderPaused: window.__paused?.() } : { novid: true, renderPaused: window.__paused?.() };
    })));
  } else if (cmd === 'sample') {
    const s0 = await page.evaluate('__deck.i');
    await sleep(7000);
    const s7 = await page.evaluate('__deck.i');
    await sleep(8000);
    const s15 = await page.evaluate('__deck.i');
    console.log('PAUSEDCHECK', JSON.stringify({ s0, s7, s15 }));
  } else if (cmd === 'space1') {
    await page.keyboard.press('Space');
    await sleep(14500);
    console.log('AFTERSPACE1', JSON.stringify(await cap()));
    console.log(await shot('deck-p1-overview'));
  } else if (cmd === 'space2') {
    await page.keyboard.press('Space');
    await sleep(14500);
    const i = await page.evaluate('__deck.i');
    console.log('AFTERSPACE2', JSON.stringify({ i }));
  } else if (cmd === 'walk') {
    const shots = { 4: 'deck-p4-care', 5: 'deck-p5-preserve', 6: 'deck-p6-community', 10: 'deck-p10-budget', 11: 'deck-p11-conclusion', 12: 'deck-p12-refs' };
    for (let i = 2; i <= 12; i++) {
      await page.evaluate('__deck.next()');
      await sleep(3000);
      const c = await cap();
      console.log('SLIDE', i, JSON.stringify(c));
      if (shots[i]) console.log(await shot(shots[i]));
    }
  } else if (cmd === 'esc') {
    await page.keyboard.press('Escape');
    await sleep(3000);
    console.log('EXIT', JSON.stringify(await page.evaluate(() => ({
      on: window.__deck?.on, i: window.__deck?.i,
      deckOn: document.getElementById('uiDeck')?.classList.contains('on'),
      hudVisible: getComputedStyle(document.getElementById('uiTopRight')).display !== 'none' && document.getElementById('uiTopRight').offsetParent !== null,
      renderPaused: window.__paused?.(),
      calls: window.__renderer?.info?.render?.calls,
      cam: window.__cam ? [window.__cam.position.x, window.__cam.position.y, window.__cam.position.z].map(v => +v.toFixed(1)) : null,
    }))));
    console.log(await shot('deck-exit'));
  } else if (cmd === 'vidstate') {
    console.log('VID', JSON.stringify(await page.evaluate(() => {
      const v = document.querySelector('#uiDeck .bgvid');
      return v ? { paused: v.paused, t: +v.currentTime.toFixed(1), dur: +v.duration.toFixed(1), renderPaused: window.__paused?.() } : { novid: true };
    })));
  } else if (cmd === 'static') {
    const pg = ctx.pages().find(p => p.url().includes('8778/deck/index.html')) || await ctx.newPage();
    await pg.setViewportSize({ width: 1400, height: 900 });
    if (!pg.url().includes('deck/index.html')) await pg.goto('http://127.0.0.1:8778/deck/index.html', { waitUntil: 'load', timeout: 30000 });
    await sleep(3000);
    console.log('STATIC0', JSON.stringify(await pg.evaluate(() => ({
      n: document.querySelectorAll('.slide').length,
      cnt: document.getElementById('cnt')?.textContent,
      kick: document.querySelector('.slide.cur .kick')?.textContent?.trim(),
      h1: document.querySelector('.slide.cur h1')?.textContent?.trim(),
      h1Style: getComputedStyle(document.querySelector('.slide.cur h1')).fontStyle,
    }))));
    console.log(await pg.screenshot({ path: `${OUT}/static-0-cover.png` }).then(() => 'SHOT static-0-cover'));
    for (let k = 0; k < 4; k++) { await pg.keyboard.press('ArrowRight'); await sleep(1100); }
    console.log('STATIC4', JSON.stringify(await pg.evaluate(() => ({
      cnt: document.getElementById('cnt')?.textContent,
      txt: document.querySelector('.slide.cur .cap')?.innerText?.replace(/\s+/g, ' ').slice(0, 700),
    }))));
    console.log(await pg.screenshot({ path: `${OUT}/static-4-care.png` }).then(() => 'SHOT static-4-care'));
    for (let k = 0; k < 6; k++) { await pg.keyboard.press('ArrowRight'); await sleep(1100); }
    console.log('STATIC10', JSON.stringify(await pg.evaluate(() => ({
      cnt: document.getElementById('cnt')?.textContent,
      txt: document.querySelector('.slide.cur')?.innerText?.replace(/\s+/g, ' ').slice(0, 900),
    }))));
    console.log(await pg.screenshot({ path: `${OUT}/static-10-budget.png` }).then(() => 'SHOT static-10-budget'));
  } else if (cmd === 'pausecheck2') {
    const a = await page.evaluate('__deck.i');
    await sleep(14000);
    const b = await page.evaluate('__deck.i');
    console.log('PAUSE2', JSON.stringify({ a, b }));
  } else if (cmd === 'walk2') {
    const shots = { 2: 'deck-p2-demo', 3: 'deck-p3-medschool', 4: 'deck-p4-care', 5: 'deck-p5-preserve', 6: 'deck-p6-community', 7: 'deck-p7-senior', 10: 'deck-p10-budget', 11: 'deck-p11-conclusion', 12: 'deck-p12-refs' };
    const cur = await page.evaluate('__deck.i');
    for (let k = 0; k < cur - 2; k++) { await page.evaluate('__deck.prev()'); await sleep(800); }
    for (let i = 2; i <= 10; i++) {           // walk up to budget; hold test runs next
      await sleep(2400);
      const c = await cap();
      console.log('SLIDE', i, JSON.stringify(c));
      if (shots[i]) console.log(await shot(shots[i]));
      if (i < 10) await page.evaluate('__deck.next()');
    }
  } else if (cmd === 'budgethold') {
    // parked on i=10 (24s hold). Space -> unpause; expect still 10 at +13s, 11 by +27s.
    await page.keyboard.press('Space');
    await sleep(13000);
    const mid = await page.evaluate('__deck.i');
    await sleep(14000);
    const end = await page.evaluate('__deck.i');
    console.log('BUDGETHOLD', JSON.stringify({ mid, end }));
    await page.keyboard.press('Space');   // re-pause wherever we landed
    await sleep(500);
    console.log('REPAUSED', JSON.stringify({ i: await page.evaluate('__deck.i') }));
  } else if (cmd === 'finish') {
    const c = await cap();
    console.log('CUR', JSON.stringify(c));
    if (c.i === 11) { await page.evaluate('__deck.next()'); await sleep(2600); console.log('LAST', JSON.stringify(await cap())); console.log(await shot('deck-p12-refs')); }
  } else {
    console.log('unknown', cmd);
  }
} finally {
  await browser.close();
}
