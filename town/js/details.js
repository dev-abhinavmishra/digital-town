// details.js â€” roads, vegetation, vehicles, street furniture, park, people
// Everything static is merged per-material (see mergeStatic in main.js);
// repeated street furniture is instanced; traffic & pedestrians animate.
import * as THREE from 'three';
import { ROADS, LOTS, WATER, PARK_ZONE, BUILDINGS, APARTMENTS,
         HOUSE_BLOCKS, FILLER } from './layout.js';
import { box, cyl, plane, mat, signTexture, fieldTexture, cropTexture, colored, VCOL,
         instances, waterMaterial, cloudSpriteTexture, uTime,
         makeCanvas, canvasTex, blobShadowTexture, warmGlowTexture,
         attachDriftShadow, lift, R, rr, pick, mulberry32, RUNENV, DETAIL, thin } from './lib.js';
import { pbr, M_BARK, WET_SURFACES } from './mats.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { occupied, occupyRect, isFree, registerOccupancy, streetBand } from './city/occ.js';
import { GeoBin } from './city/geo.js';
import { crownFor, foliageMesh } from './city/foliage.js';
import { buildStreetscape, intersections } from './city/streetscape.js';
import { buildGreens } from './city/greens.js';
import { buildYards } from './city/yards.js';
import { publishCity } from './city/stats.js';
import { buildHero } from './city/hero.js';
export { occupied, occupyRect, isFree, registerOccupancy, intersections };

const ASPH = pbr('asphalt_02');          // tile via plane(..., tile)
ASPH.color = new THREE.Color('#9aa0a6'); ASPH.roughness = .97;  // lifted in streetscape.js too (shared instance)
attachDriftShadow(ASPH, .0015, .0009, .15);   // same cloud field over pavement
// keyed color → own cache instance; shared pbr() instances mutated post-hoc
// all ended up wearing the last writer's tint
const PAVE = lift(pbr('precast_stone_paving', { color: '#a8a499' }), 4);
const GRVL = pbr('gravel');

const M = THREE.MeshStandardMaterial;
const _qp = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const FREEZE = !!(_qp && _qp.has('freeze'));
const _duskQuery = () => !!_qp && _qp.get('time') === 'dusk';
const _lowLightQuery = () => !!_qp &&
  ['dusk', 'night'].includes(_qp.get('time'));
const Y = 0.28; // surface lift â€” must clear depth-buffer epsilon at aerial range

/* ---------------- roads â†’ city/streetscape.js ---------------- */
export function buildRoads(scene) {
  const ix = buildStreetscape(scene);
  publishCity();
  return ix;
}
export function buildLots(scene) {
  const bin = new GeoBin();
  const parts = [];
  const white = lift(mat('#dfe3e6'), 5);
  /* clone so the rank doesn't ride the shared mat() instance — helipad +
     dock rings (buildings.js) use the same colour as 3D tori */
  const bump = lift(mat('#d4b23a').clone(), 6);
  /* per-lot asphalt tint - real pads weather at different rates; the shared
     ASPH instance stays on the roads, each lot gets its own keyed pbr() */
  const LOT_TINTS = ['#8e949a', '#a0a6ab', '#878e94', '#989ea4',
                     '#a8adb1', '#7f868c', '#949aa0'];
  let lotIdx = 0;
  for (const l of LOTS) {
    const lotM = pbr('asphalt_02', { color: LOT_TINTS[lotIdx++ % LOT_TINTS.length] });
    lotM.roughness = .97;
    WET_SURFACES.push(lotM);
    attachDriftShadow(lotM, .0015, .0009, .15);
    scene.add(plane(l.w, l.d, lotM, l.x, Y - .015, l.z, -Math.PI / 2, 6));
    if (l.plain) continue;   // apron/pad: bare asphalt, no stalls
    const n = Math.floor(l.w / 3.4);
    for (let i = 0; i <= n; i++) {
      const px = l.x - l.w / 2 + i * (l.w / n);
      bin.plane(.22, 5.5, white, px, Y + .005, l.z - l.d / 2 + 3.2);
      bin.plane(.22, 5.5, white, px, Y + .005, l.z + l.d / 2 - 3.2);
      // wheel stops
      if (i < n) {
        bin.plane(1.6, .18, bump, px + l.w / n / 2, Y + .012, l.z - l.d / 2 + 1.1);
        bin.plane(1.6, .18, bump, px + l.w / n / 2, Y + .012, l.z + l.d / 2 - 1.1);
      }
    }
    // disabled stalls painted blue
    if (l.w > 60) {
      bin.plane(3.4, 5.5, lift(mat('#2e6b9a'), 4), l.x - l.w / 2 + 4, Y + .004, l.z - l.d / 2 + 3.2);
    }
    // raised planter islands down the middle of the bigger slabs — curb ring,
    // soil, shrub + small crown; breaks the uninterrupted asphalt read
    if (!l.plain && l.w > 90 && l.d > 40) {
      const nI = Math.floor(l.w / 60);
      for (let i = 0; i < nI; i++) {
        const ix = l.x - l.w / 2 + (i + .5) * l.w / nI;
        const iw = Math.min(16, l.w / nI - 12);
        if (iw < 5) continue;
        bin.plane(iw, 4.6, soilMat(), ix, Y + .022, l.z);
        parts.push({ geo: new THREE.BoxGeometry(iw + .6, .3, 5.2), color: '#9a9488',
          x: ix, y: .1, z: l.z });
        parts.push({ geo: new THREE.CylinderGeometry(.2, .3, 2.6, 6), color: '#4a3527',
          x: ix, y: 1.3, z: l.z });
        parts.push({ geo: new THREE.IcosahedronGeometry(1.7, 0), color: '#5d8a3c',
          x: ix, y: 3.4, z: l.z });
        for (const sxx of [-iw / 4, iw / 4])
          parts.push({ geo: new THREE.IcosahedronGeometry(.7, 0), color: '#4e6b3e',
            x: ix + sxx, y: .55, z: l.z });
      }
    }
  }
  bin.build(scene);
  if (parts.length) {
    const m = new THREE.Mesh(colored(parts), VCOL());
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
}
let _soilM = null;
function soilMat() { return _soilM ||= lift(mat('#5a4632', { roughness: 1 }), 8); }
let _sandM = null;
function sandM() { return _sandM ||= lift(mat('#d4b98a'), 5); }

/* ---------------- trees (instanced) ---------------- */
/* district palettes - corridors/districts read differently by canopy */
const DISTRICT_TREES = [
  { name: 'downtown',      x0: -660, x1: -300, z0: -660, z1: -380, mix: [['u', .55], ['d', .3], ['b', .15]] },
  { name: 'campus',        x0: -150, x1: 230,  z0: -345, z1: -60,  mix: [['e', .5], ['o', .25], ['u', .25]] },
  { name: 'senior',        x0: 340,  x1: 800,  z0: -700, z1: -200, mix: [['w', .35], ['d', .3], ['o', .2], ['s', .15]] },
  { name: 'commercial',    x0: -140, x1: 345,  z0: 430,  z1: 710,  mix: [['u', .4], ['b', .3], ['d', .3]] },
  { name: 'residential-w', x0: -800, x1: -160, z0: 40,   z1: 430,  mix: [['o', .4], ['m', .25], ['e', .25], ['w', .1]] },
  { name: 'grove',         x0: -130, x1: 310,  z0: -30,  z1: 310,  mix: [['o', .35], ['e', .3], ['m', .2], ['d', .15]] },
  { name: 'park',          x0: 340,  x1: 800,  z0: -60,  z1: 310,  mix: [['o', .4], ['s', .2], ['w', .2], ['e', .2]] },
];
const districtOf = (x, z) => DISTRICT_TREES.find(d => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) || null;
const pickFrom = mix => { let r = R(); if (Array.isArray(mix[0])) { for (const [k, w] of mix) { if ((r -= w) <= 0) return k; } return mix[0][0]; } for (let i = 1; i < mix.length; i += 2) { if ((r -= mix[i]) <= 0) return mix[i - 1]; } return mix[0]; };
const speciesFor = (x, z, fallback) => { const d = districtOf(x, z); return d ? pickFrom(d.mix) : fallback; };

export function buildTrees(scene) {
  const spots = [];
  // species keys: o oak | m maple | b birch | c spruce | p pine | s sakura
  //               e elm | u poplar | w willow | d dogwood
  for (const r of ROADS) {
    const step = r.arterial ? 26 : 34;
    const treeline = streetBand(r) + 1.4;   // just outside the sidewalk band
    // road takes its signature mix from the district it runs through
    const roadMix = districtOf(r.axis === 'v' ? r.c : (r.a0 + r.a1) / 2,
                             r.axis === 'v' ? (r.a0 + r.a1) / 2 : r.c);
    for (let a = r.a0 + 8; a < r.a1 - 8; a += step) for (const s of [-1, 1]) {
      const off = treeline * s;
      const x = r.axis === 'v' ? r.c + off : a;
      const z = r.axis === 'v' ? a : r.c + off;
      const t = roadMix ? pickFrom(roadMix.mix) : (R() < .58 ? 'o' : R() < .7 ? 'm' : 'b');
      if (isFree(x, z, 1) && R() < .8) spots.push({ x, z, s: rr(.8, 1.15), t });
    }
  }
  for (let i = 0; i < 340; i++) {
    const x = rr(PARK_ZONE.x0 + 8, PARK_ZONE.x1 - 8), z = rr(PARK_ZONE.z0 + 8, PARK_ZONE.z1 - 8);
    // park: oaks + sakura groves + willow/elm accents
    const t = R() < .5 ? 'o' : R() < .5 ? 's' : R() < .5 ? 'w' : 'e';
    if (isFree(x, z, 3)) spots.push({ x, z, s: rr(.9, 1.8), t });
  }
  for (let i = 0; i < 220; i++) {
    const x = rr(-800, -700), z = rr(-720, 700);
    if (isFree(x, z, 3)) spots.push({ x, z, s: rr(1.0, 1.9), t: R() < .6 ? 'p' : 'c' });
  }
  for (const b of HOUSE_BLOCKS) {
    const n = Math.floor((b.x1 - b.x0) * (b.z1 - b.z0) / 1400);
    for (let i = 0; i < n; i++) {
      const x = rr(b.x0 + 6, b.x1 - 6), z = rr(b.z0 + 6, b.z1 - 6);
      const t = pickFrom([['o', .4], ['m', .25], ['e', .25], ['w', .1]]);
      if (isFree(x, z, 4)) spots.push({ x, z, s: rr(.8, 1.3), t });
    }
  }
  for (let i = 0; i < 140; i++) {
    const x = rr(-130, 335), z = rr(430, 705);
    // commercial corridor: columnar poplars + ornamentals + birches
    const t = R() < .4 ? 'u' : R() < .5 ? 'd' : 'b';
    if (isFree(x, z, 3)) spots.push({ x, z, s: rr(.9, 1.5), t });
  }
  for (let i = 0; i < 380; i++) {
    const x = rr(-800, 800), z = rr(-740, 740);
    const t = speciesFor(x, z, R() < .5 ? 'o' : R() < .5 ? 'm' : R() < .5 ? 'b' : 'p');
    if (isFree(x, z, 3.5)) spots.push({ x, z, s: rr(.8, 1.4), t });
  }
  for (let i = 0; i < 260; i++) {
    const x = rr(-1600, 1600), z = rr(-1500, 1500);
    if (Math.abs(x) < 810 && Math.abs(z) < 750) continue;
    spots.push({ x, z, s: rr(1.0, 1.8), t: R() < .55 ? 'c' : 'p' });
  }

  // MIN tier keeps an evenly-spread subset — same species mix, fewer crowns
  const kept = thin(spots);

  // soft canopy shadows under every tree — outside the shadow camera's box
  // (aerial, far verge) this is the only thing keeping trees grounded
  blobShadows(scene, kept.map(s => {
    const r = (s.t === 'c' || s.t === 'p' ? 3.4 : 5.6) * s.s;
    return { x: s.x, z: s.z, ry: 0, sx: r, sz: r };
  }), .22);

  const oak = kept.filter(s => s.t === 'o'), con = kept.filter(s => s.t === 'c'),
        maple = kept.filter(s => s.t === 'm'), birch = kept.filter(s => s.t === 'b'),
        pine = kept.filter(s => s.t === 'p'), sakura = kept.filter(s => s.t === 's'),
        elm = kept.filter(s => s.t === 'e'), poplar = kept.filter(s => s.t === 'u'),
        willow = kept.filter(s => s.t === 'w'), dogwood = kept.filter(s => s.t === 'd');
  // tapered trunk + branch scaffold — branches show through the leaf cards
  const br = (len, r, yaw, pitch, y) => {
    const g = new THREE.CylinderGeometry(r * .42, r, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateX(-pitch); g.rotateY(yaw); g.translate(0, y, 0);
    return g;
  };
  const trunkG = mergeGeometries([
    new THREE.CylinderGeometry(.26, .5, 4.6, 7).translate(0, 2.3, 0),
    br(2.6, .14, 0, .8, 3.4), br(2.2, .12, 2.1, .95, 3.7),
    br(2.4, .12, 4.2, .85, 3.9), br(1.8, .09, 1.2, 1.15, 4.2),
  ], false);
  const folG = new THREE.IcosahedronGeometry(2.4, 1);   // far-field blob crowns
  const folG2 = new THREE.IcosahedronGeometry(1.7, 0);
  const conG = new THREE.ConeGeometry(2.0, 8.2, 7);
  const conG2 = new THREE.ConeGeometry(1.3, 5.4, 7);
  const trunkM = M_BARK(); trunkM.color = new THREE.Color('#7a6a58');
  // flatShading gives crowns a stylized faceted look
  const folM = new M({ color: '#ffffff', roughness: .95, flatShading: true });
  const conM = new M({ color: '#ffffff', roughness: .95, flatShading: true });

  const mk = (geo, m, list, yoff, sVar, jitter = 0, hueBase = .27, sat = .45, lit = .3,
              flat = 1) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, m, list.length);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((t, i) => {
      p.set(t.x + (jitter ? rr(-jitter, jitter) * t.s : 0), yoff * t.s, t.z + (jitter ? rr(-jitter, jitter) * t.s : 0));
      sc.set(t.s * rr(.8, 1.25), t.s * rr(.8, 1.2) * flat, t.s * rr(.8, 1.25));
      q.setFromEuler(new THREE.Euler(rr(-.07, .07), rr(0, 6.28), rr(-.07, .07)));
      Mx.compose(p, q, sc); im.setMatrixAt(i, Mx);
      if (sVar) { col.setHSL(hueBase + rr(-.06, .06), sat + rr(-.1, .12), lit + rr(-.05, .08)); im.setColorAt(i, col); }
    });
    im.castShadow = im.receiveShadow = true;
    im.userData.staticInst = true;   // shader sways — matrices never animate
    scene.add(im);
    return im;
  };
  const trunkG2 = mergeGeometries([
    new THREE.CylinderGeometry(.14, .24, 6.4, 6).translate(0, 3.2, 0),
    br(1.9, .07, .5, .95, 4.6), br(1.7, .06, 2.8, 1.05, 5.0), br(1.6, .06, 4.8, .9, 5.3),
  ], false);
  const trunkM2 = M_BARK(); trunkM2.color = new THREE.Color('#d8d2c8');  // pale birch bark
  const conG3 = new THREE.ConeGeometry(1.05, 3.0, 7);

  /* near/far split: town trees get alpha-carded crowns; the countryside
     ring (>830m) keeps cheap blob crowns. */
  const FAR = s => Math.abs(s.x) > 830 || Math.abs(s.z) > 770;
  const split = l => [l.filter(s => !FAR(s)), l.filter(FAR)];
  const [oakN, oakF] = split(oak), [conN, conF] = split(con),
        [mapleN, mapleF] = split(maple), [birchN, birchF] = split(birch),
        [pineN, pineF] = split(pine), [sakuraN, sakuraF] = split(sakura),
        [elmN, elmF] = split(elm), [poplarN, poplarF] = split(poplar),
        [willowN, willowF] = split(willow), [dogwoodN, dogwoodF] = split(dogwood);
  const cards = (list, key) => {
    if (!list.length) return null;
    const cf = crownFor(key);
    const im = foliageMesh(cf.geo, cf.style.tex, list,
      { hue: cf.style.hue, sat: cf.style.sat, lit: cf.style.lit });
    scene.add(im);
    return im;
  };

  mk(trunkG, trunkM, oak, 0, false);
  cards(oakN, 'o');
  mk(folG, folM, oakF, 5.0, true, 0, .25, .42, .20, .92);
  mk(folG2, folM, oakF, 6.4, true, 1.4, .24, .4, .25, .9);
  mk(folG2, folM, oakF, 4.2, true, 2.6, .27, .38, .17, .85);
  mk(folG2, folM, oakF, 5.4, true, 3.4, .26, .44, .21, .8);
  // spruce â€” 2 cones
  mk(trunkG, trunkM, con, 0, false);
  cards(conN, 'c');
  mk(conG, conM, conF, 4.4, true, 0, .34, .38, .14);
  mk(conG2, conM, conF, 7.6, true, .3, .33, .42, .18);
  // maple â€” round crown, autumn oranges/reds
  mk(trunkG, trunkM, maple, 0, false);
  cards(mapleN, 'm');
  mk(folG, folM, mapleF, 4.8, true, 0, .055, .55, .34, .95);
  mk(folG2, folM, mapleF, 6.0, true, 1.6, .04, .6, .3, .9);
  mk(folG2, folM, mapleF, 4.4, true, 2.4, .08, .5, .3, .88);
  // birch â€” tall pale trunk, small bright crown high up
  mk(trunkG2, trunkM2, birch, 0, false);
  cards(birchN, 'b');
  mk(folG2, folM, birchF, 6.6, true, 0, .26, .5, .34, 1);
  mk(folG2, folM, birchF, 7.8, true, .9, .3, .55, .38, .95);
  // pine â€” 3 stacked dark cones, layered look
  mk(trunkG, trunkM, pine, 0, false);
  cards(pineN, 'p');
  mk(conG, conM, pineF, 3.6, true, 0, .36, .4, .13);
  mk(conG2, conM, pineF, 6.2, true, 0, .35, .45, .16);
  mk(conG3, conM, pineF, 8.4, true, 0, .33, .5, .19);
  // sakura â€” pink blossom clouds, park accents
  mk(trunkG, trunkM, sakura, 0, false);
  cards(sakuraN, 's');
  mk(folG, folM, sakuraF, 4.6, true, 0, .93, .42, .58, .95);
  mk(folG2, folM, sakuraF, 5.8, true, 1.8, .95, .38, .62, .9);
  mk(folG2, folM, sakuraF, 4.0, true, 2.4, .91, .45, .55, .9);
  // elm - vase silhouette: lobes ringed around a high crown
  const elmCrown = mergeGeometries([
    new THREE.IcosahedronGeometry(1.5, 0).scale(1, .72, 1).translate(1.6, 5.6, 0),
    new THREE.IcosahedronGeometry(1.5, 0).scale(1, .72, 1).translate(-1.6, 5.6, 0),
    new THREE.IcosahedronGeometry(1.5, 0).scale(1, .72, 1).translate(0, 5.6, 1.6),
    new THREE.IcosahedronGeometry(1.5, 0).scale(1, .72, 1).translate(0, 5.6, -1.6),
    new THREE.IcosahedronGeometry(1.8, 0).scale(1, .8, 1).translate(0, 7.0, 0),
  ], false);
  mk(trunkG2, trunkM2, elm, 0, false);
  cards(elmN, 'e');
  mk(elmCrown, folM, elmF, 0, true, 0, .30, .4, .22);
  // columnar poplar - tight vertical crown stack (downtown/commercial street tree)
  const popCrown = mergeGeometries([
    new THREE.IcosahedronGeometry(1.35, 0).scale(1, 1.15, 1).translate(0, 4.4, 0),
    new THREE.IcosahedronGeometry(1.7, 0).scale(1, 1.3, 1).translate(0, 6.0, 0),
    new THREE.IcosahedronGeometry(1.15, 0).scale(1, 1.2, 1).translate(0, 7.7, 0),
  ], false);
  mk(trunkG2, trunkM2, poplar, 0, false);
  cards(poplarN, 'u');
  mk(popCrown, folM, poplarF, 0, true, 0, .29, .38, .24);
  // weeping willow - broad flat crown + drooping skirt lobes
  const wilCrown = mergeGeometries([
    new THREE.IcosahedronGeometry(2.6, 1).scale(1, .55, 1).translate(0, 4.7, 0),
    new THREE.IcosahedronGeometry(1.05, 0).translate(2.1, 3.4, 0),
    new THREE.IcosahedronGeometry(1.05, 0).translate(-2.1, 3.4, 0),
    new THREE.IcosahedronGeometry(1.05, 0).translate(0, 3.4, 2.1),
    new THREE.IcosahedronGeometry(1.05, 0).translate(0, 3.4, -2.1),
    new THREE.IcosahedronGeometry(1.05, 0).translate(1.5, 3.2, 1.5),
    new THREE.IcosahedronGeometry(1.05, 0).translate(-1.5, 3.2, -1.5),
  ], false);
  mk(trunkG, trunkM, willow, 0, false);
  cards(willowN, 'w');
  mk(wilCrown, folM, willowF, 0, true, 0, .24, .45, .2);
  // dogwood - low ornamental crown + offset blossom puff
  const dogCrown = mergeGeometries([
    new THREE.IcosahedronGeometry(1.5, 0).scale(1, .8, 1).translate(0, 3.4, 0),
    new THREE.IcosahedronGeometry(1.0, 0).scale(1, .7, 1).translate(.9, 4.2, .4),
  ], false);
  mk(trunkG2, trunkM2, dogwood, 0, false);
  cards(dogwoodN, 'd');
  mk(dogCrown, folM, dogwoodF, 0, true, 0, .33, .42, .3);

  if (window.__city) {
    window.__city.trees = {
      archetypes: [oak, maple, birch, con, pine, sakura, elm, poplar, willow, dogwood]
        .filter(l => l.length).map(l => l[0].t),
      total: kept.length,
      districts: DISTRICT_TREES.map(d => ({ name: d.name, mix: Object.fromEntries(d.mix) })),
    };
  }


  /* bushes & hedges â€” instanced squashed blobs along facades & park edges */
  const bushes = [];
  for (const b of BUILDINGS) {
    if (!b.w || b.type === 'zone' || b.type === 'parkzone') continue;
    // bushes hug the facade â€” no occupancy check (the pad would reject them all)
    for (let i = 0; i < Math.floor(b.w / 9); i++) {
      const x = b.x - b.w / 2 + 4 + i * 9 + rr(-1.5, 1.5);
      bushes.push({ x, z: b.z + b.d / 2 + 1.6, s: rr(.6, 1.1) });
    }
  }
  for (const b of HOUSE_BLOCKS) {
    for (let i = 0; i < 8; i++) {
      const x = rr(b.x0 + 4, b.x1 - 4), z = rr(b.z0 + 4, b.z1 - 4);
      if (isFree(x, z, 1.4) && R() < .5) bushes.push({ x, z, s: rr(.5, .9) });
    }
  }
  const bgeo = new THREE.IcosahedronGeometry(1, 0); bgeo.scale(1, .72, 1);
  const bmat = new M({ color: '#ffffff', roughness: .95, flatShading: true });
  const keptB = thin(bushes);
  const bim = new THREE.InstancedMesh(bgeo, bmat, keptB.length);
  {
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    keptB.forEach((t, i) => {
      p.set(t.x, .5 * t.s, t.z);
      sc.set(t.s * rr(.8, 1.4), t.s, t.s * rr(.8, 1.4));
      q.setFromEuler(new THREE.Euler(0, rr(0, 6.28), 0));
      Mx.compose(p, q, sc); bim.setMatrixAt(i, Mx);
      col.setHSL(.26 + rr(-.05, .05), .4 + rr(-.1, .1), .18 + rr(-.04, .06));
      bim.setColorAt(i, col);
    });
    bim.castShadow = bim.receiveShadow = true;
    bim.userData.staticInst = true;
    scene.add(bim);
  }
  return kept.length;
}

