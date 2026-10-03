// main.js — Havenbrook 3D town: procedural sky, cinematic post fx, fly-spectator controls
import * as THREE from 'three';
import { createPipeline } from './render/pipeline.js';
import { pickTier, TIER_CFG, noteContextLost } from './render/perf.js';
import { loadEnvironment } from './render/env.js';
import { installAtmo } from './render/atmo.js';
import { upgradeGlassMaterials, glassProbe } from './render/glass.js';
import { createOccluderCull, OCCLUDER_CULL } from './render/cull.js';
import { TOWN, BUILDINGS, APARTMENTS, HOUSE_BLOCKS, COTTAGE_ROWS, PLAZA,
         CATEGORY_COLORS, FILLER, ROADS } from './layout.js';
import { makeBuilding } from './buildings.js';
import { registerOccupancy, buildRoads, buildLots, buildTrees, buildCars,
         buildLights, buildWater, buildPark, buildPlaza, buildPeople,
         buildProps, occupyRect, isFree, buildAthleticPark, buildTraffic,
         buildFerrisWheel, buildWindmill, buildCrane, buildFireflies, buildTennisCourts, buildBalloons,
         buildRain,
         buildCountryside, buildFences, buildClouds, buildBirds, buildMountains,
         buildContactShadows, tickWorld } from './details.js';
import { grassTexture, mat, plane, cyl, R, rr, pick, skyTexture, mergeStatic, splitInstanced,
         groundOverlayTexture, detailNoiseTexture, attachDriftShadow, lift, uTime, WATERFX, RUNENV,
         DETAIL } from './lib.js';
import { M_GRASS, pbr, texReport } from './mats.js';
import { buildFurniture } from './city/furniture.js';
import { buildGroundDetail } from './city/ground.js';
import { buildBacklots } from './city/backlots.js';
import { installUI } from './ui.js';
import { installInterior } from './interior.js';

const params = new URLSearchParams(location.search);
const VIEW = params.get('view') || 'aerial';
window.__mapOn = VIEW === 'map';   // early: installUI() reads it before orthoCam exists
const TIME = params.get('time') || 'day';
const LABELS = params.get('labels') === '1';
const NOFX = params.get('nofx') === '1';
const NOAO = params.get('noao') === '1';
const NOATMO = params.get('noatmo') === '1';  // master: fog patch + clouds + lamp glows
const NOFOG = params.get('nofog') === '1';   // granular: fog patch only
const WEATHER = params.get('weather');       // 'rain' = overcast + streaks + wet pavement
const RAIN = WEATHER === 'rain';
const NOWATERFX = params.has('nowaterfx');   // sprint-03: stock water material
const NOGLASSFX = params.has('noglassfx');   // sprint-03: stock glass materials
const NOCULL = params.has('nocull');         // sprint-03: disable occluder cull
const FREEZEQ = params.has('freeze');        // B-side determinism pin
const DEBUG = params.get('debug') === '1';
const FPSDBG = params.get('fps') === '1';
const CAMP = params.get('cam');   // ?cam=px,py,pz,tx,ty,tz — deterministic eval camera
const CAM_BOUND = 760;    // fly-cam stays inside the mountain ring (world-scaled)

/* ---------- quality tier (render/perf.js) ---------- */
const TIER = pickTier(params);            // auto HIGH on capable GPUs — full fidelity
const TC = TIER_CFG[TIER];
/* MIN tier thins scattered instanced content via the shared knob (lib.js) —
   must be set before any builder runs below */
DETAIL.f = TC.detail ?? 1;
const MIN = TIER === 'min';
const ULTRA = TIER === 'ultra';
/* chunked map loading: min/low/med distance-cull whole cells;
   high + ultra always keep every chunk */
const CULL = TIER === 'min' || TIER === 'low' || TIER === 'med';
const CULL_BASE = { min: 190, low: 230, med: 330 };   // street-level radii (world-scaled)

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false,
  // preserveDrawingBuffer costs a full-res copy every frame — only eval
  // probes (freeze/still/cam/determinism shots) need readPixels access
  preserveDrawingBuffer: FREEZEQ || params.has('still') || DEBUG || FPSDBG || !!CAMP,
  powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
const MAX_RATIO = Math.min(devicePixelRatio, TC.maxRatio);
let pixelRatio = MAX_RATIO;
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = TC.shadow > 0;   // MIN: no shadow pass at all
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = TIME === 'golden' ? 1.05 : TIME === 'day' ? 1.06 : 1.0;
document.getElementById('app').appendChild(renderer.domElement);
// survive GPU OOM context loss on weak iGPUs — count the loss so the next
// boot drops a tier instead of crash-looping on the same settings
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); noteContextLost(); });
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

const scene = new THREE.Scene();

/* ---------- sun + sky (procedural — no HDR fetch, no NaN bloom artifacts) ---------- */
const sunDir = new THREE.Vector3();
if (TIME === 'golden') sunDir.set(-1500, 210, 700);
else if (TIME === 'dusk') sunDir.set(-1200, 120, 500);
else if (TIME === 'night') sunDir.set(-500, 1100, -350);   // high moon, cool
else sunDir.set(900, 590, 640);
sunDir.normalize();

const pmrem = new THREE.PMREMGenerator(renderer);
const skyTex = skyTexture({
  mode: TIME,
  sunAz: Math.atan2(sunDir.z, sunDir.x),
  sunEl: Math.asin(sunDir.y),
});
scene.background = skyTex;
scene.backgroundIntensity = (TIME === 'golden' ? 1.0 : TIME === 'night' ? .9 : 0.95) * (RAIN ? .55 : 1);
scene.environment = pmrem.fromEquirectangular(skyTex).texture;
scene.environmentIntensity = TIME === 'golden' ? .9 : .8;  // r160: dead property; real gain is envScale below
// HDR image-based lighting — vendored Poly Haven sky feeds PBR reflections.
// Background stays procedural so the visible sun matches the directional light.
const envInfo = { envType: 'fallback', envSrc: 'procedural-sky',
                  envIntensity: TIME === 'golden' ? .9 : TIME === 'dusk' ? .6 : .8 };
