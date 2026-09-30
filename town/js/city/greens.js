// city/greens.js — programmed green parcels: every dead lawn quadrant gets a
// named, purposeful program (pocket parks, community gardens, meadows,
// orchards, conifer groves, planted buffers). Deterministic via the shared
// R() stream; static geometry through GeoBin/instancing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GREENS, PLAZA } from '../layout.js';
import { plane, mat, colored, VCOL, instances, waterMaterial, signTexture,
         makeCanvas, canvasTex, R, rr, pick, mulberry32, thin } from '../lib.js';
import { pbr } from '../mats.js';
import { GeoBin } from './geo.js';
import { CITY } from './stats.js';

const M = THREE.MeshStandardMaterial;
const Y = 0.28;

const GRASS_A = '#9db27e', GRASS_B = '#a9bd83', GRASS_C = '#8aa868';
const BED = '#5a4632', PATHC = '#b8a888';

function lawnPlane(bin, g, tint) {
  const gm = pbr('grass_ground', { repeat: [6, 6], color: tint, envMapIntensity: .12 });
  bin.plane(g.x1 - g.x0, g.z1 - g.z0, gm,
    (g.x0 + g.x1) / 2, Y - .005, (g.z0 + g.z1) / 2);
}
function pathStrip(bin, x0, z0, x1, z1, w = 2.2) {
  // winding path as chained discs
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3.4);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t,
          z = z0 + (z1 - z0) * t + Math.sin(t * Math.PI * 2) * 3;
    const g = new THREE.CircleGeometry(w, 8);
    g.rotateX(-Math.PI / 2); g.translate(x, Y + .006, z);
    let bb = bin.b.get(pathMat()); if (!bb) { bb = []; bin.b.set(pathMat(), bb); }
    bb.push(g);
  }
}
let _pathM = null;
function pathMat() { return _pathM || (_pathM = pbr('gravel', { repeat: [2, 2], color: PATHC, envMapIntensity: .12 })); }

function bench(parts, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const T = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [wx, wz] = T(0, 0);
  parts.push({ geo: new THREE.BoxGeometry(2.4, .12, .6), color: '#7a5c3e', x: wx, y: .55, z: wz, ry });
  [wx, wz] = T(0, -.3);
  parts.push({ geo: new THREE.BoxGeometry(2.4, .5, .1), color: '#7a5c3e', x: wx, y: .8, z: wz, ry });
  for (const lx of [-1, 1]) {
    [wx, wz] = T(lx, 0);
    parts.push({ geo: new THREE.BoxGeometry(.15, .55, .55), color: '#3a3f43', x: wx, y: .28, z: wz, ry });
  }
}
function entrySign(parts, g, name, sub) {
  const x = g.x0 + 7, z = g.z0 + 5;
  parts.push({ geo: new THREE.BoxGeometry(.16, 2.6, .16), color: '#4a3f32', x: x - 1.4, y: 1.3, z });
  parts.push({ geo: new THREE.BoxGeometry(.16, 2.6, .16), color: '#4a3f32', x: x + 1.4, y: 1.3, z });
  parts.push({ geo: new THREE.BoxGeometry(3.6, 1.5, .18), color: '#3a4a38', x, y: 1.9, z });
  return { x, z };
}
function hedgeLine(parts, x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.7);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push({ geo: new THREE.BoxGeometry(1.5, 1.0, 1.5), color: '#4e6b3e',
      x: x0 + (x1 - x0) * t, y: .5, z: z0 + (z1 - z0) * t });
  }
}

/* ---------- per-use renderers ---------- */
// each returns { trees:[{x,z,s,t}], bushes:[], flowers:[] } for instancing

let _plazaM = null;
function plazaMat() { return _plazaM ||= pbr('precast_stone_paving', { repeat: [3, 3], color: '#b8ac98', envMapIntensity: .12 }); }