/* ---------------- vehicles ---------------- */
const CAR_COLORS = ['#c0392b', '#2e5b8a', '#e8e6df', '#3d4a42', '#7f8c8d', '#d4ac0d', '#5d6d7e', '#a93226', '#1e8449', '#784212', '#8e44ad', '#b8b4ac', '#22282c', '#d8d4c8'];
/* 4 archetypes, each {body (per-instance paint), trim (vertex colors)}.
   Local +x = forward. */
const _vehCache = new Map();
function vehGeos(kind = 'sedan') {
  if (_vehCache.has(kind)) return _vehCache.get(kind);
  const B = (w, h, dd, x, y, z) => new THREE.BoxGeometry(w, h, dd).translate(x, y, z);
  const wheel = (wx, wz, r = .37) => ([
    { geo: new THREE.CylinderGeometry(r, r, .3, 14).rotateX(Math.PI / 2), color: '#141618', x: wx, y: r, z: wz },
    { geo: new THREE.CylinderGeometry(r * .42, r * .42, .32, 10).rotateX(Math.PI / 2), color: '#9aa0a5', x: wx, y: r, z: wz },
    // 4 lug detail — a small cross makes hubs read at street distance
    { geo: B(.05, r * 1.1, .05, wx, r, wz * 1.001), color: '#565c60' },
    { geo: B(.05, .05, r * 1.1, wx, r, wz * 1.001), color: '#565c60' },
  ]);
  const arch = (wx, wz) =>
    ({ geo: new THREE.CylinderGeometry(.52, .52, .1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), color: '#101214', x: wx, y: .52, z: wz });
  const plates = (fx, bx) => ([
    { geo: B(.3, .12, .02, fx, .62, 0), color: '#dfe3e6' },
    { geo: B(.3, .12, .02, bx, .62, 0), color: '#dfe3e6' },
  ]);
  const exhaust = (bx) => ({ geo: new THREE.CylinderGeometry(.05, .05, .18, 8).rotateZ(Math.PI / 2), color: '#6a7075', x: bx, y: .3, z: .62 });
  let body, trim;
  if (kind === 'sedan') {
    body = mergeGeometries([
      B(4.5, .6, 1.86, 0, .62, 0),                       // lower shell
      B(1.2, .26, 1.8, 1.6, .98, 0).rotateZ(-.07),       // raked hood
      B(.95, .3, 1.78, -1.7, 1.0, 0),                    // trunk
      B(4.52, .07, 1.88, 0, .93, 0),                     // beltline crease
      B(2.3, .5, 1.66, -.15, 1.28, 0),                   // cabin mass
    ], false);
    trim = colored([
      { geo: B(2.05, .44, 1.7, -.15, 1.3, 0), color: '#18242e' },       // glass band
      { geo: B(.1, .42, 1.64, 1.0, 1.26, 0).rotateZ(-.42), color: '#18242e' }, // windshield slope
      { geo: B(.1, .4, 1.6, -1.32, 1.28, 0).rotateZ(.4), color: '#18242e' },   // rear glass slope
      { geo: B(.18, .42, 1.84, 2.24, .6, 0), color: '#24292d' },         // bumper f
      { geo: B(.18, .42, 1.84, -2.24, .6, 0), color: '#24292d' },        // bumper r
      { geo: B(.3, .2, .32, 2.26, .84, .58), color: '#fff6d8' },         // headlights
      { geo: B(.3, .2, .32, 2.26, .84, -.58), color: '#fff6d8' },
      { geo: B(.12, .2, .44, -2.28, .86, .55), color: '#a03028' },       // taillights
      { geo: B(.12, .2, .44, -2.28, .86, -.55), color: '#a03028' },
      { geo: B(4.3, .05, 1.9, 0, .55, 0), color: '#b9bec2' },            // rocker trim
      ...wheel(1.45, .93), ...wheel(-1.45, .93), ...wheel(1.45, -.93), ...wheel(-1.45, -.93),
      arch(1.45, .965), arch(-1.45, .965), arch(1.45, -.965), arch(-1.45, -.965),
      { geo: B(.44, .07, .07, .95, 1.14, .97), color: '#24292d' },       // mirrors
      { geo: B(.44, .07, .07, .95, 1.14, -.97), color: '#24292d' },
      { geo: B(2.9, .04, .05, 0, .78, .94), color: '#4a5054' },          // door line
      { geo: B(2.9, .04, .05, 0, .78, -.94), color: '#4a5054' },
      ...plates(2.34, -2.34),
      exhaust(-2.3),
    ]);
  } else if (kind === 'suv') {
    body = mergeGeometries([
      B(4.6, .78, 1.9, 0, .72, 0),                       // taller shell
      B(1.15, .24, 1.82, 1.7, 1.14, 0).rotateZ(-.04),    // flatter hood
      B(4.6, .07, 1.92, 0, 1.1, 0),                      // beltline
      B(3.0, .55, 1.74, -.55, 1.44, 0),                  // long cabin
    ], false);
    trim = colored([
      { geo: B(2.8, .48, 1.76, -.55, 1.46, 0), color: '#18242e' },       // glass band
      { geo: B(.1, .44, 1.7, .95, 1.4, 0).rotateZ(-.5), color: '#18242e' },
      { geo: B(.2, .44, 1.88, 2.28, .68, 0), color: '#24292d' },
      { geo: B(.2, .44, 1.88, -2.28, .68, 0), color: '#24292d' },
      { geo: B(.3, .2, .34, 2.3, .95, .6), color: '#fff6d8' },
      { geo: B(.3, .2, .34, 2.3, .95, -.6), color: '#fff6d8' },
      { geo: B(.14, .3, .5, -2.33, .98, .58), color: '#a03028' },
      { geo: B(.14, .3, .5, -2.33, .98, -.58), color: '#a03028' },
      { geo: B(3.1, .08, 2.0, -.5, .32, 0), color: '#3a4045' },          // running boards
      { geo: B(2.6, .07, .07, -.55, 2.0, .8), color: '#7d848a' },        // roof rails
      { geo: B(2.6, .07, .07, -.55, 2.0, -.8), color: '#7d848a' },
      ...wheel(1.5, .96, .4), ...wheel(-1.5, .96, .4), ...wheel(1.5, -.96, .4), ...wheel(-1.5, -.96, .4),
      arch(1.5, 1.0), arch(-1.5, 1.0), arch(1.5, -1.0), arch(-1.5, -1.0),
      ...plates(2.4, -2.4),
      exhaust(-2.36),
    ]);
  } else if (kind === 'pickup') {
    body = mergeGeometries([
      B(4.9, .62, 1.92, 0, .68, 0),
      B(1.25, .26, 1.84, 1.75, 1.04, 0).rotateZ(-.05),
      B(1.7, .62, 1.8, .25, 1.35, 0),                    // cab
      B(2.0, .55, 1.86, -1.6, 1.05, 0),                  // bed walls
    ], false);
    trim = colored([
      { geo: B(1.55, .5, 1.66, .25, 1.38, 0), color: '#18242e' },        // cab glass
      { geo: B(.1, .44, 1.6, 1.1, 1.35, 0).rotateZ(-.5), color: '#18242e' },
      { geo: B(1.7, .08, 1.7, -1.6, 1.34, 0), color: '#1a1d20' },        // bed floor inset
      { geo: B(.2, .46, 1.9, 2.44, .66, 0), color: '#24292d' },
      { geo: B(.12, .5, 1.86, -2.56, .92, 0), color: '#2a2f33' },        // tailgate
      { geo: B(.3, .2, .34, 2.46, .9, .6), color: '#fff6d8' },
      { geo: B(.3, .2, .34, 2.46, .9, -.6), color: '#fff6d8' },
      { geo: B(.14, .3, .3, -2.6, 1.0, .7), color: '#a03028' },
      { geo: B(.14, .3, .3, -2.6, 1.0, -.7), color: '#a03028' },
      ...wheel(1.65, .98, .42), ...wheel(-1.7, .98, .42), ...wheel(1.65, -.98, .42), ...wheel(-1.7, -.98, .42),
      arch(1.65, 1.02), arch(-1.7, 1.02), arch(1.65, -1.02), arch(-1.7, -1.02),
      ...plates(2.54, -2.62),
      exhaust(-2.5),
    ]);
  } else {   // van
    body = mergeGeometries([
      B(4.6, 1.1, 1.9, -.3, .95, 0),                     // tall body
      B(1.0, .34, 1.84, 2.0, 1.02, 0).rotateZ(-.1),      // short nose
      B(4.62, .07, 1.92, -.3, .55, 0),                   // sill line
    ], false);
    trim = colored([
      { geo: B(.7, .5, 1.7, 1.7, 1.5, 0).rotateZ(-.35), color: '#18242e' },   // windshield
      { geo: B(2.2, .42, 1.72, -.3, 1.62, 0), color: '#18242e' },             // side glass band
      { geo: B(.2, .6, 1.88, 2.36, .66, 0), color: '#24292d' },
      { geo: B(.2, .6, 1.88, -2.6, .9, 0), color: '#24292d' },
      { geo: B(.3, .2, .34, 2.48, .78, .58), color: '#fff6d8' },
      { geo: B(.3, .2, .34, 2.48, .78, -.58), color: '#fff6d8' },
      { geo: B(.14, .34, .34, -2.72, 1.1, .62), color: '#a03028' },
      { geo: B(.14, .34, .34, -2.72, 1.1, -.62), color: '#a03028' },
      { geo: B(.05, .9, .02, -.95, 1.5, .95), color: '#3a4045' },             // door seam
      ...wheel(1.7, .97), ...wheel(-1.75, .97), ...wheel(1.7, -.97), ...wheel(-1.75, -.97),
      arch(1.7, 1.0), arch(-1.75, 1.0), arch(1.7, -1.0), arch(-1.75, -1.0),
      ...plates(2.5, -2.74),
      exhaust(-2.66),
    ]);
  }
  const out = { body, trim };
  _vehCache.set(kind, out);
  return out;
}
const VEH_MIX = [['sedan', .5], ['suv', .26], ['pickup', .14], ['van', .1]];
const vehKind = () => { let r = R(); for (const [k, w] of VEH_MIX) { if ((r -= w) <= 0) return k; } return 'sedan'; };
export function makeCar(color, kind = 'sedan') {
  const g = new THREE.Group();
  const { body, trim } = vehGeos(kind);
  const b = new THREE.Mesh(body, new M({ color, roughness: .32, metalness: .55 }));
  b.castShadow = true; g.add(b);
  const t = new THREE.Mesh(trim, VCOL()); t.castShadow = true; g.add(t);
  return g;
}
function ambulance() {
  const g = new THREE.Group();
  const parts = [
    { geo: new THREE.BoxGeometry(6, 2.4, 2.2), color: '#f2f4f5', y: 1.7 },
    { geo: new THREE.BoxGeometry(6.02, .5, 2.22), color: '#c0392b', y: 1.6 },
    { geo: new THREE.BoxGeometry(1.8, 1.4, 2), color: '#d7dde0', x: 3.4, y: 1.2 },
    { geo: new THREE.BoxGeometry(1.6, .9, 1.8), color: '#1c2833', x: 3.45, y: 2.1 },
    { geo: new THREE.BoxGeometry(.5, .3, 1.8), color: '#3d4a55', x: -3.2, y: 2.9 },  // light bar
    { geo: new THREE.BoxGeometry(.2, .35, .5), color: '#c0392b', x: -3.3, y: 3.0, z: .5 },
    { geo: new THREE.BoxGeometry(.2, .35, .5), color: '#2e5b8a', x: -3.3, y: 3.0, z: -.5 },
  ];
  for (const wx of [-2, 2, 3.4]) for (const wz of [1.1, -1.1])
    parts.push({ geo: new THREE.CylinderGeometry(.4, .4, .3, 10).rotateX(Math.PI / 2), color: '#16181a', x: wx, y: .4, z: wz });
  const m = new THREE.Mesh(colored(parts), VCOL()); m.castShadow = true; g.add(m);
  return g;
}

/* parked + moving cars â€” instanced */
let traffic = null;
export function buildCars(scene) {
  const parkedByKind = { sedan: [], suv: [], pickup: [], van: [] };
  const park = e => parkedByKind[e.kind ||= vehKind()].push(e);
  const parked = [];
  const bodyM = new M({ color: '#ffffff', roughness: .32, metalness: .55 });
  // parked in lots
  for (const l of LOTS) {
    if (l.plain) continue;
    const count = Math.floor(l.w / 4.2 * DETAIL.f);
    for (let i = 0; i < count; i++) {
      if (R() > .62) continue;
      const px = l.x - l.w / 2 + 2 + i * (l.w / count);
      park({ x: px, z: l.z - l.d / 2 + 3.2, ry: Math.PI / 2, color: pick(CAR_COLORS) });
      if (R() > .45) park({ x: px, z: l.z + l.d / 2 - 3.2, ry: Math.PI / 2, color: pick(CAR_COLORS) });
    }
  }
  // parallel parked curbs — {c: road centreline, axis, along-range, w}
  const CURB_PARK = [
    { c: -40, a0: -120, a1: 300, w: 16, axis: 'h' },   // Main St
    { c: 320, a0: -300, a1: 700, w: 20, axis: 'h' },   // Commerce Blvd
    { c: 140, a0: -780, a1: -160, w: 10, axis: 'h' },  // Elm St
    { c: 425, a0: -780, a1: -160, w: 11, axis: 'h' },  // Schoolhouse Rd
    { c: -180, a0: -700, a1: -160, w: 10, axis: 'h' }, // Midtown Ave
    { c: -640, a0: -700, a1: -160, w: 11, axis: 'h' }, // Old Town Rd
    { c: 150, a0: -140, a1: 320, w: 10, axis: 'h' },   // Juniper Ave
    { c: -460, a0: 320, a1: 780, w: 10, axis: 'h' },   // Sunset Ridge Rd
    { c: -240, a0: 320, a1: 780, w: 10, axis: 'h' },   // Meadowlark Ln
    { c: -640, a0: -40, a1: 400, w: 10, axis: 'v' },   // Cedar Ave
    { c: -420, a0: -40, a1: 400, w: 10, axis: 'v' },   // Maple St
    { c: -440, a0: -360, a1: -50, w: 10, axis: 'v' },  // Scholar Ln
    { c: 560, a0: -700, a1: -360, w: 11, axis: 'v' },  // Silver Oak Dr
    { c: 80, a0: -30, a1: 320, w: 10, axis: 'v' },     // Grove St
  ];
  for (const { c, a0, a1, w, axis } of CURB_PARK) {
    for (let a = a0; a < a1; a += rr(9, 16)) for (const s of [-1, 1]) {
      if (R() < .45) {
        park(axis === 'h'
          ? { x: a, z: c + s * (w / 2 - 1.9), ry: 0, color: pick(CAR_COLORS) }
          : { x: c + s * (w / 2 - 1.9), z: a, ry: Math.PI / 2, color: pick(CAR_COLORS) });
      }
    }
  }
  let nParked = 0;
  for (const k in parkedByKind) {
    const list = thin(parkedByKind[k]);
    if (!list.length) continue;
    nParked += list.length; parked.push(...list);
    const { body, trim } = vehGeos(k);
    scene.add(instances(body, bodyM, list), instances(trim, VCOL(), list));
  }

  // ambulances & buses stay grouped (few)
  // staged on the ER apron south of the hospital + on the EMS pad
  const amb = [[46, -458, Math.PI / 2], [56, -452, -Math.PI / 2],
               [-66, -290, Math.PI / 2], [-52, -287, -Math.PI / 2]];
  for (const [x, z, ry] of amb) {
    const a = ambulance(); a.position.set(x, 0, z); a.rotation.y = ry; scene.add(a);
  }
  const busGeoParts = [
    { geo: new THREE.BoxGeometry(9, 2.2, 2.3), color: '#e8b13a', y: 1.7 },
    { geo: new THREE.BoxGeometry(8.8, .5, 2.32), color: '#3a3a3a', y: 2.5 },
    { geo: new THREE.BoxGeometry(.4, 1.2, 2.3), color: '#2c3a42', x: -3, y: 1.9 },
    { geo: new THREE.BoxGeometry(8.2, .9, 2.2), color: '#1c2833', x: .3, y: 2.0 },
  ];
  for (const wx of [-3, 3]) for (const wz of [1.15, -1.15])
    busGeoParts.push({ geo: new THREE.CylinderGeometry(.42, .42, .35, 10).rotateX(Math.PI / 2), color: '#16181a', x: wx, y: .42, z: wz });
  const busGeo = colored(busGeoParts);
  for (const bx of [-545, -530, -515, -500]) {
    const bm = new THREE.Mesh(busGeo, VCOL());
    bm.position.set(bx, 0, 452); bm.rotation.y = Math.PI / 2; bm.castShadow = true;
    scene.add(bm);
  }
  // grounding blobs under every parked vehicle (moving cars keep real shadows)
  blobShadows(scene,
    [...parked.map(c => ({ x: c.x, z: c.z, ry: c.ry, sx: 6.4, sz: 3.1 })),
     ...amb.map(([x, z, ry]) => ({ x, z, ry, sx: 8.6, sz: 3.5 })),
     ...[-545, -530, -515, -500].map(bx => ({ x: bx, z: 452, ry: 0, sx: 3.4, sz: 10.8 }))],
    .5);
  if (window.__city) window.__city.traffic = {
    ...(window.__city.traffic || {}), parked: nParked,
    archetypes: Object.fromEntries(Object.entries(parkedByKind).map(([k, l]) => [k, l.length])),
  };
}

/* ---- soft contact shadows: blob decals that ground objects visually ---- */
const _blobMs = new Map();
function blobShadows(scene, list, op = .5) {
  if (!list.length) return;
  if (!_blobMs.has(op)) _blobMs.set(op, new THREE.MeshBasicMaterial({
    map: blobShadowTexture(), transparent: true, depthWrite: false,
    color: '#000', opacity: op }));
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(g, _blobMs.get(op), list.length);
  const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.ry || 0, 0));
    Mx.compose(new THREE.Vector3(b.x, .34, b.z), q, new THREE.Vector3(b.sx, 1, b.sz));
    im.setMatrixAt(i, Mx);
  });
  im.renderOrder = 1;
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);
  return im;
}
/* under-building skirts — every static structure gets a soft ground-contact
   gradient so nothing reads as floating on the lawn */
export function buildContactShadows(scene) {
  const list = [];
  for (const b of BUILDINGS) if (b.w)
    list.push({ x: b.x, z: b.z, ry: b.rot || 0, sx: b.w + 3.4, sz: b.d + 3.4 });
  for (const a of APARTMENTS)
    list.push({ x: a.x, z: a.z, ry: a.rot || 0, sx: (a.w || 40) + 3, sz: (a.d || 40) + 3 });
  for (const f of FILLER) if (f.w)
    list.push({ x: f.x, z: f.z, ry: f.rot || 0, sx: f.w + 2.6, sz: f.d + 2.6 });
  blobShadows(scene, list, .30);
}

