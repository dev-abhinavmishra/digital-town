// deckshot-new.mjs — capture clean slide backgrounds (no HUD) via ?cam= eval camera.
// Usage: node deckshot-new.mjs name=worldcam   worldcam = px,py,pz,tx,ty,tz
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';

const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const OUT = process.env.SHOTS_OUT || '/tmp/newshots';
const BASE = 'http://127.0.0.1:8778';
fs.mkdirSync(OUT, { recursive: true });

const specs = process.argv.slice(2).map(s => {
  const i = s.indexOf('=');
  return [s.slice(0, i), `${BASE}/?cam=${s.slice(i + 1)}&still=1`];
});

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const [name, url] of specs) {
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', null, { timeout: 900000 });
    // hide every bit of HUD chrome — the shots are presentation backdrops
    await page.evaluate(() => {
      ['hudUI', 'hint', 'compass', 'labels', 'legend', 'titlecard', 'hud', 'uiCard', 'uiDrawer']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.querySelectorAll('[id^="ui"], .hud, .chip').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < 80 && r.height < 90) el.style.display = 'none';   // top pill bars
      });
    });
    await page.waitForTimeout(2500);
  } catch (e) { console.log(name, 'BOOT:', e.message); continue; }
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
  console.log(name, (Date.now() - t0) / 1000 | 0, 's');
}
await browser.close();
