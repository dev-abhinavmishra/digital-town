import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.connectOverCDP('http://localhost:9223');
const p = b.contexts()[0].pages().find(x => x.url().includes('8778'));
const log = fs.createWriteStream('shots2/errors.log', { flags: 'a' });
p.on('console', m => { if (m.type() === 'error') log.write('CONSOLE_ERR ' + m.text().slice(0, 200) + '\n'); });
p.on('pageerror', e => log.write('PAGEERROR ' + String(e).slice(0, 200) + '\n'));
log.write('watching-8778-deck-cycle ' + new Date().toISOString() + '\n');
await p.evaluate(async () => {
  await __deck.start();
  await new Promise(r => setTimeout(r, 3000));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(r => setTimeout(r, 2500));
});
const st = await p.evaluate(() => ({ on: __deck.on, calls: __renderer.info.render.calls }));
console.log('post-cycle', JSON.stringify(st));
await new Promise(r => setTimeout(r, 600));
await b.close();