/* ---- moving traffic on a road graph ---- */
function roadGraph() {
  const ix = intersections();
  const edges = [];
  const key = (x, z) => `${Math.round(x / 4)},${Math.round(z / 4)}`;
  const nodes = new Map();
  const nodeAt = (x, z) => {
    const k = key(x, z);
    if (!nodes.has(k)) nodes.set(k, { x, z, edges: [] });
    return nodes.get(k);
  };
  for (const r of ROADS) {
    const cuts = [r.a0];
    for (const i of ix) {
      const a = r.axis === 'v' ? i.z : i.x, c = r.axis === 'v' ? i.x : i.z;
      if (Math.abs(c - r.c) < 1 && a > r.a0 + 4 && a < r.a1 - 4) cuts.push(a);
    }
    cuts.push(r.a1);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k++) {
      if (cuts[k + 1] - cuts[k] < 8) continue;
      const e = { axis: r.axis, c: r.c, a0: cuts[k], a1: cuts[k + 1], w: r.w };
      e.n0 = nodeAt(r.axis === 'v' ? e.c : e.a0, r.axis === 'v' ? e.a0 : e.c);
      e.n1 = nodeAt(r.axis === 'v' ? e.c : e.a1, r.axis === 'v' ? e.a1 : e.c);
      e.n0.edges.push(e); e.n1.edges.push(e);
      edges.push(e);
    }
  }
  return edges;
}
export function buildTraffic(scene) {
  const edges = roadGraph();
  const carsRaw = [];
  for (const e of edges) {
    const len = e.a1 - e.a0;
    const want = e.w >= 16 ? Math.floor(len / 90) : Math.floor(len / 200);
    for (let i = 0; i < want; i++) {
      carsRaw.push({
        e, t: rr(.05, .95), dir: pick([1, -1]),
        v: rr(9, 15) * (e.w >= 16 ? 1.15 : 1), col: pick(CAR_COLORS),
      });
    }
  }
  // MIN: thin the global fleet (not per-edge — per-edge scaling floors
  // short blocks to zero and empties most streets)
  const cars = thin(carsRaw);
  // signalized nodes for traffic causality (same junction list as the bulbs)
  const skey = (x, z) => Math.round(x / 4) + ',' + Math.round(z / 4);
  const sigNodes = new Map();
  {
    const allIx = intersections();
    const WANT_SIG2 = [
      ['Main St', 'University Ave'], ['Main St', 'Scholar Ln'],
      ['Elm St', 'Cedar Ave'], ['Commerce Blvd', 'University Ave'],
      ['Commerce Blvd', 'Cedar Ave'], ['Midtown Ave', 'University Ave'],
      ['Schoolhouse Rd', 'Cedar Ave'], ['Commerce Blvd', 'Parkside Dr'],
      ['Wellness Way', 'Parkside Dr'], ['Wellness Way', 'University Ave'],
    ];
    for (const [a, b] of WANT_SIG2) {
      const i = allIx.find(j => (j.vn === a && j.hn === b) || (j.vn === b && j.hn === a));
      if (i) sigNodes.set(skey(i.x, i.z), { jxn: a + ' x ' + b, queued: 0 });
    }
  }
  // cars grouped per edge+direction for cheap following logic
  const lanes = new Map();
  cars.forEach(c => {
    const k = c.e;
    if (!lanes.has(k)) lanes.set(k, { 1: [], '-1': [] });
    lanes.get(k)[c.dir].push(c);
  });
  // per-archetype instancing: cars grouped by kind, each gets body+trim IMs
  const byKind = { sedan: [], suv: [], pickup: [], van: [] };
  cars.forEach(c => byKind[c.kind ||= vehKind()].push(c));
  const kindIMs = [];
  const col = new THREE.Color();
  for (const k in byKind) {
    const list = byKind[k];
    if (!list.length) continue;
    const { body, trim } = vehGeos(k);
    const bIM = new THREE.InstancedMesh(body, new M({ color: '#fff', roughness: .32, metalness: .55 }), list.length);
    const tIM = new THREE.InstancedMesh(trim, VCOL(), list.length);
    bIM.castShadow = tIM.castShadow = true;
    bIM.frustumCulled = tIM.frustumCulled = false;
    list.forEach((c, j) => { c.ii = j; c.bIM = bIM; c.tIM = tIM; col.set(c.col); bIM.setColorAt(j, col); });
    scene.add(bIM, tIM);
    kindIMs.push({ list, bIM, tIM });
  }
  // headlight/taillight glow quads — lit at dusk (aLit per instance)
  const glowGeo = colored([
    { geo: new THREE.PlaneGeometry(.62, .3), color: '#fff2c8', x: 2.32, y: .86, z: 0, ry: Math.PI / 2 },
    { geo: new THREE.PlaneGeometry(.62, .3), color: '#ff5a3c', x: -2.32, y: .86, z: 0, ry: -Math.PI / 2 },
  ]);
  const glowM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  glowM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vLit );');
  };
  const glowIM = new THREE.InstancedMesh(glowGeo, glowM, cars.length);
  glowIM.frustumCulled = false; glowIM.renderOrder = 6;
  const litArr = new Float32Array(cars.length).fill(_lowLightQuery() ? 1 : 0);
  glowGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(litArr, 1));
  scene.add(glowIM);

  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
  function place(c, i) {
    const e = c.e;
    const a = e.a0 + c.t * (e.a1 - e.a0);
    // lane = right of travel direction
    const off = e.w / 4 * (e.axis === 'v' ? -c.dir : c.dir);
    const x = e.axis === 'v' ? e.c + off : a;
    const z = e.axis === 'v' ? a : e.c + off;
    const yaw = e.axis === 'v' ? (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    eul.set(0, yaw, 0); q.setFromEuler(eul);
    p.set(x, 0, z);
    mx.compose(p, q, s);
    c.bIM.setMatrixAt(c.ii, mx); c.tIM.setMatrixAt(c.ii, mx);
    glowIM.setMatrixAt(i, mx);
  }
  cars.forEach(place);
  for (const { bIM, tIM } of kindIMs) bIM.instanceMatrix.needsUpdate = tIM.instanceMatrix.needsUpdate = true;
  glowIM.instanceMatrix.needsUpdate = true;

  traffic = { cars, kindIMs, glowIM, place, sigNodes, lanes, skey };
}
function nextEdge(node, cur) {
  const opts = node.edges.filter(e => e !== cur);
  if (!opts.length) return null;
  // prefer continuing on the same road name/axis
  const straight = opts.filter(e => e.axis === cur.axis && Math.abs(e.c - cur.c) < 1);
  if (straight.length && R() < .7) return straight[0];
  return opts[Math.floor(R() * opts.length)];
}

/* ---------------- streetlights (instanced) ---------------- */
export function buildLights(scene) {
  const poleParts = [
    { geo: new THREE.CylinderGeometry(.12, .17, 7.6, 8), color: '#3d4145', y: 3.8 },
    { geo: new THREE.BoxGeometry(2.6, .14, .14), color: '#3d4145', x: -1.2, y: 7.45 },
    { geo: new THREE.CylinderGeometry(.3, .36, .5, 8), color: '#2c3034', y: .25 },
  ];
  const poleGeo = colored(poleParts);
  const lampGeo = new THREE.BoxGeometry(.95, .2, .42); lampGeo.translate(-2.3, 7.35, 0);
  const poleM = VCOL();
  const lampM = new M({ color: '#f5f0dc', emissive: '#000000', emissiveIntensity: 1 });
  const poles = [], lamps = [];
  for (const r of ROADS.filter(r => r.arterial || r.w >= 11)) {
    const step = 42;
    for (let a = r.a0 + 16; a < r.a1 - 16; a += step) {
      const s = (Math.floor(a / step) % 2) ? 1 : -1;
      const off = (r.w / 2 + 1.6) * s;
      const x = r.axis === 'v' ? r.c + off : a;
      const z = r.axis === 'v' ? a : r.c + off;
      // poles live on the streetscape band — exempt only this road's own rect
      // (cross roads/junction quads and all other occupancy still veto)
      if (!isFree(x, z, 1, r)) continue;
      // arm points toward road center
      const ry = r.axis === 'v' ? (s > 0 ? Math.PI : 0) : (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      poles.push({ x, z, ry });
      lamps.push({ x, z, ry });
    }
  }
  const poleIM = instances(poleGeo, poleM, poles);
  const lampIM = instances(lampGeo, lampM, lamps);
  scene.add(poleIM, lampIM);
  // lamp-post banners on arterials — vertical pennants with the town name
  {
    const [bc, bx] = makeCanvas(96, 160);
    bx.fillStyle = '#2e5d8c'; bx.fillRect(0, 0, 96, 160);
    bx.fillStyle = '#f0ead6'; bx.fillRect(0, 0, 96, 10); bx.fillRect(0, 150, 96, 10);
    bx.fillStyle = '#f0ead6'; bx.font = 'bold 20px Georgia,serif';
    bx.textAlign = 'center'; bx.textBaseline = 'middle';
    'HAVENBROOK'.split('').forEach((ch, i) => bx.fillText(ch, 48, 24 + i * 11.5));
    bx.fillStyle = '#d9b23a';
    bx.beginPath(); bx.arc(48, 140, 6, 0, 6.28); bx.fill();
    const banM = new M({ map: canvasTex(bc), side: THREE.DoubleSide, roughness: .9 });
    const banG = new THREE.PlaneGeometry(.72, 1.5); banG.translate(0, .75, 0);
    const banners = [];
    for (const l of poles) if (R() < .4) {
      // banner edge lands on the shaft (pole r=.12, half-width .36 → offset .5)
      const dx = .5 * Math.cos(l.ry + Math.PI / 2), dz = .5 * Math.sin(l.ry + Math.PI / 2);
      banners.push({ x: l.x + dx, z: l.z + dz, y: 4.4, ry: l.ry + Math.PI / 2 });
    }
    scene.add(instances(banG, banM, thin(banners), { shadow: false }));
  }
  if (_lowLightQuery()) {
    lampM.emissive = new THREE.Color('#ffb46a'); lampM.emissiveIntensity = 2.4;
    // warm pool under each lamp head — additive decal on the pavement
    const poolG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const poolM = new THREE.MeshBasicMaterial({ map: warmGlowTexture(),
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: .5 });
    const poolIM = new THREE.InstancedMesh(poolG, poolM, lamps.length);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion();
    lamps.forEach((l, i) => {
      const hx = l.x - 2.3 * Math.cos(l.ry), hz = l.z + 2.3 * Math.sin(l.ry);
      q.setFromEuler(new THREE.Euler(0, 0, 0));
      Mx.compose(new THREE.Vector3(hx, .31, hz), q, new THREE.Vector3(15, 1, 15));
      poolIM.setMatrixAt(i, Mx);
    });
    poolIM.renderOrder = 2; poolIM.instanceMatrix.needsUpdate = true;
    scene.add(poolIM);
  }
  buildHero(scene);   // sprint-03 landmarks — runs after ALL occupancy is in,
                      // before trees/cars/people so our occupyRects hold ground
  return lampIM;
}

/* ---------------- water / park ---------------- */
export function buildWater(scene) {
  const wm = waterMaterial({ color: '#2b4a58' });
  for (const wdef of WATER) {
    // sand rim + stone edging
    const rim = new THREE.Mesh(new THREE.CircleGeometry(wdef.r * 1.1, 40), mat('#c9bd9a'));
    rim.rotation.x = -Math.PI / 2; rim.position.set(wdef.x, Y + .01, wdef.z);
    rim.scale.set(wdef.sx, wdef.sz, 1); rim.rotation.z = wdef.rot; rim.receiveShadow = true;
    scene.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(wdef.r, 48), wm);
    water.rotation.x = -Math.PI / 2; water.position.set(wdef.x, Y + .04, wdef.z);
    water.scale.set(wdef.sx, wdef.sz, 1); water.rotation.z = wdef.rot;
    water.userData.dynamic = true;
    scene.add(water);
    // lily pads + reeds at rim
    const pads = [], reeds = [];
    for (let i = 0; i < 14; i++) {
      const a = rr(0, 6.28), rad = rr(0, wdef.r * .8);
      pads.push({ x: wdef.x + Math.cos(a) * rad * wdef.sx, z: wdef.z + Math.sin(a) * rad * wdef.sz,
                  s: rr(.4, 1), color: '#4e7d46' });
    }
    for (let i = 0; i < 26; i++) {
      const a = rr(0, 6.28), rad = rr(wdef.r * .95, wdef.r * 1.12);
      reeds.push({ x: wdef.x + Math.cos(a) * rad * wdef.sx, z: wdef.z + Math.sin(a) * rad * wdef.sz,
                   s: rr(.7, 1.4), color: pick(['#6a7a3a', '#7a8a4a', '#5a6a34']) });
    }
    const padG = new THREE.CircleGeometry(1, 8); padG.rotateX(-Math.PI / 2); padG.translate(0, Y + .07, 0);
    const reedG = new THREE.ConeGeometry(.09, 1.6, 5); reedG.translate(0, .8, 0);
    scene.add(instances(padG, new M({ color: '#fff', roughness: .9 }), thin(pads), { shadow: false }));
    scene.add(instances(reedG, new M({ color: '#fff', roughness: .95 }), thin(reeds), { shadow: false }));
  }

  /* pond life - ducks paddle lazy circles (animated in tickWorld), rowboats
     rest at the dock. Dedicated seed stream: zero R() draws consumed. */
  const Rd = mulberry32(4401), rd = (a, b) => a + Rd() * (b - a);
  const duckG = colored([
    { geo: new THREE.SphereGeometry(.5, 9, 7), color: '#7a6248',
      x: 0, y: .3, z: 0, sy: .78, sz: .7 },
    { geo: new THREE.CylinderGeometry(.1, .16, .32, 5), color: '#6e5a42',
      x: .4, y: .55, z: 0, rz: .5 },
    { geo: new THREE.SphereGeometry(.23, 8, 6), color: '#39543a',
      x: .52, y: .7, z: 0 },
    { geo: new THREE.ConeGeometry(.08, .3, 5), color: '#d8892e',
      x: .78, y: .7, z: 0, rz: -1.57 },
    { geo: new THREE.ConeGeometry(.15, .45, 5), color: '#64503a',
      x: -.62, y: .42, z: 0, rz: 1.9 },
  ]);
  const duckL = [];
  const keepClear = (ax, az) => (ax - 570) ** 2 + (az - 152) ** 2 > 225;  // island
  for (const wdef of WATER) {
    if (wdef.r < 40) continue;                         // big pond only
    const n = Math.round(wdef.r * .26);
    for (let i = 0; i < n; i++) {
      const a0 = rd(0, 6.28), rad = rd(.12, .72);
      const dax = wdef.x + Math.cos(a0) * wdef.r * rad * wdef.sx,
            daz = wdef.z + Math.sin(a0) * wdef.r * rad * wdef.sz;
      if (!keepClear(dax, daz)) continue;
      duckL.push({ ax: dax, az: daz, r: rd(1.5, 5), ph: rd(0, 6.28),
                   vv: rd(.05, .12) * (Rd() < .5 ? 1 : -1), s: rd(.8, 1.25) });
    }
  }
  if (duckL.length) {
    const duckIM = new THREE.InstancedMesh(duckG, VCOL(), duckL.length);
    duckIM.frustumCulled = false;
    scene.add(duckIM);
    ducks = { im: duckIM, list: duckL };
  }
  // rowboats - hull + wedge bow + benches + resting oar, merged colored geo
  const boatG = colored([
    { geo: new THREE.BoxGeometry(3.2, .5, 1.1), color: '#6e4630',
      x: 0, y: .26, z: 0 },
    { geo: new THREE.CylinderGeometry(0, .56, 1.1, 4), color: '#6e4630',
      x: 1.85, y: .26, z: 0, rz: -1.5708 },
    { geo: new THREE.BoxGeometry(2.2, .1, .78), color: '#43301f',
      x: -.2, y: .52, z: 0 },
    { geo: new THREE.BoxGeometry(.7, .1, 1.0), color: '#c8b896',
      x: .6, y: .5, z: 0 },
    { geo: new THREE.BoxGeometry(.7, .1, 1.0), color: '#c8b896',
      x: -.9, y: .5, z: 0 },
    { geo: new THREE.CylinderGeometry(.04, .04, 2.8, 5), color: '#8a7048',
      x: 0, y: .58, z: 0, ry: .5, rz: 1.5708 },
  ]);
  const boatM = VCOL();
  for (const [bx, bz, br2] of [[548, 146, .9], [618, 170, 2.5]]) {
    const b = new THREE.Mesh(boatG, boatM);
    b.position.set(bx, Y + .1, bz); b.rotation.y = br2;
    b.castShadow = true;
    scene.add(b);
  }

  /* pond island gazebo - a destination the rowboats imply. Static colored
     merge; every number is literal so zero R() draws are consumed. */
  {
    const parts = [
      { geo: new THREE.CylinderGeometry(9.4, 9.9, .9, 26), color: '#6b6f72', y: .3 },
      { geo: new THREE.CylinderGeometry(8.6, 9.0, .55, 26), color: '#79a35c', y: .72 },
      { geo: new THREE.CylinderGeometry(3.6, 3.8, .45, 6), color: '#c9bfae', y: 1.1 },
      { geo: new THREE.CylinderGeometry(.42, 4.05, 2.3, 6), color: '#5a6a74', y: 4.75 },
      { geo: new THREE.SphereGeometry(.3, 8, 6), color: '#d8b23a', y: 6.05 },
      { geo: new THREE.SphereGeometry(1.1, 8, 6), color: '#7d8184', x: 6.9, y: 1.0, z: 4.4, sy: .7 },
      { geo: new THREE.SphereGeometry(.8, 8, 6), color: '#6f7477', x: -7.4, y: .85, z: -3.2, sy: .62 },
      { geo: new THREE.SphereGeometry(1.5, 8, 6), color: '#4e7d46', x: -5.6, y: 1.4, z: 4.6, sy: .8 },
      { geo: new THREE.SphereGeometry(1.2, 8, 6), color: '#5d8a3c', x: 5.2, y: 1.3, z: -5.4, sy: .75 },
    ];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      parts.push({ geo: new THREE.CylinderGeometry(.15, .15, 2.9, 6), color: '#f0ead8',
        x: ca * 2.9, y: 2.55, z: sa * 2.9 });
      const a2 = a + Math.PI / 6;                        // rail between posts
      parts.push({ geo: new THREE.BoxGeometry(3.0, .42, .09), color: '#8a6a48',
        x: Math.cos(a2) * 2.9, y: 1.8, z: Math.sin(a2) * 2.9, ry: -a2 });
      parts.push({ geo: new THREE.BoxGeometry(3.0, .14, .12), color: '#a8885e',
        x: Math.cos(a2) * 2.9, y: 2.28, z: Math.sin(a2) * 2.9, ry: -a2 });
    }
    const island = new THREE.Mesh(colored(parts), VCOL());
    island.position.set(570, Y - .15, 152);
    island.castShadow = island.receiveShadow = true;
    scene.add(island);
  }
}

