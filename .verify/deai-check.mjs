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
await p.waitForTimeout(6000);
await p.screenshot({ path: '/tmp/deai-cover.png' });
await p.keyboard.press('ArrowRight');           // slide 2: overview w/ stats
await p.waitForTimeout(12000);
await p.screenshot({ path: '/tmp/deai-s2.png' });
console.log('i=', await p.evaluate('__deck.i'));
await b.close();
console.log('done');
