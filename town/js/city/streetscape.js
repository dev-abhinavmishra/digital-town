// city/streetscape.js — full road cross-section kit: asphalt ribbon, gutter
// pans, raised 3D curbs (broken at junctions / driveways / curb ramps), grass
// verges, raised sidewalks, tactile-pad curb ramps, driveway & lot aprons,
// lane markings (dbl-yellow / lane dashes / edge lines / stop bars /
// continental crosswalks / lane-use arrows / Commerce Blvd TWLTL), curb-line
// storm drains. Everything static funnels through GeoBin — few draw calls.
import * as THREE from 'three';
import { ROADS, LOTS, HOUSE_BLOCKS } from '../layout.js';
import { plane, mat, canvasTex, makeCanvas, attachDriftShadow, lift, R, rr } from '../lib.js';
import { pbr, WET_SURFACES } from '../mats.js';
import { GeoBin } from './geo.js';
import { CITY } from './stats.js';
import { streetBand } from './occ.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = THREE.MeshStandardMaterial;
const Y = 0.28;                 // match details.js surface lift
const CURB_H = .16, CURB_W = .38;
const WALK_W_A = 3.05, WALK_W_M = 2.7;   // sidewalk widths: arterial / minor
const VERGE_W = 1.3;                     // tree-lawn strip on minor streets

/* ------- intersections (moved from details.js — re-exported there) ------- */
export function intersections() {
  const out = [];
  const vs = ROADS.filter(r => r.axis === 'v'), hs = ROADS.filter(r => r.axis === 'h');
  for (const v of vs) for (const h of hs)
    if (h.a0 < v.c && v.c < h.a1 && v.a0 < h.c && h.c < v.a1)
      out.push({ x: v.c, z: h.c, wv: v.w, wh: h.w, vn: v.name, hn: h.name,
                 arterial: v.arterial && h.arterial, v, h });
  return out;
}

/* ------- interval math ------- */
function mergeCuts(cuts) {
  cuts.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const c of cuts) {
    if (out.length && c[0] <= out[out.length - 1][1] + .01)
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], c[1]);
    else out.push(c.slice());
  }
  return out;
}
function freeRuns(a0, a1, cuts) {
  const runs = [];
  let cur = a0;
  for (const [c0, c1] of mergeCuts(cuts)) {
    if (c0 > cur + .5) runs.push([cur, Math.min(c0, a1)]);
    cur = Math.max(cur, c1);
  }
  if (a1 > cur + .5) runs.push([cur, a1]);
  return runs.filter(r => r[1] - r[0] > .5);
}