export function buildPark(scene) {
  buildGreens(scene);      // programmed green parcels (city/greens.js)
  const P = PARK_ZONE;
  const lawnM = pbr('grass_ground', { color: '#a8c088' });
  const lawn = plane(P.x1 - P.x0, P.z1 - P.z0,
    lawnM, (P.x0 + P.x1) / 2, Y - .03, (P.z0 + P.z1) / 2, -Math.PI / 2, 9);
  scene.add(lawn);

  // winding path
  const pathM = lift(pbr('gravel', { color: '#c9b898' }), 6);  // keyed: mutating shared GRVL retinted every gravel surface
  const pathGeos = [];
  for (let t = 0; t <= 1; t += .006) {
    const x = P.x0 + 20 + t * (P.x1 - P.x0 - 40);
    const z = (P.z0 + P.z1) / 2 + Math.sin(t * Math.PI * 2.4) * 70;
    const g = new THREE.CircleGeometry(3.4, 12);
    g.rotateX(-Math.PI / 2); g.translate(x, Y + .008, z);
    pathGeos.push(g);
  }
  const pathMesh = new THREE.Mesh(mergeGeometries(pathGeos.map(g => g.toNonIndexed()), false), pathM);
  pathMesh.receiveShadow = true; scene.add(pathMesh);
  pathGeos.forEach(g => g.dispose());

  // gazebo on pond edge
  const gz = new THREE.Group();
  const gm = mat('#e8e2d4');
  gz.add(cyl(4.6, 4.6, .5, mat('#b3a58c'), 0, 0, 0, 8));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    gz.add(cyl(.18, .18, 3.4, gm, Math.cos(a) * 3.8, .5, Math.sin(a) * 3.8));
  }
  const groof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.6, 8), mat('#6d4c3d'));
  groof.position.y = 5.1; groof.castShadow = true; gz.add(groof);
  const gfin = cyl(.1, .1, 1.2, mat('#d4ac0d'), 0, 6.2, 0, 6); gz.add(gfin);
  gz.position.set(505, 0, 95); scene.add(gz);

  // wooden dock into the pond
  const dock = new THREE.Group();
  const dkM = mat('#8a6a48');
  for (let i = 0; i < 8; i++) dock.add(box(2.2, .18, 1.9, dkM, 0, .5, i * 2));
  dock.add(box(.16, 1, 16.4, mat('#6a5238'), -1.05, .5, 7));
  dock.add(box(.16, 1, 16.4, mat('#6a5238'), 1.05, .5, 7));
  dock.position.set(540, 0, 132); dock.rotation.y = .9; scene.add(dock);

  /* floating aerating fountain in the pond's east lobe - moored float ring +
     nozzle, plume animated in tickWorld. Dedicated seed stream, literal
     placement clear of the dock reach and the gazebo island, zero R() draws. */
  {
    const fx = 618, fz = 108;
    const fparts = [
      { geo: new THREE.TorusGeometry(1.7, .34, 8, 18).rotateX(Math.PI / 2),
        color: '#3a4a52', x: fx, y: Y + .32, z: fz },
      { geo: new THREE.SphereGeometry(.9, 10, 7), color: '#26333a',
        x: fx, y: Y + .45, z: fz, sy: .55 },
      { geo: new THREE.CylinderGeometry(.12, .16, 1.4, 6), color: '#c9ccd0',
        x: fx, y: Y + 1.1, z: fz },
    ];
    const fm = new THREE.Mesh(colored(fparts), VCOL());
    fm.castShadow = true; scene.add(fm);
    const NJ = 140, jp = new Float32Array(NJ * 3), js = new Float32Array(NJ * 2);
    const Rj = mulberry32(7741);
    for (let i = 0; i < NJ; i++) { js[i * 2] = Rj(); js[i * 2 + 1] = Rj(); }
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.BufferAttribute(jp, 3));
    const jpm = new THREE.PointsMaterial({ color: '#d8f0f8', size: .55,
      transparent: true, opacity: .85, depthWrite: false, sizeAttenuation: true });
    const jpts = new THREE.Points(jg, jpm);
    jpts.userData.dynamic = true;
    scene.add(jpts);
    pondJet = { pts: jpts, pos: jp, seed: js, cx: fx, cz: fz };
  }

  // moored sailboats off the dock end - hull, mast, triangle main+jib
  const sailSh = (w, h) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(w, 0); sh.lineTo(0, h);
    return new THREE.ShapeGeometry(sh);
  };
  const boatDefs = [[552, 160, .9, '#e8e2d4'], [596, 132, -2.2, '#c8543e']];
  for (const [bx, bz, br, trim] of boatDefs) {
    const sb = [
      { geo: new THREE.BoxGeometry(4.6, .6, 1.4), color: '#f0ebe0', y: .34 },
      { geo: new THREE.CylinderGeometry(0, .72, 1.5, 4), color: '#f0ebe0',
        x: 2.7, y: .34, rz: -1.5708 },
      { geo: new THREE.BoxGeometry(3.2, .16, 1.0), color: trim, y: .68 },
      { geo: new THREE.CylinderGeometry(.06, .08, 7.4, 6), color: '#8a7048',
        y: 4.2 },
      { geo: sailSh(2.6, 4.2), color: '#f2f2ee', x: .1, y: 2.2 },
      { geo: sailSh(1.9, 3.4), color: trim, x: -.15, y: 2.4, ry: Math.PI },
    ];
    const sm = new THREE.Mesh(colored(sb), VCOL());
    sm.position.set(bx, Y + .02, bz); sm.rotation.y = br;
    sm.castShadow = true;
    scene.add(sm);
  }

  // playground
  const pg = new THREE.Group();
  pg.add(plane(34, 24, sandM(), 0, Y + .005, 0));
  pg.add(box(8, .18, .18, mat('#3d6b8a'), 0, 3.4, -6));
  pg.add(box(.18, 3.4, .18, mat('#3d6b8a'), -4, 0, -6)); pg.add(box(.18, 3.4, .18, mat('#3d6b8a'), 4, 0, -6));
  for (const sx of [-2, .5]) {
    pg.add(box(.06, 2.2, .06, mat('#999'), sx - .4, 1.2, -6));
    pg.add(box(.06, 2.2, .06, mat('#999'), sx + .4, 1.2, -6));
    pg.add(box(1, .12, .4, mat('#c0392b'), sx, 1.1, -6));
  }
  const sl = box(1.2, .15, 5, mat('#d4ac0d'), 6, 1.4, 2); sl.rotation.x = -.5; pg.add(sl);
  pg.add(box(1.6, 2.8, 1.6, mat('#c0392b'), 6, 0, 4.4));
  // merry-go-round
  pg.add(cyl(1.6, 1.6, .18, mat('#8e44ad'), -7, .5, 5, 16));
  pg.add(cyl(.12, .12, .9, mat('#666'), -7, .5, 5, 8));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    pg.add(box(.08, .08, 2.6, mat('#d4ac0d'), -7 + Math.cos(a) * .01, 1.15, 5 + Math.sin(a) * .01).rotateY(-a));
  }
  pg.add(box(4.4, .15, .5, mat('#2e6b46'), -6, .8, 3));
  pg.add(cyl(.3, .3, .8, mat('#666'), -6, 0, 3));
  pg.add(box(6, .5, 6, mat('#cbb57f'), 8, 0, -5));
  pg.position.set(415, 0, 60); scene.add(pg);

  // ball field
  const bf = new THREE.Group();
  const dia = new THREE.Mesh(new THREE.CircleGeometry(26, 4), lift(mat('#b99b6e'), 4));
  dia.rotation.x = -Math.PI / 2; dia.rotation.z = Math.PI / 4; dia.position.y = Y + .004; dia.receiveShadow = true;
  bf.add(dia);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(34, 32), mat('#5f8c4e'));
  grass.rotation.x = -Math.PI / 2; grass.position.y = Y; grass.receiveShadow = true;
  bf.add(grass); dia.position.y = Y + .01;
  // bases + fence arc
  const baseM = mat('#f0ece0');
  [[10, 0], [0, 10], [-10, 0], [0, -10]].forEach(([bx, bz]) =>
    bf.add(box(.8, .08, .8, baseM, bx, Y + .02, bz)));
  bf.position.set(430, 0, 235); scene.add(bf);

  // benches along path + picnic tables â€” one merged colored mesh
  const parts = [];
  const benchAt = (bx, bz, ry) => {
    const c = Math.cos(ry), s2 = Math.sin(ry);
    const T = (lx, lz) => [bx + lx * c + lz * s2, bz - lx * s2 + lz * c];
    let [wx, wz] = T(0, 0);
    parts.push({ geo: new THREE.BoxGeometry(2.4, .12, .6), color: '#7a5c3e', x: wx, y: .55, z: wz, ry });
    [wx, wz] = T(0, -.3);
    parts.push({ geo: new THREE.BoxGeometry(2.4, .5, .1), color: '#7a5c3e', x: wx, y: .8, z: wz, ry });
    for (const lx of [-1, 1]) {
      [wx, wz] = T(lx, 0);
      parts.push({ geo: new THREE.BoxGeometry(.15, .55, .55), color: '#3a3f43', x: wx, y: .28, z: wz, ry });
    }
  };
  for (let i = 0; i < 10; i++) {
    const t = rr(0, 1);
    benchAt(P.x0 + 30 + t * (P.x1 - P.x0 - 60) + rr(-6, 6),
      (P.z0 + P.z1) / 2 + Math.sin(t * Math.PI * 2.4) * 70 + rr(4, 8), rr(0, 6.28));
  }
  // flower beds â€” colored rings + instanced flowers
  const flowers = [];
  for (let i = 0; i < 6; i++) {
    const fx = rr(P.x0 + 40, P.x1 - 60), fz = rr(P.z0 + 20, P.z1 - 60);
    if (!isFree(fx, fz, 4)) continue;
    parts.push({ geo: new THREE.CylinderGeometry(3.2, 3.4, .4, 14), color: '#6a5138', x: fx, y: .2, z: fz });
    for (let j = 0; j < 14; j++) {
      const a = rr(0, 6.28), rad = rr(.4, 2.6);
      flowers.push({ x: fx + Math.cos(a) * rad, z: fz + Math.sin(a) * rad, s: rr(.7, 1.2),
        color: pick(['#d4526e', '#e8b13a', '#e8e6df', '#8e44ad', '#c0392b']) });
    }
  }

  const propMesh = new THREE.Mesh(colored(parts), VCOL());
  propMesh.castShadow = propMesh.receiveShadow = true;
  scene.add(propMesh);
  const flG = new THREE.IcosahedronGeometry(.22, 0); flG.translate(0, .45, 0);
  const flStem = new THREE.ConeGeometry(.05, .5, 4); flStem.translate(0, .25, 0);
  scene.add(instances(flG, new M({ color: '#fff', roughness: .8 }), thin(flowers), { shadow: false }));

  // keep scattered trees off the built features & the walking path
  occupyRect(505, 95, 13, 13, 3);            // gazebo
  occupyRect(540, 132, 20, 16, 2);           // dock (rotated â€” generous box)
  occupyRect(415, 60, 38, 28, 3);            // playground
  occupyRect(430, 235, 72, 72, 3);           // ball field
  for (let t = 0; t <= 1; t += .04)
    occupyRect(P.x0 + 20 + t * (P.x1 - P.x0 - 40),
               (P.z0 + P.z1) / 2 + Math.sin(t * Math.PI * 2.4) * 70, 9, 9, 1);
}

/* ---------------- downtown plaza ---------------- */
let fountain = null, pondJet = null, balloons = null;
export function buildPlaza(scene, spec) {
  const pz = lift(pbr('precast_stone_paving', { color: '#c9bfae' }), 1);
  scene.add(plane(spec.w, spec.d, pz, spec.x, Y - .02, spec.z, -Math.PI / 2, 3.2));
  // fountain
  const f = new THREE.Group();
  f.add(cyl(5, 5.4, 1.1, mat('#9aa0a3'), 0, 0, 0, 24));
  f.add(cyl(4.6, 4.6, .3, mat('#7a8288'), 0, .95, 0, 24));
  const wf = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), waterMaterial({ color: '#2b4a58' }));
  wf.rotation.x = -Math.PI / 2; wf.position.y = 1.05; wf.userData.dynamic = true; f.add(wf);
  f.add(cyl(.5, .7, 3.2, mat('#9aa0a3'), 0, .8, 0));
  f.add(cyl(1.6, 1.8, .5, mat('#9aa0a3'), 0, 3.4, 0));
  f.add(cyl(.3, .3, 1.4, mat('#8a9094'), 0, 3.9, 0));
  f.position.set(spec.x, 0, spec.z); scene.add(f);

  // animated spray: points cycling upward from the crown
  const N = 160;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { seed[i * 2] = R(); seed[i * 2 + 1] = R(); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.PointsMaterial({ color: '#cfe8f4', size: .32, transparent: true,
    opacity: .75, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(pg, pmat);
  pts.userData.dynamic = true;
  scene.add(pts);
  fountain = { pts, pos, seed, cx: spec.x, cz: spec.z };

  // benches + planters ring
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const bx = spec.x + Math.cos(a) * 14, bz = spec.z + Math.sin(a) * 14;
    parts.push({ geo: new THREE.BoxGeometry(2.4, .12, .6), color: '#6e5138', x: bx, y: .55, z: bz, ry: -a + Math.PI / 2 });
    parts.push({ geo: new THREE.BoxGeometry(2.4, .5, .1), color: '#6e5138', x: bx - Math.sin(a) * .3, y: .8, z: bz - Math.cos(a) * .3, ry: -a + Math.PI / 2 });
  }
  for (let i = 0; i < 6; i++) {
    const px = spec.x - spec.w / 2 + 8 + i * (spec.w - 16) / 5, pz = spec.z - spec.d / 2 + 4;
    parts.push({ geo: new THREE.BoxGeometry(2, .8, 2), color: '#8a6a4d', x: px, y: .4, z: pz });
    parts.push({ geo: new THREE.IcosahedronGeometry(1.1, 0), color: '#4e7d46', x: px, y: 1.5, z: pz });
  }
  // banner poles at plaza corners
  for (const [bx, bz] of [[spec.x - spec.w / 2 + 4, spec.z + spec.d / 2 - 4],
                          [spec.x + spec.w / 2 - 4, spec.z + spec.d / 2 - 4],
                          [spec.x - spec.w / 2 + 4, spec.z - spec.d / 2 + 4],
                          [spec.x + spec.w / 2 - 4, spec.z - spec.d / 2 + 4]]) {
    parts.push({ geo: new THREE.CylinderGeometry(.08, .1, 6.5, 8), color: '#4a5154', x: bx, y: 3.25, z: bz });
    parts.push({ geo: new THREE.BoxGeometry(1.1, 2.2, .06), color: '#2471a3', x: bx + .6, y: 4.6, z: bz });
  }
  const pm = new THREE.Mesh(colored(parts), VCOL());
  pm.castShadow = pm.receiveShadow = true;
  scene.add(pm);

  /* festoon string lights spanning the corner banner poles - warm bulbs that
     glow at night via RUNENV.litI. Literal geometry, zero R() draws. */
  {
    const LP = [[spec.x - spec.w / 2 + 4, spec.z + spec.d / 2 - 4],
                [spec.x + spec.w / 2 - 4, spec.z + spec.d / 2 - 4],
                [spec.x - spec.w / 2 + 4, spec.z - spec.d / 2 + 4],
                [spec.x + spec.w / 2 - 4, spec.z - spec.d / 2 + 4]];
    const TOP = 6.35, SAG = 1.6;
    const bulbs = [], wire = [];
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [0, 3], [1, 2]]) {
      const [ax, az] = LP[a], [bx, bz] = LP[b];
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 1.35);
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n,
              x = ax + (bx - ax) * t, z = az + (bz - az) * t,
              y = Y + TOP - SAG * 4 * t * (1 - t);
        if (i) wire.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
        bulbs.push({ x, y: y - .14, z, s: 1 });
      }
    }
    const litM = new M({ color: '#fff2d8', emissive: '#ffd9a0',
      emissiveIntensity: RUNENV.litI, roughness: .5 });
    litM.envMapIntensity *= RUNENV.envScale; litM.userData.lit = true;
    scene.add(instances(new THREE.SphereGeometry(.1, 6, 4), litM, bulbs,
      { shadow: false }));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2e3234' })));
  }
}

/* ---------------- athletic park ---------------- */
export function buildAthleticPark(scene) {
  const ln = mat('#e8e6df');
  const bin = new GeoBin();
  const field = (cx, cz, w, d) => {
    occupyRect(cx, cz, w + 8, d + 8, 2);
    const fm = lift(pbr('grass_ground', { color: '#9ab578' }), 2);
    scene.add(plane(w, d, fm, cx, Y + .002, cz, -Math.PI / 2, 9));
    const line = (ww, dd, x, z) => bin.plane(ww, dd, ln, cx + x, Y + .008, cz + z);
    line(w, .35, 0, -d / 2 + .4); line(w, .35, 0, d / 2 - .4);
    line(.35, d, -w / 2 + .4, 0); line(.35, d, w / 2 - .4, 0);
    line(.35, d, 0, 0);
    const circ = new THREE.RingGeometry(7.7, 8, 24);
    circ.rotateX(-Math.PI / 2); circ.translate(cx, Y + .008, cz);
    let bb = bin.b.get(ln); if (!bb) { bb = []; bin.b.set(ln, bb); } bb.push(circ);
    // goals
    const parts = [];
    for (const s of [-1, 1]) {
      const gx = cx + s * (w / 2 - 1.2);
      parts.push({ geo: new THREE.BoxGeometry(.15, 2.4, .15), color: '#e8e6df', x: gx, y: 1.2, z: cz - 3 });
      parts.push({ geo: new THREE.BoxGeometry(.15, 2.4, .15), color: '#e8e6df', x: gx, y: 1.2, z: cz + 3 });
      parts.push({ geo: new THREE.BoxGeometry(.15, .15, 6.3), color: '#e8e6df', x: gx, y: 2.4, z: cz });
    }
    const gm = new THREE.Mesh(colored(parts), VCOL()); gm.castShadow = true; scene.add(gm);
  };
  field(-30, 570, 84, 50);
  field(-30, 670, 84, 50);
  // bleachers between fields
  for (const bx of [-72, 12]) {
    const parts = [];
    for (let t = 0; t < 4; t++)
      parts.push({ geo: new THREE.BoxGeometry(1, .4 + t * .45, 18), color: t % 2 ? '#8a9094' : '#9aa0a3',
        x: bx + t * 1.1, y: .2 + t * .22, z: 620 });
    const bm = new THREE.Mesh(colored(parts), VCOL()); bm.castShadow = true; scene.add(bm);
  }
  bin.build(scene);
  // baseball diamond
  const bd = new THREE.Group();
  const gr = new THREE.Mesh(new THREE.CircleGeometry(36, 28), lift(mat('#5f8c4e'), 2));
  gr.rotation.x = -Math.PI / 2; gr.position.y = Y + .002; gr.receiveShadow = true; bd.add(gr);
  const dia = new THREE.Mesh(new THREE.CircleGeometry(17, 4), lift(mat('#b99b6e'), 4));
  dia.rotation.x = -Math.PI / 2; dia.rotation.z = Math.PI / 4; dia.position.y = Y + .01; bd.add(dia);
  const mound = new THREE.Mesh(new THREE.CircleGeometry(3, 14), mat('#a88a60'));
  mound.rotation.x = -Math.PI / 2; mound.position.y = Y + .012; bd.add(mound);
  bd.add(box(.15, 4, 10, mat('#3d4a42'), -20, 0, 0));
  bd.add(box(10, 4, .15, mat('#3d4a42'), -15, 0, -5));
  bd.add(box(10, 4, .15, mat('#3d4a42'), -15, 0, 5));
  bd.position.set(160, 0, 580); scene.add(bd);
  occupyRect(160, 580, 76, 76, 4);
  // retention pond
  const rim = new THREE.Mesh(new THREE.CircleGeometry(30, 36), mat('#c9bd9a'));
  rim.rotation.x = -Math.PI / 2; rim.position.set(262, Y + .01, 655); rim.scale.set(1.3, .9, 1);
  rim.receiveShadow = true; scene.add(rim);
  const wat = new THREE.Mesh(new THREE.CircleGeometry(27, 36), waterMaterial({ color: '#3d6a80' }));
  wat.rotation.x = -Math.PI / 2; wat.position.set(262, Y + .04, 655); wat.scale.set(1.3, .9, 1);
  wat.userData.dynamic = true; scene.add(wat);
  occupyRect(262, 655, 84, 62, 4);
  // small playground near lot
  const pg = new THREE.Group();
  pg.add(plane(26, 20, sandM(), 0, Y + .005, 0));
  pg.add(box(7, .18, .18, mat('#3d6b8a'), -4, 3.2, -4));
  pg.add(box(.18, 3.2, .18, mat('#3d6b8a'), -7.5, 0, -4)); pg.add(box(.18, 3.2, .18, mat('#3d6b8a'), -.5, 0, -4));
  const sl = box(1.1, .15, 5, mat('#d4ac0d'), 6, 1.3, 0); sl.rotation.x = -.5; pg.add(sl);
  pg.add(box(1.5, 2.6, 1.5, mat('#c0392b'), 6, 0, 2.6));
  pg.position.set(130, 0, 505); scene.add(pg);
  occupyRect(130, 505, 30, 24, 4);
}

