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
- Display is 1600x1200 CSS px (physical 3200x2400, dpr=2; PNG screenshots are 2x CSS coords — multiply projected px by devicePixelRatio before sampling pixels). First `window.__ready` ≈ 4min at that size (poll via CDP; fpsEMA in __fx is inflated because dt clamps at .05). In-page watchdog reloads at 30s×3 (sessionStorage `hbBoot`) — the 4th load stays and renders to completion, so budget ~90s + render time. Observed ready 162-207s for a re-load of an already-built tier.
- `.verify/step-linux.mjs` (tracked helper) = one-shot CDP driver: `goto <url>` / `eval <js>` / `shot <name>` / `clickxy x,y` / `probe` / `setcam px,py,pz,tx,ty,tz` / `fly ...` / `wait ms` → shots land in `.verify/shots-linux/`.
- `.verify/hudflow.mjs` (if present, untracked) = full HUD sweep: budget text+open, drawer group counts, facility card + fly-to cam check, rubric/guide modals, tier chip, tour start→NEXT→Esc→camera-home, hint/label styles; prints `RESULT` JSON.
- `.verify/sample.mjs` (if present) = world→screen projection (`THREE.Vector3.project(__cam)` via dynamic `import('./vendor/three/build/three.module.js')` in evaluate — importmap covers bare 'three' too) + PNG pixel sampling by feeding the screenshot back as a `data:` URL into an in-page canvas `getImageData`. Use for "did this surface flicker to the wrong colour at this camera" checks.
- Auto quality tier on this box resolves LOW → tier chip reads 'PERF LOW', guide LOW row badges 'RUNNING NOW' and AUTO badges 'SAVED'.

## Chrome / WebGL — Windows box
- Chrome for Testing 137 at `C:/devin/chrome/chrome-win64/chrome.exe`; no real GPU. Hand-launched Chrome needs `--enable-unsafe-swiftshader` or WebGL2 context creation FAILS → 30s boot watchdog reloads forever (`window.__ready` never fires). Playwright `chromium.launch` adds the flag itself; `.verify/shots.mjs`/`ui-probe.mjs` already do it.
- `write_to_process` doesn't deliver readline line-endings on ConPTY — a stdin-REPL playwright driver hangs. Instead launch one persistent Chrome (`--remote-debugging-port=9223 --user-data-dir=<scratch>`) and drive it with one-shot `chromium.connectOverCDP` scripts (.verify/step.mjs: goto/eval/shot/click/key/wait/probe/fly/setcam/mousedown/readywait; .verify/errwatch.mjs: persistent console/pageerror logger to file).
- Resize to innerWidth/innerHeight exactly 1280x720 (outer ≈1296x920) via PowerShell MoveWindow; `__ready` per load varies 143-520s (PR45 branch observed ~430-520s consistently — shader-compile bound post-merge; `buildWorld` itself is only ~16-20s); waitForFunction 420s + follow-up readywait; screenshot timeout 120s. Minimize the env's own Chrome (`ShowWindow hwnd 6`) or SetWindowPos TOPMOST so it doesn't cover the test window in recordings. To find YOUR window when the env Chrome also shows this app: `/json` on :9223 lists only your targets; match the hwnd via `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%remote-debugging-port=9223%'"` → MainWindowHandle.