function rPocketPark(g, bin, parts, out) {
  lawnPlane(bin, g, GRASS_B);
  const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
  const W = g.x1 - g.x0, D = g.z1 - g.z0;
  // paved plaza pad at the west end — reads as a destination from aerial
  const pr = Math.min(9, W * .14, D * .3);
  const pg = new THREE.CircleGeometry(pr, 18);
  pg.rotateX(-Math.PI / 2); pg.translate(g.x0 + pr + 4, Y + .004, cz);
  let pb = bin.b.get(plazaMat()); if (!pb) { pb = []; bin.b.set(plazaMat(), pb); }
  pb.push(pg);
  // plaza focal: small fountain ring + centre column
  parts.push({ geo: new THREE.CylinderGeometry(1.9, 2.1, .6, 12), color: '#9aa0a3',
    x: g.x0 + pr + 4, y: .3, z: cz });
  parts.push({ geo: new THREE.CylinderGeometry(.3, .4, 1.6, 8), color: '#8a9094',
    x: g.x0 + pr + 4, y: 1.1, z: cz });
  // perimeter walking loop (ellipse of gravel discs)
  const er = Math.max(6, Math.min(W, D) / 2 - 5);
  for (let t = 0; t < 1; t += .04) {
    const a = t * Math.PI * 2;
    const dg = new THREE.CircleGeometry(1.7, 8);
    dg.rotateX(-Math.PI / 2);
    dg.translate(cx + Math.cos(a) * (W / 2 - 6), Y + .006,
                 cz + Math.sin(a) * Math.min(D / 2 - 5, er));
    let bb = bin.b.get(pathMat()); if (!bb) { bb = []; bin.b.set(pathMat(), bb); }
    bb.push(dg);
  }
  pathStrip(bin, g.x0 + 6, cz, g.x1 - 6, cz);
  for (let i = 0; i < 4; i++)
    bench(parts, rr(g.x0 + 10, g.x1 - 10), cz + rr(-8, 8), rr(0, 6.28));
  const nT = Math.max(6, Math.floor(W / 8));
  for (let i = 0; i < nT; i++)
    out.trees.push({ x: rr(g.x0 + 8, g.x1 - 8), z: rr(g.z0 + 8, g.z1 - 8), s: rr(1, 1.5),
      t: pick(['o', 'm', 'b']) });
  // ring of understory shrubs inside the hedge line
  for (let i = 0; i < Math.floor(W / 8); i++)
    out.flowers.push({ x: rr(g.x0 + 3, g.x1 - 3), z: g.z1 - rr(2, 5), s: rr(.8, 1.4),
      color: pick(['#5d8a3c', '#4e7d46', '#7aa04a']) });
  hedgeLine(parts, g.x0, g.z1 - 1, g.x1, g.z1 - 1);
}
function rGarden(g, bin, parts, out) {
  lawnPlane(bin, g, GRASS_C);
  // raised-bed grid with gravel aisles + shed + perimeter hedge
  const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
  bin.plane(g.x1 - g.x0 - 6, g.z1 - g.z0 - 6, pathMat(), cx, Y + .004, cz);
  for (let r = 0; r < 4; r++) for (let c = 0; c < Math.floor((g.x1 - g.x0) / 14); c++) {
    const bx = g.x0 + 9 + c * 14, bz = g.z0 + 9 + r * ((g.z1 - g.z0 - 16) / 3);
    parts.push({ geo: new THREE.BoxGeometry(8, .55, 3), color: BED, x: bx, y: .28, z: bz });
    for (let k = 0; k < 5; k++)
      out.flowers.push({ x: bx - 3 + k * 1.5, z: bz, s: rr(.5, .8),
        color: pick(['#5d8a3c', '#7aa04a', '#4e7d46', '#c9d44a']) });
  }
  // shed
  parts.push({ geo: new THREE.BoxGeometry(5, 3, 3.6), color: '#6e5a42', x: g.x1 - 8, y: 1.5, z: g.z0 + 7 });
  parts.push({ geo: new THREE.ConeGeometry(4, 1.8, 4), color: '#4d3f30', x: g.x1 - 8, y: 3.9, z: g.z0 + 7, ry: Math.PI / 4 });
  hedgeLine(parts, g.x0, g.z0 + 1, g.x1, g.z0 + 1);
}
function rMeadow(g, bin, parts, out) {
  lawnPlane(bin, g, GRASS_A);
  pathStrip(bin, g.x0 + 5, g.z1 - 8, g.x1 - 5, g.z0 + 8, 1.8);
  // wildflower drifts
  const n = Math.floor((g.x1 - g.x0) * (g.z1 - g.z0) / 90);
  for (let i = 0; i < n; i++)
    out.flowers.push({ x: rr(g.x0 + 4, g.x1 - 4), z: rr(g.z0 + 4, g.z1 - 4), s: rr(.5, 1),
      color: pick(['#e8e0b0', '#d4a0b8', '#f0ece0', '#b8c878', '#d4885a']) });
}
function rOrchard(g, bin, parts, out) {
  lawnPlane(bin, g, GRASS_C);
  // orchard rows + retention pond in the corner — jittered planting + varied
  // crown size so rows read as trees, not corduroy, from the air
  for (let r = 0; r < Math.floor((g.z1 - g.z0 - 30) / 12); r++)
    for (let c = 0; c < Math.floor((g.x1 - g.x0 - 14) / 11); c++)
      out.trees.push({ x: g.x0 + 10 + c * 11 + rr(-2.4, 2.4),
        z: g.z0 + 10 + r * 12 + rr(-2.4, 2.4), s: rr(.7, 1.05), t: 'o' });
  // pond
  const px = g.x1 - 22, pz = g.z1 - 20;
  bin.plane(34, 24, pbr('gravel', { repeat: [3, 3], color: '#c9bd9a' }), px, Y + .002, pz);
  const wat = new THREE.Mesh(new THREE.CircleGeometry(13, 28),
    waterMaterial({ color: '#33556a' }));
  wat.rotation.x = -Math.PI / 2; wat.position.set(px, Y + .05, pz);
  wat.scale.set(1.25, .85, 1); wat.userData.dynamic = true;
  out.extra.push(wat);
}
function rGrove(g, bin, parts, out) {
  lawnPlane(bin, g, GRASS_C);
  const n = Math.floor((g.x1 - g.x0) * (g.z1 - g.z0) / 320);
  for (let i = 0; i < n; i++)
    out.trees.push({ x: rr(g.x0 + 5, g.x1 - 5), z: rr(g.z0 + 5, g.z1 - 5),
      s: rr(1.0, 1.7), t: R() < .6 ? 'p' : 'c' });
  if ((g.x1 - g.x0) > 60) pathStrip(bin, g.x0 + 4, (g.z0 + g.z1) / 2, g.x1 - 4, (g.z0 + g.z1) / 2, 1.7);
}