/* ---------------- people (instanced, walking) ---------------- */
const SHIRTS = ['#c0392b', '#2e5b8a', '#e8e6df', '#1e8449', '#7d3c98', '#d4ac0d', '#5d6d7e', '#a93226'];
const PANTS = ['#2c3a42', '#3a4a55', '#4a3f32', '#26333d', '#37474f'];
const SKINS = ['#e8c39e', '#c68642', '#8d5524', '#f1d4b8'];
let people = null;
export function buildPeople(scene) {
  // legs pivot at the hip; includes a foot shoe block so the ankle turns
  const legSwing = mergeGeometries([
    new THREE.CylinderGeometry(.09, .075, .72, 7).translate(0, -.36, 0),
    new THREE.BoxGeometry(.11, .07, .24).translate(0, -.78, .05),
  ], false);
  // arms pivot at the shoulder; hand sphere at the wrist
  const armSwing = mergeGeometries([
    new THREE.CylinderGeometry(.065, .055, .6, 6).translate(0, -.3, 0),
    new THREE.SphereGeometry(.065, 6, 5).translate(0, -.62, 0),
  ], false);
  const torsoG = mergeGeometries([
    new THREE.BoxGeometry(.42, .22, .24).translate(0, .92, 0),                    // pelvis
    new THREE.CylinderGeometry(.24, .29, .5, 8).translate(0, 1.24, 0),           // chest
    new THREE.BoxGeometry(.5, .12, .26).translate(0, 1.5, 0),                    // shoulders
    new THREE.CylinderGeometry(.06, .07, .14, 6).translate(0, 1.58, 0),          // neck
  ], false);
  const headG = new THREE.SphereGeometry(.155, 10, 8); headG.translate(0, 1.72, 0);
  // hair cap: half-sphere raked back — separate IM so hair color varies per instance
  const hairG = new THREE.SphereGeometry(.165, 9, 6, 0, Math.PI * 2, 0, Math.PI * .62);
  hairG.scale(1, 1.05, 1.08); hairG.translate(0, 1.72, -.02);
  const HAIR = ['#2a2119', '#0f0d0b', '#5c4630', '#8a6b45', '#4a4a4a', '#b8b0a5', '#7a3b22'];

  // spots: static idlers + sidewalk walkers on the road graph
  const idlers = thin([
    ...Array.from({ length: 14 }, () => [-480 + rr(-35, 35), -520 + rr(-28, 28)]),
    ...Array.from({ length: 14 }, () => [40 + rr(-65, 65), -200 + rr(-45, 45)]),
    ...Array.from({ length: 10 }, () => [rr(380, 700), rr(345, 430)]),
    ...Array.from({ length: 10 }, () => [rr(-580, -420), rr(80, 280)]),
    ...Array.from({ length: 8 }, () => [rr(360, 700), rr(-470, -380)]),
    ...Array.from({ length: 10 }, () => [rr(-60, 300), rr(335, 425)]),
    ...Array.from({ length: 8 }, () => [rr(-160, 320), rr(60, 240)]),
  ]);
  const edges = roadGraph();
  const walkers = [];
  for (let i = 0; i < Math.max(8, Math.round(130 * DETAIL.f)); i++) {
    const e = edges[Math.floor(R() * edges.length)];
    if (e.a1 - e.a0 < 30) { i--; continue; }
    walkers.push({ e, t: rr(0, 1), dir: pick([1, -1]), v: rr(1.1, 1.9), ph: rr(0, 6.28),
      side: pick([-1, 1]) });
  }
  const total = idlers.length + walkers.length;
  const pantsM = new M({ color: '#fff', roughness: .9 });
  const shirtM = new M({ color: '#fff', roughness: .9 });
  const skinM = new M({ color: '#fff', roughness: .7 });
  const hairM = new M({ color: '#fff', roughness: .85 });
  const legLIM = new THREE.InstancedMesh(legSwing, pantsM, total);
  const legRIM = new THREE.InstancedMesh(legSwing, pantsM, total);
  const armLIM = new THREE.InstancedMesh(armSwing, shirtM, total);
  const armRIM = new THREE.InstancedMesh(armSwing, shirtM, total);
  const torsoIM = new THREE.InstancedMesh(torsoG, shirtM, total);
  const headIM = new THREE.InstancedMesh(headG, skinM, total);
  const hairIM = new THREE.InstancedMesh(hairG, hairM, total);
  for (const im of [legLIM, legRIM, armLIM, armRIM, torsoIM, headIM, hairIM]) {
    im.castShadow = true; im.frustumCulled = false;
  }
  const col = new THREE.Color();
  const scales = [];
  const setColors = (i) => {
    col.set(pick(PANTS)); legLIM.setColorAt(i, col); legRIM.setColorAt(i, col);
    col.set(pick(SHIRTS)); torsoIM.setColorAt(i, col);
    armLIM.setColorAt(i, col); armRIM.setColorAt(i, col);
    col.set(pick(SKINS)); headIM.setColorAt(i, col);
    col.set(pick(HAIR)); hairIM.setColorAt(i, col);
    scales[i] = rr(.88, 1.1);
  };
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler();
  const stand = (i, x, z, yaw) => {
    const sc = scales[i]; s.set(1, sc, 1);
    eul.set(0, yaw, 0); q.setFromEuler(eul);
    p.set(x, 0, z); mx.compose(p, q, s);
    torsoIM.setMatrixAt(i, mx); headIM.setMatrixAt(i, mx); hairIM.setMatrixAt(i, mx);
    p.y = .86 * sc; mx.compose(p, q, s);                    // legs pivot at hip
    legLIM.setMatrixAt(i, mx); legRIM.setMatrixAt(i, mx);
    // arms hang from the shoulder, angled slightly outward — pivot offset
    // to each shoulder: local ±x rotated by yaw into world space
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    p.y = 1.5 * sc;
    eul.set(0, yaw, .12); q.setFromEuler(eul);
    p.set(x + .24 * ca, p.y, z - .24 * sa); mx.compose(p, q, s);
    armLIM.setMatrixAt(i, mx);
    eul.set(0, yaw, -.12); q.setFromEuler(eul);
    p.set(x - .24 * ca, p.y, z + .24 * sa); mx.compose(p, q, s);
    armRIM.setMatrixAt(i, mx);
    s.set(1, 1, 1);
  };
  idlers.forEach(([x, z], i) => {
    setColors(i);
    stand(i, x, z, rr(0, 6.28));
  });
  walkers.forEach((wk, k) => {
    const i = idlers.length + k;
    setColors(i);
    const a = wk.e.a0 + wk.t * (wk.e.a1 - wk.e.a0);
    const off = (wk.e.w / 2 + 1.5) * wk.side;
    const x = wk.e.axis === 'v' ? wk.e.c + off : a;
    const z = wk.e.axis === 'v' ? a : wk.e.c + off;
    stand(i, x, z, 0);
  });
  scene.add(legLIM, legRIM, armLIM, armRIM, torsoIM, headIM, hairIM);
  people = { walkers, legLIM, legRIM, armLIM, armRIM, torsoIM, headIM, hairIM, scales, n0: idlers.length };
  if (window.__city) window.__city.traffic = {
    ...(window.__city.traffic || {}), pedestrians: total, idlers: idlers.length,
  };
}

/* ---------------- misc street props ---------------- */
let signals = null;
export function buildProps(scene) {
  const allIx = intersections();
  const WANT_SIG = [
    ['Main St', 'University Ave'], ['Main St', 'Scholar Ln'],
    ['Elm St', 'Cedar Ave'], ['Commerce Blvd', 'University Ave'],
    ['Commerce Blvd', 'Cedar Ave'], ['Midtown Ave', 'University Ave'],
    ['Schoolhouse Rd', 'Cedar Ave'], ['Commerce Blvd', 'Parkside Dr'],
    ['Wellness Way', 'Parkside Dr'], ['Wellness Way', 'University Ave'],
  ];
  const wanted = WANT_SIG.map(([a, b]) => allIx.find(i =>
    (i.vn === a && i.hn === b) || (i.vn === b && i.hn === a))).filter(Boolean);
  const ix = wanted.length >= 8 ? wanted
    : allIx.filter(i => i.wv >= 16 && i.wh >= 16).slice(0, 10);
  // traffic signal: merged pole+arm+head geometry (vertex colors), instanced;
  // bulbs are a separate InstancedMesh with a per-instance 'lit' attribute.
  const sigParts = [
    { geo: new THREE.CylinderGeometry(.14, .18, 6.4, 8), color: '#2c3033', y: 3.2 },
    { geo: new THREE.BoxGeometry(4.5, .15, .15), color: '#2c3033', x: 2, y: 6.2 },
    { geo: new THREE.BoxGeometry(.52, 1.5, .42), color: '#1c1e20', x: 4, y: 5.4 },
    { geo: new THREE.CylinderGeometry(.2, .24, .5, 8), color: '#2c3033', y: .25 },
    // pedestrian signal box on pole
    { geo: new THREE.BoxGeometry(.4, .5, .3), color: '#1c1e20', x: .01, y: 3.1, z: .3 },
  ];
  const sigGeo = colored(sigParts);
  const bulbGeo = new THREE.CircleGeometry(.13, 10); bulbGeo.rotateY(0); bulbGeo.translate(0, 0, .22);
  const sigT = [], bulbs = [];
  for (const i of ix) {
    for (const [cx, cz, ry] of [[-1, -1, 0], [1, 1, Math.PI]]) {
      const x = i.x + cx * (i.wv / 2 + 1.8), z = i.z + cz * (i.wh / 2 + 1.8);
      sigT.push({ x, z, ry: ry + Math.PI / 4 });
      // 3 bulbs per head â€” face back along the arm toward oncoming traffic
      const yawG = ry + Math.PI / 4;
      const face = Math.atan2(Math.cos(yawG), Math.sin(yawG)); // +z maps to -armdir
      for (let b = 0; b < 3; b++)
        bulbs.push({ x: x + Math.cos(yawG) * 4, z: z - Math.sin(yawG) * 4,
          y: 5.82 - b * .5, ry: face, lit: 0, col: ['#ff4a3c', '#ffc23a', '#3ce86a'][b],
          axis: cx < 0 ? 'v' : 'h', slot: b });
    }
  }
  scene.add(instances(sigGeo, VCOL(), sigT));
  const bulbM = new M({ color: '#ffffff', roughness: .4 });
  bulbM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * vLit * 2.6;');
  };
  const bulbIM = new THREE.InstancedMesh(bulbGeo, bulbM, bulbs.length);
  bulbIM.frustumCulled = false;
  {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), eul = new THREE.Euler(), col = new THREE.Color();
    const litArr = new Float32Array(bulbs.length);
    bulbs.forEach((b, i) => {
      eul.set(0, b.ry + Math.PI / 2, 0); q.setFromEuler(eul);
      p.set(b.x, b.y, b.z);
      mx.compose(p, q, new THREE.Vector3(1, 1, 1));
      bulbIM.setMatrixAt(i, mx);
      col.set(b.col); bulbIM.setColorAt(i, col);
      litArr[i] = 0;
      b.idx = i;
    });
    bulbGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(litArr, 1));
  }
  scene.add(bulbIM);
  signals = { bulbIM, bulbs, t: 0 };

  // hydrants, trash cans, mailboxes, stop signs, bus stops â€” colored â†’ merged
  const parts = [];
  const hydrants = [[-20, -60], [160, -60], [60, -24], [-160, 60], [-480, 440], [240, -24],
                    [-420, 200], [-640, 420], [420, -240], [620, -460]];
  for (const [x, z] of hydrants) {
    parts.push({ geo: new THREE.CylinderGeometry(.22, .26, .9, 8), color: '#c0392b', x, y: .45, z });
    parts.push({ geo: new THREE.CylinderGeometry(.1, .1, .3, 8), color: '#c0392b', x, y: 1.0, z });
    parts.push({ geo: new THREE.CylinderGeometry(.26, .26, .12, 8), color: '#8e2f26', x, y: .85, z });
    parts.push({ geo: new THREE.SphereGeometry(.12, 8, 6), color: '#e8b13a', x, y: 1.18, z });
  }
  // stop signs at minor intersections
  const minor = intersections().filter(i => !i.arterial);
  for (const i of minor) {
    if (R() > .55) continue;
    const x = i.x + i.wv / 2 + 1.2, z = i.z + i.wh / 2 + 1.2;
    parts.push({ geo: new THREE.CylinderGeometry(.07, .08, 3, 8), color: '#8a9094', x, y: 1.5, z });
    parts.push({ geo: new THREE.CylinderGeometry(.55, .55, .06, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8),
      color: '#b03a2e', x, y: 2.9, z });
  }
  // trash cans downtown & plaza
  for (const [x, z] of [[20, -186], [100, -186], [60, -225], [-30, -60], [140, -60], [-160, -330], [140, 330], [300, 330]])
    parts.push({ geo: new THREE.CylinderGeometry(.4, .34, 1, 10), color: '#3d4a42', x, y: .5, z });
  // blue mailboxes near post office & downtown
  for (const [x, z] of [[148, -298], [30, -300], [-95, -70]])
    parts.push({ geo: new THREE.BoxGeometry(.7, 1, .6), color: '#2e5b8a', x, y: .55, z });
  // bus stop shelters on Commerce Blvd & University Ave
  for (const [x, z, ry] of [[-140, -345, 0], [310, 305, Math.PI],
      [-128.4, -260, 0], [-151.6, 60, Math.PI], [-300, 307.4, Math.PI], [100, 332.6, 0]]) {
    parts.push({ geo: new THREE.BoxGeometry(.15, 2.6, .15), color: '#3d4145', x: x - 2, y: 1.3, z });
    parts.push({ geo: new THREE.BoxGeometry(.15, 2.6, .15), color: '#3d4145', x: x + 2, y: 1.3, z });
    parts.push({ geo: new THREE.BoxGeometry(4.6, .12, 1.6), color: '#3d4145', x, y: 2.7, z });
    parts.push({ geo: new THREE.BoxGeometry(4.4, 1.4, .08), color: '#7fa6bd', x, y: 1.6, z: z - .7 });
    parts.push({ geo: new THREE.BoxGeometry(3.4, .1, .5), color: '#6e5138', x, y: .55, z: z - .4 });
  }
  // street name blades at the big junctions
  const _bladeMats = new Map();
  const bladeMat = name => {
    if (!_bladeMats.has(name))
      _bladeMats.set(name, new M({ map: signTexture(name.toUpperCase(),
        { bg: '#1e6b46', fg: '#f4f7f4', h: 64, font: 'bold 38px Arial' }), roughness: .6 }));
    return _bladeMats.get(name);
  };
  const bladeGrp = new THREE.Group();
  for (const i of ix.slice(0, 8)) {
    parts.push({ geo: new THREE.CylinderGeometry(.06, .07, 3.4, 8), color: '#3d4145',
      x: i.x - i.wv / 2 - 1.4, y: 1.7, z: i.z + i.wh / 2 + 1.4 });
    // blades face both directions â€” green
    parts.push({ geo: new THREE.BoxGeometry(2.6, .34, .06), color: '#1e6b46',
      x: i.x - i.wv / 2 - 1.4, y: 3.1, z: i.z + i.wh / 2 + 1.4 });
    parts.push({ geo: new THREE.BoxGeometry(.06, .34, 2.6), color: '#1e6b46',
      x: i.x - i.wv / 2 - 1.4, y: 2.7, z: i.z + i.wh / 2 + 1.4 });
    const bx = i.x - i.wv / 2 - 1.4, bz = i.z + i.wh / 2 + 1.4;
    // lettered faces: the x-run blade names the v-road, the z-run names the h-road
    if (i.vn) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .3), bladeMat(i.vn));
      b.position.set(bx, 3.1, bz + .04);
      const b2 = b.clone(); b2.position.z = bz - .04; b2.rotation.y = Math.PI;
      bladeGrp.add(b, b2);
    }
    if (i.hn) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .3), bladeMat(i.hn));
      b.position.set(bx + .04, 2.7, bz); b.rotation.y = Math.PI / 2;
      const b2 = b.clone(); b2.position.x = bx - .04; b2.rotation.y = -Math.PI / 2;
      bladeGrp.add(b, b2);
    }
  }
  scene.add(bladeGrp);
  // power poles along Maple St (x=-420) with sagging wires
  const poleX = -420 - 5 - 1.6;
  const wirePts = [];
  let prev = null;
  for (let z = -30; z < 700; z += 46) {
    parts.push({ geo: new THREE.CylinderGeometry(.14, .2, 9, 7), color: '#4a3f32', x: poleX, y: 4.5, z });
    parts.push({ geo: new THREE.BoxGeometry(2.2, .12, .12), color: '#4a3f32', x: poleX, y: 8.4, z });
    if (prev) {
      for (const wo of [-.9, .9]) {
        for (let s = 0; s <= 8; s++) {
          const t0 = s / 8, zz = prev + t0 * (z - prev);
          const sag = Math.sin(t0 * Math.PI) * 1.1;
          wirePts.push(new THREE.Vector3(poleX + wo, 8.35 - sag, zz));
        }
      }
    }
    prev = z;
  }
  /* ---- sprint-02: sidewalk furniture scatter ----
     cycle: bench | hydrant | bin | planter | bin | bench | newsbox | bollards
     all on the walk band, occupancy-checked, never on crossing/ramp landings */
  const allJ = intersections();
  const nearJxn = (x, z) => allJ.some(j =>
    Math.abs(x - j.x) < j.wv / 2 + 10 && Math.abs(z - j.z) < j.wh / 2 + 10);
  let nFurn = 0, nPlanters = 0, nHedges = 0;
  const SHRUB = new THREE.IcosahedronGeometry(.55, 0);
  const addFurn = (x, z, ry, kind) => {
    nFurn++;
    if (kind === 0 || kind === 5) {           // bench facing street
      const bx = new THREE.BoxGeometry(1.8, .09, .5).rotateY(ry);
      const bk = new THREE.BoxGeometry(1.8, .5, .09).rotateY(ry);
      const off = .28;
      parts.push({ geo: bx, color: '#7a5a3a', x, y: .55, z });
      parts.push({ geo: bk, color: '#7a5a3a', x: x + Math.sin(ry) * off, y: .95, z: z + Math.cos(ry) * off });
      parts.push({ geo: new THREE.BoxGeometry(.09, .5, .45).rotateY(ry), color: '#3d4145', x: x - .7 * Math.cos(ry), y: .3, z: z + .7 * Math.sin(ry) });
      parts.push({ geo: new THREE.BoxGeometry(.09, .5, .45).rotateY(ry), color: '#3d4145', x: x + .7 * Math.cos(ry), y: .3, z: z - .7 * Math.sin(ry) });
    } else if (kind === 1) {                  // hydrant
      parts.push({ geo: new THREE.CylinderGeometry(.2, .24, .85, 8), color: '#c0392b', x, y: .42, z });
      parts.push({ geo: new THREE.CylinderGeometry(.09, .09, .28, 8), color: '#c0392b', x, y: .96, z });
      parts.push({ geo: new THREE.SphereGeometry(.11, 8, 6), color: '#e8b13a', x, y: 1.12, z });
    } else if (kind === 2 || kind === 4) {    // litter bin
      parts.push({ geo: new THREE.CylinderGeometry(.38, .32, .95, 10), color: '#3d4a42', x, y: .47, z });
      parts.push({ geo: new THREE.CylinderGeometry(.4, .4, .07, 10), color: '#2c3531', x, y: .98, z });
    } else if (kind === 3) {                  // sidewalk planter + shrub
      nPlanters++;
      parts.push({ geo: new THREE.BoxGeometry(1.3, .75, 1.3), color: '#6e5138', x, y: .37, z });
      parts.push({ geo: new THREE.BoxGeometry(1.1, .08, 1.1), color: '#4a3527', x, y: .72, z });
      parts.push({ geo: SHRUB, color: '#4e6b3e', x, y: 1.15, z });
    } else if (kind === 6) {                  // newspaper box
      parts.push({ geo: new THREE.BoxGeometry(.55, 1.0, .5), color: '#8a2f2f', x, y: .55, z });
      parts.push({ geo: new THREE.BoxGeometry(.5, .12, .45), color: '#e8e6df', x, y: 1.12, z });
    } else {                                  // bollard trio at walk edge
      for (const d of [-1.2, 0, 1.2])
        parts.push({ geo: new THREE.CylinderGeometry(.09, .11, .95, 8), color: '#4a4f52',
          x: x + Math.cos(ry) * d, y: .48, z: z - Math.sin(ry) * d });
    }
  };
  for (const r of ROADS) {
    const step = r.arterial ? 30 : 38;
    const walkOff = r.w / 2 + (r.arterial ? 2.5 : 2.1);   // inside sidewalk, off curb face
    let k = 0;
    for (let a = r.a0 + 20; a < r.a1 - 20; a += step + rr(-4, 4)) {
      for (const s of [-1, 1]) {
        const x = r.axis === 'v' ? r.c + walkOff * s : a;
        const z = r.axis === 'v' ? a : r.c + walkOff * s;
        if (nearJxn(x, z) || !isFree(x, z, .9, r) || R() > .62) continue;
        const ry = r.axis === 'v' ? (s > 0 ? Math.PI / 2 : -Math.PI / 2) : (s > 0 ? 0 : Math.PI);
        addFurn(x, z, ry, k++ % 8);
      }
    }
  }

  /* ---- storefront blade signs + awning bands on signable FILLER ---- */
  const SIGN_TEXT = ['CAFE', 'SHOP', 'MARKET', 'BOOKS', 'BAKERY', 'CLINIC',
                     'DINER', 'PHARMACY', 'BARBER', 'DELI', 'FLORIST', 'MART'];
  let nSigns = 0;
  FILLER.filter(f => f.type === 'storefront' || f.type === 'medoffice' || f.type === 'gas')
    .slice(0, 14).forEach((f, fi) => {
      const rot = f.rot || 0;
      const fx = Math.sin(rot), fz = Math.cos(rot);            // facade normal
      const rx = Math.cos(rot), rz = -Math.sin(rot);           // along-facade right
      // awning band over the entrance
      parts.push({ geo: new THREE.BoxGeometry(f.w * .7, .35, 1.3).rotateY(rot),
        color: pick(['#33526b', '#7a3030', '#3e5a34', '#6e5138']),
        x: f.x + fx * (f.d / 2 + .65), y: 3.15, z: f.z + fz * (f.d / 2 + .65) });
      // blade sign at the front corner, plane parallel to street direction
      const sx = f.x + rx * (f.w / 2 - 1.2) + fx * (f.d / 2 + .7);
      const sz = f.z + rz * (f.w / 2 - 1.2) + fz * (f.d / 2 + .7);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, .95, .1),
        new M({ map: signTexture(SIGN_TEXT[fi % SIGN_TEXT.length], { bg: '#2f3d4a', fg: '#e8e6df' }) }));
      sign.position.set(sx, 4.4, sz); sign.rotation.y = rot + Math.PI / 2;
      sign.castShadow = true; scene.add(sign);
      nSigns++;
    });

  /* ---- hedges along building frontages ---- */
  for (const b of BUILDINGS) {
    if (!b.w || b.type === 'zone' || b.type === 'parkzone') continue;
    const hl = Math.min(9, b.w * .22);
    const hz = b.z + b.d / 2 + .9;
    // frontage hedges sit inside the building's own pad (and may edge the
    // streetscape band downtown) — exempt own rect + road band; lots/water/
    // greens/features and neighbouring buildings still veto
    if (!isFree(b.x, hz, 1.5, [b, 'road'])) continue;
    for (const sx of [-1, 1]) {
      nHedges++;
      parts.push({ geo: new THREE.BoxGeometry(hl, .85, .8), color: '#3e5a34',
        x: b.x + sx * (b.w / 2 - hl / 2 - .5), y: .42, z: hz });
    }
  }
  // hedge runs along townhouse rows too
  for (const f of FILLER) {
    if (f.type !== 'townhouse') continue;
    nHedges++;
    parts.push({ geo: new THREE.BoxGeometry(f.w * .55, .8, .7), color: '#46603a',
      x: f.x, y: .4, z: f.z + f.d / 2 + .8 });
  }

  /* ---- grass tufts on verges & lawn edges — instanced crossed cards ---- */
  {
    let gTex = null;
    const gtex = () => gTex ||= canvasTex((() => {
      const [c, x] = makeCanvas(96, 96);
      x.clearRect(0, 0, 96, 96);
      for (let i = 0; i < 46; i++) {
        const bx = rr(8, 88), sw = rr(-14, 14), h = rr(30, 88);
        const g2 = x.createLinearGradient(0, 96, 0, 96 - h);
        g2.addColorStop(0, `rgba(${38 + rr(0, 25) | 0},${75 + rr(0, 30) | 0},${30 + rr(0, 18) | 0},.95)`);
        g2.addColorStop(1, `rgba(${80 + rr(0, 40) | 0},${120 + rr(0, 40) | 0},${50 + rr(0, 30) | 0},.9)`);
        x.strokeStyle = g2; x.lineWidth = rr(1.6, 3.4); x.lineCap = 'round';
        x.beginPath(); x.moveTo(bx, 96);
        x.quadraticCurveTo(bx + sw * .4, 96 - h * .6, bx + sw, 96 - h); x.stroke();
      }
      return c;
    })());
    const blade = new THREE.PlaneGeometry(.85, .55);
    blade.translate(0, .27, 0);
    const tuftG = mergeGeometries([
      blade.clone(),
      blade.clone().rotateY(Math.PI / 2),
    ], false);
    const tuftM = new M({ map: gtex(), alphaTest: .4, side: THREE.DoubleSide,
      roughness: .95, vertexColors: false });
    const tufts = [];
    for (const r of ROADS) {
      // minor streets: tufts live in the curb-to-walk verge; arterials pave
      // to ~r.w/2+3.43, so theirs sprout on the lawn beyond the sidewalk
      const off = r.w / 2 + (r.arterial ? rr(3.7, 5.2) : rr(.5, 1.3));
      for (let a = r.a0 + 14; a < r.a1 - 14; a += rr(5, 12)) {
        for (const s of [-1, 1]) {
          const x = r.axis === 'v' ? r.c + off * s : a;
          const z = r.axis === 'v' ? a : r.c + off * s;
          if (!isFree(x, z, .6, r) || R() > .5) continue;
          tufts.push({ x, z, ry: rr(0, 3.14), s: rr(.7, 1.5) });
        }
      }
    }
    const tuftIM = instances(tuftG, tuftM, thin(tufts), { shadow: false });
    tuftIM.receiveShadow = true;
    scene.add(tuftIM);
    if (window.__city) (window.__city.veg ||= {}).tufts = tufts.length;
  }

  /* ---- parking meters downtown + bike racks at plaza/school ---- */
  for (const [x, z] of [[-38, -62], [-6, -62], [30, -62], [66, -62], [102, -62],
      [140, -62], [180, -62], [-38, -18], [10, -18], [60, -18], [112, -18], [160, -18],
      [-36, 316], [20, 316], [90, 316], [160, 316], [240, 316],
      [-128, -90], [-128, -140], [-128, -200], [-152, 40], [-152, 90]]) {
    parts.push({ geo: new THREE.CylinderGeometry(.045, .05, 1.1, 6), color: '#3d4145', x, y: .55, z });
    parts.push({ geo: new THREE.BoxGeometry(.16, .22, .13), color: '#8a9094', x, y: 1.16, z });
  }
  // bike racks: U-tube hoops, plaza edge + school gate + med campus
  for (const [x, z, ry] of [[-520, -548, 0], [-435, -548, 0], [-500, 610, 0],
      [-430, -480, 0], [-15, -160, 0], [450, 350, Math.PI / 2]]) {
    for (let k = 0; k < 3; k++) {
      const hx = x + Math.cos(ry) * k * 1.1, hz = z - Math.sin(ry) * k * 1.1;
      parts.push({ geo: new THREE.TorusGeometry(.42, .045, 6, 12, Math.PI).rotateZ(Math.PI).rotateY(ry + Math.PI / 2),
        color: '#5a6065', x: hx, y: .46, z: hz });
    }
  }

  if (window.__city) {
    window.__city.props = {
      furniture: nFurn, signals: ix.length, shelters: 6, signs: nSigns,
    };
    window.__city.veg = { ...(window.__city.veg || {}), hedges: nHedges, planters: nPlanters };
  }

  const propMesh = new THREE.Mesh(colored(parts), VCOL());
  propMesh.castShadow = propMesh.receiveShadow = true;
  scene.add(propMesh);
  // catenary wires as line segments
  if (wirePts.length) {
    const wp = [];
    for (let i = 0; i < wirePts.length; i += 1) {
      if ((i + 1) % 9 === 0) continue;
      wp.push(wirePts[i], wirePts[i + 1]);
    }
    const wg = new THREE.BufferGeometry().setFromPoints(wp);
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1c1e20', transparent: true, opacity: .8 })));
  }

  // school playground + soccer field + track (from before)
  const sc = new THREE.Group();
  sc.add(plane(40, 26, sandM(), 0, Y + .004, 0));
  sc.add(box(10, .18, .18, mat('#3d6b8a'), -8, 3.4, 0));
  sc.add(box(.18, 3.4, .18, mat('#3d6b8a'), -13, 0, 0)); sc.add(box(.18, 3.4, .18, mat('#3d6b8a'), -3, 0, 0));
  const sl = box(1.2, .15, 6, mat('#c0392b'), 8, 1.6, 0); sl.rotation.x = -.5; sc.add(sl);
  sc.add(box(1.8, 3.2, 1.8, mat('#d4ac0d'), 8, 0, 3));
  sc.position.set(-560, 0, 645); scene.add(sc);
  occupyRect(-560, 645, 44, 30, 3);
  // track + soccer field west of Cedar Ave at the woods edge â€”
  // clear of every road (Cedar -645..-635, Maple -425..-415)
  const sfm = lift(pbr('grass_ground', { color: '#8fae6f' }), 2);
  scene.add(plane(90, 55, sfm, -730, Y + .002, 590, -Math.PI / 2, 9));
  const trk = new THREE.Mesh(new THREE.RingGeometry(30, 36, 40), lift(mat('#b06a4a'), 5));
  trk.rotation.x = -Math.PI / 2; trk.position.set(-730, Y + .006, 590); trk.scale.set(1.9, 1.35, 1);
  trk.receiveShadow = true; scene.add(trk);
  occupyRect(-730, 590, 142, 102, 3);
  const bin = new GeoBin();
  const ln = mat('#e8e6df');
  bin.plane(90, .3, ln, -730, Y + .007, 590 + 27);
  bin.plane(90, .3, ln, -730, Y + .007, 590 - 27);
  bin.plane(.3, 55, ln, -730 - 45, Y + .007, 590);
  bin.plane(.3, 55, ln, -730 + 45, Y + .007, 590);
  bin.plane(.3, 55, ln, -730, Y + .007, 590);
  // lane rings on track
  for (const rr2 of [31.5, 33, 34.5]) {
    const ring = new THREE.RingGeometry(rr2, rr2 + .18, 40);
    ring.rotateX(-Math.PI / 2); ring.translate(-730, Y + .009, 590);
    const sc2 = new THREE.Vector3(1.9, 1, 1.35);
    ring.scale(sc2.x, 1, sc2.z);
    let bb = bin.b.get(ln); if (!bb) { bb = []; bin.b.set(ln, bb); } bb.push(ring);
  }
  bin.build(scene);

  // continuous sidewalk: storefront row (z=-66 fronts) to the Main St curb
  scene.add(plane(388, 8, PAVE, 81, Y + .004, -52, -Math.PI / 2, 3.2));
  occupyRect(81, -52, 388, 8, 1);

  // WELCOME sign on Commerce Blvd east entrance
  const wx = 60, wz = 334;
  const wparts = [
    { geo: new THREE.BoxGeometry(.5, 4.6, .5), color: '#6a5138', x: wx - 5, y: 2.3, z: wz },
    { geo: new THREE.BoxGeometry(.5, 4.6, .5), color: '#6a5138', x: wx + 5, y: 2.3, z: wz },
    { geo: new THREE.BoxGeometry(12, 3, .4), color: '#3a4a38', x: wx, y: 3.1, z: wz },
  ];
  const wm = new THREE.Mesh(colored(wparts), VCOL()); wm.castShadow = true; scene.add(wm);
  const wt = signTexture('WELCOME TO HAVENBROOK', { bg: '#3a4a38', fg: '#f0e8d0', w: 512, h: 80, font: 'bold 42px Georgia', border: false });
  const wp = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new M({ map: wt }));
  wp.position.set(wx, 3.3, wz + .25); scene.add(wp);
  const wt2 = signTexture('a community of care', { bg: '#3a4a38', fg: '#c9d4b0', w: 512, h: 60, font: 'italic 30px Georgia', border: false });
  const wp2 = new THREE.Mesh(new THREE.PlaneGeometry(8, .95), new M({ map: wt2 }));
  wp2.position.set(wx, 2.2, wz + .25); scene.add(wp2);
}

