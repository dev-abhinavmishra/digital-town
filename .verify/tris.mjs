// tris.mjs — rendered triangle census per view. Usage: node tris.mjs [name=url ...]
import { chromium } from 'playwright-core';

const EXE = 'C:/devin/chrome/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:8778';
const specs = process.argv.slice(2).length
  ? process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })
  : [['min-aerial', `${BASE}/?q=min&view=aerial&still=1`]];

const browser = await chromium.launch({
  executablePath: EXE, headless: false,
  args: ['--window-size=1400,900', '--use-angle=default', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

for (const [name, url] of specs) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', null, { timeout: 420000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const meshes = [];
    window.__scene.traverse(o => {
      if (!o.isMesh && !o.isInstancedMesh || !o.visible) return;
      const g = o.geometry;
      meshes.push(Math.round((g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1)));
    });
    return {
      drawn: window.__renderer.info.render.triangles,
      calls: window.__renderer.info.render.calls,
      visibleGeoTris: meshes.reduce((a, b) => a + b, 0),
      meshes: meshes.length, fps: window.__fx.fps, tier: window.__fx.tier,
    };
  });
  console.log(JSON.stringify({ name, ...r }));
}
console.log('errors', errors.slice(0, 4));
await browser.close();
