import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9223');
const pg = await b.contexts()[0].newPage();
await pg.setViewportSize({ width: 1600, height: 900 });
await pg.goto('http://127.0.0.1:8778/deck/index.html', { waitUntil: 'load', timeout: 60000 });
await pg.emulateMedia({ media: 'print' });
await new Promise(r => setTimeout(r, 800));
// in print, all slides stack — scroll to the budget slide (#11 of 13 → y = 10*pageH)
await pg.evaluate(`window.scrollTo(0, ${10 * 900})`);
await new Promise(r => setTimeout(r, 400));
await pg.screenshot({ path: '.verify/print-budget.png' });
process.exit(0);