/* ---------------- picket fences along some house front yards ---------------- */
export function buildFences(scene) {
  const parts = [];
  for (const blk of HOUSE_BLOCKS) {
    if (blk.face !== 'h') continue;
    const W = blk.x1 - blk.x0, D = blk.z1 - blk.z0;
    const rows = D > 80 ? 2 : 1;
    for (let rI = 0; rI < rows; rI++) {
      const n = Math.ceil(blk.count / rows);
      const z = rows === 2 ? (rI === 0 ? blk.z0 + 13 : blk.z1 - 13) : blk.z1 - 13;
      const front = rI === 0 ? -1 : 1;   // which side faces street
      for (let i = 0; i < n; i++) {
        const x = blk.x0 + 14 + i * (W - 28) / Math.max(1, n - 1);
        if (R() < .5 || R() > DETAIL.f) continue;
        const fz = z + front * 9;
        const fw = rr(9, 13);
        // rails + pickets
        parts.push({ geo: new THREE.BoxGeometry(fw, .09, .05), color: '#f0ece0', x, y: .55, z: fz });
        parts.push({ geo: new THREE.BoxGeometry(fw, .09, .05), color: '#f0ece0', x, y: .95, z: fz });
        const np = Math.floor(fw / .4);
        for (let pIdx = 0; pIdx < np; pIdx++)
          parts.push({ geo: new THREE.BoxGeometry(.12, .8, .06), color: '#f5f2e8',
            x: x - fw / 2 + .2 + pIdx * .4, y: .45, z: fz });
      }
    }
  }
  const m = new THREE.Mesh(colored(parts), VCOL());
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  buildYards(scene);   // interior-block fenced backyards + commons (city/yards.js)
}

/* ---------------- farmland ring ---------------- */
export function buildCountryside(scene) {
  const fm = new M({ map: fieldTexture(), roughness: 1, color: '#9aa578' });
  const patches = [
    { x: -500, z: -1050, w: 900, d: 500, rot: .06 },
    { x: 600,  z: -1080, w: 1000, d: 520, rot: -.04 },
    { x: -1200, z: -300, w: 600, d: 800, rot: .03 },
    { x: -1250, z: 500,  w: 700, d: 700, rot: -.05 },
    { x: 1200, z: -200, w: 700, d: 900, rot: .02 },
    { x: 1150, z: 700,  w: 800, d: 600, rot: -.06 },
    { x: 300,  z: 1150, w: 1100, d: 600, rot: .04 },
    { x: -700, z: 1100, w: 800, d: 500, rot: -.03 },
  ];
  for (const p of patches) {
    const g = new THREE.PlaneGeometry(p.w, p.d);
    g.rotateZ(p.rot); g.rotateX(-Math.PI / 2);
    const f = new THREE.Mesh(g, fm);
    f.position.set(p.x, Y - .05, p.z); f.receiveShadow = true;
    scene.add(f);
  }
  // real crop relief: tilled furrow ridges + instanced corn/wheat sprigs.
  // patch yaw p.rot maps local (lx,ly) → world (cos/sin pair below)
  {
    // geo.rotateZ(rot) then rotateX(-π/2) maps local (lx,ly) →
    // world (lx·cos−ly·sin, −lx·sin−ly·cos); ry=+rot keeps boxes aligned
    const fpt = (p, lx, ly) => [
      p.x + lx * Math.cos(p.rot) - ly * Math.sin(p.rot),
      p.z - lx * Math.sin(p.rot) - ly * Math.cos(p.rot)];
    const furrows = [], corn = [], wheat = [];
    patches.forEach((p, pi) => {
      const kind = pi % 3;                              // 0 corn 1 wheat 2 fallow
      for (let i = 0, rows = Math.floor(p.d / 4); i < rows; i++) {
        const ly = -p.d / 2 + i * 4 + 2;
        const [fx, fz] = fpt(p, 0, ly);
        furrows.push({ x: fx, z: fz, ry: p.rot, y: Y + .1,
          sx: p.w - 8, sy: .3, sz: kind === 2 ? 1.4 : .8,
          color: kind === 2 ? '#6d5238' : '#54412c' });
        if (kind === 2 || i % 4) continue;              // sprigs every 4th row
        for (let lx = -p.w / 2 + 6; lx < p.w / 2 - 6; lx += 6.5) {
          const [sx, sz] = fpt(p, lx + rr(-1, 1), ly);
          (kind ? wheat : corn).push({ x: sx, z: sz, ry: rr(0, 6.28), s: rr(.8, 1.25) });
        }
      }
    });
    const furrowG = new THREE.BoxGeometry(1, 1, 1); furrowG.translate(0, .15, 0);
    scene.add(instances(furrowG, VCOL(), furrows, { shadow: false }));
    const bladeG = mergeGeometries([
      new THREE.PlaneGeometry(1.1, 1.15).translate(0, .57, 0),
      new THREE.PlaneGeometry(1.1, 1.15).translate(0, .57, 0).rotateY(Math.PI / 2),
    ], false);
    const sprigM = kind => new M({ map: cropTexture(kind), alphaTest: .35,
      side: THREE.DoubleSide, roughness: .95 });
    scene.add(instances(bladeG, sprigM('corn'), thin(corn), { shadow: false }));
    scene.add(instances(bladeG, sprigM('wheat'), thin(wheat), { shadow: false }));
  }
  // farmhouses + barns scattered in fields (merged colored)
  const parts = [];
  for (const [fx, fz] of [[-420, -980], [520, -1120], [-1150, -260], [1180, -140], [380, 1100], [-640, 1040]]) {
    parts.push({ geo: new THREE.BoxGeometry(10, 6, 8), color: '#e8e0d0', x: fx, y: 3, z: fz });
    parts.push({ geo: new THREE.ConeGeometry(7, 4, 4), color: '#7a4a3a', x: fx, y: 8, z: fz, ry: Math.PI / 4 });
    parts.push({ geo: new THREE.BoxGeometry(12, 7, 9), color: '#a03a30', x: fx + 16, y: 3.5, z: fz + 6 });
    parts.push({ geo: new THREE.CylinderGeometry(3, 3, 9, 10), color: '#b8b4ac', x: fx - 12, y: 4.5, z: fz + 8 });
    parts.push({ geo: new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: '#9aa0a3', x: fx - 12, y: 9, z: fz + 8 });
  }
  const fm2 = new THREE.Mesh(colored(parts), VCOL());
  fm2.castShadow = true; scene.add(fm2);
  // distant tree lines along field edges
  const tl = [];
  for (const p of patches)
    for (let i = 0; i < 14; i++) {
      const t = i / 14, edge = i % 2 ? -1 : 1;
      tl.push({ x: p.x - p.w / 2 + t * p.w, z: p.z + edge * p.d / 2 * (1 + rr(-.02, .02)),
        s: rr(1.4, 2.4), color: '#527a44' });
    }
  const tlG = new THREE.IcosahedronGeometry(3, 0); tlG.translate(0, 4, 0);
  scene.add(instances(tlG, new M({ color: '#fff', roughness: .95, flatShading: true }), thin(tl)));
}

/* ---------------- mountain ring — the hard edge of the world ----------------
   Three concentric ridges, ridged-multifractal crest noise, vertex-colored
   altitude bands (forest → scree → snow). One indexed grid
   mesh — merges into the VCOL bucket. */
