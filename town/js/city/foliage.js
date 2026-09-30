// city/foliage.js — alpha-carded foliage: AAA-style tree crowns built from
// clustered leaf-texture cards instead of faceted blobs. Render-side geometry
// + textures generated procedurally; consumed by buildTrees() in details.js.
//
// Technique: each crown is a merged geometry of alpha-tested quads scattered
// through a species-shaped volume (outer shell biased). One InstancedMesh per
// species keeps draw calls flat; per-instance color jitter preserved via
// setColorAt. Depth material carries the alpha test so shadows keep leaf
// silhouettes; a shared uTime uniform drives vertex wind sway.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTex, R, rr, uTime } from '../lib.js';

/* ================= leaf-cluster textures =================
   Neutral-olive leaflets so per-instance hue tint stays in control —
   highly saturated textures would double-saturate when tinted. */
function leafClusterTexture(kind = 'broad') {
  const W = 256;
  const [c, x] = makeCanvas(W, W);
  // twig skeleton — faint dark strokes radiating from bottom-center
  x.strokeStyle = 'rgba(58,48,36,.5)';
  x.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * .42 + rr(-.1, .1);
    x.lineWidth = rr(1.5, 3);
    x.beginPath();
    x.moveTo(W / 2, W * .96);
    x.quadraticCurveTo(W / 2 + Math.cos(a) * W * .18, W * .6 + Math.sin(a) * W * .2,
      W / 2 + Math.cos(a) * W * .38, W * .5 + Math.sin(a) * W * .4);
    x.stroke();
  }
  const leaf = (px, py, s, tone, rot) => {
    x.save(); x.translate(px, py); x.rotate(rot);
    x.fillStyle = tone;
    x.beginPath(); x.ellipse(0, 0, s, s * .42, 0, 0, 7); x.fill();
    x.restore();
  };
  // lobed clumps — several sub-clusters like a real crown mass
  const tones = ['rgba(96,110,70,', 'rgba(112,124,76,', 'rgba(84,98,62,',
                 'rgba(124,134,84,', 'rgba(72,88,58,'];
  const lobes = kind === 'bloom' ? 7 : kind === 'droop' ? 9 : 6;
  for (let l = 0; l < lobes; l++) {
    const lx = W / 2 + rr(-.3, .3) * W * .55, ly = W * .52 + rr(-.32, .3) * W * .5;
    const lr = rr(W * .13, W * .2);
    const n = kind === 'droop' ? 12 : 26;
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.28), r = Math.sqrt(R()) * lr;
      const px = lx + Math.cos(a) * r, py = ly + Math.sin(a) * r * .8;
      const tone = tones[Math.floor(R() * tones.length)];
      const al = rr(.85, 1);
      if (kind === 'droop') {
        // hanging strand: chain of small leaves down a wiggle line
        const s = rr(3, 6), hh = rr(14, 34);
        x.save(); x.translate(px, py); x.rotate(rr(-.35, .35));
        for (let k = 0; k < hh / 4; k++)
          leaf(0, k * 4, s * (1 - k * .04), tone + (al * (1 - k / (hh / 4) * .4)) + ')', rr(-.7, .7));
        x.restore();
      } else {
        leaf(px, py, rr(4.5, 9) * (kind === 'fine' ? .7 : 1), tone + al + ')', rr(0, 6.28));
      }
    }
    if (kind === 'bloom') {
      // blossom specks sitting on the leaf mass
      for (let i = 0; i < 26; i++) {
        const a = rr(0, 6.28), r = Math.sqrt(R()) * lr;
        x.fillStyle = `rgba(232,196,210,${rr(.7, .95)})`;
        x.beginPath(); x.arc(lx + Math.cos(a) * r, ly + Math.sin(a) * r * .8, rr(1.6, 3.4), 0, 7); x.fill();
      }
    }
  }
  // interior shade — deeper center so the clump reads volumetric
  x.globalCompositeOperation = 'source-atop';
  const g = x.createRadialGradient(W / 2, W / 2, W * .1, W / 2, W / 2, W * .52);
  g.addColorStop(0, 'rgba(40,52,32,.30)'); g.addColorStop(1, 'rgba(40,52,32,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  x.globalCompositeOperation = 'source-over';
  const t = canvasTex(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function needleTexture() {
  const W = 256;
  const [c, x] = makeCanvas(W, W);
  // branch skeleton arcs down from top-center; needle sprays off it
  for (let b = 0; b < 6; b++) {
    const bx = W * (.18 + b * .13), top = W * rr(.1, .22);
    x.strokeStyle = 'rgba(52,44,34,.55)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(bx, top);
    x.quadraticCurveTo(bx + rr(-8, 8), W * .6, bx + rr(-14, 14), W * .94); x.stroke();
    const n = 44;
    for (let i = 0; i < n; i++) {
      const t = i / n, py = top + t * (W * .94 - top), px = bx + Math.sin(t * 6) * 7;
      const len = rr(10, 20) * (1.15 - t * .5), a = Math.PI / 2 + rr(-.6, .6);
      const shade = rr(.75, 1);
      x.strokeStyle = `rgba(${58 * shade | 0},${82 * shade | 0},${52 * shade | 0},${rr(.8, 1)})`;
      x.lineWidth = rr(1, 1.9);
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * len * rr(-1, 1) * .3, py + len * .55); x.stroke();
    }
  }
  const t = canvasTex(c);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const _texCache = new Map();
function foliageTex(kind) {
  if (!_texCache.has(kind))
    _texCache.set(kind, kind === 'needle' ? needleTexture() : leafClusterTexture(kind));
  return _texCache.get(kind);
}

/* ================= crown card geometry =================
   regions: [{ cx,cy,cz, rx,ry,rz, n, size:[lo,hi], shell, ring, droop, tilt }]
   Each card: sampled inside/at a spheroid region, oriented outward (or
   hanging for droop), full-uv quad, per-card shade + aSway attribute. */
export function crownGeo(regions, seed = 0) {
  const geos = [];
  const rnd = mulberryLocal(seed);
  const rrn = (a, b) => a + rnd() * (b - a);
  for (const rg of regions) {
    for (let i = 0; i < rg.n; i++) {
      const s = rrn(rg.size[0], rg.size[1]);
      const g = new THREE.PlaneGeometry(s, s);
      const out = new THREE.Vector3();
      let px, py, pz, r01;
      if (rg.ring) {
        // ring of cards at the spheroid's equator — conifer whorls
        const a = (i / rg.n) * Math.PI * 2 + rrn(-.2, .2);
        r01 = rrn(.82, 1.0);
        px = Math.cos(a) * rg.rx * r01; pz = Math.sin(a) * rg.rz * r01;
        py = rg.ry * rrn(-.35, .35);
        out.set(Math.cos(a) / rg.rx, .18, Math.sin(a) / rg.rz).normalize();
      } else {
        // volume-fill spheroid, biased to the shell
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
        const rr2 = Math.sqrt(1 - u * u);
        r01 = rg.shell ? rrn(rg.shell, 1) : Math.cbrt(rnd());
        px = Math.cos(a) * rr2 * rg.rx * r01;
        py = u * rg.ry * r01;
        pz = Math.sin(a) * rr2 * rg.rz * r01;
        out.set(px / (rg.rx * rg.rx), py / (rg.ry * rg.ry) || 0.001, pz / (rg.rz * rg.rz)).normalize();
      }
      const q = new THREE.Quaternion();
      if (rg.droop) {
        // hanging curtain: plane's +Y maps to world down, facing outward ±yaw
        const yaw = Math.atan2(out.x, out.z) + rrn(-.5, .5);
        q.setFromEuler(new THREE.Euler(rrn(-.12, .12), yaw, rrn(-.12, .12)));
      } else {
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rrn(0, Math.PI * 2)));
        if (rg.tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rg.tilt));
      }
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(rg.cx + px, rg.cy + py, rg.cz + pz), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      // per-card attributes: shade jitter + sway weight (outerness)
      const n = g.attributes.position.count;
      const shade = rrn(.86, 1.12);
      const col = new Float32Array(n * 3), sw = new Float32Array(n);
      for (let v = 0; v < n; v++) {
        col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = shade;
        sw[v] = r01 * (rg.sway ?? 1);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
      geos.push(g);
    }
  }
  return mergeGeometries(geos, false);
}
function mulberryLocal(seed) {
  let a = (20260924 + seed * 7919) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= material w/ wind ================= */
export function foliageMat(kind, { vertexColors = true } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: foliageTex(kind),
    alphaTest: .34,
    side: THREE.DoubleSide,
    roughness: .92,
    metalness: 0,
    vertexColors,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uT; attribute float aSway; varying float vSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSway = aSway;
        {
          #ifdef USE_INSTANCING
            vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          #else
            vec2 ip = vec2(0.0);
          #endif
          float ph = dot(ip, vec2(0.171, 0.113));
          float w = aSway * aSway * 0.11;
          transformed += vec3(
            sin(uT * 1.35 + ph) + .45 * sin(uT * 2.9 + ph * 1.7),
            .35 * sin(uT * 2.1 + ph * 1.3),
            cos(uT * 1.15 + ph) + .4 * cos(uT * 2.4 + ph)
          ) * w;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vSway;`)
      // lift shadowed interiors slightly — cards read too dark otherwise
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.055;`);
  };
  // depth material carries alpha cutout so cast shadows keep leaf silhouettes
  m.customDepthMaterial = null; // set by caller via makeDepth()
  return m;
}
export function foliageDepth(kind) {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: foliageTex(kind),
    alphaTest: .42,
    side: THREE.DoubleSide,
  });
}
export function foliageMesh(geo, kind, list, { jitterHue = .06, sat = .42, lit = .3,
                                               hue = .27, yoff = 0, shadows = true } = {}) {
  const m = foliageMat(kind);
  const im = new THREE.InstancedMesh(geo, m, list.length);
  im.customDepthMaterial = foliageDepth(kind);
  const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(),
        p = new THREE.Vector3(), col = new THREE.Color();
  list.forEach((t, i) => {
    p.set(t.x, (t.yoff ?? yoff) * t.s, t.z);
    sc.set(t.s * rr(.82, 1.22), t.s * rr(.82, 1.2), t.s * rr(.82, 1.22));
    q.setFromEuler(new THREE.Euler(rr(-.05, .05), rr(0, 6.28), rr(-.05, .05)));
    Mx.compose(p, q, sc); im.setMatrixAt(i, Mx);
    col.setHSL(hue + rr(-jitterHue, jitterHue), sat + rr(-.1, .12), lit + rr(-.05, .08));
    im.setColorAt(i, col);
  });
  im.castShadow = im.receiveShadow = shadows;
  im.instanceMatrix.needsUpdate = true;
  im.userData.staticInst = true;   // wind sway is shader-side — MIN may chunk it
  return im;
}

