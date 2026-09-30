// step.mjs — one-shot CDP command against the persistent Chrome on :9223.
// Usage: node step.mjs <cmd...>
//   goto <url>            navigate, wait __ready<=420s, +2.5s settle; prints READY <bool> <sec>s
//   eval <js>             evaluate expression; prints JSON
//   shot <name>           screenshot -> .verify/shots2/<name>.png
//   click <sel>           page.click
//   mousedown x y         real mouse press+release at viewport coords (tour-end test)
//   key <key>             keyboard.press
//   wait <ms>
//   probe                 __ready/calls/tris/fps/cam
//   fly <px,py,pz,tx,ty,tz,dur>   __flyTo + wait __flyDone, prints cam pos
//   setcam <px,py,pz,tx,ty,tz>    __setCam + 600ms
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = 'C:/Users/Administrator/repos/Digital-Town/.verify/shots2';
fs.mkdirSync(OUT, { recursive: true });
const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');

const browser = await chromium.connectOverCDP('http://localhost:9223');
try {
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('127.0.0.1:8778')) || ctx.pages()[0];
  if (!page) page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  if (cmd === 'goto') {
    const t0 = Date.now();
    await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let ready = false;
    try { await page.waitForFunction('window.__ready === true', null, { timeout: 420000 }); ready = true; }
    catch { ready = await page.evaluate('window.__ready === true').catch(() => false); }
    await page.waitForTimeout(2500);
    console.log('READY', ready, Math.round((Date.now() - t0) / 1000) + 's', 'loadErrors=' + errors.length, JSON.stringify(errors.slice(0, 8)));
  } else if (cmd === 'eval') {
    console.log('EVAL', JSON.stringify(await page.evaluate(arg)));
  } else if (cmd === 'shot') {
    await page.screenshot({ path: `${OUT}/${arg}.png`, timeout: 120000 });
    console.log('SHOT', arg);
  } else if (cmd === 'click') {
    await page.click(arg);
    console.log('CLICKED', arg);
  } else if (cmd === 'mousedown') {
    const [x, y] = arg.split(',').map(Number);
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    console.log('MOUSEDOWN', x, y);
  } else if (cmd === 'clickxy') {
    const [x, y] = arg.split(',').map(Number);
    await page.mouse.click(x, y);
    console.log('CLICKXY', x, y);
  } else if (cmd === 'drag') {
    const [x1, y1, x2, y2, steps] = arg.split(',').map(Number);
    await page.mouse.move(x1, y1); await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: steps || 12 }); await page.waitForTimeout(120);
    await page.mouse.up();
    console.log('DRAGGED', x1, y1, '->', x2, y2);
  } else if (cmd === 'keyhold') {
    const [k, ms] = arg.split(',');
    await page.keyboard.down(k); await page.waitForTimeout(+ms); await page.keyboard.up(k);
    console.log('KEYHOLD', k, ms);
  } else if (cmd === 'key') {
    await page.keyboard.press(arg);
    console.log('KEY', arg);
  } else if (cmd === 'wait') {
    await page.waitForTimeout(+arg);
  } else if (cmd === 'probe') {
    console.log('PROBE', JSON.stringify(await page.evaluate(() => ({
      ready: window.__ready === true,
      calls: window.__renderer?.info?.render?.calls,
      tris: window.__renderer?.info?.render?.triangles,
      fps: window.__fx?.fps,
      cam: window.__cam ? [window.__cam.position.x, window.__cam.position.y, window.__cam.position.z].map(v => +v.toFixed(1)) : null,
      inner: [innerWidth, innerHeight],
    }))));
  } else if (cmd === 'fly') {
    const a = arg.split(',').map(Number);
    await page.evaluate(v => window.__flyTo(...v), a);
    await page.waitForFunction('window.__flyDone() === true', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    console.log('FLEW', JSON.stringify(await page.evaluate(() => [window.__cam.position.x, window.__cam.position.y, window.__cam.position.z].map(v => +v.toFixed(1)))));
  } else if (cmd === 'readywait') {
    const t0 = Date.now();
    let ready = false;
    try { await page.waitForFunction('window.__ready === true', null, { timeout: +(arg || 420000) }); ready = true; }
    catch { ready = await page.evaluate('window.__ready === true').catch(() => false); }
    console.log('READYWAIT', ready, Math.round((Date.now() - t0) / 1000) + 's');
  } else if (cmd === 'setcam') {
    const a = arg.split(',').map(Number);
    await page.evaluate(v => window.__setCam(...v), a);
    await page.waitForTimeout(600);
    console.log('CAMSET');
  }
} finally {
  await browser.close();   // disconnects, does not kill the browser
}