/* arrow decal — white on transparent; canvas 'up' maps to world -z */
const arrowCache = new Map();
function arrowMat(dir) {
  if (arrowCache.has(dir)) return arrowCache.get(dir);
  const [c, x] = makeCanvas(128, 256);
  x.fillStyle = '#e8e6df'; x.strokeStyle = '#e8e6df'; x.lineCap = 'round';
  if (dir === 'up') {
    x.fillRect(56, 96, 16, 140);
    x.beginPath(); x.moveTo(64, 14); x.lineTo(18, 96); x.lineTo(110, 96); x.closePath(); x.fill();
  } else if (dir === 'upleft') {          // shared left+through lane arrow
    x.fillRect(56, 96, 16, 140);
    x.beginPath(); x.moveTo(64, 14); x.lineTo(18, 96); x.lineTo(110, 96); x.closePath(); x.fill();
    x.lineWidth = 14;
    x.beginPath(); x.moveTo(64, 170); x.lineTo(64, 110); x.lineTo(28, 110); x.stroke();
    x.beginPath(); x.moveTo(-16 + 44, 110); x.lineTo(20, 82); x.lineTo(20, 138); x.closePath();
    x.save(); x.translate(0, 0); x.restore(); x.fill();
  } else {
    // left-turn arrow: shaft up, head turns left
    const sgn = dir === 'left' ? 1 : -1;
    x.save(); x.translate(64, 128); x.scale(sgn, 1); x.translate(-64, -128);
    x.lineWidth = 16;
    x.beginPath(); x.moveTo(64, 236); x.lineTo(64, 96); x.lineTo(28, 96); x.stroke();
    x.beginPath(); x.moveTo(8, 96); x.lineTo(34, 60); x.lineTo(34, 132); x.closePath(); x.fill();
    x.restore();
  }
  const t = canvasTex(c);
  const m = new M({ map: t, transparent: true, roughness: .9,
    polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  arrowCache.set(dir, m);
  return m;
}

/* tactile warning pad — truncated-dome dots on federal yellow */
let _tactile = null;
function tactileMat() {
  if (_tactile) return _tactile;
  const [c, x] = makeCanvas(64, 64);
  x.fillStyle = '#c9a23a'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#8f7020';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.beginPath(); x.arc(9 + i * 15 + (j % 2) * 7, 9 + j * 15, 3.2, 0, 7); x.fill();
  }
  _tactile = new M({ map: canvasTex(c), roughness: .95,
    polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  return _tactile;
}

/* heading -> plane ry. Canvas arrow 'up' points -z (north) at ry=0.
   nb=-z, sb=+z, eb=+x, wb=-x */
const HEAD_RY = { nb: 0, sb: Math.PI, eb: -Math.PI / 2, wb: Math.PI / 2 };

/* unlit wear decals stay day-bright at night otherwise — dim to match */
const _night = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('time') === 'night';

export function buildStreetscape(scene) {
  const asph = pbr('asphalt_02');
  // albedo averages ~rgb(90); near-black tint crushed it to a void ribbon —
  // lift toward worn-asphalt gray so markings + wheel polish read
  asph.color = new THREE.Color('#9aa0a6'); asph.roughness = .97;
  lift(asph, 1);
  // junction pads share the asphalt look but must order above both crossing
  // ribbons — a keyed variant splits it off the shared cache instance
  const padM = pbr('asphalt_02', { color: '#9aa0a6', roughScale: .97 });
  padM.roughness = .97;
  attachDriftShadow(padM, .0015, .0009, .15);
  WET_SURFACES.push(padM);
  lift(padM, 2);
  const gutterM = lift(pbr('asphalt_02', { repeat: [4, 4], color: '#373b41' }), 4);
  WET_SURFACES.push(gutterM);
  const curbM = pbr('concrete', { repeat: [6, 1], color: '#b6b2a8' });
  const walkM = lift(pbr('precast_stone_paving', { repeat: [4, 4], color: '#b2ac9f' }), 3);
  const apronM = lift(pbr('concrete', { repeat: [5, 5], color: '#9d998e' }), 8);
  const vergeM = lift(pbr('grass_ground', { repeat: [3, 3], color: '#8fae74' }), 3);
  // one continuous world-space cloud-shadow field across every flat surface
  // (default asphalt is shared with details.js ASPH — already drifted there)
  for (const m of [gutterM, walkM, apronM, vergeM])
    attachDriftShadow(m, .0015, .0009, m === vergeM ? .12 : .14);
  const white = lift(mat('#e8e6df'), 6), yellow = lift(mat('#d9b23a'), 6),
        drainM = lift(mat('#26292c'), 7);
  const ix = intersections();
  const bin = new GeoBin();
  const cw = 3.2, bars = 6;

  /* wheel-track wear overlay — polished tire bands per lane, gutter grime,
     crown fade, patch repairs; translucent decal stretched the road length.
     Canvas bands sit along the v axis (across the road): 'h' roads use it
     directly, 'v' roads get the canvas transposed. Keyed by axis+width. */
  const _wearM = new Map();
  const wearMat = (axis, w, lanes) => {
    const key = `${axis}:${w}:${lanes}`;
    if (_wearM.has(key)) return _wearM.get(key);
    const S = 256, [c, x] = makeCanvas(S, S);
    x.clearRect(0, 0, S, S);
    if (axis === 'v') x.setTransform(0, 1, 1, 0, 0, 0);  // transpose: bands on x
    // lanes: |offsets| from centreline - actual lane centres, mirrored ±
    for (const lp of lanes)
      for (const sg of [-1, 1]) {
        const lc = .5 + lp * sg / w;                 // lane centre at ±lp m
        for (const s of [-1, 1]) {                   // twin polished tracks
          const wy = (lc + s * .85 / w) * S, bw = Math.max(3, .62 / w * S);
          const g = x.createLinearGradient(0, wy - bw, 0, wy + bw);
          g.addColorStop(0, 'rgba(16,18,20,0)');
          g.addColorStop(.5, `rgba(16,18,20,${(.10 + R() * .06).toFixed(3)})`);
          g.addColorStop(1, 'rgba(16,18,20,0)');
          x.fillStyle = g; x.fillRect(0, wy - bw, S, bw * 2);
        }
        x.fillStyle = 'rgba(14,15,16,.10)';          // dripped-oil lane centre
        x.fillRect(0, lc * S - 1, S, 2);
      }
    for (const e of [0, 1]) {                        // gutter grime at edges
      const g = x.createLinearGradient(0, e ? S : 0, 0, e ? S * .91 : S * .09);
      g.addColorStop(0, 'rgba(20,22,24,.16)'); g.addColorStop(1, 'rgba(20,22,24,0)');
      x.fillStyle = g; x.fillRect(0, e ? S * .91 : 0, S, S * .09);
    }
    const gc = x.createLinearGradient(0, S * .42, 0, S * .58);
    gc.addColorStop(0, 'rgba(215,220,224,0)'); gc.addColorStop(.5, 'rgba(215,220,224,.07)');
    gc.addColorStop(1, 'rgba(215,220,224,0)');
    x.fillStyle = gc; x.fillRect(0, S * .42, S, S * .16);   // crown sun-bleach
    for (let i = 0; i < 4; i++) {                    // patch repairs
      x.fillStyle = `rgba(14,15,16,${.08 + R() * .07})`;
      x.fillRect(R() * S, R() * S, 30 + R() * 60, 8 + R() * 20);
    }
    const tex = canvasTex(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true,
      depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      ...(_night ? { color: '#3a4048' } : {}) });
    _wearM.set(key, m);
    return m;
  };

  /* junction pad intervals + painted-leg curb cuts */
  const padCuts = new Map(), legCuts = new Map(), apronCuts = new Map();
  for (const r of ROADS) { padCuts.set(r, []); legCuts.set(r, []); apronCuts.set(r, []); }
  const rampPts = [];
  for (const i of ix) {
    padCuts.get(i.v).push([i.z - i.wh / 2 - 1.1, i.z + i.wh / 2 + 1.1]);
    padCuts.get(i.h).push([i.x - i.wv / 2 - 1.1, i.x + i.wv / 2 + 1.1]);
    const legOk = [
      i.v.a0 < i.z - i.wh / 2 - 4.9, i.v.a1 > i.z + i.wh / 2 + 4.9,
      i.h.a0 < i.x - i.wv / 2 - 4.9, i.h.a1 > i.x + i.wv / 2 + 4.9,
    ];
    const legZ = [i.z - (i.wh / 2 + cw / 2 + 1.2), i.z + (i.wh / 2 + cw / 2 + 1.2)];
    const legX = [i.x - (i.wv / 2 + cw / 2 + 1.2), i.x + (i.wv / 2 + cw / 2 + 1.2)];
    if (legOk[0]) legCuts.get(i.v).push([legZ[0] - 2.1, legZ[0] + 2.1]);
    if (legOk[1]) legCuts.get(i.v).push([legZ[1] - 2.1, legZ[1] + 2.1]);
    if (legOk[2]) legCuts.get(i.h).push([legX[0] - 2.1, legX[0] + 2.1]);
    if (legOk[3]) legCuts.get(i.h).push([legX[1] - 2.1, legX[1] + 2.1]);
    const bandV = streetBand(i.v) - i.wv / 2, bandH = streetBand(i.h) - i.wh / 2;
    if (legOk[0]) for (const s of [-1, 1])
      rampPts.push({ x: i.x + s * (i.wv / 2 + bandV / 2), z: legZ[0], w: bandV, d: cw + 1.4 });
    if (legOk[1]) for (const s of [-1, 1])
      rampPts.push({ x: i.x + s * (i.wv / 2 + bandV / 2), z: legZ[1], w: bandV, d: cw + 1.4 });
    if (legOk[2]) for (const s of [-1, 1])
      rampPts.push({ x: legX[0], z: i.z + s * (i.wh / 2 + bandH / 2), w: cw + 1.4, d: bandH });
    if (legOk[3]) for (const s of [-1, 1])
      rampPts.push({ x: legX[1], z: i.z + s * (i.wh / 2 + bandH / 2), w: cw + 1.4, d: bandH });
  }

  /* driveway aprons where house driveways reach the street — side-aware:
     an apron only cuts the curb on the side the house fronts. Entries are
     {a0, a1, side:±1} along the road's span. */
  for (const blk of HOUSE_BLOCKS) {
    if (blk.face !== 'h') continue;
    const W = blk.x1 - blk.x0, D = blk.z1 - blk.z0;
    const rows = D > 80 ? 2 : 1;
    for (let rI = 0; rI < rows; rI++) {
      const n = Math.ceil(blk.count / rows);
      const zrow = rows === 2 ? (rI === 0 ? blk.z0 + 13 : blk.z1 - 13) : blk.z1 - 13;
      const front = rI === 0 ? -1 : 1;
      const frontZ = zrow + front * 11;
      let best = null, bd = 46;
      for (const rd of ROADS) {
        if (rd.axis !== 'h') continue;
        const d = Math.abs(rd.c - frontZ);
        if (d < bd) { bd = d; best = rd; }
      }
      if (!best) continue;
      const side = Math.sign(frontZ - best.c) || 1;
      for (let i = 0; i < n; i++) {
        const hx = blk.x0 + 14 + i * (W - 28) / Math.max(1, n - 1);
        if (hx < best.a0 + 4 || hx > best.a1 - 4) continue;
        apronCuts.get(best).push({ a0: hx + 2.6, a1: hx + 7.2, side });
      }
    }
  }
  /* lot aprons where a parking lot abuts the road edge (side = lot side) */
  for (const l of LOTS) {
    if (l.plain) continue;
    const lx0 = l.x - l.w / 2, lx1 = l.x + l.w / 2, lz0 = l.z - l.d / 2, lz1 = l.z + l.d / 2;
    for (const r of ROADS) {
      if (r.axis === 'h') {
        const xOv = Math.min(lx1, r.a1) - Math.max(lx0, r.a0);
        if (xOv < 8) continue;
        let side = 0;
        if (Math.abs(lz0 - (r.c + r.w / 2)) < 9) side = 1;
        else if (Math.abs(lz1 - (r.c - r.w / 2)) < 9) side = -1;
        if (!side) continue;
        const c0 = Math.max(lx0, r.a0) + 2;
        apronCuts.get(r).push({ a0: c0, a1: c0 + Math.min(xOv - 4, 14), side });
      } else {
        const zOv = Math.min(lz1, r.a1) - Math.max(lz0, r.a0);
        if (zOv < 8) continue;
        let side = 0;
        if (Math.abs(lx0 - (r.c + r.w / 2)) < 9) side = 1;
        else if (Math.abs(lx1 - (r.c - r.w / 2)) < 9) side = -1;
        if (!side) continue;
        const c0 = Math.max(lz0, r.a0) + 2;
        apronCuts.get(r).push({ a0: c0, a1: c0 + Math.min(zOv - 4, 14), side });
      }
    }
  }

  const stripe = (r, w, l, off, u, m, y) =>
    bin.plane(r.axis === 'v' ? w : l, r.axis === 'v' ? l : w, m,
      r.axis === 'v' ? r.c + off : u, Y + y, r.axis === 'v' ? u : r.c + off);
  const nearIx = (r, u, m = 6) => ix.some(i => r.axis === 'v'
    ? Math.abs(i.x - r.c) < r.w && u > i.z - i.wh / 2 - m && u < i.z + i.wh / 2 + m
    : Math.abs(i.z - r.c) < r.w && u > i.x - i.wv / 2 - m && u < i.x + i.wv / 2 + m);
  const arrow = (m, x, z, ry) => {
    const g = new THREE.PlaneGeometry(2.4, 4.4);
    g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(x, Y + .012, z);
    let bb = bin.b.get(m); if (!bb) { bb = []; bin.b.set(m, bb); } bb.push(g);
    CITY.markings.arrows++;
  };

  for (const r of ROADS) {
    const arterial = r.arterial || r.w >= 16;
    const len = r.a1 - r.a0, mid = (r.a0 + r.a1) / 2;
    const walkW = arterial ? WALK_W_A : WALK_W_M;
    scene.add(r.axis === 'v'
      ? plane(r.w, len, asph, r.c, Y, mid, -Math.PI / 2, 6)
      : plane(len, r.w, asph, mid, Y, r.c, -Math.PI / 2, 6));
    CITY.roads++;

    // wheel-track wear decal — v axis spans the road width exactly once so
    // band positions land on lanes; u repeats every 48 m along the span.
    // lane centres: TWLTL turns sit inside the ±2.15 double-yellow, so
    // through lanes on Commerce run at 3.875/7.45; standard arterials split
    // the remaining width in four; minor streets wear their two centres.
    {
      const laneOffs = r.name === 'Commerce Blvd' ? [3.875, 7.45]
        : r.w >= 16 ? [.25 + r.w / 8, 3 * r.w / 8 - .35]
        : [r.w >= 11 ? r.w / 4 - .35 : r.w / 4];
      for (const [s0, s1] of freeRuns(r.a0, r.a1, padCuts.get(r))) {
        const sl = s1 - s0, smid = (s0 + s1) / 2;
        const wg = new THREE.PlaneGeometry(r.axis === 'v' ? r.w : sl,
          r.axis === 'v' ? sl : r.w);
        const wuv = wg.attributes.uv, pw = wg.parameters.width,
              ph = wg.parameters.height;
        for (let i = 0; i < wuv.count; i++)
          wuv.setXY(i, wuv.getX(i) * pw / (r.axis === 'v' ? pw : 48),
            wuv.getY(i) * ph / (r.axis === 'v' ? 48 : ph));
        wg.rotateX(-Math.PI / 2);
        wg.translate(r.axis === 'v' ? r.c : smid, Y + .003,
          r.axis === 'v' ? smid : r.c);
        bin.add(wg, wearMat(r.axis, r.w, laneOffs), 0, 0, 0);
      }
    }

    const gutCuts = mergeCuts([...padCuts.get(r),
      ...apronCuts.get(r).map(c => [c.a0, c.a1])]);
    for (const s of [-1, 1]) {
      const edgeCuts = mergeCuts([...padCuts.get(r), ...legCuts.get(r),
        ...apronCuts.get(r).filter(c => c.side === s).map(c => [c.a0, c.a1])]);
      const curbC = r.w / 2 + CURB_W / 2;
      const vergeC = r.w / 2 + CURB_W + VERGE_W / 2;
      const walkC = arterial ? r.w / 2 + CURB_W + walkW / 2
                             : r.w / 2 + CURB_W + VERGE_W + walkW / 2;
      for (const [u0, u1] of freeRuns(r.a0, r.a1, edgeCuts)) {
        const ul = u1 - u0, um = (u0 + u1) / 2;
        bin.box(r.axis === 'v' ? CURB_W : ul, CURB_H, r.axis === 'v' ? ul : CURB_W,
          curbM, r.axis === 'v' ? r.c + curbC * s : um, Y - .01,
          r.axis === 'v' ? um : r.c + curbC * s);
        CITY.curbRuns++;
        bin.plane(r.axis === 'v' ? walkW : ul, r.axis === 'v' ? ul : walkW, walkM,
          r.axis === 'v' ? r.c + walkC * s : um, Y + CURB_H - .012,
          r.axis === 'v' ? um : r.c + walkC * s);
        CITY.sidewalkRuns++;
        if (!arterial) {
          bin.plane(r.axis === 'v' ? VERGE_W : ul, r.axis === 'v' ? ul : VERGE_W, vergeM,
            r.axis === 'v' ? r.c + vergeC * s : um, Y + .012,
            r.axis === 'v' ? um : r.c + vergeC * s);
          CITY.vergeRuns++;
        }
      }
      for (const c of apronCuts.get(r).filter(c => c.side === s &&
          c.a1 > r.a0 && c.a0 < r.a1)) {
        const um = (Math.max(c.a0, r.a0) + Math.min(c.a1, r.a1)) / 2,
              uw = Math.min(c.a1, r.a1) - Math.max(c.a0, r.a0);
        const band = streetBand(r) - r.w / 2;
        bin.plane(r.axis === 'v' ? band : uw, r.axis === 'v' ? uw : band, apronM,
          r.axis === 'v' ? r.c + (r.w / 2 + band / 2) * s : um, Y + .03,
          r.axis === 'v' ? um : r.c + (r.w / 2 + band / 2) * s);
        CITY.aprons++;
      }
      for (const [u0, u1] of freeRuns(r.a0, r.a1, gutCuts)) {
        const ul = u1 - u0, um = (u0 + u1) / 2;
        bin.plane(r.axis === 'v' ? .62 : ul, r.axis === 'v' ? ul : .62, gutterM,
          r.axis === 'v' ? r.c + (r.w / 2 - .31) * s : um, Y + .004,
          r.axis === 'v' ? um : r.c + (r.w / 2 - .31) * s);
        CITY.gutterRuns++;
      }
    }

    /* ---- markings ---- */
    const isCommerce = r.name === 'Commerce Blvd';
    if (isCommerce) {
      // TWLTL: solid yellow outer at ±2.15, dashed yellow inner at ±1.7
      for (const s of [-1, 1]) {
        stripe(r, .15, len, 2.15 * s, mid, yellow, .007); CITY.markings.dyellow++;
        for (let a = r.a0 + 4; a < r.a1 - 4; a += 4.8) {
          const um = a + 1.2;
          if (nearIx(r, um)) continue;
          stripe(r, .15, 2.4, 1.7 * s, um, yellow, .008); CITY.markings.dyellow++;
        }
        for (let a = r.a0 + 2; a < r.a1 - 2; a += 9) {
          const um = a + 2.4;
          if (nearIx(r, um)) continue;
          stripe(r, .2, 3, 5.6 * s, um, white, .009); CITY.markings.dash++;
        }
        stripe(r, .25, len, (r.w / 2 - .7) * s, mid, white, .006); CITY.markings.edge++;
      }
      let flip = 1;
      for (let a = r.a0 + 30; a < r.a1 - 30; a += 36) {
        if (ix.some(i => Math.abs(i.z - r.c) < r.w &&
            a > i.x - i.wv / 2 - 15 && a < i.x + i.wv / 2 + 15)) continue;
        // TWLTL arrows serve both directions — alternate heading
        arrow(arrowMat('left'), a, r.c, flip > 0 ? HEAD_RY.eb : HEAD_RY.wb);
        CITY.markings.arrows--; CITY.markings.twltlArrows++;
        flip *= -1;
      }
    } else if (arterial) {
      for (const s of [-.5, .5]) stripe(r, .16, len, s, mid, yellow, .008);
      CITY.markings.dyellow += 2;
      for (const s of [-1, 1]) {
        for (let a = r.a0 + 2; a < r.a1 - 2; a += 9) {
          const um = a + 2.4;
          if (nearIx(r, um)) continue;
          stripe(r, .2, 3, (r.w / 4) * s, um, white, .009); CITY.markings.dash++;
        }
        stripe(r, .25, len, (r.w / 2 - .7) * s, mid, white, .006); CITY.markings.edge++;
      }
    } else {
      for (let a = r.a0 + 2; a < r.a1 - 2; a += 6.5) {
        const um = a + 1.75;
        if (nearIx(r, um)) continue;
        stripe(r, .25, 3.5, 0, um, yellow, .008); CITY.markings.dash++;
      }
      if (r.w >= 11) for (const s of [-1, 1]) {
        stripe(r, .2, len, (r.w / 2 - .6) * s, mid, white, .006); CITY.markings.edge++;
      }
    }
    // manholes mid-lane; storm grates on the gutter line, alternating sides
    for (let a = r.a0 + 40; a < r.a1 - 20; a += 70) {
      bin.plane(1.05, 1.05, drainM,
        r.axis === 'v' ? r.c + rr(-r.w / 4, r.w / 4) : a, Y + .007,
        r.axis === 'v' ? a : r.c + rr(-r.w / 4, r.w / 4));
      CITY.manholes++;
      for (const s of [-1, 1]) {
        const um = a + s * 17;
        if (um > r.a1 - 12 || um < r.a0 + 12 || nearIx(r, um)) continue;
        bin.plane(r.axis === 'v' ? .62 : 1.15, r.axis === 'v' ? 1.15 : .62, drainM,
          r.axis === 'v' ? r.c + (r.w / 2 - .34) * s : um, Y + .006,
          r.axis === 'v' ? um : r.c + (r.w / 2 - .34) * s);
        CITY.drains++;
      }
    }
  }

  /* junction pads + crosswalks + stop bars + lane arrows */
  for (const i of ix) {
    scene.add(plane(i.wv + 2, i.wh + 2, padM, i.x, Y + .002, i.z, -Math.PI / 2, 6));
    const legOk = [
      i.v.a0 < i.z - i.wh / 2 - 4.9, i.v.a1 > i.z + i.wh / 2 + 4.9,
      i.h.a0 < i.x - i.wv / 2 - 4.9, i.h.a1 > i.x + i.wv / 2 + 4.9,
    ];
    const legs = [
      { dx: 0, dz: -(i.wh / 2 + cw / 2 + 1.2), w: i.wv - 2, horiz: true },
      { dx: 0, dz: (i.wh / 2 + cw / 2 + 1.2), w: i.wv - 2, horiz: true },
      { dx: -(i.wv / 2 + cw / 2 + 1.2), dz: 0, w: i.wh - 2, horiz: false },
      { dx: (i.wv / 2 + cw / 2 + 1.2), dz: 0, w: i.wh - 2, horiz: false },
    ];
    for (let li = 0; li < legs.length; li++) {
      if (!legOk[li]) continue;
      const L = legs[li];
      for (let b = 0; b < bars; b++) {
        const t = -L.w / 2 + (b + .5) * (L.w / bars);
        const g = L.horiz
          ? new THREE.PlaneGeometry(L.w / bars * .55, cw)
          : new THREE.PlaneGeometry(cw, L.w / bars * .55);
        g.rotateX(-Math.PI / 2);
        g.translate(L.horiz ? i.x + t : i.x + L.dx, Y + .015, L.horiz ? i.z + L.dz : i.z + t);
        let bb = bin.b.get(white); if (!bb) { bb = []; bin.b.set(white, bb); }
        bb.push(g); CITY.markings.crosswalkBars++;
      }
      const g = L.horiz ? new THREE.PlaneGeometry(L.w, .5) : new THREE.PlaneGeometry(.5, L.w);
      g.rotateX(-Math.PI / 2);
      g.translate(L.horiz ? i.x : i.x + L.dx * 1.18, Y + .013, L.horiz ? i.z + L.dz * 1.18 : i.z);
      let bb = bin.b.get(white); if (!bb) { bb = []; bin.b.set(white, bb); }
      bb.push(g); CITY.markings.stopbar++;
    }
    /* lane-use arrows on signalized approaches:
       inner lane = left turn, outer lane = through */
    if (i.wv >= 16 && i.wh >= 16) {
      const lin = i.wv / 8, lout = 3 * i.wv / 8, hin = i.wh / 8, hout = 3 * i.wh / 8;
      // nb (heading -z): approach zone z = i.z + wh/2 + 13, lanes on +x half
      if (i.v.a0 < i.z - i.wh / 2 - 30) {
        arrow(arrowMat('left'), i.x + lin, i.z + i.wh / 2 + 13, HEAD_RY.nb);
        arrow(arrowMat('up'), i.x + lout, i.z + i.wh / 2 + 13, HEAD_RY.nb);
      }
      // sb (heading +z): approach z = i.z - wh/2 - 12, lanes x = i.x - lin/lout
      if (i.v.a1 > i.z + i.wh / 2 + 30) {
        arrow(arrowMat('left'), i.x - lin, i.z - i.wh / 2 - 13, HEAD_RY.sb);
        arrow(arrowMat('up'), i.x - lout, i.z - i.wh / 2 - 13, HEAD_RY.sb);
      }
      // eb (heading +x): approach x = i.x - wv/2 - 12, lanes z = i.z + hin/hout
      if (i.h.a0 < i.x - i.wv / 2 - 30) {
        arrow(arrowMat('left'), i.x - i.wv / 2 - 13, i.z + hin, HEAD_RY.eb);
        arrow(arrowMat('up'), i.x - i.wv / 2 - 13, i.z + hout, HEAD_RY.eb);
      }
      // wb (heading -x): approach x = i.x + wv/2 + 12, lanes z = i.z - hin/hout
      if (i.h.a1 > i.x + i.wv / 2 + 30) {
        arrow(arrowMat('left'), i.x + i.wv / 2 + 13, i.z - hin, HEAD_RY.wb);
        arrow(arrowMat('up'), i.x + i.wv / 2 + 13, i.z - hout, HEAD_RY.wb);
      }
    }
  }

  /* ramp slabs + tactile pads */
  for (const rp of rampPts) {
    bin.plane(rp.w, rp.d, apronM, rp.x, Y + .04, rp.z);
    CITY.ramps++;
    const pin = Math.min(rp.w, rp.d) > 2.4 ? 1.5 : Math.min(rp.w, rp.d) - .4;
    bin.plane(rp.w > rp.d ? pin : rp.w - .6, rp.w > rp.d ? rp.d - .6 : pin,
      tactileMat(), rp.x, Y + .055, rp.z);
    CITY.tactilePads++;
  }

  /* ---------- asphalt wear pass ----------
     wheel-track polish + oil stains + repair patches + junction scuff.
     All translucent decals — one merged mesh, one draw call. */
  {
    const wear = [];
    const quad = (w, d, x, z, ry = 0, lift = .021) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2); if (ry) g.rotateY(ry);
      g.translate(x, Y + lift, z);
      wear.push(g);
    };
    for (const r of ROADS) {
      const len = r.a1 - r.a0;
      // wheel-track polish strips — two ruts per direction, ~.9m apart
      for (const s of [-1, 1]) for (const lane of [-1, 1]) {
        const wo = (r.w / 4) * s + lane * .9;                   // wheel path offset
        for (let a = r.a0 + 20; a < r.a1 - 20; a += rr(60, 130))
          quad(r.axis === 'v' ? .8 : rr(9, 22), r.axis === 'v' ? rr(9, 22) : .8,
            r.axis === 'v' ? r.c + wo : a, r.axis === 'v' ? a : r.c + wo);
      }
      // oil stains at rest positions — denser where traffic queues
      for (let a = r.a0 + 30; a < r.a1 - 30; a += rr(90, 170)) {
        if (nearIx(r, a)) continue;
        const o = rr(-r.w / 4, r.w / 4);
        quad(rr(1.2, 2.4), rr(1.6, 3.2),
          r.axis === 'v' ? r.c + o : a, r.axis === 'v' ? a : r.c + o, rr(0, 3.1));
      }
      // repair patches — darker fresh-asphalt rectangles
      for (let a = r.a0 + rr(50, 90); a < r.a1 - 40; a += rr(140, 260)) {
        if (nearIx(r, a)) continue;
        quad(r.axis === 'v' ? rr(2.2, r.w * .45) : rr(6, 14),
             r.axis === 'v' ? rr(6, 14) : rr(2.2, r.w * .45),
             r.axis === 'v' ? r.c + rr(-r.w / 4, r.w / 4) : a,
             r.axis === 'v' ? a : r.c + rr(-r.w / 4, r.w / 4));
        CITY.wear++;
      }
      // faint hairline cracks — short thin dark strokes
      for (let a = r.a0 + 40; a < r.a1 - 40; a += rr(110, 200)) {
        if (nearIx(r, a)) continue;
        quad(rr(.06, .12), rr(3, 7),
          r.axis === 'v' ? r.c + rr(-r.w / 2, r.w / 2) : a + rr(0, 8),
          r.axis === 'v' ? a + rr(0, 8) : r.c + rr(-r.w / 2, r.w / 2), rr(0, 3.1));
      }
    }
    // scuff polish in junction middles — lifted just under the crosswalk /
    // stop-bar paint so markings stay bright (wear = asphalt, not paint)
    for (const i of ix)
      quad(i.wv * .8, i.wh * .8, i.x, i.z, 0, .009);
    const wearM = new THREE.MeshBasicMaterial({
      color: '#141619', transparent: true, opacity: .34,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const wearMesh = new THREE.Mesh(mergeGeometries(wear, false), wearM);
    wearMesh.renderOrder = 1; wearMesh.receiveShadow = false;
    scene.add(wearMesh);
  }

  bin.build(scene);
  return ix;
}
