// city/yards.js — interior-block infill. The "dead lawn" fix: a fenced
// backyard behind every frontage house (lot-line fence, shed, patio, garden
// beds, playset, shade tree, shrubs, clothesline, doghouse) plus programmed
// 'commons' strips (playlot / dog run / half-court / community beds /
// mini-grove) on the leftover interior bands.
//
// Lot geometry comes from yardsData.js (pure math, shared with audit.mjs).
// Everything renders through GeoBin + colored() + instancing so the whole
// program costs a handful of draw calls. Deterministic via shared R().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isFree, occupyRect } from './occ.js';
import { GeoBin } from './geo.js';
import { CITY } from './stats.js';
import { yardLots } from './yardsData.js';
import { colored, mat, instances, R, rr, pick, VCOL, thin } from '../lib.js';

const Y = .28;
const WOOD = '#8a7350', WOOD2 = '#7a6444';      // weathered cedar fence

/* rect-level free-ground test: centre + four corners — a yard must fit on
   clear interior ground, never draped across a building/green/band edge */
const rectFree = (x, z, w, d) =>
  isFree(x, z, 1.2) &&
  isFree(x - w / 2 + 1, z - d / 2 + 1, 1) && isFree(x + w / 2 - 1, z - d / 2 + 1, 1) &&
  isFree(x - w / 2 + 1, z + d / 2 - 1, 1) && isFree(x + w / 2 - 1, z + d / 2 - 1, 1);

const stats = { lots: 0, fenced: 0, sheds: 0, patios: 0, gardens: 0,
                playsets: 0, commons: 0, yardTrees: 0 };

/* wooden fence run: posts + 2 rails (vertex-colored -> global merge) */
function fenceRun(parts, x0, z0, x1, z1, gate = false) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 1) return;
  const ry = -Math.atan2(dz, dx);               // box +x axis onto run dir
  const segs = gate ? [[0, .38], [.62, 1]] : [[0, 1]];
  for (const [t0, t1] of segs) {
    const l = len * (t1 - t0), mx = x0 + dx * (t0 + t1) / 2, mz = z0 + dz * (t0 + t1) / 2;
    parts.push({ geo: new THREE.BoxGeometry(l, .09, .07), color: WOOD, x: mx, y: .5, z: mz, ry });
    parts.push({ geo: new THREE.BoxGeometry(l, .09, .07), color: WOOD, x: mx, y: .92, z: mz, ry });
  }
  const n = Math.ceil(len / 3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push({ geo: new THREE.BoxGeometry(.16, 1.1, .16), color: WOOD2,
      x: x0 + dx * t, y: .55, z: z0 + dz * t });
  }
}

function shed(parts, x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  parts.push({ geo: new THREE.BoxGeometry(3, 2.2, 2.4), color: pick(['#a08a6a', '#8a8f94', '#7d8a7a']),
    x, y: 1.1, z, ry });
  // gable roof (ridge along x of the shed)
  parts.push({ geo: new THREE.BoxGeometry(3.4, .16, 2.8), color: '#5d5e61', x, y: 2.28, z, ry });
  for (const sx of [-1, 1])
    parts.push({ geo: new THREE.BoxGeometry(.12, .5, 2.82), color: '#5d5e61',
      x: x + sx * 1.68 * c, y: 2.5, z: z - sx * 1.68 * s, ry });
  // door + window
  parts.push({ geo: new THREE.BoxGeometry(.8, 1.5, .06), color: '#4a3f32',
    x: x + .6 * c + 1.22 * s, y: .75, z: z - .6 * s + 1.22 * c, ry });
}

function patio(bin, parts, x, z) {
  bin.plane(4.2, 3.4, patioMat(), x, Y + .02, z);
  parts.push({ geo: new THREE.BoxGeometry(1.4, .05, .9), color: '#b8b0a0', x: x + 1.6, y: Y + .04, z: z + 1 });
  if (R() < .6)   // grill
    parts.push({ geo: new THREE.BoxGeometry(.7, .9, .6), color: '#2c2f33', x: x - 1.6, y: .45, z: z + 1 });
}
let _patioM = null;
function patioMat() { return _patioM ||= mat('#b3a892', { roughness: .9 }); }

