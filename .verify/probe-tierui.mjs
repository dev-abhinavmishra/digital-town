/* probe-tierui.mjs — boot the town, exercise the tier-settings popover:
   open it, click LOW, confirm dt_q persisted + reload picks it up. */
import { chromium } from 'playwright-core';
import os from 'os';

const EXE = process.env.CHROME_EXE || `${os.homedir()}/.local/bin/google-chrome`;
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:8778/?still=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 900000 });

const r = await page.evaluate(async () => {
  const chip = document.getElementById('uiTier');
  const guide = document.getElementById('uiGuide');
  const out = { chip: chip && chip.textContent, guideExists: !!guide, auto: null, picked: null, after: null };
  if (!guide) return out;
  chip.click();
  out.opened = guide.classList.contains('open');
  out.running = document.getElementById('uiGuideRun')?.textContent || null;
  out.auto = guide.querySelector('.tr.on')?.dataset.q || null;
  // pick LOW
  const low = [...guide.querySelectorAll('.tr')].find(el => el.dataset.q === 'low');
  low.click();
  out.picked = localStorage.getItem('dt_q');
  return out;
});
// reload — tier must now be LOW regardless of device
await page.waitForNavigation({ waitUntil: 'commit', timeout: 120000 }).catch(() => {});
await page.waitForFunction('window.__ready === true', null, { timeout: 900000 }).catch(() => {});
r.after = await page.evaluate(() => ({
  tier: window.__fx ? window.__fx.tier : 'no-post',
  chip: document.getElementById('uiTier')?.textContent,
  pref: localStorage.getItem('dt_q'),
}));
console.log(JSON.stringify(r, null, 2));
await browser.close();