export function buildMountains(scene) {
  /* Ridged-multifractal ridges: (1-|sin|) octave stacks give crest/saddle
     silhouettes instead of sine cones; an indexed (u,a) grid + smooth vertex
     normals read as continuous terrain rather than flat facet slabs. */
  const pos = [], col = [], idx = [];
  const cFor = new THREE.Color('#2e4a2c'), cForD = new THREE.Color('#243c24'),
        cRock = new THREE.Color('#5f574c'), cScr = new THREE.Color('#8a7f6f'),
        cSnow = new THREE.Color('#eef2f5'), cSnowSh = new THREE.Color('#cfd9e2');
  const vc = new THREE.Color();
  // cheap periodic value-ish noise on the angle - deterministic, smooth
  const nz = (a, s) => Math.sin(a * 1 + s) * .55 + Math.sin(a * 2 + s * 1.7) * .3
                     + Math.sin(a * 5 + s * 3.1) * .15;
  const ridge = (rMid, hMax, width, seed, snowAt, N = 720, M = 12) => {
    // crest height per angle: ridge-noise stack shaped by a low-frequency
    // peak envelope so summits group into massifs separated by saddles
    const env = a => .42 + .58 * Math.max(0, .5 + .5 * Math.sin(2 * a + seed * 2.3)
                                   + .18 * Math.sin(5 * a + seed));
    const rid = a => {
      let v = 0, amp = .52, f = 3, ph = seed;
      for (let o = 0; o < 5; o++) {
        v += amp * (1 - Math.abs(Math.sin(f * a + ph)));
        f *= 2; amp *= .5; ph += 1.9;
      }
      return v;   // ~0..1 crest profile
    };
    const H = a => hMax * Math.max(.10, env(a) * (.25 + .95 * rid(a)));
    const rugF = Math.min(1, hMax / 300);      // low foothills stay smooth
    const R0 = a => rMid + 120 * Math.sin(2 * a + seed * 2) + 60 * Math.sin(6 * a + seed);
    // ragged snowline per angle (higher peaks keep snow in the gullies)
    const snowLine = a => snowAt + .09 * nz(a * 3, seed * 5);
    const vbase = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2;
      const h = H(a), rm = R0(a);
      for (let j = 0; j <= M; j++) {
        const u = j / M;                       // 0 = inner base, .5 = crest, 1 = outer base
        // asymmetric slope profile: concave foot, steep headwall at crest
        const prof = u < .5 ? Math.pow(u * 2, 1.55) : Math.pow((1 - u) * 2, 1.55);
        // mid-slope crag: radial + height displacement grows toward the crest
        const cragA = Math.sin(a * 23 + seed * 3 + j * 1.7) * .5
                    + Math.sin(a * 41 + seed * 7 + j * 2.3) * .3;
        const rj = cragA * width * .10 * rugF * Math.sin(Math.PI * u);
        const r = rm + width * (2 * u - 1) + rj;
        const y = Math.max(0, h * prof + h * .035 * cragA * rugF * Math.sin(Math.PI * u));
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
        /* color: forest -> talus -> rock -> snow with per-vertex mottle and
           gully streaks running downslope */
        const t = y / hMax;
        const mottle = Math.min(1, Math.max(0, .5 + .5 * nz(a * 9 + u * 4.2, seed + 2)
                     + .18 * Math.sin(a * 37 + u * 9 + seed)));
        const gully = Math.abs(Math.sin(a * 17 + seed * 4))
                    * (.5 + .5 * Math.abs(Math.sin(a * 7 + seed * 6)));
        if (t > snowLine(a)) {
          // snowfield with shaded gully lips
          vc.copy(cSnow).lerp(cSnowSh, .25 + .45 * mottle * gully);
        } else if (t > .38) {
          // talus/rock band - warmer scree streaked by gullies
          vc.copy(cRock).lerp(cScr, .25 + .55 * mottle);
          vc.multiplyScalar(.82 + .18 * gully);
          const treeline = snowLine(a) - .10 - .04 * mottle;
          if (t > treeline) vc.lerp(cSnow, (t - treeline) / .10);
        } else {
          // forested foot - mottled canopy darkening into gullies
          vc.copy(cFor).lerp(cForD, .15 + .6 * mottle);
          vc.lerp(cRock, Math.max(0, (t - .30) / .08) * .8);
        }
        col.push(vc.r, vc.g, vc.b);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = vbase + i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { H, R0, rugF, width, hMax, seed, M };
  };
  // MIN tier: fewer angular samples (silhouette stays intact at city
  // distance) — M must NOT drop: firs plant by the continuous slope
  // profile, so coarser radial rows would interpolate above them
  const MR = DETAIL.f < 1 ? .42 : 1;
  const rg1 = ridge(1500, 150, 180, 4.7, 1.25, Math.round(720 * MR), 12);   // near wooded foothill band - never snows
  const rg2 = ridge(1700, 380, 260, 0.0, .80, Math.round(720 * MR), 12);    // green foothills, thin snow cap
  ridge(2600, 790, 500, 2.4, .55, Math.round(640 * MR), 14);                // taller far range, deeper snowline

  /* conifer cover on the forest-band slopes - instanced firs sized to read
     as canopy at city distance. A dedicated seeded stream keeps the global
     R() draw order (and every downstream placement) untouched. */
  const R2 = mulberry32(7771);
  const rr2 = (a, b) => a + R2() * (b - a);
  const firG = colored([
    { geo: new THREE.CylinderGeometry(.16, .26, 1.6, 5), color: '#33241a', x: 0, y: .8, z: 0 },
    { geo: new THREE.ConeGeometry(1.35, 4.4, 7), color: '#2e4a2c', x: 0, y: 3.6, z: 0 },
    { geo: new THREE.ConeGeometry(.9, 2.6, 7), color: '#395631', x: 0, y: 5.5, z: 0 },
  ]);
  const firL = [], FIR_TINTS = ['#24401f', '#2e4a2c', '#3a5a33', '#2a4630'];
  for (const rg of [rg1, rg2]) {
    for (let i = 0; i < 4200; i++) {
      const a = rr2(0, Math.PI * 2), u = rr2(.12, .88), jf = u * rg.M,
            prof = u < .5 ? Math.pow(u * 2, 1.55) : Math.pow((1 - u) * 2, 1.55),
            cragA = Math.sin(a * 23 + rg.seed * 3 + jf * 1.7) * .5
                  + Math.sin(a * 41 + rg.seed * 7 + jf * 2.3) * .3,
            h = rg.H(a),
            r = rg.R0(a) + rg.width * (2 * u - 1)
              + cragA * rg.width * .10 * rg.rugF * Math.sin(Math.PI * u),
            y = Math.max(0, h * prof + h * .035 * cragA * rg.rugF * Math.sin(Math.PI * u));
      if (y < 4 || y > .38 * rg.hMax) continue;          // forest band only
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      if (px * px + pz * pz < 800 * 800) continue;       // never inside town
      firL.push({ x: px, y: y - 1.2, z: pz, s: rr2(1.4, 3.2), ry: rr2(0, 6.28),
                  color: FIR_TINTS[Math.floor(R2() * 4)] });
    }
  }
  const fim = instances(firG, VCOL(), thin(firL), { shadow: false });
  fim.frustumCulled = false;
  scene.add(fim);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();                    // indexed -> smooth terrain shading
  const m = new THREE.Mesh(g, VCOL());
  m.receiveShadow = true;
  scene.add(m);
}

/* ---------------- ferris wheel ---------------- */
let ferris = null;
export function buildFerrisWheel(scene) {
  /* amusement wheel on the park's east lawn - literal geometry only,
     zero R() draws. Wheel spins in tickWorld; gondolas stay upright. */
  let fx = 0, fz = 0;
  for (const [cx, cz] of [[700, 214], [662, 258], [742, 170], [508, 272]]) {
    if (isFree(cx, cz, 24)) { fx = cx; fz = cz; break; }
  }
  if (!fx) return;
  occupyRect(fx, fz, 44, 32, 3);
  const R0 = 15, HY = 18.5, FACE = .62;
  const sup = [
    { geo: new THREE.CylinderGeometry(11.5, 12.2, .55, 22), color: '#b0a894', y: .27 },
    { geo: new THREE.CylinderGeometry(.5, .55, 1.1, 8), color: '#5a5650', y: 1.0, x: 8.6, z: -6.4 },
    { geo: new THREE.BoxGeometry(1.9, 1.5, 1.5), color: '#d88a4a', y: 2.0, x: 8.6, z: -6.4 },
    { geo: new THREE.CylinderGeometry(0, 1.5, .9, 4), color: '#8a4434', y: 3.2, x: 8.6, z: -6.4 },
  ];
  for (const sgn of [-1, 1]) {                      // A-frame legs, both faces
    for (const l of [-1, 1])
      sup.push({ geo: new THREE.CylinderGeometry(.55, .8, 21.4, 8), color: '#cdd2d8',
        x: l * 4.2, y: 10.2, z: sgn * 5.2, rx: sgn * -.24, rz: l * .21 });
    sup.push({ geo: new THREE.BoxGeometry(10.6, .5, .6), color: '#b8bdc4',
      y: 6.4, z: sgn * 4.3 });
  }
  sup.push({ geo: new THREE.CylinderGeometry(1.15, 1.15, 12.6, 10), color: '#8a8f96',
    y: HY, rx: Math.PI / 2 });
  const base = new THREE.Mesh(colored(sup), VCOL());
  base.position.set(fx, Y, fz); base.rotation.y = FACE;
  base.castShadow = base.receiveShadow = true;
  scene.add(base);

  const wp = [                                      // rotating wheel, local XY
    { geo: new THREE.TorusGeometry(R0, .42, 6, 30), color: '#e8e2d4' },
    { geo: new THREE.TorusGeometry(R0 * .8, .28, 6, 30), color: '#c8543e' },
    { geo: new THREE.CylinderGeometry(1.5, 1.5, 1.4, 12), color: '#d8b23a', rx: Math.PI / 2 },
  ];
  for (let i = 0; i < 6; i++)
    wp.push({ geo: new THREE.BoxGeometry(.32, R0 * 2, .32), color: '#cdd2d8',
      rz: i * Math.PI / 6 });
  const wheel = new THREE.Mesh(colored(wp), VCOL());
  wheel.position.set(fx, Y + HY, fz);
  wheel.castShadow = true;
  wheel.rotation.y = FACE;                    // static yaw (freeze-safe rest pose)
  wheel.userData.dynamic = true;              // spins - keep out of mergeStatic
  scene.add(wheel);

  const litG = new THREE.SphereGeometry(.3, 6, 5);
  const litM = new M({ color: '#ffe9c0', emissive: '#ffd9a0',
    emissiveIntensity: RUNENV.litI, roughness: .6 });
  litM.envMapIntensity *= RUNENV.envScale; litM.userData.lit = true;
  const bulbs = [];
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    bulbs.push({ x: Math.cos(a) * R0, y: Math.sin(a) * R0, z: 0, s: 1 });
  }
  const bulbIM = new THREE.InstancedMesh(litG, litM, bulbs.length);
  bulbs.forEach((b, i) => {
    _p.set(b.x, b.y, b.z); _q.identity(); _s1.set(1, 1, 1);
    _mx.compose(_p, _q, _s1); bulbIM.setMatrixAt(i, _mx);
  });
  wheel.add(bulbIM);                                // spins with the rim

  const cabG = colored([
    { geo: new THREE.BoxGeometry(2.3, 1.5, 1.6), color: '#ffffff', y: -.6 },
    { geo: new THREE.BoxGeometry(2.0, .22, 1.8), color: '#44403a', y: .2 },
    { geo: new THREE.CylinderGeometry(.09, .09, 1.1, 5), color: '#8a8f96', y: .85 },
  ]);
  const cabIM = new THREE.InstancedMesh(cabG, VCOL(), 12);
  cabIM.frustumCulled = false;
  const TINTS = ['#d8543e', '#e8a23a', '#4a90c2', '#5aa04a', '#b05a9a', '#e8e4da'];
  for (let i = 0; i < 12; i++)
    cabIM.setColorAt(i, new THREE.Color(TINTS[i % TINTS.length]));
  scene.add(cabIM);
  const cf0 = Math.cos(FACE), sf0 = Math.sin(FACE);   // initial pose (t = 0)
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, lx = Math.cos(a) * R0, ly = Math.sin(a) * R0 - 1.7;
    _p.set(fx + lx * cf0, Y + HY + ly, fz - lx * sf0);
    _eul.set(0, FACE, 0); _q.setFromEuler(_eul); _mx.compose(_p, _q, _s1);
    cabIM.setMatrixAt(i, _mx);
  }
  cabIM.instanceMatrix.needsUpdate = true;
  ferris = { wheel, cabIM, cx: fx, cy: Y + HY, cz: fz, R0, face: FACE };
}

/* ---------------- hot air balloons ---------------- */
export function buildBalloons(scene) {
  /* two striped envelopes drifting lazy circuits over the town - wedge-sliced
     sphere gores, basket + rope lines, animated drift/bob in tickWorld.
     dynamic groups so mergeStatic leaves them alone; zero R() draws. */
  const DEFS = [
    { cx: 300, cz: -180, r: 220, h: 95, ph: 0,   v: .008,
      cols: ['#c0392b', '#f2d49b'] },           // crimson/cream over downtown
    { cx: 520, cz: 150,  r: 160, h: 120, ph: 2.4, v: .006,
      cols: ['#3d6b8a', '#e8e2d4'] },           // blue/bone over the park
  ];
  balloons = [];
  for (const d of DEFS) {
    const grp = new THREE.Group();
    grp.userData.dynamic = true;
    const parts = [];
    for (let i = 0; i < 10; i++)
      parts.push({ geo: new THREE.SphereGeometry(4.2, 3, 9,
                     i / 10 * Math.PI * 2, Math.PI * 2 / 10 + .01),
                   color: d.cols[i % 2], sy: 1.18 });
    parts.push({ geo: new THREE.CylinderGeometry(.9, 1.6, 1.1, 8),
                 color: '#6e5138', y: -4.2 });
    parts.push({ geo: new THREE.CylinderGeometry(.42, .55, .5, 8),
                 color: '#8a7048', y: -3.5 });
    for (const [rx, rz] of [[.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]])
      parts.push({ geo: new THREE.CylinderGeometry(.03, .03, 2.6, 4),
                   color: '#8a7a5a', x: rx * 1.1, y: -2.4, z: rz * 1.1 });
    const env = new THREE.Mesh(colored(parts), VCOL());
    env.castShadow = true;
    grp.add(env);
    grp.position.set(d.cx, Y + d.h, d.cz);
    scene.add(grp);
    balloons.push({ grp, ...d });
  }
}

/* ---------------- tennis courts ---------------- */
export function buildTennisCourts(scene) {
  /* pair of fenced hard courts on the park's north lawn between the ponds -
     blue pads, green surround, white lines, nets, benches. Literal geometry,
     zero R() draws. */
  let x = 0, z = 0, ok = false;
  for (const [cx, cz] of [[620, 70], [660, 74], [705, 74], [560, 72]])
    if (isFree(cx, cz, 16)) { x = cx; z = cz; ok = true; break; }
  if (!ok) return;
  occupyRect(x, z, 33, 29, 2);
  const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const P = [], PW = 30.4, PD = 26;
  P.push({ geo: BX(PW + 2, .1, PD + 2), color: '#4a7f52', x, y: Y + .05, z });
  const line = (lx, lz, lx2, lz2) =>
    P.push({ geo: BX(Math.max(Math.abs(lx2 - lx), .12), .012,
                     Math.max(Math.abs(lz2 - lz), .12)),
             color: '#f2f2ee', x: x + (lx + lx2) / 2, y: Y + .165,
             z: z + (lz + lz2) / 2 });
  for (const cz of [z - 6.5, z + 6.5]) {              // two courts, long axis x
    const c = cz - z;
    P.push({ geo: BX(23.8, .12, 11), color: '#3f6ea8', x, y: Y + .11, z: cz });
    line(-11.89, c - 5.49, 11.89, c - 5.49);          // doubles sidelines
    line(-11.89, c + 5.49, 11.89, c + 5.49);
    line(-11.89, c - 5.49, -11.89, c + 5.49);         // baselines
    line(11.89, c - 5.49, 11.89, c + 5.49);
    line(-6.40, c - 5.49, -6.40, c + 5.49);           // service lines
    line(6.40, c - 5.49, 6.40, c + 5.49);
    line(-6.40, c, 6.40, c);                          // center service line
    // net: posts + mesh + white top tape
    P.push({ geo: BX(.12, 1.1, .12), color: '#1c2226', x, y: Y + .72, z: cz - 6.1 });
    P.push({ geo: BX(.12, 1.1, .12), color: '#1c2226', x, y: Y + .72, z: cz + 6.1 });
    P.push({ geo: BX(.05, .92, 12.2), color: '#22282c', x, y: Y + .62, z: cz });
    P.push({ geo: BX(.07, .07, 12.2), color: '#f2f2ee', x, y: Y + 1.1, z: cz });
  }
  /* perimeter fence: posts every ~4.3m + translucent chain-link panels */
  const posts = [];
  const FW = PW + 1.6, FD = PD + 1.6, H = 3.1;
  const panels = [];
  for (const [fx, fz, fw, fd] of [[0, -FD / 2, FW, .03], [0, FD / 2, FW, .03],
                                  [-FW / 2, 0, .03, FD], [FW / 2, 0, .03, FD]]) {
    panels.push({ geo: BX(fw, H, fd), x: x + fx, y: Y + H / 2 + .1, z: z + fz });
    const n = Math.max(2, Math.round((fw > fd ? fw : fd) / 4.3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      posts.push({ x: x + fx + (fw > fd ? (t - .5) * fw : 0),
                   z: z + fz + (fd > fw ? (t - .5) * fd : 0), s: 1 });
    }
  }
  const panelMesh = new THREE.Mesh(colored(panels), new M({ color: '#5a6a70',
    roughness: .6, metalness: .4, transparent: true, opacity: .28,
    side: THREE.DoubleSide }));
  panelMesh.receiveShadow = true;
  scene.add(panelMesh);
  scene.add(instances(new THREE.CylinderGeometry(.05, .05, H + .1, 5),
    new M({ color: '#42505a', roughness: .55, metalness: .4 }),
    posts.map(pt => ({ ...pt, y: Y + H / 2 + .1 })), { shadow: true }));
  /* benches at the pad ends outside the fence */
  for (const bz of [z - 6.5, z + 6.5]) {
    P.push({ geo: BX(2.2, .08, .5), color: '#7a5b3f',
             x: x - PW / 2 - 2.2, y: Y + .46, z: bz });
    P.push({ geo: BX(.1, .44, .1), color: '#3a4048',
             x: x - PW / 2 - 3.0, y: Y + .22, z: bz - .8 });
    P.push({ geo: BX(.1, .44, .1), color: '#3a4048',
             x: x - PW / 2 - 1.4, y: Y + .22, z: bz + .8 });
  }
  const cm = new THREE.Mesh(colored(P), VCOL());
  cm.castShadow = cm.receiveShadow = true;
  scene.add(cm);
}

/* ---------------- fireflies ---------------- */
let fireflies = null;
export function buildFireflies(scene) {
  /* night-only drift of glowing points over the park + pond - additive
     PointsMaterial, bobbing on per-fly sine paths. Dedicated stream, zero
     R() draws; only built when main.js gates it on ?time=night. */
  const Rf = mulberry32(5197), rf = (a, b) => a + Rf() * (b - a);
  const FLIES = [], zones = [
    { x: 560, z: 210, rx: 190, rz: 80 },        // park SE lawn
    { x: 585, z: 150, rx: 100, rz: 70 },        // over the pond
    { x: -755, z: 340, rx: 40, rz: 330 },       // west green belt
  ];
  for (const zn of zones)
    for (let i = 0; i < 80; i++)
      FLIES.push({ x: zn.x + rf(-zn.rx, zn.rx), z: zn.z + rf(-zn.rz, zn.rz),
                   h: rf(.6, 3.2), ph: rf(0, 6.28), v: rf(.4, 1.1),
                   amp: rf(.8, 2.2), tw: rf(1.5, 4) });
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(FLIES.length * 3),
        col = new Float32Array(FLIES.length * 3).fill(1);
  FLIES.forEach((f, i) => { pos[i * 3] = f.x; pos[i * 3 + 1] = Y + f.h; pos[i * 3 + 2] = f.z; });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pm = new THREE.PointsMaterial({ color: '#d8e86a', size: .34,
    transparent: true, opacity: .9, depthWrite: false, vertexColors: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, pm);
  pts.frustumCulled = false;
  pts.userData.dynamic = true;
  scene.add(pts);
  fireflies = { pts, list: FLIES };
}

/* ---------------- tower crane ---------------- */
let crane = null;
export function buildCrane(scene) {
  /* construction tower crane on a fenced gravel pad in the downtown fringe -
     literal geometry, zero R() draws. Jib slews slowly in tickWorld. */
  let mx = 0, mz = 0;
  for (const [cx, cz] of [[248, -84], [36, -96], [-120, -100], [300, -120]]) {
    if (isFree(cx, cz, 20)) { mx = cx; mz = cz; break; }
  }
  if (!mx) return;
  occupyRect(mx, mz, 34, 34, 3);
  const MH = 42;                                   // mast height
  const parts = [
    { geo: new THREE.CylinderGeometry(15, 15.6, .5, 18), color: '#b0a890', y: .25 },
    { geo: new THREE.BoxGeometry(5.4, 1.4, 5.4), color: '#8a8478', y: 1.2 },   // base block
    { geo: new THREE.BoxGeometry(3.4, 2.6, 2.6), color: '#c8543e', x: 6.5, y: 1.8, z: 6 },   // site office pod
    { geo: new THREE.BoxGeometry(2.4, 1.3, 1.3), color: '#d8a03a', x: -7, y: 1.1, z: 7 },    // generator
  ];
  for (const [lx, lz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]])   // mast rails
    parts.push({ geo: new THREE.BoxGeometry(.3, MH, .3), color: '#e8b23a',
      x: lx, y: MH / 2 + 1.6, z: lz });
  for (let y = 3.4; y < MH; y += 4.4)              // mast brace rings
    parts.push({ geo: new THREE.BoxGeometry(2.3, .16, 2.3), color: '#d8a838', y: y + 1.6 });
  const site0 = new THREE.Mesh(colored(parts), VCOL());
  site0.position.set(mx, Y, mz);
  site0.castShadow = site0.receiveShadow = true;
  scene.add(site0);

  const slew = new THREE.Group();                  // everything above the ring
  slew.position.set(mx, Y + MH + 1.7, mz);
  const jp = [
    { geo: new THREE.BoxGeometry(1.5, 1.6, 1.5), color: '#d8a838', y: .8 },       // cab/slew block
    { geo: new THREE.CylinderGeometry(.2, .2, 5.6, 6), color: '#9aa0a6', y: 3.6 }, // A-post
    { geo: new THREE.BoxGeometry(1.4, 1.5, 1.2), color: '#d8dde2', x: -.4, y: 1.0, z: .8 }, // cab
  ];
  const JIB = 21, CJ = 7;                          // jib / counter-jib length
  for (let i = 0; i < 7; i++) {                    // jib lattice chords
    jp.push({ geo: new THREE.BoxGeometry(JIB / 7 + .1, .22, .22), color: '#e8b23a',
      x: 2.2 + i * JIB / 7, y: 1.7, z: -.75 });
    jp.push({ geo: new THREE.BoxGeometry(JIB / 7 + .1, .22, .22), color: '#e8b23a',
      x: 2.2 + i * JIB / 7, y: 1.7, z: .75 });
    jp.push({ geo: new THREE.BoxGeometry(.16, 1.3, .16), color: '#d8a838',
      x: 2.2 + i * JIB / 7 + JIB / 14, y: 2.25, z: -.75, rz: (i % 2 ? .5 : -.5) });
  }
  jp.push({ geo: new THREE.BoxGeometry(JIB / 7, .22, .22), color: '#e8b23a', x: JIB + .4, y: 2.9, z: 0 });
  jp.push({ geo: new THREE.BoxGeometry(CJ, .5, 1.5), color: '#e8b23a', x: -CJ / 2 - .5, y: 1.9, z: 0 });
  jp.push({ geo: new THREE.BoxGeometry(1.6, 3.2, 1.5), color: '#8a9096', x: -CJ - .2, y: .4, z: 0 }); // counterweight
  jp.push({ geo: new THREE.CylinderGeometry(.05, .05, 6.2, 4), color: '#6a7076',
    x: JIB * .45, y: 4.2, z: 0, rz: .9 });         // tie bar jib
  jp.push({ geo: new THREE.CylinderGeometry(.05, .05, 5.4, 4), color: '#6a7076',
    x: -CJ * .45, y: 4.2, z: 0, rz: -.9 });        // tie bar counter
  // trolley + cable + hook
  jp.push({ geo: new THREE.BoxGeometry(.8, .3, 1.6), color: '#8a9096', x: JIB * .7, y: 1.45, z: 0 });
  jp.push({ geo: new THREE.CylinderGeometry(.05, .05, 9.5, 4), color: '#3a3e44',
    x: JIB * .7, y: -3.3, z: 0 });
  jp.push({ geo: new THREE.BoxGeometry(.9, .7, .9), color: '#c8543e', x: JIB * .7, y: -8.4, z: 0 });
  const jib = new THREE.Mesh(colored(jp), VCOL());
  jib.castShadow = true;
  slew.add(jib);
  slew.userData.dynamic = true;                  // slews - keep out of mergeStatic
  scene.add(slew);
  crane = { slew };
}

/* ---------------- farm windmill ---------------- */
let windmill = null;
export function buildWindmill(scene) {
  /* lattice farm windmill in the NE fields - literal geometry, zero R()
     draws. Rotor spins in tickWorld with a gentle yaw hunt. */
  let mx = 0, mz = 0;
  for (const [cx, cz] of [[576, -578], [540, -628], [662, -598], [588, -536]]) {
    if (isFree(cx, cz, 12)) { mx = cx; mz = cz; break; }
  }
  if (!mx) return;
  occupyRect(mx, mz, 14, 14, 2);
  const TH = 14, HEAD = .8;                 // tower height, vane heading
  const parts = [];
  for (const [lx, lz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]])
    parts.push({ geo: new THREE.BoxGeometry(.22, TH, .22), color: '#9aa0a6',
      x: lx * .5, y: TH / 2, z: lz * .5, rx: -lz * .055, rz: lx * .055 });
  for (const by of [4.2, 8.6])                     // cross-brace rings
    parts.push({ geo: new THREE.BoxGeometry(2.4 + by * .18, .12, 2.4 + by * .18),
      color: '#8a9096', y: TH - by });
  parts.push({ geo: new THREE.BoxGeometry(1.3, .4, 1.3), color: '#7a8086', y: TH + .2 });
  const tower = new THREE.Mesh(colored(parts), VCOL());
  tower.position.set(mx, Y, mz);
  tower.castShadow = tower.receiveShadow = true;
  scene.add(tower);

  const head = new THREE.Group();                  // yaws on the tower top
  head.position.set(mx, Y + TH + .6, mz);
  const bladeP = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    bladeP.push({ geo: new THREE.BoxGeometry(1.5, 2.3, .06), color: '#c8ccd2',
      x: Math.cos(a + .26) * 2.9, y: Math.sin(a + .26) * 2.9, rz: a + 1.05 });
  }
  bladeP.push({ geo: new THREE.TorusGeometry(4.1, .1, 5, 20), color: '#9aa0a6' });
  bladeP.push({ geo: new THREE.CylinderGeometry(.4, .4, .5, 8), color: '#6a7076',
    rx: Math.PI / 2 });
  const rotor = new THREE.Mesh(colored(bladeP), VCOL());
  rotor.position.z = .8; rotor.castShadow = true;
  head.add(rotor);
  const tail = new THREE.Mesh(colored([
    { geo: new THREE.BoxGeometry(2.6, .1, .1), color: '#8a9096', x: -1.9 },
    { geo: new THREE.BoxGeometry(1.2, 1.7, .06), color: '#c8543e', x: -3.3 },
  ]), VCOL());
  head.add(tail);
  head.rotation.y = HEAD;
  head.userData.dynamic = true;               // yaws - keep out of mergeStatic
  scene.add(head);
  windmill = { head, rotor };
}