loadEnvironment(renderer, { mode: TIME, skyTex }).then(e => {
  if (e.envType === 'hdr') scene.environment = e.texture;
  envInfo.envType = e.envType; envInfo.envSrc = e.envSrc;
  envInfo.envIntensity = e.envIntensity;
  if (window.__fx) { window.__fx.envType = e.envType; window.__fx.envSrc = e.envSrc;
                     window.__fx.envIntensity = e.envIntensity; }
});
// per-time env gain applied to materials post-build (r160 has no
// scene.environmentIntensity — multiply envMapIntensity instead)
const envScale = (TIME === 'night' ? .22 : TIME === 'dusk' ? .5 : TIME === 'golden' ? 1.15 : 1.0) * (RAIN ? .5 : 1);
/* fog density scaled up with the world-scale-down (horizon is ~38% closer
   now) so the aerial haze reads the same relative to the town */
scene.fog = new THREE.FogExp2(
  TIME === 'golden' ? 0xd8b490 : TIME === 'dusk' ? 0x4a4258
    : TIME === 'night' ? 0x0b111c : 0xd4e2ec,
  TIME === 'dusk' ? 0.00052 : TIME === 'night' ? 0.00035 : 0.00027);

/* ---------- sun + fill ---------- */
const sun = new THREE.DirectionalLight(RAIN ? 0xc8d4de : TIME === 'golden' ? 0xffb268 : TIME === 'dusk' ? 0xff9a6a
    : TIME === 'night' ? 0x9fb8e0 : 0xffe9c4,
  (TIME === 'golden' ? 3.4 : TIME === 'dusk' ? 1.8 : TIME === 'night' ? .55 : 3.15) * (RAIN ? .38 : 1));
sun.position.copy(sunDir).multiplyScalar(1800);
sun.castShadow = true;
if (TC.shadow) sun.shadow.mapSize.set(TC.shadow, TC.shadow);
sun.shadow.camera.left = -580; sun.shadow.camera.right = 580;
sun.shadow.camera.top = 580; sun.shadow.camera.bottom = -580;
sun.shadow.camera.near = 200; sun.shadow.camera.far = 3600;
sun.shadow.bias = -0.00018; sun.shadow.normalBias = .35;
scene.add(sun); scene.add(sun.target);
// hemisphere fill lifts shadows gently toward sky color
scene.add(new THREE.HemisphereLight(
  TIME === 'golden' ? 0xd8b088 : TIME === 'night' ? 0x18243a : 0xbdd6e8,
  TIME === 'golden' ? 0x7a6848 : TIME === 'night' ? 0x05070a : 0x5d7050,
  TIME === 'night' ? .22 : TIME === 'dusk' ? .6 : TIME === 'golden' ? .64 : .40));

/* ---------- world scale — every town object lives under `world` ----------
   The town is authored in layout coords (±840m), then uniformly scaled down
   by WS so the whole footprint shrinks on every tier. Cameras, labels, cull
   radii and the shadow box scale to match. Interiors stage under `scene`
   directly and stay full-size. */
const WS = .62;
const world = new THREE.Group();
world.name = 'world';
scene.add(world);

/* ---------- ground ---------- */
/* keyed color → own pbr() cache instance; shared instances mutated post-hoc
   all ended up wearing the last writer's tint (every lawn read identical) */
const groundM = pbr('grass_ground', { color: '#9db27e' });
/* micro-detail multiply — the vendored grass tex repeats every 60m, so at eye
   level it reads flat; a luminance noise layer on a fixed 28m world tile
   restores close-range texture without adding a draw call */