function gardenBed(parts, x, z) {
  for (const dz of [-1, 0, 1]) {
    parts.push({ geo: new THREE.BoxGeometry(2.6, .35, 1.0), color: '#4a3a2a', x, y: .17, z: z + dz * 1.5 });
    const n = 5;
    for (let i = 0; i < n; i++)
      parts.push({ geo: new THREE.SphereGeometry(.16, 6, 5), color: pick(['#4e7d46', '#6a8f3c', '#8aa04a', '#c2b45a']),
        x: x - 1 + i * .5, y: .45, z: z + dz * 1.5 });
  }
}

function playset(parts, x, z) {
  // swing A-frames + crossbar + seats
  const a = pick(['#c0392b', '#2e5b8a', '#3d7a52']);
  for (const sx of [-1, 1]) {
    parts.push({ geo: new THREE.BoxGeometry(.14, 2.2, .14), color: a, x: x + sx * 1.9, y: 1.1, z: z - .8 });
    parts.push({ geo: new THREE.BoxGeometry(.14, 2.2, .14), color: a, x: x + sx * 1.9, y: 1.1, z: z + .8 });
  }
  parts.push({ geo: new THREE.BoxGeometry(4, .12, .12), color: a, x, y: 2.2, z });
  for (const sx of [-.8, .8])
    parts.push({ geo: new THREE.BoxGeometry(.5, .06, .3), color: '#2c2f33', x: x + sx, y: .8, z });
}

function clothesline(parts, x, z) {
  parts.push({ geo: new THREE.BoxGeometry(.08, 1.8, .08), color: '#8a9094', x: x - 2, y: .9, z });
  parts.push({ geo: new THREE.BoxGeometry(.08, 1.8, .08), color: '#8a9094', x: x + 2, y: .9, z });
  parts.push({ geo: new THREE.BoxGeometry(4, .02, .02), color: '#b8c0c4', x, y: 1.7, z });
  for (let i = 0; i < 3; i++)
    parts.push({ geo: new THREE.BoxGeometry(.6, .5, .02), color: pick(['#e8e6df', '#7ba0c4', '#c47b7b']),
      x: x - 1.2 + i * 1.1, y: 1.45, z });
}

function doghouse(parts, x, z) {
  parts.push({ geo: new THREE.BoxGeometry(1.1, .8, 1.2), color: '#8a6a4a', x, y: .4, z });
  parts.push({ geo: new THREE.BoxGeometry(1.3, .12, 1.4), color: '#4a4e52', x, y: .86, z });
}

