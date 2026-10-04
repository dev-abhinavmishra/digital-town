// final-smoke.mjs — boot the app on a real page, wait for build-ready,
// then probe scene/internals and report console errors. Usage:
//   node .verify/final-smoke.mjs [tier=med] [extraQuery]
import { chromium } from 'playwright-core';

const tier = process.argv[2] || 'med';
const extra = process.argv[3] ? '&' + process.argv[3] : '';
const url = `http://127.0.0.1:8778/?q=${tier}${extra}`;

const browser = await chromium.connectOverCDP('http://localhost:9223');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errs.push('PAGEERROR:' + e.message.slice(0, 160)));

const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit', timeout: 60000 });

// wait for the scene ready flag — __scene populated with the world group
let ready = null;
for (let i = 0; i < 240; i++) {
  ready = await page.evaluate(() => {
    if (!window.__scene) return null;
    let meshes = 0, tris = 0;
    window.__scene.traverse(o => {
      if (o.isMesh && o.geometry) {
        meshes++;
        const ix = o.geometry.index;
        tris += (ix ? ix.count : (o.geometry.attributes.position || { count: 0 }).count) / 3;
      }
    });
    return { meshes, tris: Math.round(tris / 1000) + 'k',
      ws: window.__ws || null, kids: window.__scene.children.length };
  }).catch(() => null);
  if (ready && ready.meshes > 50) break;
  await new Promise(r => setTimeout(r, 5000));
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);

// polish probes: ferris dynamic tag survived, interiors + deck hooks live —
// tolerate a post-ready navigation (tier reload) by retrying briefly
let probe = null;
for (let i = 0; i < 12 && !probe; i++) {
  probe = await page.evaluate(() => {
    if (!window.__scene) return null;
    const out = {};
    window.__scene.traverse(o => {
      if (o.userData && o.userData.dynamic && o.isMesh) out.dynamicMeshes = (out.dynamicMeshes || 0) + 1;
    });
    out.interiors = typeof window.__enterInterior === 'function';
    out.deck = !!(window.__deck && window.__deck.start);
    return out;
  }).catch(() => null);
  if (!probe) await new Promise(r => setTimeout(r, 3000));
}

console.log(JSON.stringify({ tier, bootSecs: +secs, ready, probe,
  errors: errs.slice(0, 10), errCount: errs.length }));
await page.close();
await b2cleanup();
async function b2cleanup() { try { await browser.close(); } catch {} }
