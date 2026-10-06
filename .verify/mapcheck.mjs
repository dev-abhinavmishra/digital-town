import { chromium } from 'playwright-core';
import os from 'node:os';
const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const b = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://127.0.0.1:8778/deck/index.html');
await p.waitForTimeout(1200);
// step to slide 3 (0-indexed 2): three dots
for (let k = 0; k < 2; k++) await p.keyboard.press('ArrowRight');
await p.waitForTimeout(1400);
await p.screenshot({ path: '/tmp/mapcheck-s3.png' });
// slide 5: three care dots
for (let k = 0; k < 2; k++) await p.keyboard.press('ArrowRight');
await p.waitForTimeout(1400);
await p.screenshot({ path: '/tmp/mapcheck-s5.png' });
await b.close();
console.log('done');
