# Test Plan — MIN-tier chunked merge + distance culling (devin/1790705124-min-chunked-budget)

Branch: devin/1790705124-min-chunked-budget @ C:\Users\Administrator\repos\Digital-Town (HEAD e2e0bb7)
Serve: node town/server.cjs → http://127.0.0.1:8778 (verified 200; serves working tree)
Driver: persistent Chrome 137 @ :9223 (--enable-unsafe-swiftshader), inner 1280×720,
one-shot .verify/step.mjs CDP commands + errwatch3 console/pageerror logger.
Recording: screen recording + annotations.

What changed (from git diff e2e0bb7):
- lib.js: mergeStatic(root,{chunk}) — one mesh per material per cell; chunk meshes get
  userData.ccx/ccz = cell centre. CHUNK=160 on MIN, 320 on all other tiers.
  splitInstanced(im,chunk) rebuckets staticInst InstancedMeshes into per-cell meshes (MIN only).
- main.js: CHUNKS = merged children (+ split instanced on MIN); culler every 10 frames on MIN:
  r = max(300, activeCam.y*3); cell hidden iff (ccx-px)^2+(ccz-pz)^2 >= r^2.
  window.__prof gets ['minSplit', n] only on MIN.
- perf.js: min detail .22 → .12; shadow:0; POST off on min (no composer path).
- #uiTier element reads 'MIN' when ?q=min.

In-page probes:
- chunk meshes: scene.traverse(o => o.userData && o.userData.ccx !== undefined) — collect
  {ccx,ccz,visible,geometry.boundingBox}. Cell spacing = min pairwise |Δccx| → 160 (min) / 320 (high).
- culler invariant: after camera settles ≥1s (≥2 cull passes at ~20fps), for EVERY chunk mesh:
  expected = ((ccx-cam.x)^2+(ccz-cam.z)^2) < (max(300,cam.y*3))^2; assert mesh.visible === expected.
- hole check: for each HIDDEN cell, compute boundingBox min-distance to camera (x,z,y) —
  if any part reaches inside 250m → mid-field hole risk → FAIL.

## Load 1 — ?q=min&view=mainstreet&still=1 (primary)
- __ready ≤420s; uiTier === 'MIN'; __prof contains ['minSplit', n>0]; errors.log empty.
- chunk audit: spacing == 160; total cell count recorded.
- culler invariant at street cam: all cells <300m visible, all ≥300m hidden; visible≪total.
- hole check: no hidden cell geometry inside 250m.
- probe → {calls,tris,fps}; commit claims street <400k tris.
- Shot m1-min-street: near/mid field intact (buildings, road, meters, trees near camera).
- Fly-along pop-in: flyTo forward ~350m down Main St over ~6s; shots mid-flight + at end;
  re-run invariant + hole check at destination. Acceptable: brief edge pop at ~300m
  (culler cadence ~0.5s). FAIL: hole/missing geometry inside ~250m at any stop.

## Load 2 — ?q=min&view=aerial&still=1
- __ready; uiTier MIN. Camera y≈620 → r≈1860 → whole town: assert ALL cells visible.
- Shot m2-min-aerial: entire town renders into mountains.
- __setCam to y≈150 → wait 1s → invariant at r=450: near cells visible, far hidden;
  shot m3-min-mid. Then flyTo back up toward aerial — cell counts re-expand.
- Watch for errors during transitions.

## Load 3 — ?q=high&view=mainstreet&still=1 (regression)
- __ready; uiTier HIGH; __prof has NO 'minSplit' (staticInst split is MIN-only).
- chunk spacing == 320 (all tiers chunk now, but coarse).
- EVERY chunk mesh visible === true (culler never runs on high).
- probe → tris ≈ 1.7M range (vs ~1.74M baseline), shadows visually present.
- Shot m4-high-street — compare composition to known-good high framing.

## Back on min (reuse Load 1 page or quick reload) — interior click
- setcam hospital preset (240,90,-300 → 70,30,-500); clickxy at projected facade.
- __interior.on true, kind 'medical', panel text present → shot m5-min-interior.
- ESC → on false; town re-renders. Note: pose-restore bug from PR #43 may still repro
  (re-entry only — this is a fresh page load so first enter should restore cleanly).

## Evidence
- shots2/m*.png; summary-chunked.json; errwatch3 log must be empty; perf table min vs high.