/* ================= species crown definitions =================
   Card counts are per crown geometry (one IM per species).
   Positions are local — scale/rotation applied per instance. */
export const CROWNS = {
  oak: () => crownGeo([
    { cx: 0, cy: 6.1, cz: 0, rx: 3.1, ry: 2.3, rz: 3.1, n: 42, size: [1.0, 1.7], shell: .38 },
    { cx: 0, cy: 5.3, cz: 0, rx: 3.4, ry: 1.6, rz: 3.4, n: 16, size: [.8, 1.3], shell: .55 },
    { cx: 0, cy: 7.4, cz: 0, rx: 2.2, ry: 1.4, rz: 2.2, n: 12, size: [.8, 1.3], shell: .45 },
  ], 1),
  maple: () => crownGeo([
    { cx: 0, cy: 5.9, cz: 0, rx: 2.8, ry: 2.5, rz: 2.8, n: 40, size: [.9, 1.5], shell: .4 },
    { cx: 0, cy: 7.6, cz: 0, rx: 1.7, ry: 1.2, rz: 1.7, n: 10, size: [.7, 1.1], shell: .35 },
  ], 2),
  birch: () => crownGeo([
    { cx: 0, cy: 7.3, cz: 0, rx: 1.8, ry: 1.7, rz: 1.8, n: 18, size: [.7, 1.15], shell: .4 },
    { cx: 0, cy: 6.4, cz: 0, rx: 1.4, ry: 1.0, rz: 1.4, n: 6, size: [.6, .9], shell: .5 },
  ], 3),
  sakura: () => crownGeo([
    { cx: 0, cy: 5.6, cz: 0, rx: 2.7, ry: 2.0, rz: 2.7, n: 28, size: [.85, 1.4], shell: .45 },
    { cx: 0, cy: 6.9, cz: 0, rx: 1.8, ry: 1.2, rz: 1.8, n: 8, size: [.7, 1.0], shell: .4 },
  ], 4, ),
  elm: () => crownGeo([
    // vase: lobes ringed around + crown cap
    ...[0, 1, 2, 3, 4].map(i => {
      const a = i / 5 * Math.PI * 2;
      return { cx: Math.cos(a) * 1.7, cy: 5.9, cz: Math.sin(a) * 1.7,
               rx: 1.5, ry: 1.3, rz: 1.5, n: 10, size: [.7, 1.2], shell: .35 };
    }),
    { cx: 0, cy: 7.3, cz: 0, rx: 1.9, ry: 1.3, rz: 1.9, n: 10, size: [.7, 1.15], shell: .4 },
  ], 5),
  poplar: () => crownGeo([
    { cx: 0, cy: 4.6, cz: 0, rx: 1.15, ry: 1.6, rz: 1.15, n: 8, size: [.65, 1.0], shell: .5 },
    { cx: 0, cy: 6.3, cz: 0, rx: 1.45, ry: 1.9, rz: 1.45, n: 10, size: [.7, 1.1], shell: .45 },
    { cx: 0, cy: 8.1, cz: 0, rx: 1.0, ry: 1.3, rz: 1.0, n: 6, size: [.6, .9], shell: .5 },
  ], 6),
  willow: () => crownGeo([
    { cx: 0, cy: 4.9, cz: 0, rx: 2.5, ry: 1.0, rz: 2.5, n: 12, size: [.9, 1.4], shell: .5 },
    // skirt ring of hanging curtains
    { cx: 0, cy: 3.6, cz: 0, rx: 2.5, ry: .8, rz: 2.5, n: 22, size: [1.0, 1.5],
      ring: true, droop: true },
    { cx: 0, cy: 4.4, cz: 0, rx: 1.4, ry: .5, rz: 1.4, n: 8, size: [.7, 1.0],
      ring: true, droop: true },
  ], 7),
  dogwood: () => crownGeo([
    { cx: 0, cy: 3.7, cz: 0, rx: 1.9, ry: 1.1, rz: 1.9, n: 14, size: [.7, 1.1], shell: .45 },
    { cx: .8, cy: 4.5, cz: .3, rx: 1.0, ry: .7, rz: 1.0, n: 5, size: [.55, .8], shell: .4 },
  ], 8),
  spruce: () => crownGeo([
    { cx: 0, cy: 3.4, cz: 0, rx: 2.3, ry: .55, rz: 2.3, n: 9, size: [1.0, 1.5], ring: true, tilt: .35 },
    { cx: 0, cy: 4.7, cz: 0, rx: 1.9, ry: .5, rz: 1.9, n: 8, size: [.9, 1.4], ring: true, tilt: .3 },
    { cx: 0, cy: 5.9, cz: 0, rx: 1.5, ry: .45, rz: 1.5, n: 7, size: [.8, 1.2], ring: true, tilt: .25 },
    { cx: 0, cy: 7.0, cz: 0, rx: 1.05, ry: .4, rz: 1.05, n: 6, size: [.7, 1.0], ring: true, tilt: .2 },
    { cx: 0, cy: 7.9, cz: 0, rx: .6, ry: .5, rz: .6, n: 5, size: [.5, .8], shell: .3 },
    { cx: 0, cy: 5.4, cz: 0, rx: 1.1, ry: 2.2, rz: 1.1, n: 8, size: [.7, 1.0], shell: .2 },
  ], 9),
  pine: () => crownGeo([
    { cx: 0, cy: 4.0, cz: 0, rx: 2.1, ry: .55, rz: 2.1, n: 8, size: [.9, 1.4], ring: true, tilt: .3 },
    { cx: 0, cy: 5.4, cz: 0, rx: 1.7, ry: .5, rz: 1.7, n: 8, size: [.8, 1.25], ring: true, tilt: .25 },
    { cx: 0, cy: 6.7, cz: 0, rx: 1.3, ry: .45, rz: 1.3, n: 6, size: [.7, 1.05], ring: true, tilt: .2 },
    { cx: 0, cy: 7.9, cz: 0, rx: .9, ry: .4, rz: .9, n: 5, size: [.6, .9], ring: true, tilt: .15 },
    { cx: 0, cy: 8.7, cz: 0, rx: .5, ry: .5, rz: .5, n: 4, size: [.45, .7], shell: .3 },
    { cx: 0, cy: 5.8, cz: 0, rx: .95, ry: 2.0, rz: .95, n: 7, size: [.6, .95], shell: .2 },
  ], 10),
};
/* which foliage texture + default tint per species key */
export const CROWN_STYLE = {
  o: { geo: 'oak', tex: 'broad', hue: .26, sat: .44, lit: .29 },
  m: { geo: 'maple', tex: 'broad', hue: .055, sat: .58, lit: .33 },   // autumn
  b: { geo: 'birch', tex: 'fine', hue: .24, sat: .5, lit: .38 },
  s: { geo: 'sakura', tex: 'bloom', hue: .93, sat: .42, lit: .60 },   // blossom
  e: { geo: 'elm', tex: 'broad', hue: .3, sat: .42, lit: .29 },
  u: { geo: 'poplar', tex: 'fine', hue: .3, sat: .4, lit: .30 },
  w: { geo: 'willow', tex: 'droop', hue: .24, sat: .46, lit: .26 },
  d: { geo: 'dogwood', tex: 'bloom', hue: .31, sat: .42, lit: .33 },
  c: { geo: 'spruce', tex: 'needle', hue: .34, sat: .4, lit: .21 },
  p: { geo: 'pine', tex: 'needle', hue: .36, sat: .44, lit: .23 },
};
const _geoCache = new Map();
export function crownFor(t) {
  const st = CROWN_STYLE[t]; if (!st) return null;
  if (!_geoCache.has(st.geo)) _geoCache.set(st.geo, CROWNS[st.geo]());
  return { geo: _geoCache.get(st.geo), style: st };
}
