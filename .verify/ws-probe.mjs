import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9223');
const pg = b.contexts()[0].pages().find(p => p.url().includes('8778'));
if (!pg) { console.log('no page'); process.exit(0); }
console.log(await pg.evaluate('JSON.stringify({ws:window.__ws, cam:window.__cam && window.__cam.position ? [Math.round(window.__cam.position.x),Math.round(window.__cam.position.y),Math.round(window.__cam.position.z)] : null, paused:window.__paused && window.__paused()})'));
process.exit(0);
