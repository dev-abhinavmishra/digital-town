import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9223');
const pg = await b.contexts()[0].newPage();
await pg.setViewportSize({ width: 1600, height: 900 });
await pg.goto('http://127.0.0.1:8778/deck/index.html', { waitUntil: 'load', timeout: 60000 });
await new Promise(r => setTimeout(r, 1200));
const n = await pg.evaluate('document.querySelectorAll(".slide").length');
// jump to slides of interest and screenshot
for (const [i, name] of [[1,'s2-brief'],[4,'s5-care'],[10,'s11-budget'],[11,'s12-close'],[12,'s13-refs']]) {
  await pg.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}))`);
  for (let k = 0; k < i; k++) await pg.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))`);
  await new Promise(r => setTimeout(r, 1400));
  await pg.screenshot({ path: `.verify/${name}.png` });
}
console.log('slides:', n);
process.exit(0);
