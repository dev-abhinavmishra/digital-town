---
name: testing-havenbrook-town
description: How to run and verify the Havenbrook 3D town (town/server.cjs :8778) — Chrome SwiftShader flags, CDP driving pattern, page probes, and expected values. Covers the Windows box AND the Linux box (Devin's own Chrome).
---

# Testing the Havenbrook 3D town

## Serve
`node town/server.cjs` serves `town/` on http://127.0.0.1:8778 (no bundler; importmap → town/vendor/three, previously town/node_modules/three). Verify it serves the working tree: `curl -s http://127.0.0.1:8778/js/ui.js | md5sum` vs `md5sum town/js/ui.js`.
To simulate the Vercel static bundle, copy town/ minus node_modules (`tar --exclude=node_modules --exclude=audit.mjs --exclude=server.cjs --exclude=package-lock.json -cf - . | tar -xf - -C /tmp/deploy-sim`) and serve that dir instead — then `GET /node_modules/three/...` 404s, so a broken importmap cannot load. A logging static server (write ~15 lines: log `status url` per request) gives authoritative zero-404 evidence without fighting console capture.

## Chrome / WebGL — Linux box (devin-remote Chrome)
- The desktop Chrome devin-remote drives (CDP :29229, binary /opt/.devin/chrome/chrome/linux-*/chrome-linux64/chrome) already renders WebGL2 via SwiftShader (`--use-angle=swiftshader-webgl --disable-gpu`); probe `canvas.getContext('webgl2')` to confirm — no relaunch needed. webgl1 is absent; three@0.160 only needs webgl2.
- `browser_console` eval can be spuriously blocked with "the page has a JavaScript dialog open" when NO dialog exists (phantom state across reloads; `Page.handleJavaScriptDialog` returns "No dialog is showing"). Don't trust that error — drive JS via `chromium.connectOverCDP('http://127.0.0.1:29229')` from playwright-core (.verify/node_modules); find the page by `p.url().includes(':PORT')`.
- Display is 1600x1200; the window fills it. First `window.__ready` ≈ 4min at that size (poll via CDP; fpsEMA in __fx is inflated because dt clamps at .05). In-page watchdog reloads at 30s×3 (sessionStorage `hbBoot`) — the 4th load stays and renders to completion, so budget ~90s + render time.

## Chrome / WebGL — Windows box
- Chrome for Testing 137 at `C:/devin/chrome/chrome-win64/chrome.exe`; no real GPU. Hand-launched Chrome needs `--enable-unsafe-swiftshader` or WebGL2 context creation FAILS → 30s boot watchdog reloads forever (`window.__ready` never fires). Playwright `chromium.launch` adds the flag itself; `.verify/shots.mjs`/`ui-probe.mjs` already do it.
- `write_to_process` doesn't deliver readline line-endings on ConPTY — a stdin-REPL playwright driver hangs. Instead launch one persistent Chrome (`--remote-debugging-port=9223 --user-data-dir=<scratch>`) and drive it with one-shot `chromium.connectOverCDP` scripts (.verify/step.mjs: goto/eval/shot/click/key/wait/probe/fly/setcam/mousedown/readywait; .verify/errwatch.mjs: persistent console/pageerror logger to file).
- Resize to innerWidth/innerHeight exactly 1280x720 (outer ≈1296x920) via PowerShell MoveWindow; first `__ready` ~2-4min per load (observed 143-196s); waitForFunction 420s; screenshot timeout 120s. Minimize the env's own Chrome (`ShowWindow hwnd 6`) or SetWindowPos TOPMOST so it doesn't cover the test window in recordings.

## Page probes (window.*)
`__ready` (bool; flips after veil fades + 2 presented frames), `__flyTo(px,py,pz,tx,ty,tz,durSec)`, `__flyDone()`, `__setCam(px,py,pz,tx,ty,tz)`, `__cam`, `__scene`, `__renderer.info.render.{calls,triangles}`, `__fx.{fps,calls,callsAvg,tris,atmo,...}`. URL params: `?view=aerial|mainstreet|park|downtown|campus|medical|senior|commercial|school|housing|map`, `?time=day|dusk|golden`, `&still=1` (no auto-orbit), `&labels=1`, `&cam=...`, `&nofx|noao|noatmo|nofog|freeze|debug|fps=1`.

## HUD (town/js/ui.js) — expected values
- `#uiBudget` chip reads exactly `$9.95M / $10.00M` (spent = 9,950,000); click toggles `.open` → breakdown rows.
- `#uiBtnDir` toggles `#uiDrawer.open` (3 groups: free×2, health×13, community×11); clicking `.fi[data-id]` shows `#uiCard.show` and calls `__flyTo` — verify `__cam.position` ≈ flyToBuilding formula: dist=max(w,d)*1.7+26, ang=atan2(b.x,b.z)+.6, px=b.x+sin(ang)*dist, pz=b.z+cos(ang)*dist, py=max(30,h*1.6+24).
- `#uiBtnTour` starts 8-stop tour in `#uiTourBar` (`.cap b` caption, `.step` "n / 8", auto-advance every 9s); `#uiTourNext` advances (its mousedown is stopPropagation'd so it must NOT end the tour); Esc or a canvas mousedown ends it and tweens the camera back to aerial (540,620,660).
- `#uiBtnRubric` opens `#uiRubric.open` (9 ✓ rows); `#uiRubricX` or backdrop click closes.

## Building interiors (town/js/interior.js)
- Probes: `__interior{.on,.kind,.b.id,.spec,.saved.p/q}`, `__enterInterior(id)`/`I.byId(id)`, `__exitInterior()`. Deep link: `?interior=hospital|coffee|medhall|preservecommons`. Rooms render on layer 2 at STAGE=(0,-180,0); EYE=1.62; archetypes from BY_ID/BY_TYPE (medical ward, cafe dining room, hall great hall, mall atrium, home, shop).
- Interior HUD = anonymous `body>div` with `style.zIndex==='72'` (panel/hint/exitBtn; display:'block' while inside). Read panel text via `[...document.querySelectorAll('body>div')].filter(d=>d.style.zIndex==='72'&&d.style.display==='block')`.
- Click-to-enter is guarded by delivered pointerdown→pointerup <450ms AND <6px move. Under SwiftShader input delivery lags — an 80ms playwright down→up can arrive ~1s apart and get REJECTED. Use `page.mouse.click()` (no delay) — observed delivered gap ~50ms. Diagnose with elementFromPoint + an in-page `pickBuildingAt` raycast (import './js/interior.js' + './node_modules/three/build/three.module.js' in evaluate).
- Camera pose check: on enter, `I.saved.p/q` must equal the pre-enter aerial pose; on exit, `__cam.position`/`quaternion` must equal it exactly. Regression signature (seen on devin/1790469015-building-interiors): on re-entry the saved pose captured stage coords (~(16.4,-178.4,-12.4) for a w34×d26 room) because I.on flips 190ms before the save and interior.tick clamps to the stale I.spec — exit then lands at a random street point. First entry per page is immune (I.spec null → tick no-ops).
- Park zone ('park') has no w/d and ZONE_RECT.park=null → unpickable; clicking the park does nothing (no card). Road/ground clicks are inert by design.

## MIN-tier chunked merge + distance culler
- `?q=min|low|med|high` forces a tier; `#uiTier` element shows the active tier ('MIN'/'HIGH'). `window.__prof` build entries: `['buildWorld',ms]`, `['mergeStatic',ms]`, `['minSplit',n]` (MIN only — n static InstancedMeshes rebucketed into cells).
- Chunk cells: merged-mesh + split-instanced children carry `userData.ccx/ccz` (cell centre). Collect via `__scene.traverse(o=>o.userData&&o.userData.ccx!==undefined)`. Cell spacing: 160m on MIN, 320m on all other tiers.
- Culler (MIN only, every 10 frames): cell hidden iff `(ccx-cam.x)^2+(ccz-cam.z)^2 >= max(300,cam.y*3)^2`. Verify by comparing `mesh.visible` to that formula per cell after the camera settles ≥1s — any mismatch is a bug. Note: hidden cells can have huge boundingBox reach (big world-baked ground pieces) — that alone is NOT a hole; only missing near-field pixels are.
- playwright `page.screenshot` can stall >20s on heavy tiers under SwiftShader — pass `timeout:120000`.

## Good camera spots for close-ups
- Street blades: pole at each of the first 8 `intersections()` (all on University Ave x=-140) → SW corner offset (−wv/2−1.4, +wh/2+1.4); e.g. Univ×Main pole ≈(−150.4,−30.6), cam (−138,4.5,−18)→(−150.4,3.1,−30.6). (Verified on Linux: renders blades + crosswalks + pedestrians.)
- Parking meters: rows z=−62 / z=−18 (x −38..180) along Main St; look along the row, e.g. (−30,2.6,−52)→(40,1,−62).
- Pedestrian cluster (idlers): plaza (60,−205)±35, cam (35,5,−168)→(62,1.2,−205).
- Dusk headlight glows: any moving/parked car on Main St, e.g. (55,4,−24)→(95,1.2,−48).

## Devin secrets needed
None — fully local static app.
