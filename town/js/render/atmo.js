// atmo.js — sprint-02 atmosphere: cumulus billboards, height haze + aerial
// perspective, dusk lamp pools/halos. Render-side only — touches no B files.
// All content here is additive onto B's scene objects (same precedent as the
// sprint-01 cloud-tint traversal): sprite objects stay B's so tickWorld drift
// is preserved; lamp pools derive from lampIM instance matrices.
import * as THREE from 'three';
import { R, rr, makeCanvas, canvasTex } from '../lib.js';
import { ROADS } from '../layout.js';

/* ================= cumulus billboard textures =================
   Multi-lobe clusters painted on canvas: core + shoulder puffs with shaded
   undersides and eroded edges — no radial-gradient discs, no circles. */
function puff(x, cx, cy, r, a) {
  // hard core + tight falloff: soft-gradient lobes leave visible rims even
  // after the merge-blur; a dense core fuses lobes into one mass
  const g = x.createRadialGradient(cx, cy, r * .1, cx, cy, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(.82, `rgba(250,252,254,${a * .92})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
}

// variants differ in silhouette family: tower, wide-anvil, ragged, low-flat
export function cumulusTexture(variant = 0) {
  const W = 512, H = 256;
  const [c, x] = makeCanvas(W, H);
  const baseY = H * rr(.66, .74);          // flat-ish underside line
  const cx = W * .5;
  // shared core mass — a wide low-alpha body under the lobes so the union
  // reads as ONE cloud with lumpy edges, not stacked soap bubbles
  const coreW = [200, 330, 300, 300][variant] || 280;
  const core = x.createRadialGradient(cx, baseY - 30, 10, cx, baseY - 20, coreW);
  core.addColorStop(0, 'rgba(255,255,255,.62)');
  core.addColorStop(.7, 'rgba(252,253,255,.4)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = core;
  x.beginPath();
  x.ellipse(cx, baseY - 25, coreW, coreW * .42, 0, 0, 7);
  x.fill();
  if (variant === 0) {                      // towering cumulus — tall cluster
    const puffs = [[0, 0, 88], [-58, 14, 62], [55, 18, 58], [-20, -62, 55],
                   [30, -48, 48], [-78, -18, 40], [72, -10, 38], [8, -95, 34]];
    for (const [px, py, pr] of puffs) puff(x, cx + px * rr(.8, 1.15), baseY + py * rr(.85, 1.1), pr * rr(.85, 1.1), .85);
  } else if (variant === 1) {               // wide anvil spread
    const puffs = [[-150, 8, 66], [-88, -14, 74], [-18, -24, 80], [60, -16, 70],
                   [140, 4, 58], [-190, 20, 44], [195, 22, 42], [15, 10, 72]];
    for (const [px, py, pr] of puffs) puff(x, cx + px * rr(.85, 1.1), baseY + py * rr(.9, 1.1), pr * rr(.85, 1.1), .8);
  } else if (variant === 2) {               // ragged strato-clump
    for (let i = 0; i < 14; i++)
      puff(x, cx + rr(-200, 200), baseY + rr(-40, 6) - Math.abs(rr(-1, 1)) * 30,
           rr(26, 58), rr(.5, .8));
  } else {                                  // low flat fair-weather mass
    const puffs = [[-120, 4, 60], [-50, -14, 66], [25, -20, 70], [105, -6, 60],
                   [170, 10, 44], [-170, 14, 40]];
    for (const [px, py, pr] of puffs) puff(x, cx + px * rr(.85, 1.05), baseY + py, pr * rr(.8, 1), .75);
  }
  // erode BEFORE the merge-blur — alpha-aware bites into the silhouette rim
  // band (4%-60% alpha) soften into scallops after the blur pass instead of
  // reading as disc rims; interior and fully-outside samples are skipped
  {
    const px = x.getImageData(0, 0, W, H).data;
    const rimAlpha = (ax, ay) =>
      px[((Math.min(H - 1, Math.max(0, ay | 0))) * W +
          Math.min(W - 1, Math.max(0, ax | 0))) * 4 + 3] / 255;
    x.globalCompositeOperation = 'destination-out';
    let bites = 0;
    for (let i = 0; i < 500 && bites < 60; i++) {
      const ex = R() * W, ey = baseY + (R() - .5) * H * .6;
      if (ey > baseY + 8) continue;         // never erode below the base line
      const a = rimAlpha(ex, ey);
      if (a < .04 || a > .6) continue;      // rim band only
      x.beginPath(); x.arc(ex, ey, rr(4, 15), 0, 7);
      x.fillStyle = `rgba(0,0,0,${rr(.18, .55)})`; x.fill();
      bites++;
    }
    x.globalCompositeOperation = 'source-over';
  }
  // blur-merge: fuse the discrete puff lobes into one continuous mass —
  // unblurred, each lobe's gradient edge reads as a cauliflower ring
  const [cb, xb] = makeCanvas(W, H);
  xb.filter = 'blur(9px)';
  xb.drawImage(c, 0, 0);
  x.clearRect(0, 0, W, H);
  x.drawImage(cb, 0, 0);
  // shaded underside — darker toward the base line, keeps cumulus volume
  x.globalCompositeOperation = 'source-atop';
  const u = x.createLinearGradient(0, baseY - H * .34, 0, H);
  u.addColorStop(0, 'rgba(255,255,255,0)');
  u.addColorStop(.55, 'rgba(190,198,210,.28)');
  u.addColorStop(1, 'rgba(120,132,150,.55)');
  x.fillStyle = u; x.fillRect(0, 0, W, H);
  // top rim light — sun catches crown puffs
  const t = x.createLinearGradient(0, 0, 0, baseY);
  t.addColorStop(0, 'rgba(255,255,255,.35)');
  t.addColorStop(.5, 'rgba(255,255,255,0)');
  x.fillStyle = t; x.fillRect(0, 0, W, H);
  // edge vignette — alpha must reach 0 inside ~92% of the canvas or the
  // billboard clips into an axis-aligned rectangle at low camera angles
  x.globalCompositeOperation = 'destination-in';
  x.save();
  x.translate(W / 2, H / 2);
  x.scale(1, .5);                           // rx 92%*W/2, ry 92%*H/2
  const vg = x.createRadialGradient(0, 0, W * .3, 0, 0, W * .46);
  vg.addColorStop(0, 'rgba(0,0,0,1)');
  vg.addColorStop(.78, 'rgba(0,0,0,1)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = vg;
  x.beginPath(); x.arc(0, 0, W * .46, 0, 7); x.fill();
  x.restore();
  x.globalCompositeOperation = 'source-over';
  return canvasTex(c);
}

/* ---- light pool decal (flat warm radial) + halo point sprite texture ---- */
function radialTex(size, inner, outer, stops) {
  const [c, x] = makeCanvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) g.addColorStop(p, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return canvasTex(c);
}

/* ================= fog patch — height haze + aerial perspective =================
   THREE ships FogExp2 distance-only. We patch the shared ShaderChunk strings so
   every fogged material gains (a) a ground-haze band attenuated by fragment
   world-Y, (b) aerial perspective: distance tints toward a baked horizon colour
   and pulls chroma down. Per-time constants are baked in at patch time — TIME is
   fixed per page load, and stock fog uniforms are the only uploadable tunables.
   Materials with fog:false (clouds, pools, halos) skip these chunks entirely —
   the guard clause is automatic. */
const FOGP = {
  day:    { hazeH: 95,  hazeK: .00042, hazeW: .13, airLo: 700, airHi: 2600,
            tint: '0.788,0.847,0.902', desat: .13 },
  golden: { hazeH: 110, hazeK: .00055, hazeW: .34, airLo: 200, airHi: 1400,
            tint: '0.914,0.769,0.608', desat: .15 },
  dusk:   { hazeH: 80,  hazeK: .00070, hazeW: .40, airLo: 160, airHi: 1100,
            tint: '0.333,0.310,0.408', desat: .35 },
  night:  { hazeH: 70,  hazeK: .00055, hazeW: .25, airLo: 250, airHi: 1200,
            tint: '0.055,0.082,0.128', desat: .55 },
};

export function patchFog(TIME) {
  const P = FOGP[TIME] || FOGP.day;
  const f = n => n.toFixed(5);
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`#ifdef USE_FOG
    varying float vFogDepth;
    varying float vFogWY;
  #endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vec4 atmoWP = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      atmoWP = instanceMatrix * atmoWP;
    #endif
    vFogWY = ( modelMatrix * atmoWP ).y;
  #endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying float vFogWY;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    // height haze: extra extinction concentrated at ground level, thinning
    // with fragment world-Y — reads as a haze band hugging the town
    float atmoHaze = exp( -max( vFogWY + 4.0, 0.0 ) / ${f(P.hazeH)} )
                   * ( 1.0 - exp( -vFogDepth * ${f(P.hazeK)} ) ) * ${f(P.hazeW)};
    fogFactor = clamp( fogFactor + atmoHaze, 0.0, 1.0 );
    // aerial perspective: distance shifts toward a horizon tint + desaturates
    float atmoA = smoothstep( ${f(P.airLo)}, ${f(P.airHi)}, vFogDepth );
    vec3 atmoCol = mix( fogColor, vec3(${P.tint}), atmoA );
    float atmoL = dot( atmoCol, vec3( .299, .587, .114 ) );
    atmoCol = mix( atmoCol, vec3( atmoL ), atmoA * ${f(P.desat)} );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, atmoCol, fogFactor );
  #endif`;
  return { hazeH: P.hazeH, hazeK: P.hazeK, hazeW: P.hazeW,
           airLo: P.airLo, airHi: P.airHi, desat: P.desat };
}

/* ================= cloud upgrade =================
   B's buildClouds() sprites keep their objects + tickWorld drift; we swap the
   shared radial-blob map for cumulus variants and parent 2-4 puff children per
   sprite so each formation has silhouette depth. */
export function upgradeClouds(scene, TIME) {
  const variants = [0, 1, 2, 3].map(v => cumulusTexture(v));
  const tint = TIME === 'golden' ? '#e8b489' : TIME === 'dusk' ? '#5e5578'
    : TIME === 'night' ? '#1c2838' : '#ffffff';
  const opMul = TIME === 'golden' ? .66 : TIME === 'dusk' ? .14
    : TIME === 'night' ? .3 : .88;
  const scMul = TIME === 'dusk' ? 1.05 : 1.9;  // dusk: dark masses read huge — keep near stock size
  let sprites = 0, vi = 0;
  scene.traverse(o => {
    if (!o.isSprite || o.userData.atmoPuff) return;
    o.userData.atmoPuff = true;               // never re-upgrade / never self-hit
    if (o.userData.cirrus) {                  // high ice deck stays a thin streak
      o.material.color.set(tint);             // still TIME-tinted + unfogged,
      o.material.fog = false;                 // but no map swap / puffs / rescale,
      o.material.needsUpdate = true;          // and no rr/R draws consumed
      return;
    }
    const m = o.material;
    m.map = variants[vi++ % variants.length];
    m.color.set(tint);
    m.opacity = Math.min(1, m.opacity * opMul * rr(.85, 1.0));
    m.fog = false;                            // guard clause — clouds unfogged
    m.rotation = rr(-.07, .07);
    m.needsUpdate = true;
    o.scale.x *= scMul; o.scale.y *= scMul * .71;  // formation scale, wide silhouette
    sprites++;
    const kids = TIME === 'dusk' ? 1 + (sprites % 2)
                                 : sprites % 3;         // 0-2 day/golden — broken cumulus, not overcast
    for (let i = 0; i < kids; i++) {
      const cm = new THREE.SpriteMaterial({
        map: variants[Math.floor(R() * variants.length)],
        transparent: true, depthWrite: false, fog: false,
        opacity: m.opacity * rr(.5, .8),
      });
      cm.color.set(tint);
      cm.rotation = rr(-.15, .15);
      const ch = new THREE.Sprite(cm);
      ch.userData.atmoPuff = true;
      // parent scale (s, .38s, 1) multiplies child local space — compensate
      // child Y so the sub-puff keeps roughly its texture aspect
      const k = rr(.35, .62);
      ch.scale.set(k, k * 1.4, 1);
      ch.position.set(rr(-.42, .42), rr(-.5, .55), rr(-60, 60));
      o.add(ch);
      sprites++;
    }
  });
  return { sprites, variants: variants.length };
}

/* ================= dusk lamp pools + halos =================
   Lamp heads live at local (-2.3, 7.35, 0) inside each lampIM instance.
   Decompose instance matrices (robust to B's placement convention), project the
   head offset to world, drop a flat depth-tested glow decal on the ground and a
   billboard point halo at the head. Two draw calls total, dusk-only. */
/* Lamp head world positions. Preferred source: lampIM instance matrices
   (auto-follows if B repopulates it). Fallback when lampIM is empty: recompute
   from ROADS using B's placement rule — arterial || w>=11, step 42, alternating
   side at pole base w/2+1.6, arm reaching 2.3m toward road centre. Heads land
   over the curb lane so pools sit on asphalt; a mid-build occupancy rework
   (streetPad inside registerOccupancy) currently zeroes B's lampIM — render-side
   synthesis keeps the dusk night-look independent of that. */
function lampHeadPositions(lampIM) {
  const heads = [];
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(),
        q = new THREE.Quaternion(), s = new THREE.Vector3(),
        head = new THREE.Vector3();
  if (lampIM && lampIM.count > 0) {
    for (let i = 0; i < lampIM.count; i++) {
      lampIM.getMatrixAt(i, m);
      m.decompose(pos, q, s);
      head.set(-2.3 * s.x, 7.35 * s.y, 0).applyQuaternion(q).add(pos);
      heads.push(head.clone());
    }
    return heads;
  }
  for (const r of ROADS.filter(r => r.arterial || r.w >= 11)) {
    const step = 42;
    for (let a = r.a0 + 16; a < r.a1 - 16; a += step) {
      const sg = (Math.floor(a / step) % 2) ? 1 : -1;
      // pole base sits at w/2+1.6 (sidewalk edge); the 2.3m arm reaches toward
      // the centreline so the head hangs ~0.7m inside the road edge — pools
      // land on asphalt, not on the walk or into parked cars
      const headOff = sg * (r.w / 2 - .7);
      heads.push(new THREE.Vector3(
        r.axis === 'v' ? r.c + headOff : a, 7.35,
        r.axis === 'v' ? a : r.c + headOff));
    }
  }
  return heads;
}

export function buildLampGlows(scene, lampIM) {
  const heads = lampHeadPositions(lampIM);
  if (!heads.length) return { pools: 0, halos: 0 };
  const pools = heads.map(h => ({ x: h.x, y: .22, z: h.z }));
  const haloPos = [];
  for (const h of heads) haloPos.push(h.x, 7.5, h.z);
  // flat ground decals — NOT billboarded: must sit on the road surface
  const poolTex = radialTex(128, 0, 64, [
    [0, 'rgba(255,214,150,.85)'], [.35, 'rgba(255,190,120,.38)'],
    [.7, 'rgba(255,170,90,.12)'], [1, 'rgba(255,160,80,0)']]);
  const poolGeo = new THREE.PlaneGeometry(11, 11);
  poolGeo.rotateX(-Math.PI / 2);
  const poolM = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolIM = new THREE.InstancedMesh(poolGeo, poolM, pools.length);
  const pm = new THREE.Matrix4();
  pools.forEach((p, i) => { pm.makeTranslation(p.x, p.y, p.z); poolIM.setMatrixAt(i, pm); });
  poolIM.instanceMatrix.needsUpdate = true;
  poolIM.renderOrder = 4;
  scene.add(poolIM);
  // lamp head halos — one Points draw for all
  const haloTex = radialTex(64, 0, 32, [
    [0, 'rgba(255,224,170,1)'], [.3, 'rgba(255,205,140,.55)'],
    [1, 'rgba(255,190,110,0)']]);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3));
  const hm = new THREE.PointsMaterial({
    map: haloTex, size: 3.2, sizeAttenuation: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    opacity: .3 });   // tight glow — 200+ points must read as pinpoints at range
  const haloPts = new THREE.Points(hg, hm);
  haloPts.renderOrder = 5;
  scene.add(haloPts);
  return { pools: pools.length, halos: pools.length };
}

/* ================= orchestrator ================= */
export function installAtmo(scene, { lampIM = null, TIME = 'day', fogPatch = true } = {}) {
  const info = { fog: { type: 'exp2+height+aerial' }, clouds: null,
                 lampPools: 0, lampHalos: 0 };
  if (fogPatch) info.fog = { type: 'exp2+height+aerial', ...patchFog(TIME) };
  else info.fog = { type: 'exp2-stock' };
  info.clouds = upgradeClouds(scene, TIME);
  if ((TIME === 'dusk' || TIME === 'night') && lampIM) {
    const g = buildLampGlows(scene, lampIM);
    info.lampPools = g.pools; info.lampHalos = g.halos;
  }
  return info;
}