/* ---------------- bird flocks ---------------- */
let birds = null;
let ducks = null;
export function buildBirds(scene) {
  // tiny chevron: two triangles sharing a body vertex â€” reads as a gliding bird
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, .28,  -1.05, .18, -.3,  0, 0, -.3,   // left wing
    0, 0, .28,   0, 0, -.3,       1.05, .18, -.3, // right wing
  ]), 3));
  bg.computeVertexNormals();
  const bm = new M({ color: '#2c3438', roughness: .9, side: THREE.DoubleSide });
  const flocks = [
    { cx: -80, cz: -300, r: 130, h: 70,  n: 9 },
    { cx: 300, cz: 100,  r: 170, h: 95,  n: 7 },
    { cx: -420, cz: 380, r: 150, h: 80,  n: 8 },
    { cx: 60,  cz: -540, r: 200, h: 110, n: 6 },
  ];
  const list = [];
  for (const f of flocks)
    for (let i = 0; i < f.n; i++)
      list.push({ f, ph: i / f.n * Math.PI * 2 + rr(-.3, .3),
        rr2: rr(.85, 1.15), vv: rr(.12, .2) * (R() < .5 ? 1 : -1), s: rr(.8, 1.3) });
  const im = new THREE.InstancedMesh(bg, bm, list.length);
  im.frustumCulled = false;
  scene.add(im);
  birds = { im, list };
}

/* ---------------- drifting clouds ---------------- */
let clouds = null;
export function buildClouds(scene) {
  const texs = [cloudSpriteTexture(0), cloudSpriteTexture(1),
                cloudSpriteTexture(2)];
  const items = [];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3],
      transparent: true, opacity: rr(.4, .7), depthWrite: false }));
    const s = rr(200, 380);
    sp.scale.set(s, s * .38, 1);
    sp.position.set(rr(-1600, 1600), rr(240, 460), rr(-1400, 500));
    scene.add(sp);
    items.push({ sp, v: rr(2, 5) });
  }
  /* extra high cirrus deck - dedicated stream so the original 12 keep their
     exact positions/R() draws. userData.cirrus tells upgradeClouds to keep
     them thin (no cumulus map swap / puff children). */
  const Rc = mulberry32(6603), rc = (a, b) => a + Rc() * (b - a);
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texs[i % 3], transparent: true, opacity: rc(.16, .3),
      depthWrite: false }));
    sp.userData.cirrus = true;
    const s = rc(420, 700);
    sp.scale.set(s, s * .16, 1);
    sp.position.set(rc(-1800, 1800), rc(560, 780), rc(-1600, 400));
    scene.add(sp);
    items.push({ sp, v: rc(1, 2.5) });
  }
  clouds = items;
}

/* ---------------- rain (?weather=rain) ---------------- */
let rain = null;
export function buildRain(scene) {
  /* 1300 streak instances over the town core, falling in a wrapped column.
     Dedicated seed stream - zero R() draws. ASPH goes wet sheen here so the
     pass stays self-contained (its roughness wins over streetscape's lift). */
  const Rr = mulberry32(8819), rf = (a, b) => a + Rr() * (b - a);
  const drops = [];
  for (let i = 0; i < 1300; i++)
    drops.push({ x: rf(-780, 780), y: rf(0, 260), z: rf(-780, 780),
                 v: rf(46, 68), s: rf(.8, 1.3), len: rf(2.4, 4.0) });
  /* crossed quads - a single Y-facing plane goes edge-on to streets that run
     along X; two perpendicular panels keep a visible face from every azimuth */
  const qA = new THREE.PlaneGeometry(.12, 1); qA.translate(0, -.5, 0);
  const qB = qA.clone(); qB.rotateY(Math.PI / 2);  // anchor at drop head
  const streakG = mergeGeometries([qA, qB]);
  const streakM = new THREE.MeshBasicMaterial({ color: '#d8e6ee',
    transparent: true, opacity: .55, depthWrite: false,
    side: THREE.DoubleSide, fog: false });
  const rim = new THREE.InstancedMesh(streakG, streakM, drops.length);
  rim.frustumCulled = false;
  scene.add(rim);
  rain = { im: rim, list: drops };
  ASPH.roughness = .3;                             // rain-slick pavement
  ASPH.envMapIntensity = 1.35;
  for (const m of WET_SURFACES) {                  // parking lots + gutters wet too
    m.roughness = .3; m.envMapIntensity = 1.35;
  }

  /* standing puddles along lane edges - dark glossy ellipses that pick up
     the (rain-dimmed) env map. Same dedicated stream; runs only under
     ?weather=rain since buildRain is gated on it. */
  const pudG = new THREE.CircleGeometry(1, 14);
  pudG.scale(1, .62, 1); pudG.rotateX(-Math.PI / 2); pudG.translate(0, Y + .055, 0);
  const pudM = new M({ color: '#20303a', roughness: .07, metalness: .08 });
  pudM.envMapIntensity = 1.8 * RUNENV.envScale;
  const pudL = [];
  const ix0 = intersections();                    // keep junction paint clear
  for (const r of ROADS) {
    const len = r.a1 - r.a0;
    for (let a = 14; a < len - 14; a += 30) {
      if (Rr() > .55) continue;
      const along = r.a0 + a;
      if (ix0.some(i => r.axis === 'v'
        ? Math.abs(i.x - r.c) < 12 && Math.abs(i.z - along) < 14
        : Math.abs(i.z - r.c) < 12 && Math.abs(i.x - along) < 14)) continue;
      const side = Rr() < .5 ? -1 : 1;            // curbside band, not mid-lane
      const off = side * rf(r.w / 2 - 4.0, r.w / 2 - 2.2);
      pudL.push({ x: r.axis === 'v' ? r.c + off : along,
                  z: r.axis === 'v' ? along : r.c + off,
                  s: rf(1.0, 2.6), ry: rf(0, 6.28) });
    }
  }
  const pudIM = instances(pudG, pudM, pudL, { shadow: false });
  pudIM.receiveShadow = true;
  scene.add(pudIM);
}

const _mx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(),
      _s1 = new THREE.Vector3(1, 1, 1), _eul = new THREE.Euler();
export function tickWorld(t, dt) {
  uTime.value = FREEZE ? 0 : t;
  if (FREEZE) return;
  // traffic
  if (traffic) {
    const { cars, kindIMs, glowIM, place, sigNodes, lanes, skey } = traffic;
    const cyc = t % 19;
    const vGo = cyc < 9.6, hGo = cyc >= 10.4 && cyc < 19;   // matches bulb windows
    for (const s of sigNodes.values()) s.queued = 0;
    // leader-following: regroup per edge each tick (cars change edges),
    // sort by progress along direction, clamp follower speed at gap < 8m
    const lane2 = new Map();
    cars.forEach(c => {
      let l = lane2.get(c.e); if (!l) lane2.set(c.e, l = []);
      l.push(c);
    });
    for (const [e, lane] of lane2) {
      if (lane.length < 2) continue;
      const len = e.a1 - e.a0;
      for (const d of [1, -1]) {
        const dir = lane.filter(c => c.dir === d);
        if (dir.length < 2) continue;
        dir.sort((a, b) => (a.t - b.t) * d);
        for (let k = 1; k < dir.length; k++) {
          const lead = dir[k - 1], fol = dir[k];
          if ((lead.t - fol.t) * len * d < 8) fol.capV = lead.capV ?? lead.v * .8;
        }
      }
    }
    cars.forEach((c, i) => {
      const len = c.e.a1 - c.e.a0;
      const dEnd = c.dir > 0 ? (1 - c.t) * len : c.t * len;
      const node = c.dir > 0 ? c.e.n1 : c.e.n0;
      const sig = sigNodes.get(skey(node.x, node.z));
      let v = c.v * (dEnd < 18 ? (.55 + .45 * dEnd / 18) : 1);
      // red phase for this approach: decelerate to a 9m stopline, queue
      if (sig && dEnd < 20 && !(c.e.axis === 'v' ? vGo : hGo)) {
        v = Math.min(v, Math.max(0, (dEnd - 9) * c.v / 11));
        if (dEnd < 14 && v < .5) sig.queued++;
      }
      if (c.capV !== undefined) { v = Math.min(v, c.capV); if ((c.capT = (c.capT || 0) - dt) <= 0) delete c.capV; }
      c.t += c.dir * v * dt / len;
      if (c.t > 1 || c.t < 0) {
        const node = c.dir > 0 ? c.e.n1 : c.e.n0;
        const ne = nextEdge(node, c.e);
        if (ne) {
          c.e = ne;
          c.dir = ne.n0 === node ? 1 : -1;
          c.t = c.dir > 0 ? 0 : 1;
        } else { c.dir *= -1; c.t = Math.max(0, Math.min(1, c.t)); }
      }
      place(c, i);
    });
    for (const { bIM, tIM } of kindIMs) {
      bIM.instanceMatrix.needsUpdate = true;
      tIM.instanceMatrix.needsUpdate = true;
    }
    glowIM.instanceMatrix.needsUpdate = true;
    if (window.__city) {
      const phase = cyc < 9.6 ? 'v-green' : cyc < 10.4 ? 'all-red' : 'h-green';
      window.__city.traffic = {
        ...(window.__city.traffic || {}), moving: cars.length,
        signals: [...sigNodes.values()].map(s => ({ jxn: s.jxn, phase, queued: s.queued })),
      };
    }
  }
  // pedestrians
  if (people) {
    const { walkers, legLIM, legRIM, armLIM, armRIM, torsoIM, headIM, hairIM, scales, n0 } = people;
    walkers.forEach((wk, k) => {
      const i = n0 + k;
      const sc = scales[i] || 1;
      const len = wk.e.a1 - wk.e.a0;
      wk.t += wk.dir * wk.v * dt / len;
      if (wk.t > 1 || wk.t < 0) {
        const node = wk.dir > 0 ? wk.e.n1 : wk.e.n0;
        const opts = node.edges.filter(e => e !== wk.e);
        if (opts.length) {
          wk.e = opts[Math.floor(R() * opts.length)];
          wk.dir = wk.e.n0 === node ? 1 : -1;
          wk.t = wk.dir > 0 ? 0 : 1;
          wk.side = pick([-1, 1]);
        } else { wk.dir *= -1; wk.t = Math.max(0, Math.min(1, wk.t)); }
      }
      wk.ph += wk.v * dt * 4.4;
      const a = wk.e.a0 + wk.t * len;
      const off = (wk.e.w / 2 + 1.5) * wk.side;
      const x = wk.e.axis === 'v' ? wk.e.c + off : a;
      const z = wk.e.axis === 'v' ? a : wk.e.c + off;
      const yaw = wk.e.axis === 'v'
        ? (wk.dir > 0 ? 0 : Math.PI)
        : (wk.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const bob = Math.abs(Math.sin(wk.ph)) * .05;
      const swing = Math.sin(wk.ph) * .5;
      _s1.set(1, sc, 1);
      _p.set(x, bob, z);
      _eul.set(0, yaw, 0); _q.setFromEuler(_eul);
      _mx.compose(_p, _q, _s1);
      torsoIM.setMatrixAt(i, _mx); headIM.setMatrixAt(i, _mx); hairIM.setMatrixAt(i, _mx);
      // legs pivot at hip .82 â€” swing around X in local frame
      _p.y = .86 * sc + bob;
      _eul.set(swing, yaw, 0); _q.setFromEuler(_eul); _mx.compose(_p, _q, _s1);
      legLIM.setMatrixAt(i, _mx);
      _eul.set(-swing, yaw, 0); _q.setFromEuler(_eul); _mx.compose(_p, _q, _s1);
      legRIM.setMatrixAt(i, _mx);
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      _p.y = 1.5 * sc + bob;
      _eul.set(-swing * .62, yaw, .12); _q.setFromEuler(_eul);
      _p.set(x + .24 * ca, _p.y, z - .24 * sa); _mx.compose(_p, _q, _s1);
      armLIM.setMatrixAt(i, _mx);
      _eul.set(swing * .62, yaw, -.12); _q.setFromEuler(_eul);
      _p.set(x - .24 * ca, _p.y, z + .24 * sa); _mx.compose(_p, _q, _s1);
      armRIM.setMatrixAt(i, _mx);
      _s1.set(1, 1, 1);
    });
    legLIM.instanceMatrix.needsUpdate = legRIM.instanceMatrix.needsUpdate = true;
    armLIM.instanceMatrix.needsUpdate = armRIM.instanceMatrix.needsUpdate = true;
    torsoIM.instanceMatrix.needsUpdate = headIM.instanceMatrix.needsUpdate = hairIM.instanceMatrix.needsUpdate = true;
  }
  // traffic lights: 8s green, 1.6s yellow, .8s all-red per axis
  if (signals) {
    const { bulbIM, bulbs } = signals;
    const cyc = (t % 19) ;
    const vGreen = cyc < 8, vYellow = cyc >= 8 && cyc < 9.6;
    const hGreen = cyc >= 10.4 && cyc < 18.4, hYellow = cyc >= 18.4;
    const attr = bulbIM.geometry.getAttribute('aLit');
    for (const b of bulbs) {
      const on = b.axis === 'v'
        ? (b.slot === 2 && vGreen) || (b.slot === 1 && vYellow) || (b.slot === 0 && !vGreen && !vYellow)
        : (b.slot === 2 && hGreen) || (b.slot === 1 && hYellow) || (b.slot === 0 && !hGreen && !hYellow);
      attr.array[b.idx] = on ? 1 : .04;
    }
    attr.needsUpdate = true;
  }
  // hot air balloons - lazy circuit + bob + slow rotation
  if (balloons) for (const b of balloons) {
    const a = b.ph + t * b.v;
    b.grp.position.set(b.cx + Math.cos(a) * b.r, Y + b.h + Math.sin(t * .5 + b.ph) * 4,
                       b.cz + Math.sin(a) * b.r);
    b.grp.rotation.y = t * .04 + b.ph;
  }
  // pond jet - taller plume, wider mushroom crown
  if (pondJet) {
    const { pts, pos, seed, cx, cz } = pondJet;
    const N = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const life = (seed[i * 2] + t * (.42 + seed[i * 2 + 1] * .55)) % 1;
      const ang = seed[i * 2 + 1] * 6.28 + seed[i * 2] * 3;
      const r = .25 + life * (2.4 + seed[i * 2] * 1.6);
      pos[i * 3] = cx + Math.cos(ang) * r * life * life;
      pos[i * 3 + 1] = Y + 1.6 + life * 7.6 - life * life * 6.8;
      pos[i * 3 + 2] = cz + Math.sin(ang) * r * life * life;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }
  // fountain spray
  if (fountain) {
    const { pts, pos, seed, cx, cz } = fountain;
    const N = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const life = (seed[i * 2] + t * (.5 + seed[i * 2 + 1] * .5)) % 1;
      const ang = seed[i * 2 + 1] * 6.28 + seed[i * 2] * 2;
      const r = .2 + life * (1.2 + seed[i * 2]);
      pos[i * 3] = cx + Math.cos(ang) * r * life;
      pos[i * 3 + 1] = 4.4 + life * 3.4 - life * life * 4.2;
      pos[i * 3 + 2] = cz + Math.sin(ang) * r * life;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }
  // drifting clouds
  if (clouds) for (const c of clouds) {
    c.sp.position.x += c.v * dt;
    if (c.sp.position.x > 1800) c.sp.position.x = -1800;
  }
  // circling birds â€” flap = quick body roll, glide between wingbeats
  if (birds) {
    const { im, list } = birds;
    list.forEach((b, i) => {
      const a = b.ph + t * b.vv;
      const flap = Math.sin(t * 9 + b.ph * 7) * (Math.sin(t * .7 + b.ph) > 0 ? .5 : .12);
      _p.set(b.f.cx + Math.cos(a) * b.f.r * b.rr2,
             b.f.h + Math.sin(t * 1.3 + b.ph) * 6,
             b.f.cz + Math.sin(a) * b.f.r * b.rr2);
      _eul.set(flap * .3, -a + (b.vv > 0 ? 0 : Math.PI), flap);
      _q.setFromEuler(_eul);
      _s1.setScalar(b.s);
      _mx.compose(_p, _q, _s1);
      im.setMatrixAt(i, _mx);
    });
    _s1.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
  }
  // fireflies - lazy drift + bob + twinkle fade
  if (fireflies) {
    const { pts, list } = fireflies, arr = pts.geometry.attributes.position.array;
    list.forEach((f, i) => {
      const t2 = t * f.v + f.ph;
      arr[i * 3] = f.x + Math.sin(t2) * f.amp + Math.sin(t2 * .37) * f.amp * .5;
      arr[i * 3 + 1] = Y + f.h + Math.sin(t2 * 1.7) * .5;
      arr[i * 3 + 2] = f.z + Math.cos(t2 * .8) * f.amp;
      const tw = .15 + .85 * Math.max(0, Math.sin(t * f.tw + f.ph * 3));
      const ca = pts.geometry.attributes.color.array;
      ca[i * 3] = tw; ca[i * 3 + 1] = tw; ca[i * 3 + 2] = tw * .6;
    });
    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
  }
  // tower crane - slow slew like a real site crane at idle
  if (crane) crane.slew.rotation.y = t * .045 + Math.sin(t * .3) * .06;
  // farm windmill - rotor spin + slow vane yaw hunt
  if (windmill) {
    windmill.rotor.rotation.z = t * 2.1;
    windmill.head.rotation.y = .8 + Math.sin(t * .16) * .22;
  }
  // ferris wheel - slow turn; gondolas hang upright below the rim
  if (ferris) {
    const { wheel, cabIM, cx, cy, cz, R0, face } = ferris;
    const a0 = t * .09;
    wheel.rotation.set(0, face, a0);
    const cf = Math.cos(face), sf = Math.sin(face);
    for (let i = 0; i < 12; i++) {
      const a = a0 + i * Math.PI / 6;
      const lx = Math.cos(a) * R0, ly = Math.sin(a) * R0 - 1.7;
      _p.set(cx + lx * cf, cy + ly, cz - lx * sf);
      _eul.set(0, face, Math.sin(t * 1.1 + i * 2.1) * .05);
      _q.setFromEuler(_eul); _mx.compose(_p, _q, _s1);
      cabIM.setMatrixAt(i, _mx);
    }
    cabIM.instanceMatrix.needsUpdate = true;
  }
  // paddling ducks - lazy circles on the pond, gentle bob, tangent heading
  if (ducks) {
    const { im, list } = ducks;
    list.forEach((d, i) => {
      const a = d.ph + t * d.vv;
      _p.set(d.ax + Math.cos(a) * d.r,
             Y + .12 + Math.sin(t * 1.6 + d.ph) * .05,
             d.az + Math.sin(a) * d.r);
      _eul.set(0, d.vv > 0 ? -a - 1.5708 : 1.5708 - a,
               Math.sin(t * 2 + d.ph) * .04);
      _q.setFromEuler(_eul);
      _s1.setScalar(d.s);
      _mx.compose(_p, _q, _s1);
      im.setMatrixAt(i, _mx);
    });
    _s1.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
  }
  // rain streaks - wrapped fall column, slight slant via fixed roll
  if (rain) {
    const { im, list } = rain;
    _eul.set(0, 0, .1);
    _q.setFromEuler(_eul);
    list.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) d.y += 260;
      _p.set(d.x, d.y, d.z);
      _s1.set(d.s, d.len, d.s);
      _mx.compose(_p, _q, _s1);
      im.setMatrixAt(i, _mx);
    });
    _s1.set(1, 1, 1);
    im.instanceMatrix.needsUpdate = true;
  }
}
