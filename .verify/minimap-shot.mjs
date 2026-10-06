// minimap-shot.mjs — capture the ortho map view for the deck's corner locator.
// Viewport locked to the ortho frustum aspect (890x800 layout units) so
// (x,z) -> image uv is linear: u=(x+890)/1780, v=(z+800)/1600.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';

const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const OUT = process.env.SHOTS_OUT || '/tmp/newshots';
const BASE = 'http://127.0.0.1:8778';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 890, height: 800 }, deviceScaleFactor: 2 });
try {
  await page.goto(`${BASE}/?view=map&still=1&q=low`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', null, { timeout: 900000 });
  await page.evaluate(() => {
    ['hudUI', 'hint', 'compass', 'labels', 'legend', 'titlecard', 'hud', 'uiCard', 'uiDrawer']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('[id^="ui"], .hud, .chip').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < 80 && r.height < 90) el.style.display = 'none';
    });
  });
  await page.waitForTimeout(2500);
} catch (e) { console.log('minimap BOOT:', e.message); }
await page.screenshot({ path: `${OUT}/minimap-raw.png`, timeout: 120000 });
console.log('minimap saved');
await browser.close();
