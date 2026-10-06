import { chromium } from 'playwright-core';
import os from 'node:os';
const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const b = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://127.0.0.1:8778/?q=low&still=1', { waitUntil: 'commit', timeout: 120000 });
await p.waitForFunction('window.__ready === true', null, { timeout: 900000 });
await p.evaluate('window.__deck.start()');
await p.waitForTimeout(2000);
for (let k = 0; k < 13; k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350); }
await p.waitForTimeout(3000);
const mb14 = await p.evaluate(`document.querySelector('.mapbox').style.display`);
const i14 = await p.evaluate('window.__deck.i');
await p.screenshot({ path: '/tmp/tailcheck-s14.png' });
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/tailcheck-s15.png' });
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/tailcheck-s16.png' });
const refs = await p.evaluate(`[...document.querySelectorAll('.refs li')].map(x=>x.textContent.slice(0,60))`);
console.log('slide', i14, 'mapbox display:', JSON.stringify(mb14), 'refs:', refs.length);
await b.close();
