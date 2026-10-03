import { chromium } from 'playwright-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.connectOverCDP('http://localhost:9223');
const pg = await b.contexts()[0].newPage();
await pg.setViewportSize({ width: 1280, height: 720 });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_RESET')) errs.push(m.text()); });
await pg.goto('http://127.0.0.1:8778/?view=aerial&q=med&still=1', { waitUntil: 'commit', timeout: 30000 });
for (let i = 0; i < 600; i++) { if (await pg.evaluate('window.__ready === true').catch(() => false)) break; await sleep(1000); }
console.log('ready:', await pg.evaluate('window.__ready'));
await pg.evaluate('window.__deck.start()');
await sleep(6000);
console.log('deck A:', await pg.evaluate(`(()=>{const v=document.querySelector('#uiDeck .bgvid');return JSON.stringify({i:__deck.i,playing:!v.paused,t:+v.currentTime.toFixed(1),calls:__renderer.info.render.calls})})()`));
await pg.screenshot({ path: '.verify/deck-video.png' });
// fallback: point at a missing file, restart the deck
await pg.evaluate('window.__deck.exit()');
await sleep(2000);
await pg.evaluate(`const v=document.querySelector('#uiDeck .bgvid'); v.src='deck/nope.mp4'; v.load();`);
await pg.evaluate('window.__deck.start()');
await sleep(6000);
console.log('deck B:', await pg.evaluate(`(()=>({i:__deck.i, calls:__renderer.info.render.calls, camY:__cam.position.y}))()`));
await pg.evaluate('window.__deck.exit()');
await sleep(1500);
console.log('errors:', errs.length ? errs : 'none');
await pg.close(); process.exit(0);