const RENDER = { pocketpark: rPocketPark, garden: rGarden, meadow: rMeadow,
                 orchard: rOrchard, grove: rGrove };

export function buildGreens(scene) {
  const bin = new GeoBin();
  const out = { trees: [], bushes: [], flowers: [], extra: [] };
  const parts = [];
  const signed = [];
  for (const g of GREENS) {
    const render = RENDER[g.use] || rPocketPark;
    render(g, bin, parts, out);
    // entry sign on parcels big enough to be destinations
    if (g.name && (g.x1 - g.x0) * (g.z1 - g.z0) > 900) {
      const sg = entrySign(parts, g, g.name);
      signed.push({ g, sg });
    }
    CITY.parcels.push({ id: g.id, use: g.use, w: g.x1 - g.x0, d: g.z1 - g.z0 });
  }

  /* ground edge blending - a speckle-alpha ribbon straddling each parcel's
     boundary so grass fades into the neighboring ground instead of a hard
     rect edge. One merged ShapeGeometry ring set + shared alpha map. */
  {
    const [ac, ax] = makeCanvas(128, 128);
    ax.clearRect(0, 0, 128, 128);
    const Rn = mulberry32(6137);                              // seeded noise
    for (let i = 0; i < 900; i++) {
      const a = .15 + Rn() * .85;
      ax.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      ax.beginPath();
      ax.arc(Rn() * 128, Rn() * 128, .5 + Rn() * 1.6, 0, 6.283);
      ax.fill();
    }
    const edgeAlpha = canvasTex(ac, { srgb: false });
    edgeAlpha.wrapS = edgeAlpha.wrapT = THREE.RepeatWrapping;
    edgeAlpha.repeat.set(.055, .055);
    const edgeM = new M({ color: '#7d814f', roughness: .95, transparent: true,
      alphaMap: edgeAlpha, depthWrite: false });
    edgeM.envMapIntensity = .08;
    const ring = (x0, x1, z0, z1, E = 2.4, I = .9) => {
      const sh = new THREE.Shape();
      sh.moveTo(x0 - E, -z1 - E); sh.lineTo(x1 + E, -z1 - E);
      sh.lineTo(x1 + E, -z0 + E); sh.lineTo(x0 - E, -z0 + E); sh.closePath();
      const hole = new THREE.Path();
      hole.moveTo(x0 + I, -z1 + I); hole.lineTo(x0 + I, -z0 - I);
      hole.lineTo(x1 - I, -z0 - I); hole.lineTo(x1 - I, -z1 + I);
      hole.closePath();
      sh.holes.push(hole);
      const geo = new THREE.ShapeGeometry(sh);
      geo.rotateX(-Math.PI / 2); geo.translate(0, Y + .0025, 0);
      return geo;
    };
    const rings = GREENS.map(g => ring(g.x0, g.x1, g.z0, g.z1));
    rings.push(ring(PLAZA.x - PLAZA.w / 2, PLAZA.x + PLAZA.w / 2,
                    PLAZA.z - PLAZA.d / 2, PLAZA.z + PLAZA.d / 2, 1.6, .5));
    const merged = new THREE.Mesh(
      mergeGeometries(rings.map(r => r.toNonIndexed()), false), edgeM);
    merged.receiveShadow = true;
    scene.add(merged);
    rings.forEach(r => r.dispose());
  }
  CITY.greens = GREENS.length;
  // all parcel signs share one canvas atlas -> one material -> one draw call
  if (signed.length) {
    const cols = Math.ceil(Math.sqrt(signed.length)),
          rows = Math.ceil(signed.length / cols), cw = 256, ch = 96;
    const [ac, ax] = makeCanvas(cols * cw, rows * ch);
    signed.forEach(({ g }, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
      ax.fillStyle = '#3a4a38'; ax.fillRect(cx, cy, cw, ch);
      ax.strokeStyle = '#8a8f6a'; ax.lineWidth = 3; ax.strokeRect(cx + 3, cy + 3, cw - 6, ch - 6);
      ax.fillStyle = '#efe8d0'; ax.font = 'bold 28px Georgia';
      ax.textAlign = 'center'; ax.textBaseline = 'middle';
      ax.fillText(g.name, cx + cw / 2, cy + ch / 2);
    });
    const atlasM = new M({ map: canvasTex(ac), roughness: .7 });
    signed.forEach(({ sg }, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const u0 = col / cols, u1 = (col + 1) / cols,
            v0 = 1 - (row + 1) / rows, v1 = 1 - row / rows;
      const g2 = new THREE.PlaneGeometry(3.2, 1.1);
      const uv = g2.attributes.uv;
      uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
      bin.add(g2, atlasM, sg.x, 1.95, sg.z + .11);
    });
  }

  // instanced parcel vegetation (same species system style as buildTrees)
  if (out.trees.length) {
    const trunkG = new THREE.CylinderGeometry(.24, .44, 4.2, 6); trunkG.translate(0, 2.1, 0);
    const trunkM = new M({ color: '#6e5c48', roughness: .95 });
    const folG = new THREE.IcosahedronGeometry(2.3, 0); folG.translate(0, 5.6, 0);
    const conG = new THREE.ConeGeometry(1.9, 7.4, 7); conG.translate(0, 4.6, 0);
    const folM = new M({ color: '#fff', roughness: .95, flatShading: true });
    const oaks = thin(out.trees.filter(t => t.t !== 'p' && t.t !== 'c'));
    const cons = thin(out.trees.filter(t => t.t === 'p' || t.t === 'c'));
    if (oaks.length) scene.add(instances(trunkG, trunkM, oaks));
    if (oaks.length) {
      const im = new THREE.InstancedMesh(folG, folM, oaks.length);
      const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
      oaks.forEach((t, i) => {
        p.set(t.x, 0, t.z); sc.set(t.s * rr(.8, 1.2), t.s * rr(.8, 1.1), t.s * rr(.8, 1.2));
        q.setFromEuler(new THREE.Euler(0, rr(0, 6.28), 0)); Mx.compose(p, q, sc);
        im.setMatrixAt(i, Mx);
        col.setHSL(.25 + rr(-.05, .05), .45 + rr(-.1, .1), .24 + rr(-.05, .07)); im.setColorAt(i, col);
      });
      im.castShadow = im.receiveShadow = true; im.userData.staticInst = true; scene.add(im);
    }
    if (cons.length) {
      const im = new THREE.InstancedMesh(conG, folM, cons.length);
      const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
      cons.forEach((t, i) => {
        p.set(t.x, 0, t.z); sc.set(t.s * rr(.85, 1.15), t.s, t.s * rr(.85, 1.15));
        q.setFromEuler(new THREE.Euler(0, rr(0, 6.28), 0)); Mx.compose(p, q, sc);
        im.setMatrixAt(i, Mx);
        col.setHSL(.34 + rr(-.04, .04), .42 + rr(-.08, .08), .15 + rr(-.03, .05)); im.setColorAt(i, col);
      });
      im.castShadow = im.receiveShadow = true; im.userData.staticInst = true; scene.add(im);
    }
      scene.add(instances(trunkG, trunkM, cons));
  }
  if (out.flowers.length) {
    const flG = new THREE.IcosahedronGeometry(.24, 0); flG.translate(0, .4, 0);
    scene.add(instances(flG, new M({ color: '#fff', roughness: .85 }), thin(out.flowers), { shadow: false }));
  }
  if (parts.length) {
    const pm = new THREE.Mesh(colored(parts), VCOL());
    pm.castShadow = pm.receiveShadow = true; scene.add(pm);
  }
  out.extra.forEach(m => scene.add(m));
  bin.build(scene, { shadows: false });
}