## Page probes (window.*)
`__ready` (bool; flips after veil fades + 2 presented frames), `__flyTo(px,py,pz,tx,ty,tz,durSec)`, `__flyDone()`, `__setCam(px,py,pz,tx,ty,tz)`, `__cam`, `__scene`, `__renderer.info.render.{calls,triangles}`, `__fx.{fps,calls,callsAvg,tris,atmo,tier,...}`. URL params: `?view=aerial|mainstreet|park|downtown|campus|medical|senior|commercial|school|housing|map`, `?time=day|dusk|golden`, `&still=1` (no auto-orbit), `&labels=1` (REQUIRED for .lbl map labels + #legend — without it the labels layer stays empty), `&cam=...`, `&nofx|noao|noatmo|nofog|freeze|debug|fps=1`.

## HUD (town/js/ui.js) — expected values
- `#uiTopRight` is a single flex row of `#uiBtns`(uiBtnDir/uiBtnTour/uiBtnDeck/uiBtnRubric/uiBtnGuide) + `#uiTier` perf chip = 6 controls (post-PR45). `#uiBudget` chip was REMOVED — budget figures live inside `#uiRubric` (PROJECT BRIEF: '$9.95M spent of $10.00M' + '6.25M'/'3.70M' category rows). Older branches still have the `#uiBudget` chip ('$9.95M / $10.00M', click toggles `.open`).
- `#uiBtnDir` toggles `#uiDrawer.open` (3 `.grp` groups: 'Provided by the town (2)', 'Healthcare facilities (13)', 'Community locations (11)'; 26 `.fi` rows); clicking `.fi[data-id]` shows `#uiCard.show` and calls `__flyTo` — verify `__cam.position` ≈ flyToBuilding formula: dist=max(w,d)*1.7+26, ang=atan2(b.x,b.z)+.6, px=b.x+sin(ang)*dist, pz=b.z+cos(ang)*dist, py=max(30,h*1.6+24).
- `#uiBtnTour` starts 8-stop tour in `#uiTourBar` (`.cap b` caption, `.step` "n / 8", auto-advance every 9s); `#uiTourNext` advances (its mousedown is stopPropagation'd so it must NOT end the tour — regression check: after clicking NEXT, `.step` must show '2 / 8' and tourBar still `.show`); Esc or a canvas mousedown ends it and tweens the camera back to aerial (540,620,660 → -30,0,-40); verify `__cam.position` ≈ that ±40 after ~3s.
- `#uiBtnRubric` opens `#uiRubric.open` (9 `td.ok` ✓ rows); `#uiRubricX` or backdrop click closes.
- `#uiBtnGuide` opens `#uiGuide.open` (6 `.tr` tier rows AUTO/ULTRA/HIGH/MED/LOW/MIN — med/low/min mention "chunked map loading", ULTRA lists "4x MSAA, 2.5x pixels"; `.bdg` text 'SAVED' on saved pref, 'RUNNING NOW' on live tier); `#uiGuideX`/backdrop closes (there are no <button> elements inside overlays — the × is a span).
- `#uiTier` chip textContent = 'PERF ' + tier.toUpperCase() (set in main.js).
- `__uiShowCard(id)` probe opens the card without flying. Map labels `.lbl` (only exist with `?labels=1`) carry a `.num` badge; clicking one calls `showCard(b,false)` — card opens but camera stays.
- Known cosmetic quirk (pre-existing, translateY(140px) closed state): a closed `#uiCard` leaves ~40-70px of its top edge visible above the viewport bottom — shows as a card sliver in screenshots, NOT a stuck-open card. Check `.classList.contains('show')` for truth.
- Card 'step inside' link `[data-act="in"]` → `__enterInterior(b.id)`; `__interior.on` flips true, Esc exits. Interior HUD (interior.js anonymous panel, zIndex 72) is a separate dark-ish component — not part of the ui.js theme.

## PRESENT mode (town/js/deck.js) — cinematic slide deck
- `#uiBtnDeck` ("◉ PRESENT") → `deck.start()`: `#uiDeck.on`, 56px letterbox bars, HUD chrome hidden (hudUI/hint/compass/labels/legend/titlecard/hud stashed+restored via inline display), `.cnt` "01 / 09"…"09 / 09", `.cap` caption staggered fade. Slide idx 7 = 'The ledger' (`.bud` budget bar); idx 0/8 = covers.
- **Video background**: `.bgvid` (`deck/town-orbit.mp4`, muted/loop/playsinline, object-fit:cover) sits under `.scrim`. start() awaits `vid.play()` → on success `__setPaused(true)` halts ALL scene rendering (main.js tick early-returns — `window.__paused()`===true is the proof; `info.reset()` now runs inside frame(), so `__renderer.info.render.calls` FREEZES at the last rendered count while paused — not 0) and slides show the rotating-town loop; on failure slides fall back to per-slide `__flyTo` flights (cams authored in layout space × `__ws`). exit() pauses video + `__setPaused(false)`.
- Regenerate the video with `.verify/orbit-capture.mjs [frames] [tier] [time]` (360 @24fps = 15s loop; renders headless frame-by-frame so SwiftShader speed doesn't matter).
- Nav: `.edge.l`/`.edge.r` (outer 22% zones — click at ~5%/95% width), ArrowLeft/Right/Up/Down, Space pauses, Esc or step-past-last exits → `__flyTo(540,620,660,-30,0,-40)` home. start() also calls `__endTour` and `__exitInterior` — test both preemptions.
- Probes: `window.__deck {start,exit,next,prev,on,i,n}` (n=9).
- **SwiftShader timing trap**: auto-advance HOLD=9.5s + caption reveal via 360ms setTimeout — page.screenshot takes 2-5s under load, so the auto-advance WILL race your asserts (counter jumps mid-check; past-last auto-exit fires while you screenshot). For deterministic manual-nav asserts press Space FIRST (paused → timer cleared, manual nav unaffected). Caption/`h1` reads need ≥1.5-4s settle, not 0.4s. An "extra" step in counts is usually the auto-advance, not a double-fire — same for TOUR (its 9s timer races identically).
- **Codec note (Windows box)**: Chrome for Testing DOES decode H.264 — `canPlayType('video/mp4; codecs="avc1.42E01E"')` returns 'probably', so the avc1 `town-orbit.mp4` plays and the video path engages (don't assume codec-less Chromium blocks it). Video-advance proof = `.bgvid.currentTime` delta across two samples + `__paused()===true` simultaneously.
- Space pauses slide auto-advance ONLY — the video keeps looping (HTML `loop` attr independent of the deck's `paused` flag). Assert the SLIDE INDEX freezes >9.5s, not `vid.paused`. On exit, `vid.paused===true` + calls>0 + cam at 0.62×aerial are the resume proof.
- `__enterInterior(id)` probe is the reliable interior-enter for preemption tests (click through the card can miss the thin 'step inside' link while it settles).

## Static deck (town/deck/index.html, served at /deck/index.html — no dir index on server.cjs)
- 9 `.slide` sections, `#track` translateX(−i*100%), `.cur` marks active, `#cnt` "NN/NN", `.edge l/r` click zones, Arrow/Space/Home/End keys, wheel (900ms throttle, |delta|≥24). Clamps at ends (no exit). Slide idx 7 is `.paper` (light ledger, adds `body.darkchrome`); the other 8 load `shots/01-cover.jpg`…`08-close.jpg` — assert decode via `new Image().naturalWidth` per computed `backgroundImage` url.

## Building interiors (town/js/interior.js)
- Probes: `__interior{.on,.kind,.b.id,.spec,.saved.p/q}`, `__enterInterior(id)`/`I.byId(id)`, `__exitInterior()`. Deep link: `?interior=hospital|coffee|medhall|preservecommons`. Rooms render on layer 2 at STAGE=(0,-180,0); EYE=1.62; archetypes from BY_ID/BY_TYPE (medical ward, cafe dining room, hall great hall, mall atrium, home, shop).
- Interior HUD = anonymous `body>div` with `style.zIndex==='72'` (panel/hint/exitBtn; display:'block' while inside). Read panel text via `[...document.querySelectorAll('body>div')].filter(d=>d.style.zIndex==='72'&&d.style.display==='block')`.
- Click-to-enter is guarded by delivered pointerdown→pointerup <450ms AND <6px move. Under SwiftShader input delivery lags — an 80ms playwright down→up can arrive ~1s apart and get REJECTED. Use `page.mouse.click()` (no delay) — observed delivered gap ~50ms. Diagnose with elementFromPoint + an in-page `pickBuildingAt` raycast (import './js/interior.js' + './node_modules/three/build/three.module.js' in evaluate).
- Camera pose check: on enter, `I.saved.p/q` must equal the pre-enter aerial pose; on exit, `__cam.position`/`quaternion` must equal it exactly. Regression signature (seen on devin/1790469015-building-interiors): on re-entry the saved pose captured stage coords (~(16.4,-178.4,-12.4) for a w34×d26 room) because I.on flips 190ms before the save and interior.tick clamps to the stale I.spec — exit then lands at a random street point. First entry per page is immune (I.spec null → tick no-ops).
- Park zone ('park') has no w/d and ZONE_RECT.park=null → unpickable; clicking the park does nothing (no card). Road/ground clicks are inert by design.

## Tiers & raster budgets (`window.__fx` is the authoritative probe)
- `?q=min|low|med|high|ultra` forces a tier; `#uiTier` shows 'PERF <TIER>'. Do NOT verify tier caps via `__renderer.getPixelRatio()` — an adaptive governor (main.js ~line 840) lowers pixelRatio toward a .42 floor whenever fpsEMA<42 (always true under SwiftShader), so it reads ~.42 on EVERY tier. Use `__fx` instead: `{tier, msaa, ao, aoPresent/aoState, shadowMapSize, bloom, envType/envSrc/envIntensity, cull, tris, calls, callsAvg, fps}`.
- Expected configs (PR45): ultra msaa4/ao/8K shadow/2.5px, high msaa2/ao/4K/.85 detail/1.5px, med msaa0/no-ao/2K/.7, low msaa0/no-ao/1K/.45, min .12 detail/0 shadows/.6px. Observed tris @ mainstreet: MIN 359,674/306 calls · MED 1.11M/581 · HIGH 2.87M/853 · ULTRA 5.1M/893.
- __fx exists ~60s into a load (before __ready's ~430-520s wait) — for a slow tier like ULTRA you can verify config without waiting for full render.

## World scale (PR45+, WS=.62)
- Town geometry lives in `__scene.getObjectByName('world')` with `world.scale.setScalar(__ws)`; `window.__ws===.62`. Everything AFTER the group is layout-coords multiplied by .62: camera presets (aerial → [334.8,384.4,409.2]), flyTo targets (×__ws applied inside flyToBuilding), label anchors. Interiors are UNscaled (stage at y=-178 always in raw meters).
- Click-pick regression to watch: if picking/raycast code feeds world-space hit points to layout-space rect maps (e.g. `pickBuildingAt(hit.point)` vs layout.js x/z rects), clicks mis-hit — scaled hit (49.6,-313.1) lands inside healthdept's LAYOUT rect while physically hitting the hospital → wrong interior opens. Signature: `__interior.b.id` ≠ the building you clicked. Always assert the entered bid, not just `on===true`.
- envMapIntensity audit (angle-tint fix): for non-glass (`m.map.userData.v2.glass` — v2 lives on the TEXTURE's userData, NOT material.userData) MeshStandardMaterials with roughness≥.8, envMapIntensity must be ≤0.5. GLB-imported meshes (chains like `Cube_1<Cube<Scene<world`) added after the material pass can escape the cap — check obj names for imported-model patterns.

## Map view + district/street labels (PR46+)
- `?view=map` is the HEAVIEST view under SwiftShader (~14-16min to __ready; CDP connects time out repeatedly mid-build — keep retrying, the page is alive; verify via `/json` target list). Add `&labels=1` or NOTHING renders: the whole label block (facility labels + district labels + street-name map labels) is inside `if (LABELS)` — district `.lbl.dist` divs only spawn when `VIEW==='map'` AND `LABELS`.
- District label positions (DOM divs in `#labels`): UNIVERSITY DISTRICT (40,-360), MEDICAL DISTRICT (200,-555), SENIOR (585,-620), DOWNTOWN (-480,-445), COMMERCIAL CORRIDOR (160,555), RESIDENTIAL WEST (-460,40), SCHOOL (-510,705). Map north = screen-up.
- `Failed to load resource: net::ERR_CONNECTION_RESET` can appear transiently on the heaviest loads — static-server socket drops under the fetch burst, not an app error; pages still render fully. Don't count these as app console errors but DO report them honestly.

## Wayfinding/fingerpost verification
- `finger(x,z,ry,blades)` (city/hero.js ~251): blades = texPanel meshes in a group rotated `ry`; each blade's TWO faces carry the same arrow texture so each face's arrow points opposite world dirs. Arrow glyph maps to the face's local axes: '→'=+xText, '←'=-xText, '↑'=-faceNormal (ahead past sign), '↓'=+faceNormal (behind). World arrow dir per face = rotateY(ry+byaw) applied. Validate convention via a known-good sign first, then flag blades whose best-face direction is >60deg off the bearing to the named destination.
- Sign text IS legible in close-ups: position cam ~10-15m from the pole at blade height (y~3) facing the pole.
- Pre-shrink branch (pre-PR45-merge): layout coords ARE world coords — `__ws` and the `world` group are absent; `pickBuildingAt(hit.point)` gets matching coords so click-pick works (the PR45 ws mis-pick does not apply).

## MIN-tier chunked merge + distance culler
- `?q=min|low|med|high` forces a tier; `#uiTier` element shows the active tier ('MIN'/'HIGH'). `window.__prof` build entries: `['buildWorld',ms]`, `['mergeStatic',ms]`, `['minSplit',n]` (MIN only — n static InstancedMeshes rebucketed into cells).
- Chunk cells: merged-mesh + split-instanced children carry `userData.ccx/ccz` (cell centre) AND (post-PR45) `userData.cb={x0,z0,x1,z1}` bounds in WORLD coords (pre-scaled by ×__ws at bake). Collect via `__scene.traverse(o=>o.userData&&o.userData.cb)`. Cell spacing: 160m on MIN, 320m elsewhere.
- Culler (post-PR45: MIN/LOW/MED, every 10 frames): cell hidden iff bounds-gap `dx²+dz² >= max(CULL_BASE[tier],cam.y*3)²` where `dx=max(cb.x0-px,px-cb.x1,0)` (rect distance, not point). CULL_BASE={min:190,low:230,med:330}. Pre-PR45: MIN only, point-distance `>= max(300,cam.y*3)²` on ccx/ccz. Verify `mesh.visible` against the formula per cell — zero tolerance.
- playwright `page.screenshot` can stall >20s on heavy tiers under SwiftShader — pass `timeout:120000`.

## Good camera spots for close-ups
- Street blades: pole at each of the first 8 `intersections()` (all on University Ave x=-140) → SW corner offset (−wv/2−1.4, +wh/2+1.4); e.g. Univ×Main pole ≈(−150.4,−30.6), cam (−138,4.5,−18)→(−150.4,3.1,−30.6). (Verified on Linux: renders blades + crosswalks + pedestrians.)
- Junction pad pixel check (z-fight): junction centre Univ×Main = (−140,0,−40); project to screen each pose and sample — should stay asphalt-grey (r≈g≈b ~100-175) at every angle, never grass-green.
- Parking meters: rows z=−62 / z=−18 (x −38..180) along Main St; look along the row, e.g. (−30,2.6,−52)→(40,1,−62).
- Pedestrian cluster (idlers): old-town plaza (−480,−520)±35, cam (−455,5,−485)→(−480,1.2,−520); campus cluster (40,−200)±45.
- Lawn overlays (3 stripe/mottle variants): school field cam (−450,16,470)→(−512,0,545) shows mottle; campus quad cam (40,22,−160)→(40,0,−200).
- Dusk headlight glows: any moving/parked car on Main St, e.g. (55,4,−24)→(95,1.2,−48).

## Devin secrets needed
None — fully local static app.