/* --- per-commons programs on interior bands ----------------------------- */
function commons(lot, bin, parts, trees) {
  const kinds = ['playlot', 'dogrun', 'halfcourt', 'beds', 'minigrove'];
  // pick along the band: one program per ~55m of width; each chunk checks
  // its own anchor so scattered interior trees never kill the whole strip
  const n = Math.max(1, Math.floor(lot.w / 55));
  for (let i = 0; i < n; i++) {
    const cx = lot.x - lot.w / 2 + (i + .5) * lot.w / n,
          cz = lot.z, kind = kinds[Math.floor(R() * kinds.length)];
    const w = Math.min(lot.w / n - 8, 40), d = Math.min(lot.d - 4, 24);
    if (!rectFree(cx, cz, w, d)) continue;
    switch (kind) {
      case 'playlot': {
        bin.plane(Math.min(w * .8, 24), Math.min(d * .8, 18), playMat(), cx, Y + .015, cz);
        playset(parts, cx - 3, cz);
        parts.push({ geo: new THREE.BoxGeometry(1.2, 1.6, 1.2), color: '#c0392b', x: cx + 4, y: .8, z: cz - 1 });
        parts.push({ geo: new THREE.BoxGeometry(3.4, .18, 1.4), color: '#c4b45a', x: cx + 4.6, y: 1.62, z: cz - 1, rz: -.5 });
        // sandbox
        parts.push({ geo: new THREE.BoxGeometry(3, .3, 3), color: '#c9b898', x: cx + w * .2, y: .15, z: cz + d * .25 });
        break;
      }
      case 'dogrun': {
        const pw = Math.min(w * .85, 26), pd = Math.min(d * .85, 18);
        bin.plane(pw, pd, barkMat(), cx, Y + .015, cz);
        const hw = pw * .5, hd = pd * .5;
        fenceRun(parts, cx - hw, cz - hd, cx + hw, cz - hd, true);
        fenceRun(parts, cx + hw, cz - hd, cx + hw, cz + hd);
        fenceRun(parts, cx + hw, cz + hd, cx - hw, cz + hd);
        fenceRun(parts, cx - hw, cz + hd, cx - hw, cz - hd);
        parts.push({ geo: new THREE.CylinderGeometry(.18, .22, .8, 8), color: '#8a9094', x: cx, y: .4, z: cz });
        // agility posts + a bench inside the run so it isn't a bare pad
        for (const [px, pz] of [[-.3, -.4], [.2, .1], [-.15, .42]])
          parts.push({ geo: new THREE.CylinderGeometry(.06, .06, 1.1, 6), color: '#c0392b',
            x: cx + px * pw, y: .55, z: cz + pz * pd });
        benchAt(parts, cx + hw * .6, cz - hd * .5, 0);
        break;
      }
      case 'halfcourt': {
        bin.plane(15, Math.min(d, 12), courtMat(), cx, Y + .015, cz);
        parts.push({ geo: new THREE.CylinderGeometry(.12, .12, 3.4, 6), color: '#3a3f43', x: cx - 6.5, y: 1.7, z: cz });
        parts.push({ geo: new THREE.BoxGeometry(1.6, 1, .08), color: '#e8e6df', x: cx - 6.5, y: 3.4, z: cz });
        parts.push({ geo: new THREE.CylinderGeometry(.36, .36, .06, 10).rotateX(Math.PI / 2), color: '#c0392b', x: cx - 6.5, y: 3.1, z: cz + .2 });
        break;
      }
      case 'beds': {
        // community garden rows
        for (let g = 0; g < Math.floor(d / 4); g++)
          gardenBed(parts, cx + rr(-2, 2), cz - d / 2 + 2 + g * 4);
        break;
      }
      default: {   // minigrove
        bin.plane(Math.min(w * .7, 30), Math.min(d * .7, 20), lawn2Mat(), cx, Y + .012, cz);
        for (let tI = 0; tI < Math.floor(w / 11); tI++)
          trees.push({ x: cx - w * .3 + tI * 10 + rr(-2, 2), z: cz + rr(-d * .3, d * .3),
            s: rr(.9, 1.4), t: pick(['o', 'm', 'b']) });
        // bench pair on a gravel pad
        bin.plane(6, 2.4, pathMat(), cx, Y + .018, cz + d * .32);
        benchAt(parts, cx - 1.8, cz + d * .32, Math.PI);
        benchAt(parts, cx + 1.8, cz + d * .32, Math.PI);
      }
    }
    stats.commons++;
  }
}
let _playM = null, _barkM = null, _courtM = null, _lawn2M = null, _pathM = null;
function playMat() { return _playM ||= mat('#a8905c', { roughness: 1 }); }
function barkMat() { return _barkM ||= mat('#7a5c3c', { roughness: 1 }); }
function courtMat() { return _courtM ||= mat('#3f5560', { roughness: .92 }); }
function lawn2Mat() { return _lawn2M ||= mat('#6f8f52', { roughness: 1 }); }
function pathMat() { return _pathM ||= mat('#b8a888', { roughness: 1 }); }

function benchAt(parts, x, z, ry) {
  parts.push({ geo: new THREE.BoxGeometry(2.2, .1, .55), color: '#7a5c3e', x, y: .5, z, ry });
  parts.push({ geo: new THREE.BoxGeometry(2.2, .45, .09), color: '#7a5c3e', x, y: .75, z: z - .25, ry });
  for (const sx of [-1, 1])
    parts.push({ geo: new THREE.BoxGeometry(.14, .5, .5), color: '#3a3f43', x: x + sx, y: .25, z, ry });
}