const grassDetail = sh => {
  sh.uniforms.uDetail = { value: detailNoiseTexture() };
  /* sample the detail texture in WORLD xz (one tile = 28 m) so every
     grass_ground surface gets the same texel density — UV-based sampling let
     small lawn planes (tile=9) alias it into plaid moiré */
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 detailWP = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        detailWP = instanceMatrix * detailWP;
      #endif
      vWXZ = ( modelMatrix * detailWP ).xz;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vWXZ;')
    .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= texture2D(uDetail, vWXZ / 28.0).rgb;`);
};
groundM.onBeforeCompile = grassDetail;
attachDriftShadow(groundM, .0015, .0009, .22);  // ~660m cloud shadow field
world.add(plane(20000, 20000, groundM, 0, 0, 0, -Math.PI / 2, 60));
// large-scale blotch overlay so the lawn never reads as flat tiling
const ovM = new THREE.MeshStandardMaterial({ map: groundOverlayTexture(), transparent: true,
  roughness: 1, depthWrite: false });
const ov = plane(3400, 3400, ovM, 0, .14, 0, -Math.PI / 2, 0);
ov.userData.noMerge = true;
world.add(ov);

/* ---------- occupancy then build ---------- */
const _tb = performance.now();
registerOccupancy();
buildRoads(world);
buildLots(world);
buildWater(world);
buildPark(world);
buildFerrisWheel(world);
buildWindmill(world);
buildCrane(world); buildTennisCourts(world);
if (!MIN) buildBalloons(world);             // sky decor — dropped on MIN
if (TIME === 'night' && !MIN) buildFireflies(world);
buildAthleticPark(world);
buildPlaza(world, PLAZA);
buildProps(world);
buildContactShadows(world);

for (const b of BUILDINGS) if (b.w) world.add(makeBuilding(b));
for (const f of FILLER) { world.add(makeBuilding({ name: '', ...f })); occupyRect(f.x, f.z, f.w, f.d, 4); }
for (const a of APARTMENTS) world.add(makeBuilding({ ...a, type: 'apartment' }));

for (const blk of HOUSE_BLOCKS) {
  const W = blk.x1 - blk.x0, D = blk.z1 - blk.z0;
  const typeFor = () => blk.duplex ? 'duplex' : (R() < .24 ? 'ranch' : 'house');
  // occupancy mirrors the real footprint (body + garage wing + porch + driveway)
  // so scattered trees/bushes never land on a driveway or inside a garage
  const occupy = (t, x, z, sgn) => {
    if (t === 'duplex') occupyRect(x, z + sgn, 19, 15, 2);
    else if (t === 'ranch') occupyRect(x + sgn * 4, z + sgn * 3, 28, 20, 2);
    else occupyRect(x + sgn * 2, z + sgn * 3, 22, 20, 2);
  };
  if (blk.face === 'v') {
    for (let i = 0; i < blk.count; i++) {
      const z = blk.z0 + (i + .5) * D / blk.count;
      const spec = { type: typeFor(), x: blk.x1 - 12, z, rot: Math.PI / 2 };
      world.add(makeBuilding(spec));
      // rot π/2: front & driveway face +x, garage wing extends -z
      if (spec.type === 'ranch') occupyRect(spec.x + 3.5, z - 4, 20, 28, 2);
      else occupyRect(spec.x + 3.5, z - 2.5, 20, 20, 2);
    }
  } else {
    const twoRows = D > 80, rows = twoRows ? 2 : 1;
    for (let rI = 0; rI < rows; rI++) {
      const n = Math.ceil(blk.count / rows);
      const z = twoRows ? (rI === 0 ? blk.z0 + 13 : blk.z1 - 13) : blk.z1 - 13;
      const rot = twoRows ? (rI === 0 ? Math.PI : 0) : 0;
      const sgn = rot ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const x = blk.x0 + 14 + i * (W - 28) / Math.max(1, n - 1);
        if (!isFree(x, z, 8)) continue;
        const t = typeFor();
        world.add(makeBuilding({ type: t, x, z, rot }));
        occupy(t, x, z, sgn);
      }
    }
  }
}
for (const row of COTTAGE_ROWS) {
  const W = row.x1 - row.x0;
  const sgn = row.face === 'n' ? -1 : 1;
  for (let i = 0; i < row.count; i++) {
    const x = row.x0 + 12 + i * (W - 24) / Math.max(1, row.count - 1);
    world.add(makeBuilding({ type: 'cottage', x, z: row.z, rot: row.face === 'n' ? Math.PI : 0 }));
    occupyRect(x + sgn * 2, row.z + sgn * 3, 22, 20, 2);
  }
}

const lampIM = buildLights(world);
if (TIME === 'golden' || TIME === 'dusk' || TIME === 'night')
  lampIM.material.emissive = new THREE.Color('#ffdf9e'),
  lampIM.material.emissiveIntensity = TIME === 'night' ? 1.9 : 1.4;
buildTrees(world);
buildCars(world);
/* MIN: no moving traffic or pedestrians — parked cars remain as static
   set-dressing (merged cells), tickWorld null-guards the absent systems */
if (!MIN) { buildTraffic(world); buildPeople(world); }
buildFences(world);
buildCountryside(world);
buildMountains(world);
// subagent passes: street furniture + ground cover run last so isFree()
// sees the full occupancy map
buildFurniture(world);
buildGroundDetail(world);
buildBacklots(world);
if (VIEW !== 'map') { buildClouds(world); buildBirds(world); }
if (VIEW !== 'map' && RAIN) buildRain(world);   // ?weather=rain
// sprint-02 atmo module: cumulus billboards, height-haze + aerial fog patch,
// dusk lamp pools/halos — all render-side over B's objects (js/render/atmo.js)
let atmoInfo = null;
if (VIEW !== 'map' && !NOATMO)
  atmoInfo = installAtmo(world, { lampIM, TIME, fogPatch: !NOFOG });
// ?noatmo fallback — sprint-01 behaviour: tint the unlit orb sprites into the
// sky palette (kept for evaluator A/B pairs)
else if (VIEW !== 'map' && TIME !== 'day') world.traverse(o => {
  if (!o.isSprite) return;
  o.material.color.set(TIME === 'golden' ? '#d8a37e' : TIME === 'night' ? '#2a3444' : '#6e5a74');
  o.material.opacity *= TIME === 'golden' ? .78 : TIME === 'night' ? .5 : .65;
});
// sprint-03: glass/reflections v2 — upgrades cached facade materials built from
// A-owned glassFacadeMaps textures; B's wallMat()/buildings stay untouched
const glassInfo = VIEW !== 'map' && !NOGLASSFX ? upgradeGlassMaterials(scene, TIME) : null;
// sprint-03: near-camera transient occluder cull — post-tickWorld pass in tick()
const occluderCull = VIEW !== 'map' && !NOCULL ? createOccluderCull(scene) : null;
// water body count for __fx.water (materials tagged by the v2 factory)
let waterBodies = 0;
scene.traverse(o => {
  const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
  for (const mm of mats) if (mm.userData && mm.userData.waterV2) waterBodies++;
});
(window.__prof ||= []).push(['buildWorld', Math.round(performance.now() - _tb)]);

/* campus quad — sized to sit clear of the med hall & the campus lot */
const quadM = pbr('grass_ground', { color: '#93b377' });
quadM.onBeforeCompile = grassDetail;               // same world-noise detail
attachDriftShadow(quadM, .0015, .0009, .22);        // and the same cloud field
lift(quadM, 1);
world.add(plane(190, 84, quadM, 40, .31, -200, -Math.PI / 2, 10));
const qp = lift(pbr('precast_stone_paving', { color: '#c4b49a' }), 5);
for (const a of [.62, -.62]) {
  const g = new THREE.PlaneGeometry(6, 170); g.rotateX(-Math.PI / 2); g.rotateY(a);
  const p = new THREE.Mesh(g, qp); p.position.set(40, .33, -202); p.receiveShadow = true;
  world.add(p);
}
world.add(plane(190, 6, qp, 40, .33, -202, -Math.PI / 2, 3));
world.add(cyl(4, 4.4, .9, mat('#9aa0a3'), 40, .3, -202, 20));

/* collapse all static geometry into one mesh per material per cell —
   street views frustum-cull far cells, and MIN distance-culls whole cells.
   MIN uses 160m cells (finer radius granularity); other tiers use 320m. */
const _tm = performance.now();
const CHUNK = MIN ? 160 : 320;
const MERGED = mergeStatic(world, { chunk: CHUNK });
/* every chunk-cullable object: merged cells on all tiers; on MIN the big
   static instanced scatter (trees/grass/litter/furniture) is also rebucketed
   into cells so it drops out with distance like the merged geometry */
const CHUNKS = [...MERGED.children];
if (CULL) {
  const tagged = [];
  scene.traverse(o => { if (o.isInstancedMesh && o.userData.staticInst) tagged.push(o); });
  for (const im of tagged) {
    const grp = splitInstanced(im, CHUNK);
    grp.position.copy(im.position); grp.quaternion.copy(im.quaternion);
    grp.scale.copy(im.scale); grp.matrixAutoUpdate = im.matrixAutoUpdate;
    im.parent.add(grp); im.parent.remove(im);
    CHUNKS.push(...grp.children);
  }
  (window.__prof ||= []).push(['chunkSplit', tagged.length]);
}

/* shrink the whole town — world.scale applies to every child uniformly.
   Cull bounds (userData.cb) were baked in layout coords during merge /
   splitInstanced, so rescale them into world space for the culler. */
world.scale.setScalar(WS);
for (const m of CHUNKS) {
  const b = m.userData.cb;
  if (b) { b.x0 *= WS; b.x1 *= WS; b.z0 *= WS; b.z1 *= WS; }
}

/* presentation layer — budget tracker, facility directory, info cards, tour
   (independent of ?labels: the directory/cards work either way) */
installUI();
document.getElementById('uiTier').textContent = 'PERF ' + TIER.toUpperCase();
(window.__prof ||= []).push(['mergeStatic', Math.round(performance.now() - _tm)]);

/* lit windows + material-upgrade pass on the shared cached materials:
   - userData.lit → emissiveIntensity follows time of day
   - map.userData.v2 → attach roughness/normal maps + glass env boost (facade v2)
   - envScale → real per-time env gain (scene.environmentIntensity is r163+) */
const matStats = { withNormal: 0, withRough: 0 };
{
  const litI = TIME === 'night' ? 2.4 : TIME === 'dusk' ? 1.7 : TIME === 'golden' ? .95 : .12;
  RUNENV.envScale = envScale; RUNENV.litI = litI;
  const seen = new Set();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (m.userData && m.userData.lit) m.emissiveIntensity = litI;
      const v2 = m.map && m.map.userData && m.map.userData.v2;
      if (v2) {
        if (v2.normal && !m.normalMap) { m.normalMap = v2.normal; m.normalScale.set(.85, .85); }
        if (v2.rough && !m.roughnessMap) { m.roughnessMap = v2.rough; }
        // normalMap supersedes the bump map — dropping it keeps the 512px
        // bump canvas off the GPU entirely on the eval iGPU
        if (v2.bump && m.bumpMap === v2.bump) m.bumpMap = null;
        m.needsUpdate = true;
      }
      // count by actual material state — v2 upgrade AND natively-mapped PBR
      if (m.normalMap) matStats.withNormal++;
      if (m.roughnessMap) matStats.withRough++;
      if (m.isMeshStandardMaterial) {
        const envI = (v2 && v2.glass ? 1.7 : (m.envMapIntensity || 1)) * envScale;
        /* matte surfaces (lawns, asphalt, roofs — roughness ≥ .8) picked up a
           strong sky reflection at grazing view angles: the ground visibly
           shifted tint by camera tilt. Cap their env gain so they keep their
           baked color from every degree; glass keeps the boosted reflection. */
        m.envMapIntensity = !(v2 && v2.glass) && m.roughness >= .8
          ? Math.min(envI, .5) : envI;
      }
    }
  });
}

/* ---------- cameras + fly controls ---------- */
const asp = innerWidth / innerHeight;
const camera = new THREE.PerspectiveCamera(55, asp, 1, 12000);
const P = {
  aerial:     { p: [540, 620, 660],   t: [-30, 0, -40] },
  aerialW:    { p: [-660, 540, 620],  t: [30, 0, -60] },
  aerialfull: { p: [60, 1250, 640],   t: [0, 0, -20] },
  medical:    { p: [430, 210, -120],  t: [60, 25, -510] },
  campus:     { p: [340, 180, 165],   t: [40, 20, -215] },
  downtown:   { p: [-150, 150, -160], t: [-480, 10, -520] },
  park:       { p: [250, 200, 330],   t: [580, 8, 120] },
  senior:     { p: [740, 210, -60],   t: [560, 12, -520] },
  commercial: { p: [280, 300, 760],   t: [290, 8, 430] },
  school:     { p: [-720, 180, 320],  t: [-510, 10, 560] },
  housing:    { p: [-620, 210, 420],  t: [-440, 8, 120] },
  mainstreet: { p: [-150, 6.5, -34],  t: [140, 8, -60] },
  univclose:  { p: [250, 70, -5],     t: [40, 22, -215] },
  hospital:   { p: [240, 90, -300],   t: [70, 30, -500] },
  dusk:       { p: [820, 200, 260],   t: [-350, 60, 120] },
};
/* camera presets are authored in layout coords — scale with the world so
   every view keeps the same relative framing on the smaller town */
for (const k in P) { P[k].p = P[k].p.map(n => n * WS); P[k].t = P[k].t.map(n => n * WS); }
let orthoCam = null;
if (VIEW === 'map') {
  orthoCam = new THREE.OrthographicCamera(-890, 890, 800, -800, 1, 6000);
  orthoCam.position.set(0, 1500, 0); orthoCam.up.set(0, 0, -1);
  orthoCam.lookAt(0, 0, 0);
}
let activeCam = orthoCam || camera;
if (!orthoCam) {
  const v = P[VIEW] || P.aerial;
  camera.position.set(...v.p);
  camera.lookAt(...v.t);
}

/* fly/spectator controls — drag look + WASD */
const fly = {
  yaw: 0, pitch: -0.5, vel: new THREE.Vector3(), speed: 60,
  keys: {}, dragging: false, lx: 0, ly: 0,
  // skip auto-orbit for street-level views (it would sweep the camera through buildings)
  auto: !orthoCam && !params.get('still') && (P[VIEW] || P.aerial).p[1] > 60,
};
function syncAnglesFromCam() {
  const d = camera.getWorldDirection(new THREE.Vector3());
  fly.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  fly.yaw = Math.atan2(-d.x, -d.z);
}
syncAnglesFromCam();
addEventListener('mousedown', e => { fly.dragging = true; fly.lx = e.clientX; fly.ly = e.clientY; fly.auto = false; camTween.on = false; });
addEventListener('mouseup', () => fly.dragging = false);
addEventListener('mousemove', e => {
  if (!fly.dragging) return;
  fly.yaw -= (e.clientX - fly.lx) * .0032;
  fly.pitch -= (e.clientY - fly.ly) * .0032;
  fly.pitch = Math.max(-1.45, Math.min(1.45, fly.pitch));
  fly.lx = e.clientX; fly.ly = e.clientY;
});
addEventListener('wheel', e => { fly.speed = Math.max(6, Math.min(400, fly.speed * (e.deltaY < 0 ? 1.15 : .87))); });
addEventListener('keydown', e => fly.keys[e.code] = true);
addEventListener('keyup', e => fly.keys[e.code] = false);
addEventListener('dblclick', () => fly.auto = !fly.auto);

/* deterministic eval camera — ?cam=px,py,pz,tx,ty,tz or window.__setCam(...).
   Disables auto-orbit; fly drag/keys still work afterwards. */
function setCam(px, py, pz, tx, ty, tz) {
  if (orthoCam) return;
  camTween.on = false;             // a setCam call wins over an active flight
  camera.position.set(px, py, pz);
  camera.lookAt(tx, ty, tz);
  fly.auto = false;
  syncAnglesFromCam();
}
window.__setCam = setCam;

/* smooth camera flight — used by the tour + facility directory. The tween
   runs inside the render loop so it composes correctly with fly controls:
   while active it owns the camera; on completion the fly yaw/pitch re-sync
   and the user can drag away seamlessly. */
const camTween = { on: false, t0: 0, dur: 1,
  p0: new THREE.Vector3(), t0v: new THREE.Vector3(),
  p1: new THREE.Vector3(), t1: new THREE.Vector3() };
const _lookTgt = new THREE.Vector3();
window.__flyTo = (px, py, pz, tx, ty, tz, dur = 1.7) => {
  if (orthoCam) { orthoCam.position.set(tx, 1500, tz); orthoCam.lookAt(tx, 0, tz); return; }
  fly.auto = false;
  camTween.on = true; camTween.t0 = performance.now(); camTween.dur = Math.max(.2, dur) * 1000;
  camTween.p0.copy(camera.position);
  camera.getWorldDirection(_lookTgt);                     // current look target ≈ pos + dir·k
  camTween.t0v.copy(camera.position).addScaledVector(_lookTgt, Math.max(40, camera.position.distanceTo(new THREE.Vector3(tx, ty, tz)) * .5));
  camTween.p1.set(px, py, pz); camTween.t1.set(tx, ty, tz);
};
function tweenCam(now) {
  const k = Math.min(1, (now - camTween.t0) / camTween.dur);
  const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
  camera.position.lerpVectors(camTween.p0, camTween.p1, e);
  _lookTgt.lerpVectors(camTween.t0v, camTween.t1, e);
  camera.lookAt(_lookTgt);
  if (k >= 1) { camTween.on = false; syncAnglesFromCam(); }
}
window.__flyDone = () => !camTween.on;

/* click-to-enter building interiors — interior.js owns picking, the
   underground stage rooms, walk controls and the info HUD */
const interior = installInterior({ scene, camera, renderer, fly,
  getOrtho: () => orthoCam,
  setActiveCam: c => { activeCam = c; },
  syncAnglesFromCam, camTween });
if (params.get('interior')) interior.byId(params.get('interior'));   // eval/deep-link
if (CAMP && !orthoCam) {
  const v = CAMP.split(',').map(Number);
  if (v.length === 6 && v.every(Number.isFinite)) setCam(...v);
}

/* ---------- labels ---------- */
const labelDivs = [];
if (LABELS) {
  const holder = document.getElementById('labels');
  const mk = (txt, x, y, z, cat, num, minor) => {
    const d = document.createElement('div');
    d.className = 'lbl' + (cat === 'free' ? ' free' : '') + (minor ? ' minor' : '');
    d.innerHTML = `<span class="dot" style="background:${CATEGORY_COLORS[cat] || '#555'}"></span>` +
      (num ? `<span class="num">${num}</span>` : '') + `<span>${txt}</span>`;
    if (num) { d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; }
    holder.appendChild(d);
    labelDivs.push({ d, p: new THREE.Vector3(x * WS, y * WS, z * WS) });
  };
  for (const b of BUILDINGS) {
    if (b.type === 'zone' || b.type === 'parkzone') { mk(b.name, b.x, 4, b.z, b.cat, b.num); continue; }
    if (b.nolabel) continue;
    mk(b.name, b.x, (b.h || 8) + 8, b.z, b.cat, b.num);
  }
  for (const a of APARTMENTS) mk(a.name, a.x, a.h + 6, a.z, 'res', 0, true);
  const dists = [
    ['UNIVERSITY DISTRICT', 40, -360], ['MEDICAL DISTRICT', 200, -555],
    ['SENIOR DISTRICT', 585, -620], ['DOWNTOWN', -480, -445],
    ['COMMERCIAL CORRIDOR', 160, 555], ['RESIDENTIAL WEST', -460, 40],
    ['SCHOOL DISTRICT', -510, 705],
  ];
  if (VIEW === 'map') {
    for (const [t, x, z] of dists) {
      const d = document.createElement('div');
      d.className = 'lbl dist'; d.textContent = t;
      document.getElementById('labels').appendChild(d);
      labelDivs.push({ d, p: new THREE.Vector3(x * WS, 2 * WS, z * WS), norelax: true });
    }
    for (const r of ROADS) {
      const d = document.createElement('div');
      d.className = 'lbl roadname' + (r.axis === 'v' ? ' vert' : '');
      d.textContent = r.name.toUpperCase();
      document.getElementById('labels').appendChild(d);
      const mx = r.axis === 'v' ? r.c : (r.a0 + r.a1) / 2;
      const mz = r.axis === 'v' ? (r.a0 + r.a1) / 2 : r.c;
      labelDivs.push({ d, p: new THREE.Vector3(mx * WS, 2 * WS, mz * WS), norelax: true });
    }
  }
  const lg = document.getElementById('legend');
  lg.style.display = 'block';
  const counts = { free: 0, health: 0, community: 0 };
  BUILDINGS.forEach(b => { if (b.num) counts[b.cat] = (counts[b.cat] || 0) + 1; });
  lg.innerHTML = `<h3>${TOWN.name} — LEGEND</h3>` +
    `<div class="cat"><span class="dot" style="background:${CATEGORY_COLORS.free}"></span>Provided free (${counts.free})</div>` +
    `<div class="cat"><span class="dot" style="background:${CATEGORY_COLORS.health}"></span>Healthcare facilities (${counts.health})</div>` +
    `<div class="cat"><span class="dot" style="background:${CATEGORY_COLORS.community}"></span>Community locations (${counts.community})</div>` +
    `<div class="cat"><span class="dot" style="background:${CATEGORY_COLORS.res}"></span>Residential &amp; districts</div>`;
  document.getElementById('titlecard').style.display = 'block';
  document.getElementById('compass').style.display = 'block';
}
const v3 = new THREE.Vector3();
let _lblOff = false;
function updateLabels() {
  // interiors render no labels — hide them once and skip the whole pass
  if (interior && interior.on) {
    if (!_lblOff) { for (const it of labelDivs) it.d.style.display = 'none'; _lblOff = true; }
    return;
  }
  _lblOff = false;
  const items = [];
  for (const it of labelDivs) {
    const { d, p } = it;
    v3.copy(p).project(activeCam);
    const behind = v3.z > 1;
    const x = (v3.x * .5 + .5) * innerWidth, y = (-v3.y * .5 + .5) * innerHeight;
    if (behind || x < -100 || x > innerWidth + 100 || y < -60 || y > innerHeight + 60) {
      d.style.display = 'none'; continue;
    }
    // label text never changes — measure each rect lazily once instead of
    // forcing a getBoundingClientRect layout read for every label every frame
    if (!it.w) { const r = d.getBoundingClientRect(); it.w = r.width; it.h = r.height; }
    it.x = x; it.y = y; it.dy = 0;
    d.style.display = 'flex';
    items.push(it);
  }
  const solid = items.filter(i => !i.norelax);
  if (solid[0] && solid[0]._ord === undefined)
    labelDivs.forEach((it, i) => it._ord = i);
  // pure-math relaxation (centred boxes) — deterministic, no DOM feedback
  for (let pass = 0; pass < 14; pass++) {
    let moved = false;
    for (const a of solid) {
      const ay = a.y + a.dy;
      const al = a.x - a.w / 2, ar = a.x + a.w / 2, at = ay - a.h / 2, ab = ay + a.h / 2;
      for (const b of solid) {
        if (a === b) continue;
        const by = b.y + b.dy;
        const ox = Math.min(ar, b.x + b.w / 2) - Math.max(al, b.x - b.w / 2);
        const oy = Math.min(ab, by + b.h / 2) - Math.max(at, by - b.h / 2);
        if (ox > 0 && oy > 0) {
          const push = oy / 2 + 1;
          if (ay < by || (ay === by && a._ord < b._ord)) a.dy -= push;
          else a.dy += push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  for (const it of items) {
    it.d.style.left = it.x + 'px';
    it.d.style.top = (it.norelax ? it.y : it.y + it.dy) + 'px';
  }
}

/* ---------- post processing (js/render/pipeline.js) ---------- */
const MSAAQ = params.get('msaa');    // eval/perf override — default per-tier
const msaaSamples = MSAAQ === null ? TC.msaa : Math.max(0, Math.min(8, +MSAAQ || 0));
const POSTSKIP = params.get('postskip');  // diagnostics: ?postskip=bloom,smaa
const skipSet = POSTSKIP ? new Set(POSTSKIP.split(',')) : new Set();
if (!TC.bloom) skipSet.add('bloom');
if (!TC.smaa) skipSet.add('smaa');
let composer = null, pipe = null;
let aoShed = false, bloomShed = false;   // latched fps fallbacks (see tick)
/* LOW tier renders straight to screen — skips the composer's full-res
   render targets and every fullscreen pass; the cheapest possible path
   for devices where the tab's RAM/GPU budget is the constraint */
const POST = !NOFX && TIER !== 'low' && TIER !== 'min';
if (POST) {
  pipe = createPipeline(renderer, scene, activeCam,
    { time: TIME, ao: !NOAO && TC.ao, pixelRatio, msaa: msaaSamples,
      aoHi: ULTRA, skip: skipSet.size ? skipSet : null });
  composer = pipe.composer;
}

/* ---------- evaluator probe ---------- */
const __fx = {
  tier: TIER,
  get ao() { return !!(pipe && pipe.gtao && pipe.gtao.enabled); },
  aoPresent: !!(pipe && pipe.gtao),     // pass exists in chain even if map-view disables it
  get aoState() { return pipe && pipe.gtao ? (pipe.gtao.enabled ? pipe.gtao._state : 'map-off') : 'off'; },
  msaa: POST ? msaaSamples : 0,
  shadowType: 'PCFSoftShadowMap', shadowMapSize: sun.shadow.mapSize.x,
  bloom: pipe && pipe.bloom ? { threshold: pipe.bloom.threshold, strength: pipe.bloom.strength,
                  radius: pipe.bloom.radius } : null,
  envType: envInfo.envType, envSrc: envInfo.envSrc, envIntensity: envInfo.envIntensity,
  atmo: {
    enabled: !NOATMO && VIEW !== 'map',
    noatmo: NOATMO, nofog: NOFOG,
    fog: atmoInfo ? atmoInfo.fog : { type: 'exp2-stock' },
    fogDensity: scene.fog ? scene.fog.density : 0,
    clouds: atmoInfo ? atmoInfo.clouds : null,
    grade: TIME,
    lampPools: atmoInfo ? atmoInfo.lampPools : 0,
    lampHalos: atmoInfo ? atmoInfo.lampHalos : 0,
  },
  tex: {}, mats: matStats,
  water: {
    enabled: WATERFX, nowaterfx: NOWATERFX, bodies: waterBodies, time: TIME,
    freezePinned: FREEZEQ, rimFade: WATERFX, sunVectorGlint: WATERFX,
  },
  glass: glassProbe(glassInfo, VIEW !== 'map' && !NOGLASSFX, TIME),
  cull: {
    enabled: !!occluderCull, minDist: OCCLUDER_CULL.minDist,
    maxFrac: OCCLUDER_CULL.maxFrac, targets: occluderCull ? occluderCull.state.targets : 0,
    get squashed() { return occluderCull ? occluderCull.state.squashed : 0; },
  },
  // optional determinism nicety: fnv-1a over a strided readPixels sample
  get frameHash() {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let hash = 0x811c9dc5;
    for (let i = 0; i < px.length; i += 997) { hash ^= px[i]; hash = Math.imul(hash, 0x01000193) >>> 0; }
    return hash.toString(16).padStart(8, '0');
  },
  calls: 0, tris: 0, fps: 0,
};
window.__fx = __fx;

/* ---------- adaptive shadow box: follows the camera, snaps to texels ---------- */
const _focus = new THREE.Vector3(), _fwd = new THREE.Vector3();
let shHalf = 700, _shFrame = 0;
const _lastFocus = new THREE.Vector2(1e9, 1e9);
let _lastHalf = 0;
renderer.shadowMap.autoUpdate = false;   // refresh on movement or periodically
renderer.shadowMap.needsUpdate = true;   // first frame must bake
function updateShadow() {
  // interiors: only the sealed stage renders — the 4096 sun map is pure waste
  if (interior && interior.on) return;
  if (++_shFrame % 12 === 0) renderer.shadowMap.needsUpdate = true;  // moving props ~2Hz
  if (orthoCam) return;
  camera.getWorldDirection(_fwd); _fwd.y = 0;
  const fl = _fwd.lengthSq() > .01 ? _fwd.normalize() : _fwd.set(0, 0, -1);
  // focus point on the ground ahead of the camera — but once the box covers
  // the whole town (aerial), tracking is pure waste: pin it at town centre
  /* capture rigs: __lockShadow snaps the box to the whole town once, then
     never touches it again — a per-frame refocus while the camera orbits
     smears the ground dark, and re-rastering the 4096 map doubles cost */
  if (window.__lockShadow) {
    _focus.set(0, 0, 0); shHalf = 900;
    sun.position.copy(_focus).addScaledVector(sunDir, 1800);
    sun.target.position.copy(_focus);
    const sc = sun.shadow.camera;
    if (sc.right !== 900) {
      sc.left = -900; sc.right = 900; sc.top = 900; sc.bottom = -900;
      sc.updateProjectionMatrix();
    }
    return;
  }
  const townWide = shHalf > 640;
  if (townWide) _focus.set(0, 0, 0);
  else {
    const ahead = Math.min(camera.position.y * 1.1, 500);
    _focus.copy(camera.position).addScaledVector(fl, ahead);
    _focus.y = 0;
  }
  // box grows with altitude: crisp up close, still covers the town from above
  const want = THREE.MathUtils.clamp(camera.position.y * 1.05, 130, 900);
  shHalf += (want - shHalf) * .08;
  // snap focus to shadow texels to stop shimmer
  const texel = (shHalf * 2) / sun.shadow.mapSize.x;
  _focus.x = Math.round(_focus.x / texel) * texel;
  _focus.z = Math.round(_focus.z / texel) * texel;
  sun.position.copy(_focus).addScaledVector(sunDir, 1800);
  sun.target.position.copy(_focus);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - shHalf) > 1) {
    sc.left = -shHalf; sc.right = shHalf; sc.top = shHalf; sc.bottom = -shHalf;
    sc.updateProjectionMatrix();
  }
  // rebuild only when the tracked box moved (snapped to texels), and at most
  // every 3rd frame while in motion — a 4096 map on an iGPU is the budget
  const boxMoved = Math.abs(_focus.x - _lastFocus.x) > texel ||
    Math.abs(_focus.z - _lastFocus.y) > texel || Math.abs(shHalf - _lastHalf) > 1;
  if (boxMoved && (townWide || _shFrame % 3 === 0)) {
    renderer.shadowMap.needsUpdate = true;
    _lastFocus.set(_focus.x, _focus.z); _lastHalf = shHalf;
  }
}

/* resize paths MUST repaint in the same task — setPixelRatio/setSize clear
   the canvas, and a compositor paint between the clear and the next tick's
   render would present a black frame (this landed in the __ready window) */
const resync = () => {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(pixelRatio);
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
    if (pipe && pipe.gtao) pipe.gtao.dirty = true;   // RTs realloc'd — rebuild AO, never composite stale
    composer.render(); }
  else renderer.render(scene, activeCam);
};

/* ---------- debug HUD ---------- */
const hud = document.getElementById('hud');
let fpsEMA = 60, frames = 0, lastHud = 0;
let veilGone = false, veilFreeFrames = 0;

/* ---------- loop ---------- */
const clock = new THREE.Clock();
window.__ready = false;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
let lastRatioCheck = 0, callsEMA = 0;
renderer.info.autoReset = false;
/* deck-video mode pauses ALL scene rendering: the loop stays alive (cheap)
   but draws nothing — the 3D work is what makes PRESENT laggy, the video
   plays over a frozen frame instead */
let renderPaused = false;
window.__setPaused = v => {
  if (!!v === renderPaused) return;
  renderPaused = !!v;
  clock.getDelta();          // swallow the paused span so resume doesn't get a huge dt
};
window.__paused = () => renderPaused;
/* eval hook for capture rigs: pin an exact pixel ratio (locks the adaptive
   governor via __lockRatio so it can't drift back) — pipeline + composer
   buffers all resize through resync() */
window.__setRatio = v => { window.__lockRatio = true; pixelRatio = v; resync(); };
/* deterministic capture: __setPaused(true) parks the RAF loop, then __step(n, dt)
   renders exactly n frames at a fixed dt — sim time advances in lockstep with
   video playback so cars, cloud shadows and waves never jump between frames */
let simT = 0;
window.__step = (n = 1, dt = 1 / 60, draw = true) => { for (let k = 0; k < n; k++) frame(dt, draw); };
function frame(dt, draw = true) {
  renderer.info.reset();
  const t = simT;
  simT += dt;
  if (interior && interior.on) {
    interior.tick(dt);
  } else if (!orthoCam) {
    if (fly.auto) {
      const v = P[VIEW] || P.aerial;
      const a = t * .05;
      camera.position.x = v.p[0] * Math.cos(a) - v.p[2] * Math.sin(a);
      camera.position.z = v.p[0] * Math.sin(a) + v.p[2] * Math.cos(a);
      camera.position.y = v.p[1];
      camera.lookAt(...v.t);
      syncAnglesFromCam();
    } else if (camTween.on) {
      tweenCam(performance.now());
    } else {
      const sp = fly.speed * (fly.keys.ShiftLeft || fly.keys.ShiftRight ? 3 : 1);
      fwd.set(-Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), -Math.cos(fly.yaw) * Math.cos(fly.pitch));
      right.set(-Math.sin(fly.yaw - Math.PI / 2), 0, -Math.cos(fly.yaw - Math.PI / 2));
      const mv = new THREE.Vector3();
      if (fly.keys.KeyW || fly.keys.ArrowUp) mv.add(fwd);
      if (fly.keys.KeyS || fly.keys.ArrowDown) mv.sub(fwd);
      if (fly.keys.KeyA || fly.keys.ArrowLeft) mv.sub(right);
      if (fly.keys.KeyD || fly.keys.ArrowRight) mv.add(right);
      if (fly.keys.KeyE || fly.keys.Space) mv.y += 1;
      if (fly.keys.KeyQ || fly.keys.KeyC) mv.y -= 1;
      if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(sp);
      fly.vel.lerp(mv, .12);
      camera.position.addScaledVector(fly.vel, dt);
      camera.position.y = Math.max(2.2, camera.position.y);
      // hard world boundary: stay inside the mountain ring (inner base ~1290)
      const hr = Math.hypot(camera.position.x, camera.position.z);
      if (hr > CAM_BOUND) {
        const k = CAM_BOUND / hr;
        camera.position.x *= k; camera.position.z *= k;
        fly.vel.multiplyScalar(.25);          // bleed off outward momentum
      }
      camera.position.y = Math.min(camera.position.y, 1400);
      camera.quaternion.setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'));
    }
  }
  updateShadow();
  // interiors: the town is hidden — skip its animation + culling work entirely
  const inside = !!(interior && interior.on);
  if (!inside) tickWorld(t, dt);
  if (occluderCull && !inside) occluderCull.tick(activeCam);
  /* min/low/med: distance-cull whole merge cells by their baked bounds.
     Radius grows with altitude so the aerial keeps the town intact while
     a street camera drops most of the static world; high/ultra keep all. */
  if (CULL && (frames % 10) === 0) {
    const r = Math.max(CULL_BASE[TIER] || 300, activeCam.position.y * 3.0), r2 = r * r;
    const px = activeCam.position.x, pz = activeCam.position.z;
    /* bounds-overlap test: each chunk is hidden only when its real baked
       bounds clear the radius — town-spanning geometry never drops out
       under the camera even when its cell centre is far away */
    for (const m of CHUNKS) {
      const b = m.userData.cb;
      const dx = Math.max(b.x0 - px, px - b.x1, 0);
      const dz = Math.max(b.z0 - pz, pz - b.z1, 0);
      m.visible = dx * dx + dz * dz < r2;
    }
  }
  if (draw) {
    if (composer) {
      if (composer.passes[0] && composer.passes[0].camera !== activeCam) {
        composer.passes[0].camera = activeCam;
        if (composer.passes[1] && composer.passes[1].camera) composer.passes[1].camera = activeCam;
      }
      // AO off in the ortho map view — the map is a schematic overlay, and
      // GTAO assumes a perspective projection anyway; aoShed is a persistent
      // low-fps fallback — once shed it stays off (re-enabling would re-add
      // the pass on exactly the GPU that couldn't afford it)
      if (pipe && pipe.gtao) pipe.gtao.enabled = !orthoCam && !aoShed && !inside;
      if (composer._grade) composer._grade.uniforms.uTime.value = t;
      composer.render();
    } else {
      renderer.render(scene, activeCam);
    }
    updateLabels();
  }
  // fps + dynamic resolution
  fpsEMA = fpsEMA * .95 + (1 / Math.max(dt, .001)) * .05;
  callsEMA = callsEMA * .9 + renderer.info.render.calls * .1;
  __fx.calls = renderer.info.render.calls;
  __fx.callsAvg = Math.round(callsEMA);
  __fx.tris = renderer.info.render.triangles;
  __fx.fps = Math.round(fpsEMA * 10) / 10;
  if ((DEBUG || FPSDBG) && hud && t - lastHud > .25) {
    lastHud = t;
    const i = renderer.info.render;
    hud.style.display = 'block';
    hud.textContent = `${fpsEMA.toFixed(0)} fps · ${i.calls} calls · ` +
      `${(i.triangles / 1e6).toFixed(2)}M tris · ratio ${pixelRatio} · ` +
      `${renderer.info.memory.geometries} geo / ${renderer.info.memory.textures} tex`;
  }
  if (t - lastRatioCheck > 2.5 && !window.__lockRatio) {
    lastRatioCheck = t;
    if (fpsEMA < 42 && pixelRatio > .55) {
      pixelRatio = Math.max(.42, pixelRatio - .2); resync();
    } else if (fpsEMA > 57 && pixelRatio < MAX_RATIO) {
      pixelRatio = Math.min(MAX_RATIO, pixelRatio + .25); resync();
    }
    // resolution alone didn't rescue a weak GPU — shed heavy passes next.
    // latched: the per-frame AO write would re-enable it otherwise
    if (fpsEMA < 30 && pixelRatio <= .6) {
      if (pipe && pipe.gtao && pipe.gtao.enabled && !aoShed) { aoShed = true; pipe.gtao.enabled = false; }
      else if (pipe && pipe.bloom && pipe.bloom.enabled && !bloomShed) { bloomShed = true; pipe.bloom.enabled = false; }
    }
  }
  if (++frames === 40) {
    __fx.tex = texReport();
    const lo = document.getElementById('loading');
    // fade the veil, then count frames tick-side: __ready must not flip until
    // real composer frames have PRESENTED with the veil gone — a capture at
    // the flip sees whatever was last composited
    if (lo) { lo.style.opacity = '0';
      setTimeout(() => { lo.remove(); veilGone = true; }, 700); }
    else veilGone = true;
  }
  if (veilGone && !window.__ready && ++veilFreeFrames >= 2)
    window.__ready = true;
}
function tick() {
  requestAnimationFrame(tick);
  if (renderPaused) { frames++; return; }
  frame(Math.min(clock.getDelta(), .05));
}
tick();
addEventListener('resize', () => {
  if (camera.isPerspectiveCamera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  resync();
});
window.__cam = camera; window.__scene = scene; window.__renderer = renderer;
window.__ws = WS;   // ui.js: layout coords → world coords for fly targets
