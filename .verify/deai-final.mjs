import { chromium } from 'playwright-core';
import os from 'node:os';
const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const b = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://127.0.0.1:8778/?q=low&still=1', { waitUntil: 'commit', timeout: 120000 });
await p.waitForFunction('window.__ready === true', null, { timeout: 900000 });
await p.evaluate('window.__deck.start()');
await p.waitForTimeout(3500);
await p.screenshot({ path: '/tmp/deai-s1.png' });
for (let k = 0; k < 4; k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400); }
await p.waitForTimeout(4500);
await p.screenshot({ path: '/tmp/deai-s5.png' });
const res = await p.evaluate(`({
  i: __deck.i,
  capText: document.querySelector('#uiDeck .cap').innerText.slice(0, 80),
  stray: [...document.querySelectorAll('#uiDeck .brand,#uiDeck .cnt,#uiDeck .prog,#uiDeck .meta,#uiDeck .kick')].length,
  map: document.querySelector('.mapbox').style.display
})`);
console.log(JSON.stringify(res));
await b.close();