/* ---------------------------------- main --------------------------------- */
export function buildYards(scene) {
  const bin = new GeoBin();
  const parts = [];
  let trees = [];

  for (const lot of yardLots()) {
    if (lot.kind === 'commons') { commons(lot, bin, parts, trees); continue; }
    // yard lot guard: interior ground only — never on hardscape or a
    // building/lot/green rect edge (commons chunks self-check instead)
    if (!rectFree(lot.x, lot.z, lot.w, lot.d)) continue;

    stats.lots++;
    const hw = lot.w / 2, hd = lot.d / 2;
    // fence: rear lot line + two side stubs (gate gap on the rear)
    const toward = lot.face === 'n' ? 1 : lot.face === 's' ? -1 : 0; // +z side when n
    if (lot.face === 'w') {          // vertical block: rear faces -x
      fenceRun(parts, lot.x - hw, lot.z - hd, lot.x - hw, lot.z + hd, true);
      fenceRun(parts, lot.x - hw, lot.z - hd, lot.x + hw * .4, lot.z - hd);
      fenceRun(parts, lot.x - hw, lot.z + hd, lot.x + hw * .4, lot.z + hd);
    } else {
      const rearZ = lot.z + toward * hd;
      fenceRun(parts, lot.x - hw, rearZ, lot.x + hw, rearZ, R() < .8);
      fenceRun(parts, lot.x - hw, lot.z - toward * hd * .3, lot.x - hw, rearZ);
      fenceRun(parts, lot.x + hw, lot.z - toward * hd * .3, lot.x + hw, rearZ);
    }
    stats.fenced++;

    // seeded per-lot furnishing — each anchor checks free ground so yards
    // never drop furniture onto a straggler tree or prop
    const cx = lot.x, cz = lot.z;
    const freeAt = (x, z, r = 1.4) => isFree(x, z, r);
    if (lot.d >= 6 && R() < .38 && freeAt(cx + hw * .45, cz + toward * hd * .55, 1.8)) { shed(parts, cx + hw * .45, cz + toward * hd * .55, 0); stats.sheds++; }
    if (R() < .45 && freeAt(cx - hw * .3, cz - toward * hd * .6, 2.2)) { patio(bin, parts, cx - hw * .3, cz - toward * hd * .6); stats.patios++; }
    if (R() < .3 && freeAt(cx, cz, 2))  { gardenBed(parts, cx + rr(-hw * .3, hw * .3), cz); stats.gardens++; }
    if (lot.d >= 7 && R() < .22 && freeAt(cx, cz, 2.4)) { playset(parts, cx + rr(-hw * .2, hw * .2), cz); stats.playsets++; }
    if (R() < .15) clothesline(parts, cx + rr(-2, 2), cz - toward * hd * .3);
    if (R() < .1)  doghouse(parts, cx + rr(-hw * .4, hw * .4), cz + toward * hd * .2);
    if (R() < .55) { // shade tree near a rear corner
      trees.push({ x: cx - hw * .35, z: cz + toward * hd * .4, s: rr(.7, 1.1), t: pick(['o', 'm']) });
      stats.yardTrees++;
    }
    // shrub cluster along the fence
    if (R() < .5)
      for (const sx of [-.4, .4])
        parts.push({ geo: new THREE.IcosahedronGeometry(.5, 0), color: '#4e6b3e',
          x: cx + sx * hw, y: .4, z: cz + toward * hd * .8 });
    occupyRect(lot.x, lot.z, lot.w, lot.d, .5);
  }

  bin.build(scene);
  const m = new THREE.Mesh(colored(parts), VCOL());
  m.castShadow = m.receiveShadow = true; scene.add(m);

  // yard trees instanced with the same two-tone scheme as buildTrees
  if (trees.length) {
    trees = thin(trees);
    const trunkG = new THREE.CylinderGeometry(.22, .4, 3.6, 6); trunkG.translate(0, 1.8, 0);
    scene.add(instances(trunkG, mat('#4a3527'), trees.map(t => ({ x: t.x, z: t.z, s: t.s }))));
    stats.yardTrees = trees.length;
    const folG = new THREE.IcosahedronGeometry(2.1, 0); folG.scale(1, .85, 1); folG.translate(0, 4.6, 0);
    const folG2 = new THREE.IcosahedronGeometry(1.4, 0); folG2.translate(.9, 5.9, .4);
    const fol = new THREE.InstancedMesh(
      mergeGeometries([folG, folG2], false),
      new THREE.MeshStandardMaterial({ color: '#fff', roughness: .95, flatShading: true }),
      trees.length);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(),
          p = new THREE.Vector3(), col = new THREE.Color();
    trees.forEach((t, i) => {
      p.set(t.x, 0, t.z); sc.set(t.s, t.s, t.s);
      q.setFromEuler(new THREE.Euler(0, rr(0, 6.28), 0));
      Mx.compose(p, q, sc); fol.setMatrixAt(i, Mx);
      col.setHSL(.26 + rr(-.04, .04), .42 + rr(-.08, .08), .30 + rr(-.05, .07));
      fol.setColorAt(i, col);
    });
    fol.castShadow = fol.receiveShadow = true;
    fol.userData.staticInst = true;
    scene.add(fol);
  }
  CITY.yards = stats;
}
