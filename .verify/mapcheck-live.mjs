import { chromium } from 'playwright-core';
import os from 'node:os';
const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const b = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://127.0.0.1:8778/?q=low&still=1', { waitUntil: 'commit', timeout: 120000 }).catch(e => console.log('goto', e.message));
await p.waitForFunction('window.__ready === true', null, { timeout: 900000 });
await p.evaluate('window.__deck.start()');
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/mapcheck-live-cover.png' });
// slide 4 = university (gold + two nearby whites)
for (let k = 0; k < 3; k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); }
await p.waitForTimeout(8000);
await p.screenshot({ path: '/tmp/mapcheck-live-s4.png' });
// slide 5 = care tour
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(20000);
await p.screenshot({ path: '/tmp/mapcheck-live-s5.png' });
await b.close();
console.log('done');
