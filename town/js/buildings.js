// buildings.js — procedural builders for every Havenbrook facility type
import * as THREE from 'three';
import { box, cyl, plane, gableRoof, hipRoof, mat, facadeMaps, glassFacadeMaps,
         sidingTexture, brickTexture, garageDoorTexture, awningTexture,
         signTexture, crossTexture, clockTexture, colored, VCOL, flagMaterial,
         makeCanvas, canvasTex, R, rr, pick, DETAIL } from './lib.js';
import { M_CONCRETE, M_ROOFGRAY, M_ROOFCLAY } from './mats.js';
import { CITY, heroLeaf, heroCrown } from './city/stats.js';

const M = THREE.MeshStandardMaterial;

/* sprint-03 entrance registry — each named facility that gains a real
   entrance kit appends one {placed,parts,pos} site under hero.entrances. */
function heroEntrance(s, parts) {
  const e = (CITY.hero.entrances ||= { placed: 0, parts: 0, pos: [] });
  e.placed++; e.parts += parts; e.pos.push([s.x, s.z]);
}

/* facade material set for a box: [px, nx, top, bottom, pz, nz]
   Wall materials are cached per texture so identical facades share one
   material → mergeStatic() merges every matching wall into one draw call. */
const wallCache = new Map();
function wallMat(maps) {
  const { map, bump, emis, rough, normal } = maps;
  const k = map.uuid + ':' + (bump ? bump.uuid : '') + ':' + (normal ? normal.uuid : '') + ':' + (rough ? rough.uuid : '');
  if (!wallCache.has(k)) {
    const m = new M({ map, bumpMap: bump || null, bumpScale: .08, roughness: .88 });
    if (rough) { m.roughnessMap = rough; m.roughness = 1; }
    if (normal) { m.normalMap = normal; m.normalScale = new THREE.Vector2(.85, .85); }
    if (emis) {
      m.emissiveMap = emis;
      m.emissive = new THREE.Color('#ffd9a0');
      m.emissiveIntensity = 0;               // main.js sets it from time-of-day
      m.userData.lit = true;
    }
    wallCache.set(k, m);
  }
  return wallCache.get(k);
}
let _concTop = null;
function wallMats(maps, roofMat) {
  const wall = wallMat(maps);
  if (!roofMat.map) { // plain color roof -> concrete PBR
    if (!_concTop) { _concTop = M_CONCRETE(7, 7); }
    roofMat = _concTop;
  }
  return [wall, wall, roofMat, mat('#3c3f42'), wall, wall];
}
function sign(group, text, w, y, z, opts = {}) {
  const t = signTexture(text, opts);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (opts.h || 96) / (opts.w || 512)),
    new M({ map: t, roughness: .6, transparent: false }));
  p.position.set(opts.x || 0, y, z);
  if (opts.ry) p.rotation.y = opts.ry;
  group.add(p);
  return p;
}
/* parameterized parapet — seeded height, cap palette, silhouette styles.
   Accepts a color string (legacy call sites) or {color, ph, style}. */
const PARAPET_COLORS = ['#4a4e52', '#53575c', '#5d5750', '#424a4e', '#57504a'];
const PARAPET_CAPS = ['#d9d5cc', '#c9c2b4', '#b0a898', '#8f8b82', '#a8765c'];
function parapet(g, w, d, h, opts = {}) {
  const o = typeof opts === 'string' ? { color: opts } : opts;
  const color = o.color || pick(PARAPET_COLORS);
  const ph = o.ph || rr(.6, 1.6);
  const style = o.style || (R() < .32 ? 'stepped' : R() < .30 ? 'pediment' : 'plain');
  const t = 0.5;
  const m = mat(color);
  g.add(box(w + t, ph, t, m, 0, h, -d / 2));
  g.add(box(w + t, ph, t, m, 0, h, d / 2));
  g.add(box(t, ph, d, m, -w / 2, h, 0));
  g.add(box(t, ph, d, m, w / 2, h, 0));
  const cm = mat(o.cap || pick(PARAPET_CAPS));
  g.add(box(w + t + .15, .18, t + .15, cm, 0, h + ph, -d / 2));
  g.add(box(w + t + .15, .18, t + .15, cm, 0, h + ph, d / 2));
  g.add(box(t + .15, .18, d, cm, -w / 2, h + ph, 0));
  g.add(box(t + .15, .18, d, cm, w / 2, h + ph, 0));
  // darker metal band under the cap — reads as the parapet's coping shadow
  if (o.band !== false) {
    const bm = mat(o.bandC || '#34383d');
    const by = h + ph - .34;
    g.add(box(w + t + .22, .16, t + .22, bm, 0, by, -d / 2));
    g.add(box(w + t + .22, .16, t + .22, bm, 0, by, d / 2));
    g.add(box(t + .22, .16, d + t, bm, -w / 2, by, 0));
    g.add(box(t + .22, .16, d + t, bm, w / 2, by, 0));
  }
  // scupper drains along the street parapet
  const sc = mat('#2c3034');
  for (let i = 0, n = Math.max(1, Math.round(w / 11)); i < n; i++)
    g.add(box(.5, .16, .18, sc, -w / 2 + (i + .5) * w / n, h + .1, d / 2 + t / 2 - .04));
  if (style === 'stepped') {
    // corner piers rise ~.5m above the parapet cap
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(1.4, ph + .62, 1.4, m, sx * (w / 2 - .5), h - .1, sz * (d / 2 - .5)));
  } else if (style === 'pediment') {
    // raised center bay on the street face (+z)
    g.add(box(w * .3, ph + .7, t + .2, m, 0, h, d / 2));
    g.add(box(w * .3 + .4, .2, t + .35, cm, 0, h + ph + .7, d / 2));
  }
  return h + ph;
}

/* tar-gravel roof skin — speckle + membrane seams + blotch stains. One shared
   set of canvases tints all flat-roof finishes without breaking the cache. */
const _roofSkin = { map: null, bump: null, rough: null };
function roofSkin() {
  if (!_roofSkin.map) {
    const [cm, xm] = makeCanvas(256, 256);
    xm.fillStyle = '#f4f2ee'; xm.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {                 // gravel speckle
      const v = 120 + R() * 110;
      xm.fillStyle = `rgba(${v},${v},${v * .94},${.12 + R() * .2})`;
      xm.fillRect(R() * 256, R() * 256, 1 + R() * 2, 1 + R() * 2);
    }
    for (let i = 0; i < 12; i++) {                   // blotch stains
      xm.fillStyle = `rgba(70,62,50,${.05 + R() * .1})`;
      xm.fillRect(R() * 256, R() * 256, 24 + R() * 60, 18 + R() * 44);
    }
    xm.strokeStyle = 'rgba(0,0,0,.10)'; xm.lineWidth = 1;   // membrane seams
    for (let s = 32; s < 256; s += 32) {
      xm.beginPath(); xm.moveTo(0, s); xm.lineTo(256, s); xm.stroke();
    }
    const [cbk, xbk] = makeCanvas(256, 256);
    xbk.fillStyle = '#808080'; xbk.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const v = 96 + R() * 96;
      xbk.fillStyle = `rgb(${v},${v},${v})`;
      xbk.fillRect(R() * 256, R() * 256, 1 + R() * 2, 1 + R() * 2);
    }
    const [crq, xrq] = makeCanvas(128, 128);
    xrq.fillStyle = '#e6e6e6'; xrq.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 10; i++) {                   // stained spots run glossier
      xrq.fillStyle = `rgba(90,90,90,${.15 + R() * .2})`;
      xrq.fillRect(R() * 128, R() * 128, 16 + R() * 30, 12 + R() * 24);
    }
    _roofSkin.map = canvasTex(cm);
    _roofSkin.bump = canvasTex(cbk, { srgb: false });
    _roofSkin.rough = canvasTex(crq, { srgb: false });
  }
  return _roofSkin;
}

/* bump + rough partners for the flat siding/brick wall textures — without
   them house walls render as a single unlit color plane. */
const _sidSkin = { bump: null, rough: null };
function sidingSkin() {
  if (!_sidSkin.bump) {
    const [cb, xb] = makeCanvas(128, 128);
    xb.fillStyle = '#808080'; xb.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 10) {              // plank grooves + ridge
      const j = 118 + Math.floor((R() - .5) * 30);
      xb.fillStyle = `rgb(${j},${j},${j})`; xb.fillRect(0, y, 128, 8);
      xb.fillStyle = '#383838'; xb.fillRect(0, y + 8, 128, 2);
      xb.fillStyle = '#a8a8a8'; xb.fillRect(0, y, 128, 1);
    }
    const [cr, xr] = makeCanvas(64, 64);
    xr.fillStyle = '#d2d2d2'; xr.fillRect(0, 0, 64, 64);
    xr.fillStyle = '#b8b8b8';
    for (let y = 4; y < 64; y += 5) xr.fillRect(0, y, 64, 1);
    _sidSkin.bump = canvasTex(cb, { srgb: false });
    _sidSkin.rough = canvasTex(cr, { srgb: false });
  }
  return _sidSkin;
}

/* flat-roof finish palette — membrane / gravel / asphalt / tan EPDM /
   weathered green-gray, cached per finish */
const _flatRoofs = [null, null, null, null, null];
function flatRoofMat() {
  const i = Math.floor(R() * _flatRoofs.length);
  if (!_flatRoofs[i]) {
    const finish = [['#c8ccc5', .55], ['#84827c', 1], ['#4a4d51', .97],
                    ['#b0a58e', .85], ['#5c6460', .9]][i];
    _flatRoofs[i] = mat(finish[0], { roughness: finish[1] });
    const skin = roofSkin();
    _flatRoofs[i].map = skin.map;
    _flatRoofs[i].bumpMap = skin.bump; _flatRoofs[i].bumpScale = .04;
    _flatRoofs[i].roughnessMap = skin.rough; _flatRoofs[i].roughness = 1;
  }
  return _flatRoofs[i];
}

/* facade articulation kit — pilasters, cornice ledge, plinth, string
   courses, corner downspouts. Vertex-colored so it merges globally. */
function facadeDress(g, w, d, h, o = {}) {
  const parts = [];
  const bandC = o.band || '#d9d2c0';
  if (o.plinth !== false && R() < .82)
    parts.push({ geo: new THREE.BoxGeometry(w + .22, .95, d + .22), color: o.plinthC || '#5a5348', x: 0, y: .48, z: 0 });
  if (o.cornice !== false && R() < .68) {
    parts.push({ geo: new THREE.BoxGeometry(w + .55, .42, d + .55), color: bandC, x: 0, y: h - .65, z: 0 });
    parts.push({ geo: new THREE.BoxGeometry(w + .3, .16, d + .3), color: bandC, x: 0, y: h - 1.05, z: 0 });
  }
  if (o.pilasters && R() < .6) {
    const n = Math.max(2, Math.round(w / 9));
    for (let i = 0; i <= n; i++) {
      const px = -w / 2 + 1 + i * (w - 2) / n;
      parts.push({ geo: new THREE.BoxGeometry(.8, h - 1.6, .3), color: bandC, x: px, y: .9 + (h - 1.6) / 2, z: d / 2 + .05 });
    }
  }
  if (o.courses && h > 12 && R() < .55) {
    const floors = Math.floor(h / 3.3);
    for (let f = 1; f < floors; f++)
      parts.push({ geo: new THREE.BoxGeometry(w + .18, .14, d + .18), color: bandC, x: 0, y: f * 3.3, z: 0 });
  }
  if (o.downspouts !== false && R() < .6) {
    // corner downspouts on front + back faces — pipe, gutter elbow, shoe
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) if (R() < .62) {
      const px = sx * (w / 2 - .35), pz = sz * (d / 2 + .07);
      parts.push({ geo: new THREE.BoxGeometry(.16, h - .5, .18), color: '#6d7276', x: px, y: h / 2 - .1, z: pz });
      parts.push({ geo: new THREE.BoxGeometry(.2, .2, .34), color: '#6d7276', x: px, y: h - .35, z: pz });
      parts.push({ geo: new THREE.BoxGeometry(.2, .2, .3), color: '#5d6367', x: px, y: .32, z: pz + sz * .12 });
    }
  }
  if (parts.length) {
    const m = new THREE.Mesh(colored(parts), VCOL());
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
}

/* 3D window dressing aligned to the facadeMaps() painter grid — stone lintels,
   sills and jamb trims stand proud of the painted reveal so the glass reads
   recessed while lit panes keep their dusk emissive (nothing covers the paint).
   faces: 'f' = +z street face, 'b' = back, 's' = ±x flanks.
   storefront:true clips the grid at the painted shopfront band (px 322). */
/* shared semi-transparent facade glass — every winDress pane lands in ONE
   merged bucket. Painted lit windows beneath still bleed through. */
const _FGLASS = new M({ vertexColors: true, roughness: .14, metalness: .35,
  transparent: true, opacity: .78 });
function glassMesh(g, gp) {
  if (!gp.length) return;
  const m = new THREE.Mesh(colored(gp), _FGLASS);
  m.receiveShadow = true; g.add(m);
}
const PANE_TINTS = ['#22303a', '#26333b', '#31404a', '#3a3129', '#1d272e'];

function winDress(parts, w, d, h, { rows = 2, cols = 4, storefront = false,
                                    faces = 'fb', trim = '#e5e0d4',
                                    transom = false, spandrel = false,
                                    fins = false, deep = true,
                                    reveal = false } = {}, gp = null) {
  const TOP = storefront ? 190 : 14, BAND = storefront ? 322 : 512;
  const cw = 512 / cols, rh = (512 - TOP - 14) / rows;
  // face table: ry = box rotation to lie on the face; at(u, n) maps a lateral
  // metre offset + outward protrusion to world xz.  Grids are symmetric so
  // the texture's mirror on back/right faces doesn't matter.
  const FDEF = {
    f: { ry: 0,            W: w, at: (u, n) => [u,  d / 2 + n] },
    b: { ry: Math.PI,      W: w, at: (u, n) => [-u, -d / 2 - n] },
    l: { ry: Math.PI / 2,  W: d, at: (u, n) => [-w / 2 - n, u] },
    r: { ry: -Math.PI / 2, W: d, at: (u, n) => [w / 2 + n, -u] },
  };
  const list = [];
  for (const ch of faces)
    if (ch === 's') list.push(FDEF.l, FDEF.r);
    else if (FDEF[ch]) list.push(FDEF[ch]);
  let topY = -1, botY = -1;
  for (let r = 0; r < rows; r++) {
    const wy = TOP + r * rh + rh * .14, wh = rh * .64;
    if (wy >= BAND) break;                         // row hidden behind shopfront
    const yT = h * (1 - wy / 512);
    const yB = h * (1 - Math.min(wy + wh, BAND) / 512);
    if (yT - yB < .4) continue;
    if (topY < 0) topY = yT;
    botY = yB;
    for (let c = 0; c < cols; c++) {
      const cf = (c + .5) / cols - .5;
      for (const F of list) {
        const ww = cw * .68 / 512 * F.W, u = cf * F.W;
        const span = yT - yB;
        const [lx, lz] = F.at(u, deep ? .18 : .1); // lintel
        parts.push({ geo: new THREE.BoxGeometry(ww + .34, .2, deep ? .36 : .2),
          color: trim, x: lx, y: yT + .07, z: lz, ry: F.ry });
        const [sx, sz] = F.at(u, deep ? .18 : .12); // sill
        parts.push({ geo: new THREE.BoxGeometry(ww + .36, .16, deep ? .4 : .26),
          color: '#d5cfc0', x: sx, y: yB - .07, z: sz, ry: F.ry });
        for (const sd of [-1, 1]) {                // jambs
          const [jx, jz] = F.at(u + sd * (ww / 2 + .07), deep ? .16 : .08);
          parts.push({ geo: new THREE.BoxGeometry(.14, span, deep ? .32 : .16),
            color: trim, x: jx, y: (yT + yB) / 2, z: jz, ry: F.ry });
        }
        if (reveal) {                              // dark inner reveal ring
          const [rx, rz] = F.at(u, .09);
          parts.push({ geo: new THREE.BoxGeometry(ww + .1, .09, .14), color: '#3c4348',
            x: rx, y: yT - .04, z: rz, ry: F.ry });
          for (const sd of [-1, 1]) {
            const [rx2, rz2] = F.at(u + sd * (ww / 2 + .03), .09);
            parts.push({ geo: new THREE.BoxGeometry(.09, span, .14), color: '#3c4348',
              x: rx2, y: (yT + yB) / 2, z: rz2, ry: F.ry });
          }
        }
        if (gp) {                                  // inset glass pane (one shared bucket)
          const [px, pz] = F.at(u, .02);
          gp.push({ geo: new THREE.BoxGeometry(ww - .04, span - .04, .05),
            color: PANE_TINTS[(r * cols + c + list.indexOf(F)) % 5],
            x: px, y: (yT + yB) / 2, z: pz, ry: F.ry });
        }
        if (transom && yT - yB > 1.4) {            // mid-rail splits tall panes
          const ty = yB + (yT - yB) * .38;
          const [tx, tz] = F.at(u, deep ? .12 : .07);
          parts.push({ geo: new THREE.BoxGeometry(ww + .16, .11, deep ? .18 : .14),
            color: trim, x: tx, y: ty, z: tz, ry: F.ry });
        }
      }
    }
    if (spandrel) {
      // floor-slab band at this row's top line (painter's shadow row)
      const by = h * (1 - (TOP + r * rh) / 512);
      for (const F of list) {
        const [bx, bz] = F.at(0, .13);
        parts.push({ geo: new THREE.BoxGeometry(F.W + .2, .26, .18), color: trim,
          x: bx, y: by, z: bz, ry: F.ry });
      }
    }
  }
  if (fins && cols > 3 && topY > 0)                // pilaster fins between bays
    for (let c = 1; c < cols; c++)
      for (const F of list) {
        const [fx, fz] = F.at((c / cols - .5) * F.W, .09);
        parts.push({ geo: new THREE.BoxGeometry(.2, topY - botY + .3, .18),
          color: trim, x: fx, y: (topY + botY) / 2, z: fz, ry: F.ry });
      }
}

/* ground-floor shopfront articulation over the painted storefront band —
   bay mullions, header fascia, kick plate. Matches the painter's bay grid. */
function storefrontKit(parts, w, d, h, { cols = 4, faces = 'f',
                                        band = '#3a4147', trim = '#ddd6c8' } = {}, gp = null) {
  const bandTop = h * (1 - 322 / 512);             // painted shopfront height
  const FDEF = {
    f: { ry: 0,            W: w, at: (u, n) => [u,  d / 2 + n] },
    b: { ry: Math.PI,      W: w, at: (u, n) => [-u, -d / 2 - n] },
    l: { ry: Math.PI / 2,  W: d, at: (u, n) => [-w / 2 - n, u] },
    r: { ry: -Math.PI / 2, W: d, at: (u, n) => [w / 2 + n, -u] },
  };
  for (const ch of faces) {
    const fl = ch === 's' ? [FDEF.l, FDEF.r] : [FDEF[ch]];
    for (const FF of fl) {
      if (!FF) continue;
      // header fascia across the whole band + kick plate at grade
      let [hx, hz] = FF.at(0, .12);
      parts.push({ geo: new THREE.BoxGeometry(FF.W + .3, .5, .22), color: trim,
        x: hx, y: bandTop + .18, z: hz, ry: FF.ry });
      const [kx, kz] = FF.at(0, .1);
      parts.push({ geo: new THREE.BoxGeometry(FF.W + .2, .42, .16), color: '#2e3439',
        x: kx, y: .28, z: kz, ry: FF.ry });
      // mullions at bay boundaries + thicker end pilasters
      for (let c = 0; c <= cols; c++) {
        const edge = c === 0 || c === cols;
        const u = (c / cols - .5) * FF.W;
        const [mx, mz] = FF.at(u, .08);
        parts.push({ geo: new THREE.BoxGeometry(edge ? .3 : .16, bandTop - .3,
          edge ? .2 : .14), color: edge ? trim : band,
          x: mx, y: .4 + (bandTop - .4) / 2, z: mz, ry: FF.ry });
      }
      // transom rail + glass pane per bay (pane → shared transparent bucket)
      const bayW = FF.W / cols;
      for (let c = 0; c < cols; c++) {
        const u = ((c + .5) / cols - .5) * FF.W;
        const [tx, tz] = FF.at(u, .09);
        parts.push({ geo: new THREE.BoxGeometry(bayW - .2, .11, .14), color: band,
          x: tx, y: bandTop * .62, z: tz, ry: FF.ry });
        if (gp) {
          const [px, pz] = FF.at(u, .02);
          gp.push({ geo: new THREE.BoxGeometry(bayW - .26, bandTop - .85, .05),
            color: PANE_TINTS[(c + (FF.ry ? 1 : 0)) % 5],
            x: px, y: .55 + (bandTop - .75) / 2, z: pz, ry: FF.ry });
        }
      }
    }
  }
}

/* corner quoins — alternating stone blocks, up to maxH. faces 'all' wraps
   every corner, 'f' only the two street-face corners (shared side walls). */
function quoins(parts, w, d, h, { color = '#e3dcc8', maxH = 7.6, faces = 'all' } = {}) {
  const top = Math.min(h, maxH); let lv = 0;
  for (let y = .5; y < top - .3; y += .8, lv++) {
    const long = lv % 2 === 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (faces === 'f' && sz !== 1) continue;
      parts.push({ geo: new THREE.BoxGeometry(.18, .46, long ? .78 : .42), color,
        x: sx * (w / 2 + .07), y, z: sz * (d / 2 - (long ? .3 : .13)) });
      parts.push({ geo: new THREE.BoxGeometry(long ? .78 : .42, .46, .18), color,
        x: sx * (w / 2 - (long ? .3 : .13)), y, z: sz * (d / 2 + .07) });
    }
  }
}

/* blade sign — perpendicular panel projecting off the front face, hung on
   two bracket rods. Classic main-street marker. */
function bladeSign(parts, w, d, h, { x = w / 2 - 1.3, color = '#b8433a',
                                     edge = '#f0e9da' } = {}) {
  const y = Math.min(h - 2.3, 5.1), z = d / 2 + .66;
  parts.push({ geo: new THREE.BoxGeometry(.12, 2.3, .95), color, x, y, z });
  parts.push({ geo: new THREE.BoxGeometry(.14, .12, 1.0), color: edge, x, y: y + 1.16, z });
  parts.push({ geo: new THREE.BoxGeometry(.14, .12, 1.0), color: edge, x, y: y - 1.16, z });
  for (const dy of [1.15, -1.15])
    parts.push({ geo: new THREE.BoxGeometry(.05, .05, .66), color: '#2e3134',
      x, y: y + dy, z: d / 2 + .3 });
}

/* bolt-on steel fire escape for 2–4 storey commercial/apartment blocks —
   grated platforms + railing + diagonal stair hints on one flank wall, plus
   a drop ladder to the sidewalk. All vertex-colored parts (merge globally). */
function fireEscape(parts, w, d, h, { side = 1, z0 = null } = {}) {
  const wx = side * w / 2;
  const zc = z0 ?? -d * .18;
  const lv = [];
  for (let y = 3.3; y < h - 1.6; y += 3.2) lv.push(y);
  if (!lv.length) return;
  const iron = '#24272b', grate = '#3b4045';
  const X = wx + side * .58;                       // platform centreline
  for (let i = 0; i < lv.length; i++) {
    const y = lv[i];
    parts.push({ geo: new THREE.BoxGeometry(1.16, .09, 3.4), color: grate, x: X, y, z: zc });
    parts.push({ geo: new THREE.BoxGeometry(.05, .05, 3.4), color: iron, x: wx + side * 1.12, y: y + 1.05, z: zc });
    for (const zz of [-1.55, 0, 1.55])
      parts.push({ geo: new THREE.BoxGeometry(.05, 1.05, .05), color: iron, x: wx + side * 1.12, y: y + .52, z: zc + zz });
    for (const zz of [-1.67, 1.67])
      parts.push({ geo: new THREE.BoxGeometry(1.14, .05, .05), color: iron, x: X, y: y + 1.05, z: zc + zz });
    if (i < lv.length - 1) {                       // diagonal stair to next level
      const rise = lv[i + 1] - y, run = 2.3, L = Math.hypot(rise, run);
      for (const ox of [-.3, .3])
        parts.push({ geo: new THREE.BoxGeometry(.09, .12, L), color: iron,
          x: X + ox, y: y + rise / 2 + .06, z: zc + 1.05 - run / 2, rx: -Math.atan2(rise, run) });
      for (let s = 1; s <= 3; s++)                 // tread hints along the slope
        parts.push({ geo: new THREE.BoxGeometry(.8, .05, .34), color: grate,
          x: X, y: y + rise * s / 4, z: zc + 1.05 - run * s / 4 });
    }
  }
  // drop ladder from the lowest platform
  const low = lv[0];
  for (const zz of [-1.55, -.85])
    parts.push({ geo: new THREE.BoxGeometry(.06, low, .06), color: iron,
      x: wx + side * 1.05, y: low / 2, z: zc + zz });
  for (let s = .5; s < low - .3; s += .85)
    parts.push({ geo: new THREE.BoxGeometry(.05, .05, .7), color: iron,
      x: wx + side * 1.05, y: s, z: zc - 1.2 });
}

/* mesh wrappers — each funnels into one colored() mesh (one merge bucket) */
function winDressMesh(g, w, d, h, o) {
  const parts = [], gp = [];
  winDress(parts, w, d, h, o, gp);
  if (o.quoins) quoins(parts, w, d, h, typeof o.quoins === 'object' ? o.quoins : {});
  if (o.blade) bladeSign(parts, w, d, h, typeof o.blade === 'object' ? o.blade : {});
  if (parts.length) {
    const m = new THREE.Mesh(colored(parts), VCOL());
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
  glassMesh(g, gp);
}
function fireEscapeMesh(g, w, d, h, o) {
  const parts = [];
  fireEscape(parts, w, d, h, o);
  if (!parts.length) return;
  const m = new THREE.Mesh(colored(parts), VCOL());
  m.castShadow = m.receiveShadow = true; g.add(m);
}
function storefrontKitMesh(g, w, d, h, o) {
  const parts = [], gp = [];
  storefrontKit(parts, w, d, h, o, gp);
  if (parts.length) {
    const m = new THREE.Mesh(colored(parts), VCOL());
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
  glassMesh(g, gp);
}

/* rooftop clutter beyond hvac(): exhaust fans, vent stacks, skylight rows,
   stair bulkhead, solar arrays, water tank, condenser lines, mech screens.
   Seeded 2–3 kinds per roof. */
function clutter(g, w, d, h, o = {}) {
  if (DETAIL.f < 1) return;          // MIN tier: bare roofs, keep silhouettes
  const parts = [];
  const kinds = [];
  if (o.fans !== false && w > 14) kinds.push('fans');
  if (o.vents !== false) kinds.push('vents');
  if (o.skylights !== false && w > 16 && d > 12) kinds.push('skylights');
  if (o.bulkhead !== false && w > 18 && d > 14) kinds.push('bulkhead');
  if (o.condensers !== false && w > 10) kinds.push('condensers');
  if (o.screen !== false && w > 12 && d > 10) kinds.push('screen');
  if (o.solar && w > 20) kinds.push('solar');
  if (o.tank && h > 30) kinds.push('tank');
  const nK = Math.min(kinds.length, 2 + (R() < .5 ? 1 : 0));
  for (let k = 0; k < nK; k++) {
    const kind = kinds.splice(Math.floor(R() * kinds.length), 1)[0];
    if (kind === 'fans')
      for (let i = 0; i < 2; i++) {
        const fx = rr(-w / 2 + 4, w / 2 - 4), fz = rr(-d / 2 + 4, d / 2 - 4);
        parts.push({ geo: new THREE.BoxGeometry(1.5, .8, 1.5), color: '#7d858a', x: fx, y: h + .4, z: fz });
        parts.push({ geo: new THREE.CylinderGeometry(.5, .5, .3, 10), color: '#5c6367', x: fx, y: h + .95, z: fz });
        parts.push({ geo: new THREE.BoxGeometry(2.1, .02, 2.1), color: '#43484a', x: fx, y: h + .01, z: fz });   // oil stain pad
      }
    if (kind === 'vents')
      for (let i = 0; i < 3; i++)
        parts.push({ geo: new THREE.CylinderGeometry(.13, .16, rr(1.2, 2.2), 7), color: '#9aa0a3',
          x: rr(-w / 2 + 3, w / 2 - 3), y: h + .8, z: rr(-d / 2 + 3, d / 2 - 3) });
    if (kind === 'skylights') {
      const nx = Math.floor(w / 9);
      for (let i = 0; i < nx; i++)
        parts.push({ geo: new THREE.BoxGeometry(2.6, .35, 1.6), color: '#9fc3d4',
          x: -w / 2 + 5 + i * 9, y: h + .18, z: rr(-d / 4, d / 4) });
    }
    if (kind === 'bulkhead') {
      const bx = rr(-w / 4, w / 4);
      parts.push({ geo: new THREE.BoxGeometry(4.4, 2.6, 3.4), color: '#8a8f94', x: bx, y: h + 1.3, z: -d / 4 });
      parts.push({ geo: new THREE.BoxGeometry(.9, 2.0, .15), color: '#3c4145', x: bx, y: h + 1.0, z: -d / 4 + 1.75 });
      parts.push({ geo: new THREE.BoxGeometry(5.4, .02, 4.4), color: '#43484a', x: bx, y: h + .01, z: -d / 4 });
    }
    if (kind === 'condensers') {
      // row of small AC condenser pads along the rear setback
      const nC = 2 + Math.floor(R() * 3), cz = -d / 2 + 1.9;
      for (let i = 0; i < nC; i++) {
        const cx = -w / 2 + 3 + i * 2.4 + rr(-.3, .3);
        if (cx > w / 2 - 3) break;
        parts.push({ geo: new THREE.BoxGeometry(1.6, .02, 1.6), color: '#43484a', x: cx, y: h + .01, z: cz });   // oil stain pad
        parts.push({ geo: new THREE.BoxGeometry(1.1, .75, 1.1), color: '#9aa0a3', x: cx, y: h + .38, z: cz });
        parts.push({ geo: new THREE.CylinderGeometry(.38, .38, .14, 8), color: '#6d7276', x: cx, y: h + .82, z: cz });
      }
    }
    if (kind === 'screen') {
      // louvered mechanical screen hiding equipment — U of thin panels on posts
      const sx = rr(-w / 4, w / 4), sz = rr(-d / 5, d / 5), sw = rr(4, Math.min(7, w * .3));
      const pc = pick(['#5f666b', '#6d7276', '#575d61']);
      parts.push({ geo: new THREE.BoxGeometry(sw, 2.1, .14), color: pc, x: sx, y: h + 1.05, z: sz + 2 });
      parts.push({ geo: new THREE.BoxGeometry(.14, 2.1, 4), color: pc, x: sx - sw / 2, y: h + 1.05, z: sz });
      parts.push({ geo: new THREE.BoxGeometry(.14, 2.1, 4), color: pc, x: sx + sw / 2, y: h + 1.05, z: sz });
      // shadow gap: dark base under the screen slats
      parts.push({ geo: new THREE.BoxGeometry(sw + .1, .24, 4.1), color: '#33373b', x: sx, y: h + .12, z: sz });
    }
    if (kind === 'solar') {
      const rows = Math.floor(d / 8);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < Math.floor(w / 7); c++)
          parts.push({ geo: new THREE.BoxGeometry(3.2, .14, 2.2), color: '#1e3345',
            x: -w / 2 + 5 + c * 7, y: h + .5, z: -d / 2 + 5 + r * 8, rx: -.28 });
    }
    if (kind === 'tank') {
      const tx = rr(-w / 4, w / 4);
      for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]])
        parts.push({ geo: new THREE.BoxGeometry(.22, 2.4, .22), color: '#4a3f32', x: tx + lx, y: h + 1.2, z: lz });
      parts.push({ geo: new THREE.CylinderGeometry(1.7, 1.7, 3, 12), color: '#8a6a48', x: tx, y: h + 2.4, z: 0 });
      parts.push({ geo: new THREE.ConeGeometry(1.9, .9, 12), color: '#6e5138', x: tx, y: h + 4.35, z: 0 });
    }
  }
  if (parts.length) {
    const m = new THREE.Mesh(colored(parts), VCOL());
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
}
function hvac(g, w, d, h, n = 3) {
  n = Math.ceil(n * DETAIL.f);
  for (let i = 0; i < n; i++) {
    const hw = rr(2, 3.5), hd = rr(2, 3.5), hx = rr(-w / 2 + 4, w / 2 - 4), hz = rr(-d / 2 + 4, d / 2 - 4);
    g.add(box(hw, rr(1, 1.8), hd, mat('#8b9094'), hx, h, hz));
    g.add(cyl(.3, .3, .5, mat('#6d7276'), hx, h + 1.2, hz, 10));
  }
  // vent pipes + skylight
  g.add(cyl(.14, .14, 1.4, mat('#a8adb0'), rr(-w / 3, w / 3), h, rr(-d / 3, d / 3), 8));
  g.add(box(rr(2, 4), .3, rr(1.5, 2.5), mat('#c4cdd2', { roughness: .4 }),
    rr(-w / 4, w / 4), h, rr(-d / 4, d / 4)));
}
function door(g, w, h, x, z, ry = 0, color = '#2c3a42', o = {}) {
  const d = box(w, h, .4, mat(color, { roughness: .35, metalness: .3 }), x, 0, z);
  d.rotation.y = ry; g.add(d);
  if (o.recess) { // dark niche the leaf sits in — reads as a true door recess
    const rc = box(w + .9, h + .6, .12, mat('#151b20'), x, -.05, z - .14);
    rc.rotation.y = ry; g.add(rc);
  }
  // frame + transom + step + handles
  const fr = box(w + .5, h + .3, .25, mat('#d9d5cc'), x, 0, z - .1);
  fr.rotation.y = ry; fr.position.z = z; g.add(fr);
  d.position.z = z + .12;
  g.add(box(w + 1.2, .25, 1, mat('#9aa0a3'), x, 0, z + .5));
  if (o.canopy) {  // flat hood on diagonal brackets — portico hint over the entry
    g.add(box(w + 1.9, .24, 1.5, mat(o.canopyC || '#4a5560'), x, h + .5, z + .55));
    for (const sx of [-1, 1]) {
      const br = box(.1, .1, 1.1, mat('#2e3236'), x + sx * (w / 2 + .55), 0, 0);
      br.rotation.x = .5; br.position.y = h + .2; br.position.z = z + .35;
      g.add(br);
    }
  }
  if (o.portico) { // column pair + entablature slab — true entry portico
    const PH = h + .9, PC = o.porticoC || '#e3ded2';
    for (const sx of [-1, 1]) {
      g.add(cyl(.1, .13, PH, mat(PC), x + sx * (w / 2 + .8), 0, z + 1.6, 10));
      g.add(box(.34, .3, .34, mat(PC), x + sx * (w / 2 + .8), PH, z + 1.6));
      g.add(box(.4, .24, .4, mat(PC), x + sx * (w / 2 + .8), 0, z + 1.6));
    }
    g.add(box(w + 2.4, .42, 2.2, mat(PC), x, PH + .15, z + .95));
  }
}
const awnCache = new Map();
function awningMat(color, striped) {
  const k = color + striped;
  if (!awnCache.has(k))
    awnCache.set(k, striped
      ? new M({ map: awningTexture(color), roughness: .8 })
      : mat(color));
  return awnCache.get(k);
}
function awning(g, w, x, y, z, color = '#7a2e2e', striped = true, posts = false) {
  const m = awningMat(color, striped);
  const a = box(w, .22, 2.3, m, x, y, z);
  a.rotation.x = .18; g.add(a);
  // valance
  const v = box(w, .5, .1, m, x, y - .35, z + 1.05);
  g.add(v);
  if (posts)  // sidewalk-canopy posts at the drop edge
    for (const sx of [-1, 1])
      g.add(cyl(.06, .08, y - .55, mat('#3a3e42'), x + sx * (w / 2 - .3), 0, z + .95, 8));
}
let _garageDoorM = null;
function garageDoorMat() {
  if (!_garageDoorM) _garageDoorM = new M({ map: garageDoorTexture(), roughness: .7 });
  return _garageDoorM;
}
/* shared material for every house window pane — glows warm at dusk.
   vertexColors so the tint variety survives the merge. */
const GLASSM = new M({ vertexColors: true, roughness: .28, metalness: .1,
  emissive: new THREE.Color('#ffbe6e'), emissiveIntensity: 0 });
GLASSM.userData.lit = true;

/* 3D window unit for houses: trim + glass + optional shutters (vertex-colored → merges globally) */
function houseWindow(parts, x, y, z, { w = 1.7, h = 1.9, shutters = true, ry = 0 } = {}, glass) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const T = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const push = (geo, color, lx, y0, lz, extra = {}) => {
    const [wx, wz] = T(lx, lz);
    parts.push({ geo, color, x: wx, y: y0, z: wz, ry, ...extra });
  };
  push(new THREE.BoxGeometry(w + .3, h + .3, .12), '#f0ece0', 0, y, 0);            // trim
  if (glass) {
    const [wx, wz] = T(0, .02);
    glass.push({ geo: new THREE.BoxGeometry(w, h, .14), color: '#8fb0c2',
      x: wx, y, z: wz, ry });
  } else {
    push(new THREE.BoxGeometry(w, h, .14), '#33424e', 0, y, .02);                  // glass
  }
  push(new THREE.BoxGeometry(w * .44, h * .44, .15), '#9db6c4', -w * .24, y + h * .24, .03);
  push(new THREE.BoxGeometry(w * .44, h * .44, .15), '#87a2b2', w * .24, y + h * .24, .03);
  push(new THREE.BoxGeometry(w + .5, .14, .3), '#e5e0d4', 0, y - h / 2 - .1, .08); // sill
  if (shutters) {
    push(new THREE.BoxGeometry(.42, h + .1, .1), pick(['#3e5a44', '#5a3e34', '#2e4054', '#424a52']),
      -w / 2 - .35, y, .02);
    push(new THREE.BoxGeometry(.42, h + .1, .1), parts[parts.length - 1].color, w / 2 + .35, y, .02);
  }
}

/* ================== BUILDERS (return Group centered at 0,0) ================== */

function hospital(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  // podium
  const pod = box(w, 12, d, null, 0, 0, 0);
  pod.material = wallMats(facadeMaps({ base: '#cfd6da', cols: 12, rows: 2, storefront: true, band: '#9aa5ab' }), mat('#7d858a'));
  g.add(pod);
  // tower with setbacks — two stacked slabs
  const tw = w * .55, td = d * .62;
  const t1h = s.h * .62, t2h = s.h - t1h;
  const tower = box(tw, t1h, td, null, -w * .12, 12, -d * .08);
  tower.material = wallMats(glassFacadeMaps({ rows: 9, cols: 11, litRatio: .15 }), mat('#aab3b8'));
  g.add(tower);
  const t2 = box(tw * .72, t2h, td * .8, null, -w * .12 - tw * .06, 12 + t1h, -d * .08);
  t2.material = wallMats(glassFacadeMaps({ rows: 4, cols: 8, litRatio: .18, tint: '#8fb4c6' }), mat('#9aa4a9'));
  g.add(t2);
  parapet(g, tw, td, t1h + 12, { style: 'stepped' }); hvac(g, tw, td, t1h + 12, 4);
  parapet(g, tw * .72, td * .8, 12 + s.h, { ph: 1.4 });
  clutter(g, w, d, 12, { solar: false });   // podium roof clutter around heli
  winDressMesh(g, w, d, 12, { rows: 2, cols: 12, storefront: true, faces: 'fbs',
    transom: true, fins: true, reveal: true });
  storefrontKitMesh(g, w, d, 12, { cols: 12, faces: 'fbs' });
  // podium roof edge band
  g.add(box(w + .6, .5, d + .6, mat('#8a949a'), 0, 12, 0));
  // red cross on tower (front + side)
  const ct = crossTexture();
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new M({ map: ct }));
  cross.position.set(-w * .12 + tw / 2 + .3, 12 + t1h * .55, -d * .08); cross.rotation.y = Math.PI / 2;
  g.add(cross);
  const cross2 = cross.clone(); cross2.rotation.y = 0; cross2.position.set(-w * .12, 12 + t1h * .55, -d * .08 + td / 2 + .3);
  g.add(cross2);
  sign(g, 'HAVENBROOK GENERAL', w * .7, 10.4, d / 2 + .3, { bg: '#b03a2e', font: 'bold 44px Arial' });
  // ER canopy + curved drive
  const can = box(32, .9, 15, mat('#b03a2e'), -w * .3, 5.6, d / 2 + 8);
  g.add(can);
  g.add(box(32, .18, 15.6, mat('#e8e2d4'), -w * .3, 6.4, d / 2 + 8));
  [-w * .3 - 13, -w * .3 + 13].forEach(px => g.add(cyl(.42, .42, 5.6, mat('#6d7276'), px, 0, d / 2 + 14)));
  sign(g, 'EMERGENCY', 18, 6.9, d / 2 + 15.2, { bg: '#b03a2e', font: 'bold 40px Arial' });
  // ambulance bay doors
  for (let i = 0; i < 3; i++)
    g.add(box(5.4, 4.6, .5, mat('#d7dde0'), -w * .42 + i * 7, 0, d / 2 + .2));
  // helipad on podium corner
  const heli = cyl(7, 7, .5, mat('#3d4a42'), w * .32, 12, -d * .28, 24);
  g.add(heli);
  const hT = signTexture('H', { bg: '#3d4a42', fg: '#ffd23e', w: 64, h: 64, font: 'bold 48px Arial', border: false });
  const hp = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new M({ map: hT }));
  hp.rotation.x = -Math.PI / 2; hp.position.set(w * .32, 12.6, -d * .28); g.add(hp);
  // heli ring lights
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    g.add(cyl(.12, .12, .25, mat('#ffd23e', { emissive: '#ffd23e', emissiveIntensity: .8 }),
      w * .32 + Math.cos(a) * 6.2, 12.5, -d * .28 + Math.sin(a) * 6.2, 6));
  }
  /* sprint-03 hero kit (contract A1) — helipad detail + ER drop-off */
  let _hp = g.children.length;
  const hring = new THREE.Mesh(new THREE.TorusGeometry(8.2, .14, 6, 48), mat('#d4b23a'));
  hring.rotation.x = Math.PI / 2; hring.position.set(w * .32, 12.58, -d * .28);
  hring.castShadow = true; g.add(hring);
  for (const [bx, bz] of [[6.2, 6.2], [-6.2, 6.2], [6.2, -6.2], [-6.2, -6.2]])
    g.add(box(1.7, .14, .45, mat('#ffd23e'), w * .32 + bx, 12.5, -d * .28 + bz));
  // windsock — uTime-animated cloth (declared animation path; freezes at rest
  // because tickWorld pins uTime=0 under ?freeze=1). No new clock.
  g.add(cyl(.07, .09, 4.6, mat('#7d868c'), w * .32 + 8.8, 12, -d * .28 + 6.6, 8));
  const sock = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.05, 12, 4), flagMaterial('#e8762c'));
  sock.position.set(w * .32 + 8.8 + 1.45, 16.2, -d * .28 + 6.6);
  sock.castShadow = true; sock.userData.dynamic = true; g.add(sock);
  heroLeaf('hospital', 'helipadKit', g.children.length - _hp, [s.x + w * .32, s.z - d * .28]);
  // ER drop-off: forecourt paving + bollard row + canopy fascia + door planters
  _hp = g.children.length;
  const fc = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), mat('#8f897d', { roughness: .98 }));
  fc.rotation.x = -Math.PI / 2; fc.position.set(-w * .3, .36, d / 2 + 7); fc.receiveShadow = true;
  g.add(fc);
  for (let i = 0; i < 7; i++)
    g.add(cyl(.16, .16, 1.05, mat('#3a4a55'), -w * .3 - 13.5 + i * 4.5, .28, d / 2 + 12.6, 8));
  sign(g, 'AMBULANCE  DROP-OFF', 15, 4.6, d / 2 + 15.6, { bg: '#b03a2e', font: 'bold 42px Arial' });
  for (const px of [-w * .42 - 3, -w * .42 + 16.5]) {
    g.add(cyl(.55, .65, .75, mat('#6a5138'), px, .28, d / 2 + 1.4, 10));
    g.add(cyl(.45, .34, .95, mat('#3f6b3a'), px, 1.03, d / 2 + 1.4, 8));
  }
  heroLeaf('hospital', 'dropoff', g.children.length - _hp, [s.x - w * .3, s.z + d / 2 + 8]);
  return g;
}

function medhall(s) { // university main hall — landmark campus anchor
  const g = new THREE.Group();
  const { w, d } = s;
  const maps = facadeMaps({ base: '#8d4a38', rows: Math.max(3, Math.round(s.h / 4)),
    cols: Math.max(6, Math.round(w / 8)), win: '#2c3e50', brickLines: true });
  const trim = mat('#e8e2d4'), roofM = M_ROOFGRAY(w / 7, d / 7, '#4a5560');
  const main = box(w, s.h, d, null); main.material = wallMats(maps, roofM); g.add(main);
  const roof = gableRoof(w, 7, d, roofM); roof.position.y = s.h; g.add(roof);
  // end pavilions — projecting wings read as a palatial institution
  for (const sx of [-1, 1]) {
    const pw = 18, ph = s.h * .78;
    const pav = box(pw, ph, d + 7, null, sx * (w / 2 - pw / 2), 0, 0);
    pav.material = wallMats(facadeMaps({ base: '#8d4a38', rows: 3,
      cols: 3, win: '#2c3e50', brickLines: true }), roofM); g.add(pav);
    const proof = hipRoof(pw + 3, 4.5, d + 10, roofM);
    proof.position.set(sx * (w / 2 - pw / 2), ph, 0); g.add(proof);
    for (const sz of [-1, 1])
      g.add(box(1.4, ph, 1.4, trim, sx * (w / 2 - .9), 0, sz * (d / 2 + 2.6)));
  }
  // belt cornice + raised parapet band over the main block
  g.add(box(w + .6, 1.0, d + .6, trim, 0, s.h - 1.1, 0));
  // clock tower — taller, crowned with a domed cupola
  const tw = 14, th = s.h + 22;
  const tb = box(tw, th, tw, null, 0, 0, 0);
  tb.material = wallMats(maps, roofM); g.add(tb);
  g.add(box(tw + 2, 1.0, tw + 2, trim, 0, th - 6.5, 0));         // belfry cornice
  const cap = hipRoof(tw + 4, 5.5, tw + 4, roofM); cap.position.y = th + .1; g.add(cap);
  const drum = cyl(3.6, 4.2, 3.4, trim, 0, th + 4.6, 0, 12); g.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mat('#3d6b8a', { metalness: .35, roughness: .4 }));
  dome.position.y = th + 8; g.add(dome);
  g.add(cyl(.14, .3, 3.4, mat('#d4ac0d', { metalness: .6, roughness: .4 }), 0, th + 12.2, 0, 8));
  const cf = clockTexture();
  [[0, 0, tw / 2 + .2, 0], [0, 0, -tw / 2 - .2, Math.PI], [tw / 2 + .2, 0, 0, Math.PI / 2], [-tw / 2 - .2, 0, 0, -Math.PI / 2]]
    .forEach(([ox, , oz, ry]) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), new M({ map: cf }));
      f.position.set(ox, th - 3.4, oz); f.rotation.y = ry; g.add(f);
    });
  // corner quoins (limestone strips)
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(box(1.6, s.h, 1.6, trim, sx * (w / 2 - .5), 0, sz * (d / 2 - .5)));
  // entry colonnade — seven columns under a full entablature
  for (let i = -3; i <= 3; i++) {
    g.add(cyl(.7, .8, 7, trim, i * 5, 0, d / 2 + 2.4));
    g.add(box(1.6, .5, 1.6, trim, i * 5, 6.8, d / 2 + 2.4));   // capitals
    g.add(box(1.8, .5, 1.8, trim, i * 5, 0, d / 2 + 2.4));     // bases
  }
  const ent = box(34, 1.2, 6, trim, 0, 7, d / 2 + 2.4); g.add(ent);
  const ped = gableRoof(34, 4, 6, roofM); ped.position.set(0, 8.2, d / 2 + 2.4); g.add(ped);
  sign(g, 'SCHOOL OF MEDICINE', w * .5, s.h - 3.4, d / 2 + .3, { bg: '#4a3428', font: 'bold 40px Georgia' });
  // window strips
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) < 2) continue;
    g.add(box(6, s.h - 4, .6, mat('#2c3e50', { roughness: .35 }), i * 11, 3, d / 2 + .1));
  }
  // sills/lintels on back + flanks (front already carries 3D window strips)
  winDressMesh(g, w, d, s.h, { rows: Math.max(3, Math.round(s.h / 4)),
    cols: Math.max(6, Math.round(w / 8)), faces: 'bs', trim: '#e8e2d4',
    transom: true, spandrel: true, fins: true, reveal: true });
  door(g, 8, 6.4, 0, d / 2 + .4, 0, '#2c3a42', { recess: true });
  // entry stairs
  g.add(box(12, .4, 2.4, mat('#b9b2a2'), 0, 0, d / 2 + 5));
  g.add(box(11, .4, 1.6, mat('#c4bcac'), 0, .4, d / 2 + 4.6));
  return g;
}

function campusb(s) { // campus brick academic block
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = M_ROOFGRAY(w / 7, d / 7, '#4d5760');
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: '#93503d', win: '#2a3844',
    rows: 3, cols: Math.round(w / 7), trim: '#e8e2d4' }), roofM);
  g.add(b);
  const r = gableRoof(w, 4.5, d, roofM); r.position.y = s.h; g.add(r);
  g.add(box(w * .3, 1.2, .8, mat('#e8e2d4'), 0, s.h * .55, d / 2 + .2)); // limestone band
  winDressMesh(g, w, d, s.h, { rows: 3, cols: Math.round(w / 7), faces: 'fbs',
    trim: '#e8e2d4', transom: true, spandrel: true, fins: true, reveal: true });
  door(g, 6, 4.5, 0, d / 2 + .3, 0, '#2c3a42', { recess: true, portico: true,
    porticoC: '#e8e2d4' });
  // steps + hedges flanking entry
  g.add(box(9, .35, 2, mat('#b9b2a2'), 0, 0, d / 2 + 1.4));
  return g;
}

function medoffice(s, opts = {}) {
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = flatRoofMat();
  const maps = facadeMaps({ base: opts.base || '#c9bda6', win: '#2b3b46',
    rows: Math.max(2, Math.round(s.h / 3.4)), cols: Math.round(w / 6), storefront: true,
    signText: opts.sign || null, signBg: opts.signBg || '#3b5568' });
  const b = box(w, s.h, d, null); b.material = wallMats(maps, roofM); g.add(b);
  parapet(g, w, d, s.h); hvac(g, w, d, s.h, 2);
  clutter(g, w, d, s.h, { solar: R() < .4 });
  facadeDress(g, w, d, s.h, { pilasters: R() < .5, courses: s.h > 12 });
  winDressMesh(g, w, d, s.h, { rows: Math.max(2, Math.round(s.h / 3.4)),
    cols: Math.round(w / 6), storefront: true, faces: 'fbs',
    transom: true, spandrel: true, fins: true, reveal: true,
    blade: { color: opts.signBg || '#3b5568' } });
  storefrontKitMesh(g, w, d, s.h, { cols: Math.round(w / 6), faces: 'fbs' });
  if (s.h > 8.5 && R() < .65) fireEscapeMesh(g, w, d, s.h, { side: R() < .5 ? -1 : 1 });
  door(g, 5, 4.2, 0, d / 2 + .2, 0, '#2c3a42', { recess: true, portico: true });
  awning(g, w * .8, 0, 4.6, d / 2 + 1.2, opts.awn || '#41618a', true, s.num ? true : false);
  // sprint-03 entrance dress: awning posts + step + flanking planters (named offices only)
  if (s.num) {
    const _mo = g.children.length;
    for (const px of [-w * .32, w * .32]) g.add(cyl(.18, .18, 4.4, mat('#d9d2c0'), px, 0, d / 2 + 1.5));
    g.add(box(6.5, .35, 2.7, mat('#9a927c'), 0, 0, d / 2 + 1.5));
    for (const px of [-w * .42, w * .42]) {
      g.add(cyl(.5, .6, .7, mat('#6a5138'), px, 0, d / 2 + 1.2, 10));
      g.add(cyl(.42, .34, .9, mat('#3f6b3a'), px, .7, d / 2 + 1.2, 8));
    }
    heroEntrance(s, g.children.length - _mo);
  }
  return g;
}

function ems(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: '#a8453a', rows: 1, cols: 6, brickLines: true }), flatRoofMat());
  g.add(b);
  parapet(g, w, d, s.h); facadeDress(g, w, d, s.h, { cornice: true });
  winDressMesh(g, w, d, s.h, { rows: 1, cols: 6, faces: 'b', reveal: true });   // front face is all bay doors
  // 3 garage bays
  for (let i = -1; i <= 1; i++) {
    const door = box(7, 6, .6, new M({ map: garageDoorTexture(), color: '#d7dde0' }), i * 9, 0, d / 2 + .1);
    g.add(door);
    g.add(box(7, .5, .7, mat('#b03a2e'), i * 9, 6, d / 2 + .15));
    g.add(box(.3, 6.5, .5, mat('#d9d5cc'), i * 9 + 3.6, 0, d / 2 + .12));
  }
  sign(g, 'HARTLINE EMS', w * .8, s.h - 1.4, d / 2 + .3, { bg: '#8e2f26', font: 'bold 44px Arial' });
  // small tower + antenna + beacon
  g.add(box(5, s.h + 5, 5, mat('#8e2f26'), -w / 2 + 3, 0, -d / 2 + 3));
  g.add(cyl(.08, .08, 8, mat('#333'), -w / 2 + 3, s.h + 5, -d / 2 + 3));
  g.add(cyl(.18, .18, .4, mat('#c0392b', { emissive: '#c0392b', emissiveIntensity: .9 }),
    -w / 2 + 3, s.h + 13, -d / 2 + 3, 8));
  return g;
}

function senior(s) { // assisted living — U-shaped courtyard
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = M_ROOFCLAY(8, 8, '#8a6a55');
  const mk = (ww, dd, x, z) => {
    const b = box(ww, s.h, dd, null, x, 0, z);
    b.material = wallMats(facadeMaps({ base: '#b98a68', win: '#33414c',
      rows: 4, cols: Math.round(ww / 7), band: '#e8ddc8', trim: '#e8ddc8' }), roofM);
    g.add(b);
    const r = hipRoof(ww, 5, dd, roofM); r.position.set(x, s.h, z); g.add(r);
  };
  mk(w, d * .34, 0, -d * .33);            // back wing — south face at z=-d*.16
  mk(w * .3, d * .61, -w * .35, d * .145); // west wing abuts it (no overlap)
  mk(w * .3, d * .61, w * .35, d * .145);  // east wing abuts it
  // porte-cochère
  g.add(box(14, .7, 10, roofM, 0, 5.2, -d * .33 + d * .17 + 4));
  g.add(cyl(.35, .35, 5.2, mat('#e8e2d4'), -6, 0, -d * .33 + d * .17 + 7));
  g.add(cyl(.35, .35, 5.2, mat('#e8e2d4'), 6, 0, -d * .33 + d * .17 + 7));
  sign(g, 'HALCYON HOUSE', w * .55, s.h - 2, -d * .33 + d * .17 + .4, { bg: '#5d4037', font: 'bold 40px Georgia' });
  // courtyard garden beds
  for (let i = -1; i <= 1; i++)
    g.add(box(6, .5, 3, mat('#5d7a4a'), i * 9, 0, d * .22));
  return g;
}

function hospice(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = M_ROOFGRAY(w / 6, d / 6, '#5d6d5e');
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: '#e3d5b8', rows: 1, cols: 9, win: '#3a4a55', brickLines: false }), roofM);
  g.add(b);
  winDressMesh(g, w, d, s.h, { rows: 1, cols: 9, faces: 'fb', trim: '#efe8da',
    transom: true, reveal: true });
  const r = gableRoof(w, 5.5, d, roofM); r.position.y = s.h; g.add(r);
  // porch
  g.add(box(w * .7, .5, 5, mat('#a58a68'), 0, .4, d / 2 + 2.5));
  for (let i = -3; i <= 3; i++) g.add(cyl(.28, .28, 3.6, mat('#efe8da'), i * w * .09, .6, d / 2 + 4));
  g.add(box(w * .7, .4, 5.5, roofM, 0, 4.4, d / 2 + 2.5));
  sign(g, 'STILLPOINT HOSPICE', w * .6, s.h - 2, d / 2 + .4, { bg: '#4d6155', font: 'bold 38px Georgia' });
  return g;
}

function civicb(s, signTxt) {
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = flatRoofMat();
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: '#b3a78f', win: '#2c3a44',
    rows: Math.max(2, Math.round(s.h / 3.6)), cols: Math.round(w / 6.5), band: '#8f8468', trim: '#ddd6c0' }), roofM);
  g.add(b);
  parapet(g, w, d, s.h, { style: 'stepped', ph: rr(1.0, 1.4) });
  facadeDress(g, w, d, s.h, { cornice: true, pilasters: true, downspouts: false });
  winDressMesh(g, w, d, s.h, { rows: Math.max(2, Math.round(s.h / 3.6)),
    cols: Math.round(w / 6.5), faces: 'fbs', trim: '#ddd6c0',
    transom: true, spandrel: true, fins: true, reveal: true,
    quoins: { color: '#ddd6c0' } });
  // entry steps + columns
  for (let i = -1; i <= 1; i++) {
    g.add(cyl(.5, .55, 5, mat('#d9d2c0'), i * 4, 0, d / 2 + 1.8));
    g.add(box(1.2, .4, 1.2, mat('#d9d2c0'), i * 4, 5, d / 2 + 1.8));
  }
  g.add(box(14, 1, 4, mat('#d9d2c0'), 0, 5, d / 2 + 1.8));
  g.add(box(10, .6, 3, mat('#9a927c'), 0, 0, d / 2 + 2.5));
  g.add(box(11, .3, 2, mat('#aaa18a'), 0, .6, d / 2 + 2.6));
  if (signTxt || s.name) sign(g, (signTxt || s.name).toUpperCase(), w * .6, s.h - 2, d / 2 + .3, { bg: '#5b5340', font: 'bold 34px Georgia' });
  // flag (waves via shader — needs segments to deform)
  g.add(cyl(.1, .12, 11, mat('#888'), w / 2 + 4, 0, d / 2 + 4));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6, 14, 5), flagMaterial('#b3423a'));
  flag.position.set(w / 2 + 6.3, 9.6, d / 2 + 4); flag.castShadow = true;
  flag.userData.dynamic = true;
  g.add(flag);
  return g;
}

const SHOP_STYLES = [
  { sign: 'HAVEN BAKERY',      signBg: '#7a4b26', awn: '#8a5a30' },
  { sign: 'PAGE & SPINE BOOKS',signBg: '#2e4a5f', awn: '#3e5a44' },
  { sign: 'MAIN ST BARBER',    signBg: '#42302a', awn: '#7a2e2e' },
  { sign: 'GOLDEN WOK',        signBg: '#8e2f26', awn: '#b3543a' },
  { sign: 'PEDAL CYCLES',      signBg: '#2e5b46', awn: '#41618a' },
  { sign: 'CORNER DELI',       signBg: '#4a5d3a', awn: '#6b7a3a' },
  { sign: 'LOTUS YOGA',        signBg: '#5d4a72', awn: '#7a5c8e' },
  { sign: 'BLOOM FLORIST',     signBg: '#7a3a52', awn: '#8e4a62' },
  { sign: 'HAVEN LAUNDRY',     signBg: '#3a5a78', awn: '#4a6a88' },
  { sign: 'PET PARLOR',        signBg: '#6a4a2e', awn: '#7a5a3e' },
];
let _shopIdx = 0;
function storefront(s, style = {}) {
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = mat('#565c60');
  const st = style.sign ? style : SHOP_STYLES[_shopIdx++ % SHOP_STYLES.length];
  const name = s.name || st.sign;   // a named facility keeps its real name on the facade
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: style.base || pick(['#c4b49a', '#b8a894',
    '#cbb8a0', '#bfae92', '#9a6a52', '#7d8894', '#8c7f6e']),
    rows: 1, cols: 4, storefront: true, signText: name, signBg: st.signBg || '#33526b',
    brickLines: R() < .5, trim: '#ddd6c8' }), flatRoofMat());
  g.add(b);
  parapet(g, w, d, s.h, R() < .4 ? { style: 'pediment' } : {});
  facadeDress(g, w, d, s.h, { cornice: true, pilasters: R() < .45 });
  winDressMesh(g, w, d, s.h, { rows: 1, cols: 4, storefront: true, faces: 'fbs',
    trim: '#ddd6c8', transom: true, reveal: true,
    quoins: true, blade: { color: s.signBg || '#b8433a' } });
  storefrontKitMesh(g, w, d, s.h, { cols: 4, faces: 'fbs' });
  if (s.h > 8.5 && R() < .7) fireEscapeMesh(g, w, d, s.h, { side: R() < .5 ? -1 : 1 });
  awning(g, w * .85, 0, 4.4, d / 2 + 1.1, st.awn || '#3f5e78', true, true);
  door(g, 4.4, 4, 0, d / 2 + .25, 0, '#2c3a42', { recess: true });
  // planters flanking door
  g.add(box(1.4, .8, 1.4, mat('#6e5138'), -w * .3, 0, d / 2 + 1));
  g.add(box(1.4, .8, 1.4, mat('#6e5138'), w * .3, 0, d / 2 + 1));
  return g;
}

function bigbox(s, brand) {
  const g = new THREE.Group();
  const { w, d } = s;
  const isTarget = brand === 'target';
  const body = box(w, s.h, d, null);
  body.material = wallMats(
    facadeMaps({ base: isTarget ? '#d8d3c8' : pick(['#cbb9a0', '#a8a090', '#8f8a7c',
      '#b5a894']), rows: 1, cols: 10, storefront: true, brickLines: false }),
    flatRoofMat());
  g.add(body);
  parapet(g, w, d, s.h, { ph: rr(1.2, 1.8) }); hvac(g, w, d, s.h, 8);
  clutter(g, w, d, s.h, { solar: true });
  facadeDress(g, w, d, s.h, { pilasters: true, courses: false });
  winDressMesh(g, w, d, s.h, { rows: 1, cols: 10, storefront: true, faces: 'fbs',
    transom: true, fins: true, reveal: true });
  storefrontKitMesh(g, w, d, s.h, { cols: 10, faces: 'fbs' });
  if (isTarget) {   // anchor store — Masterson's navy livery
    const bc = '#1f3a5f';
    g.add(box(w, 2.6, .8, mat(bc), 0, s.h - 4, d / 2 + .2));
    sign(g, "MASTERSON'S", w * .3, s.h - 8.4, d / 2 + .4, { bg: bc, font: 'bold 60px Georgia' });
    for (let i = -3; i <= 3; i++) {
      const sph = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 12), mat('#c8a34e', { roughness: .4 }));
      sph.position.set(i * 6, .8, d / 2 + 4); sph.castShadow = true; g.add(sph);
    }
    // cart corrals in front
    for (const cx of [-18, 18]) {
      g.add(box(6, 1.1, .15, mat(bc), cx, .4, d / 2 + 10));
      g.add(box(.15, 1.1, 4, mat(bc), cx - 3, .4, d / 2 + 8));
      g.add(box(.15, 1.1, 4, mat(bc), cx + 3, .4, d / 2 + 8));
    }
  } else {
    sign(g, s.name.toUpperCase(), w * .5, s.h - 4, d / 2 + .3, { bg: '#2e6b46', font: 'bold 48px Georgia' });
    awning(g, w * .4, 0, 5.4, d / 2 + 1.4, '#2e6b46', false);
  }
  door(g, 10, 5.4, 0, d / 2 + .3);
  // sprint-03 entrance: canopy + branded fascia + posts over the doors
  const _be = g.children.length;
  const bc2 = s.brand === 'target' ? '#1f3a5f' : '#2e6b46';
  g.add(box(w * .36, .55, 5, mat('#3f4750'), 0, 6.3, d / 2 + 2.4));
  g.add(box(w * .36 + .5, .25, 5.6, mat(bc2), 0, 6.85, d / 2 + 2.4));
  for (const px of [-w * .15, w * .15]) g.add(cyl(.3, .3, 6.3, mat('#8a9094'), px, 0, d / 2 + 4.4));
  heroEntrance(s, g.children.length - _be);
  // loading dock at back
  g.add(box(16, 1.4, 6, mat('#6d7276'), -w / 4, 0, -d / 2 - 3));
  g.add(box(5, 3.4, .4, mat('#8a9094'), -w / 4, 1.4, -d / 2 - .1));
  return g;
}

function mall(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const body = box(w, s.h, d, null);
  body.material = wallMats(
    facadeMaps({ base: '#b9a48f', rows: 2, cols: 14, storefront: true, band: '#8a7358', brickLines: false }),
    flatRoofMat());
  g.add(body);
  parapet(g, w, d, s.h, { ph: rr(1.1, 1.7) }); hvac(g, w, d, s.h, 10);
  clutter(g, w, d, s.h, { solar: true, skylights: false });
  facadeDress(g, w, d, s.h, { pilasters: false });
  winDressMesh(g, w, d, s.h, { rows: 2, cols: 14, storefront: true, faces: 'fbs',
    transom: true, fins: true, reveal: true });
  storefrontKitMesh(g, w, d, s.h, { cols: 14, faces: 'fbs' });
  // clerestory spine on roof
  g.add(box(w * .6, 3, 8, mat('#8a8070'), 0, s.h, 0));
  const skyl = box(w * .58, 2.2, 7, new M({ color: '#9fc3d4', roughness: .2, metalness: .4 }), 0, s.h + .5, 0);
  g.add(skyl);
  // central entrance atrium
  const atr = box(34, s.h + 6, 18, null, 0, 0, -d / 2 - 6);
  atr.material = wallMats(glassFacadeMaps({ rows: 6, cols: 6, tint: '#8fb6c9' }), mat('#6d6152'));
  g.add(atr);
  const ar = hipRoof(36, 6, 20, mat('#6d6152')); ar.position.set(0, s.h + 6, -d / 2 - 6); g.add(ar);
  sign(g, 'HAVENBROOK COMMONS', w * .4, s.h + 2.4, -d / 2 - 15.1, { bg: '#4f4231', font: 'bold 40px Georgia' });
  sign(g, 'FOOD COURT', 30, s.h - 3, 0, { bg: '#6b5334', font: 'bold 40px Arial', ry: Math.PI / 2, x: w / 2 + .3 });
  door(g, 12, 6, 0, -d / 2 - 15.2, Math.PI);
  // entry columns + planters
  for (const px of [-14, -5, 5, 14])
    g.add(cyl(.5, .5, 7, mat('#d9d2c0'), px, 0, -d / 2 - 13));
  /* sprint-03 portal gesture (contract A4): twin entry pylons framing the
     atrium + cantilevered drop-off canopy + marquee over the drive lane */
  const _mp = g.children.length;
  const pm = facadeMaps({ base: '#8a7358', rows: 5, cols: 2, brickLines: false, band: '#d9d2c0' });
  for (const px of [-22, 22]) {
    const py = box(7, s.h + 9, 7, null, px, 0, -d / 2 - 10);
    py.material = wallMats(pm, flatRoofMat());
    g.add(py);
    g.add(box(7.8, .8, 7.8, mat('#4f4231'), px, s.h + 9, -d / 2 - 10));
  }
  g.add(box(48, .9, 10, mat('#4f4231'), 0, 6.9, -d / 2 - 21));
  g.add(box(48.5, .3, 10.5, mat('#d9d2c0'), 0, 7.8, -d / 2 - 21));
  for (const px of [-21, -7, 7, 21]) g.add(cyl(.42, .42, 6.9, mat('#8a7358'), px, 0, -d / 2 - 24.5));
  sign(g, 'NORTH ENTRANCE', 34, 7.4, -d / 2 - 26.6, { bg: '#4f4231', font: 'bold 46px Arial' });
  heroLeaf('mallPortal', null, g.children.length - _mp, [s.x, s.z - s.d / 2 - 21]);
  return g;
}

function museum(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const b = box(w * .7, s.h, d, null, -w * .12, 0, 0);
  b.material = wallMats(facadeMaps({ base: '#a9b2b8', rows: 2, cols: 8, brickLines: false }), flatRoofMat());
  g.add(b);
  facadeDress(g, w * .7, d, s.h, { cornice: false, pilasters: false });
  const prow = box(w * .3, s.h * .75, d * .8, null, w * .32, 0, 0);
  prow.material = wallMats(glassFacadeMaps({ rows: 4, cols: 5, tint: '#9fc3d4' }), mat('#788086'));
  prow.rotation.y = .3; g.add(prow);
  const rot = cyl(9, 9, s.h * .8, mat('#c4cdd2'), -w * .3, 0, d * .18, 20); g.add(rot);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5d7686', { roughness: .5, metalness: .3 }));
  dome.position.set(-w * .3, s.h * .8, d * .18); dome.castShadow = true; g.add(dome);
  sign(g, 'QUARRY HILL MUSEUM', w * .5, s.h - 3, d / 2 + .3, { bg: '#37474f', font: 'bold 36px Georgia' });
  // entry plaza steps
  g.add(box(16, .4, 4, mat('#b9b2a2'), w * .1, 0, d / 2 + 2));
  // sprint-03 entrance: portico canopy + door + blade over the plaza steps
  const _me = g.children.length;
  for (const px of [-7.4, -2.5, 2.5, 7.4]) g.add(cyl(.26, .26, 5.2, mat('#c4cdd2'), w * .1 + px, .4, d / 2 + 4.2));
  g.add(box(17.5, .5, 5.6, mat('#37474f'), w * .1, 5.6, d / 2 + 2.4));
  sign(g, 'MUSEUM ENTRY', 11, 5.1, d / 2 + 5.4, { bg: '#37474f', font: 'bold 40px Arial' });
  door(g, 7, 4.6, w * .1, d / 2 + .2);
  heroEntrance(s, g.children.length - _me);
  return g;
}

function school(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const roofM = M_ROOFGRAY(9, 9, '#5a6570');
  const mk = (ww, dd, x, z, h) => {
    const b = box(ww, h || s.h, dd, null, x, 0, z);
    b.material = wallMats(facadeMaps({ base: '#c08552', win: '#2f3f4c',
      rows: 2, cols: Math.round(ww / 8), band: '#e8dcc0', trim: '#e8dcc0' }), roofM);
    g.add(b);
    const r = gableRoof(ww, 3.5, dd, roofM); r.position.set(x, h || s.h, z); g.add(r);
  };
  mk(w * .55, d * .4, -w * .18, -d * .26);              // main wing
  mk(w * .34, d * .34, w * .3, -d * .22, s.h + 3);      // gym (taller)
  mk(w * .3, d * .3, -w * .32, d * .28, s.h - 2);       // classroom wing
  sign(g, 'HAVENBROOK UNIFIED', w * .4, s.h - 1.6, -d * .26 + d * .2 + .3, { bg: '#7a4b26', font: 'bold 36px Georgia' });
  // marquee sign by the road
  g.add(box(6, 2.6, .5, mat('#7a4b26'), w * .1, 0, d / 2 + 6));
  const mq = signTexture('HAVENBROOK\nUNIFIED', { bg: '#3a2a18', fg: '#ffd98a', w: 256, h: 96, font: 'bold 30px Arial', border: false });
  const mqp = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2), new M({ map: mq }));
  mqp.position.set(w * .1, 1.7, d / 2 + 6.3); g.add(mqp);
  // flag pole
  g.add(cyl(.1, .13, 12, mat('#999'), w * .18, 0, -d * .26 + d * .2 + 4));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.7, 14, 5), flagMaterial('#2e5b8a'));
  flag.position.set(w * .18 + 2.4, 10.6, -d * .26 + d * .2 + 4); flag.castShadow = true;
  flag.userData.dynamic = true;
  g.add(flag);
  // sprint-03 entrance: canopy + colonnettes over the main door
  const _se = g.children.length;
  const ex = -w * .18, ez = -d * .26 + d * .2;
  g.add(box(12, .45, 4.2, mat('#5a6570'), ex, 5.7, ez + 2.4));
  for (const px of [-5, 5]) g.add(cyl(.28, .28, 5.7, mat('#e8dcc0'), ex + px, 0, ez + 3.9));
  g.add(box(12.5, .2, 4.6, mat('#e8dcc0'), ex, 6.15, ez + 2.4));
  heroEntrance(s, g.children.length - _se);
  door(g, 8, 5, -w * .18, -d * .26 + d * .2 + .2);
  return g;
}

function fastfood(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const b = box(w, s.h, d, null);
  b.material = wallMats(facadeMaps({ base: '#e8dcc4', rows: 1, cols: 4,
    storefront: true, signText: 'PAINTED COYOTE', signBg: '#c0392b', brickLines: false }), mat('#8a4b2d'));
  g.add(b);
  parapet(g, w, d, s.h, { color: '#8a4b2d' });
  facadeDress(g, w, d, s.h, { cornice: true, pilasters: false });
  winDressMesh(g, w, d, s.h, { rows: 1, cols: 4, storefront: true, faces: 'fbs',
    transom: true, reveal: true, blade: { color: '#c0392b' } });
  storefrontKitMesh(g, w, d, s.h, { cols: 4, faces: 'fbs' });
  awning(g, w * .9, 0, 4.2, d / 2 + 1, '#c0392b', true, true);
  // drive-thru canopy on side + menu board
  g.add(box(8, .5, 5, mat('#c0392b'), w / 2 + 5, 4.6, 0));
  g.add(cyl(.25, .25, 4.6, mat('#666'), w / 2 + 8, 0, 2));
  g.add(cyl(.25, .25, 4.6, mat('#666'), w / 2 + 8, 0, -2));
  g.add(box(2.4, 1.6, .2, mat('#3a2a18'), w / 2 + 5, .8, -3.6));
  // sign pole
  g.add(cyl(.25, .25, 12, mat('#555'), w / 2 + 12, 0, d / 2 + 6));
  const st = signTexture('PAINTED\nCOYOTE', { bg: '#c0392b', font: 'bold 34px Arial' });
  const ps = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), new M({ map: st, side: THREE.DoubleSide }));
  ps.position.set(w / 2 + 12, 10, d / 2 + 6); g.add(ps);
  return g;
}

function apartment(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  const maps = facadeMaps({ base: pick(['#b97d5a', '#a87468', '#bfae8e', '#8a5a44',
    '#cfc5a8', '#9aa28c']), win: '#26333d',
    rows: Math.round(s.h / 3.2), cols: Math.round(w / 5.5), litRatio: .2 });
  const b = box(w, s.h, d, null);
  b.material = wallMats(maps, flatRoofMat());
  g.add(b);
  parapet(g, w, d, s.h);
  facadeDress(g, w, d, s.h, { pilasters: false });
  hvac(g, w, d, s.h, 2);
  clutter(g, w, d, s.h, { solar: true, tank: true });
  // balconies with railings — vertex-colored so they merge globally
  const parts = [], gp = [];
  winDress(parts, w, d, s.h, { rows: Math.round(s.h / 3.2), cols: Math.round(w / 5.5),
    faces: 'fbs', transom: true, spandrel: true, fins: true, reveal: true }, gp);
  quoins(parts, w, d, s.h, { color: '#d8cdbb' });
  fireEscape(parts, w, d, s.h, { side: s.x > 0 ? -1 : 1 });
  const cols = Math.round(w / 8);
  for (let i = 0; i < cols; i++) for (let r = 0; r < Math.round(s.h / 3.2); r++) {
    if (R() > .7) continue;
    const bx = -w / 2 + 4 + i * (w - 8) / Math.max(1, cols - 1), by = 2.6 + r * 3.2;
    parts.push({ geo: new THREE.BoxGeometry(2.8, .18, 1.7), color: '#7d8a90', x: bx, y: by, z: d / 2 + .85 });
    for (const sx of [-1.3, 0, 1.3])
      parts.push({ geo: new THREE.BoxGeometry(.07, .9, .07), color: '#4a5154', x: bx + sx, y: by + .45, z: d / 2 + 1.6 });
    parts.push({ geo: new THREE.BoxGeometry(2.7, .07, .07), color: '#4a5154', x: bx, y: by + .9, z: d / 2 + 1.6 });
    parts.push({ geo: new THREE.BoxGeometry(.07, .9, 1.4), color: '#4a5154', x: bx - 1.35, y: by + .45, z: d / 2 + .9 });
    parts.push({ geo: new THREE.BoxGeometry(.07, .9, 1.4), color: '#4a5154', x: bx + 1.35, y: by + .45, z: d / 2 + .9 });
  }
  if (parts.length) {
    const rail = new THREE.Mesh(colored(parts), VCOL());
    rail.castShadow = rail.receiveShadow = true;
    g.add(rail);
  }
  glassMesh(g, gp);
  // recessed lobby + canopy + mailboxes
  door(g, 6, 4.6, 0, d / 2 + .2, 0, '#2c3a42', { recess: true, portico: true,
    porticoC: '#8a939a' });
  g.add(box(8, .4, 3, mat('#5d6d7e'), 0, 4.8, d / 2 + 1.4));
  g.add(cyl(.16, .16, 4.8, mat('#4a5154'), -3.4, 0, d / 2 + 2.6));
  g.add(cyl(.16, .16, 4.8, mat('#4a5154'), 3.4, 0, d / 2 + 2.6));
  return g;
}

/* mid-rise downtown tower with setbacks — fills out the skyline */
function tower(s) {
  const g = new THREE.Group();
  const { w, d, h } = s;
  const glassy = R() < .45;
  const tint = pick(['#7fa6bd', '#8fb4c6', '#6d8ea0', '#9ab4c2']);
  const baseC = pick(['#b8a894', '#a89a88', '#9aa2a8', '#b0a690', '#8f7f6c', '#7a8a94']);
  /* per-tower curtain-wall identity hashed off the lot position — gives each
     glass tower its own frame color / banding without consuming the R()
     stream (a new draw here would reshuffle every seed downstream) */
  const hid = Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453) % 1;
  const frame = ['#c6cfd4', '#b5aa92', '#4a4238', '#39424c', '#7e8890'][Math.floor(hid * 5)];
  const banded = (hid * 7) % 1 < .38;
  // podium (2 floors, storefront)
  const podH = 7;
  const pod = box(w, podH, d, null);
  pod.material = wallMats(facadeMaps({ base: baseC, rows: 1, cols: Math.round(w / 7),
    storefront: true, signText: s.sign || null, signBg: '#2e3f4a' }), flatRoofMat());
  g.add(pod);
  parapet(g, w, d, podH);
  clutter(g, w, d, podH, { skylights: false });
  facadeDress(g, w, d, podH, { pilasters: true });
  winDressMesh(g, w, d, podH, { rows: 1, cols: Math.round(w / 7), storefront: true,
    faces: 'fbs', transom: true, fins: true, reveal: true });
  storefrontKitMesh(g, w, d, podH, { cols: Math.round(w / 7), faces: 'fbs' });
  // shaft(s) — setback tiers
  let y = podH, ww = w * .82, dd = d * .82, cx = 0, cz = -d * .05;
  const tiers = h > 34 ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const th = i === tiers - 1 ? (h - y) : (h - podH) * (i === 0 ? .55 : .32);
    const b = box(ww, th, dd, null, cx, y, cz);
    b.material = glassy
      ? wallMats(glassFacadeMaps({ rows: Math.max(3, Math.round(th / 3)), cols: Math.round(ww / 4), litRatio: .14, tint, frame, banded }), mat('#8a949a'))
      : wallMats(facadeMaps({ base: baseC, rows: Math.max(3, Math.round(th / 3.2)), cols: Math.round(ww / 5), win: '#2b3b46' }), mat('#8a949a'));
    g.add(b);
    parapet(g, ww, dd, y + th);
    // floor shadow band at setback
    if (i < tiers - 1) g.add(box(ww + .4, .5, dd + .4, mat('#6d7276'), cx, y + th, cz));
    y += th; ww *= .8; dd *= .85; cx -= w * .04;
  }
  // mechanical penthouse + antenna + roof clutter
  g.add(box(ww * .6, 3, dd * .6, mat('#7a8288'), cx, y, cz));
  if (s.crown === 'deck') {
    // sprint-03 rooftop aviation deck on the penthouse (contract A3)
    const _tc = g.children.length;
    const rr2 = Math.min(ww, dd) * .36;
    const dkr = new THREE.Mesh(new THREE.TorusGeometry(rr2, .15, 6, 36), mat('#d4b23a'));
    dkr.rotation.x = Math.PI / 2; dkr.position.set(cx, y + 3.15, cz); dkr.castShadow = true;
    g.add(dkr);
    const hdT = signTexture('H', { bg: '#4a5560', fg: '#ffd23e', w: 64, h: 64, font: 'bold 48px Arial', border: false });
    const hd = new THREE.Mesh(new THREE.PlaneGeometry(rr2 * 1.15, rr2 * 1.15), new M({ map: hdT }));
    hd.rotation.x = -Math.PI / 2; hd.position.set(cx, y + 3.08, cz); g.add(hd);
    for (const sx of [-1, 1]) g.add(box(.12, .85, dd * .62, mat('#8a9094'), cx + sx * ww * .3, y + 3, cz));
    g.add(cyl(.06, .1, 3.6, mat('#4a4e52'), cx + ww * .3, y + 3, cz + dd * .3));
    heroCrown('deck', g.children.length - _tc, [s.x, s.z]);
  } else {
    clutter(g, ww, dd, y, { tank: true, skylights: false, solar: false });
    if (R() < .6) g.add(cyl(.1, .14, rr(6, 12), mat('#555'), cx, y + 3, cz));
  }
  // entrance canopy + lobby doors
  g.add(box(10, .5, 4, mat('#3a4a55'), cx, 4.4, cz + dd / 2 + 1.6));
  g.add(cyl(.2, .2, 4.4, mat('#666'), cx - 4, 0, cz + dd / 2 + 3));
  g.add(cyl(.2, .2, 4.4, mat('#666'), cx + 4, 0, cz + dd / 2 + 3));
  door(g, 6, 4.2, cx, cz + dd / 2 + .2);
  return g;
}

function church(s) {
  const g = new THREE.Group();
  const { w = 22, d = 16, h = 9 } = s;
  const roofM = M_ROOFGRAY(5, 5, '#4d5560');
  const maps = facadeMaps({ base: '#d8cfbc', rows: 1, cols: 6, win: '#3a4a5a', brickLines: false, trim: '#efe8da' });
  const b = box(w, h, d, null); b.material = wallMats(maps, roofM); g.add(b);
  const r = gableRoof(w, 5, d, roofM); r.position.y = h; g.add(r);
  // steeple
  const sx = -w / 2 + 3;
  g.add(box(4.5, h + 7, 4.5, wallMat(maps), sx, 0, 0));
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 4), roofM);
  spire.position.set(sx, h + 10, 0); spire.rotation.y = Math.PI / 4; spire.castShadow = true; g.add(spire);
  g.add(box(.3, 2.2, .3, mat('#d4ac0d'), sx, h + 13, 0));
  g.add(box(1.2, .3, .3, mat('#d4ac0d'), sx, h + 13.7, 0));
  // rose window
  const rose = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20),
    new M({ color: '#5a7a9a', roughness: .3, metalness: .2 }));
  rose.position.set(sx + 2.4, h - 2, 0); rose.rotation.y = Math.PI / 2; g.add(rose);
  // arched door
  door(g, 3.4, 4.4, w * .15, d / 2 + .2, 0, '#5a3e2e');
  return g;
}

function gas(s) {
  const g = new THREE.Group();
  const { w, d } = s;
  // kiosk
  const k = box(w * .45, 5.5, d * .5, null, -w * .2, 0, -d * .15);
  k.material = wallMats(facadeMaps({ base: '#d8d3c8', rows: 1, cols: 5, storefront: true,
    signText: 'HAVEN FUEL', signBg: '#2e6b46', brickLines: false }), mat('#8d8578'));
  g.add(k);
  parapet(g, w * .45, d * .5, 5.5);
  // canopy
  g.add(box(w * .8, .7, d * .6, mat('#e8e4da'), w * .1, 5.8, d * .15));
  g.add(box(w * .8, .5, d * .6 + .4, mat('#2e6b46'), w * .1, 6.5, d * .15));
  for (const [px, pz] of [[-w * .2, d * .3], [w * .4, d * .3], [-w * .2, -d * .05], [w * .4, -d * .05]])
    g.add(cyl(.3, .3, 5.8, mat('#d9d5cc'), px, 0, pz));
  // pumps
  const parts = [];
  for (const [px, pz] of [[-w * .05, d * .18], [w * .25, d * .18], [-w * .05, d * .02], [w * .25, d * .02]]) {
    parts.push({ geo: new THREE.BoxGeometry(1.1, 1.8, .7), color: '#c0392b', x: px, y: .9, z: pz });
    parts.push({ geo: new THREE.BoxGeometry(.9, .5, .75), color: '#e8e4da', x: px, y: 1.5, z: pz });
    parts.push({ geo: new THREE.BoxGeometry(1.6, .3, 1.2), color: '#8a9094', x: px, y: .05, z: pz });
  }
  const pm = new THREE.Mesh(colored(parts), VCOL()); pm.castShadow = true; g.add(pm);
  // price sign
  g.add(cyl(.2, .25, 7, mat('#555'), w * .45, 0, d * .4));
  const st = signTexture('FUEL 3.49', { bg: '#2e6b46', fg: '#ffd98a', w: 256, h: 128, font: 'bold 40px Arial' });
  // (kiosk roof already concrete; canopy + pumps carry the silhouette)
  const ps = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.6), new M({ map: st, side: THREE.DoubleSide }));
  ps.position.set(w * .45, 6.4, d * .4); g.add(ps);
  return g;
}

const HOUSE_COLORS = ['#d9cbb2', '#c2d1c5', '#d4b8ae', '#b9c4d1', '#ddd2be', '#cbb9a4', '#b5c7b8'];
const ROOF_COLORS = ['#5a5048', '#6d4c3d', '#4d5560', '#6b5a4d', '#54504a',
  '#3e4a58', '#8a4a34', '#3f4a3c'];
function house(s = {}) {
  const g = new THREE.Group();
  const w = s.w || rr(10, 14), d = s.d || rr(9, 12), h = s.h || rr(5.5, 7.5);
  const wallC = pick(HOUSE_COLORS);
  const roofHex = pick(ROOF_COLORS);
  const roofM = (R() < .55 ? M_ROOFGRAY(w / 6, d / 6, roofHex) : M_ROOFCLAY(w / 6, d / 6, roofHex));
  const useSiding = R() < .6;
  const wallMaps = useSiding
    ? { map: sidingTexture(wallC), bump: sidingSkin().bump, rough: sidingSkin().rough }
    : facadeMaps({ base: wallC, rows: 2, cols: 4, win: '#33424e', brickLines: false, cornice: false });
  // foundation strip
  g.add(box(w + .3, .6, d + .3, mat('#9aa0a3'), 0, 0, 0));
  const body = box(w, h, d, null, 0, .5, 0);
  body.material = wallMats(wallMaps, roofM);
  g.add(body);
  const roofH = rr(2.5, 3.8);
  const roof = gableRoof(w, roofH, d, roofM);
  roof.position.y = h + .5; if (R() < .5) roof.rotation.y = Math.PI / 2;
  // rotated gable swaps footprint axes: local x now spans world z & vice versa
  if (roof.rotation.y) roof.scale.set(d / w, 1, w / d);
  g.add(roof);
  // fascia boards along eaves
  const fdir = roof.rotation.y ? 'z' : 'x';
  const flen = fdir === 'x' ? w + 1.2 : d + 1.2;
  const fm = mat('#f0ece0');
  if (fdir === 'x') {
    g.add(box(flen, .3, .15, fm, 0, h + .45, d / 2 + .55));
    g.add(box(flen, .3, .15, fm, 0, h + .45, -d / 2 - .55));
  } else {
    g.add(box(.15, .3, flen, fm, w / 2 + .55, h + .45, 0));
    g.add(box(.15, .3, flen, fm, -w / 2 - .55, h + .45, 0));
  }
  // 3D windows + shutters on front & gable sides
  const parts = [], glass = [];
  houseWindow(parts, -w * .28, 3.4, d / 2 + .05, {}, glass);
  houseWindow(parts, w * .3, 3.4, d / 2 + .05, {}, glass);
  if (h > 6) { houseWindow(parts, -w * .28, 6, d / 2 + .05, {}, glass); houseWindow(parts, w * .3, 6, d / 2 + .05, {}, glass); }
  houseWindow(parts, -w / 2 - .05, 3.4, 0, { ry: Math.PI / 2, shutters: false }, glass);
  // gutters under the eaves + downspouts at the eave ends; rake boards on the
  // gable ends.  gableRoof's triangle is extruded along z, so for fdir 'x' the
  // ridge runs along z, eaves face ±x and the gable ends are at ±z.
  const gc = '#c9ced2';
  if (fdir === 'x') {
    parts.push({ geo: new THREE.BoxGeometry(.13, .1, d + .9), color: gc, x: w / 2 + .5, y: h + .36, z: 0 });
    parts.push({ geo: new THREE.BoxGeometry(.13, .1, d + .9), color: gc, x: -w / 2 - .5, y: h + .36, z: 0 });
    for (const sx of [-1, 1]) {
      parts.push({ geo: new THREE.BoxGeometry(.13, h, .13), color: gc, x: sx * (w / 2 + .44), y: h / 2 + .15, z: d / 2 - .4 });
      parts.push({ geo: new THREE.BoxGeometry(.34, .16, .16), color: gc, x: sx * (w / 2 + .55), y: .4, z: d / 2 - .4 });
    }
    // rake boards tracing the gable-end slopes (ends face ±z)
    const run = w / 2 + .6, rk = Math.hypot(roofH, run) * 1.03, ra = Math.atan2(roofH, run);
    for (const sz of [-1, 1]) for (const sx of [-1, 1])
      parts.push({ geo: new THREE.BoxGeometry(rk, .12, .12), color: '#f0ece0',
        x: sx * run / 2, y: h + .5 + roofH / 2, z: sz * (d / 2 + .66), rz: -sx * ra });
  } else {
    parts.push({ geo: new THREE.BoxGeometry(w + .9, .1, .13), color: gc, x: 0, y: h + .36, z: d / 2 + .5 });
    parts.push({ geo: new THREE.BoxGeometry(w + .9, .1, .13), color: gc, x: 0, y: h + .36, z: -d / 2 - .5 });
    for (const sx of [-1, 1]) {
      parts.push({ geo: new THREE.BoxGeometry(.13, h, .13), color: gc, x: sx * (w / 2 - .4), y: h / 2 + .15, z: d / 2 + .44 });
      parts.push({ geo: new THREE.BoxGeometry(.16, .16, .34), color: gc, x: sx * (w / 2 - .4), y: .4, z: d / 2 + .55 });
    }
    // rotated roof: gable ends face ±x just proud of the wall
    const endX = (d / 2 + .6) * w / d + .08, runW = (w / 2 + .6) * d / w;
    const rk2 = Math.hypot(roofH, runW) * 1.03, ra2 = Math.atan2(roofH, runW);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push({ geo: new THREE.BoxGeometry(.12, .12, rk2), color: '#f0ece0',
        x: sx * endX, y: h + .5 + roofH / 2, z: sz * runW / 2, rx: sz * ra2 });
  }
  // porch: slab + posts + shed roof + steps + rail
  const pw = w * .55, pd = 2.6;
  const px = -w * .12, pz = d / 2 + pd / 2 + .1;
  parts.push({ geo: new THREE.BoxGeometry(pw, .4, pd), color: '#b9ac94', x: px, y: .25, z: pz });
  parts.push({ geo: new THREE.BoxGeometry(pw, .25, pd + .3), color: '#6d6154', x: px, y: 3.6, z: pz });
  for (const sx of [-pw / 2 + .3, pw / 2 - .3])
    parts.push({ geo: new THREE.BoxGeometry(.22, 3.4, .22), color: '#f0ece0', x: px + sx, y: 1.9, z: pz + pd / 2 - .2 });
  parts.push({ geo: new THREE.BoxGeometry(pw * .8, .18, .9), color: '#9aa0a3', x: px, y: .05, z: pz + pd / 2 + .5 });
  // porch rail along the slab's outer edge — gap left at the steps
  for (const sd of [-1, 1]) {
    const seg = pw / 2 - 1.7;
    parts.push({ geo: new THREE.BoxGeometry(seg, .07, .07), color: '#efe9dc',
      x: px + sd * (seg / 2 + 1.5), y: 1.16, z: pz + pd / 2 - .16 });
    const nb = Math.max(2, Math.round(seg / .55));
    for (let i = 0; i <= nb; i++)
      parts.push({ geo: new THREE.BoxGeometry(.05, .72, .05), color: '#efe9dc',
        x: px + sd * (1.6 + i * (seg - .2) / nb), y: .8, z: pz + pd / 2 - .16 });
  }
  // gable vent — sits just proud of the roof's end face (extrusion ends at ±(half + .6 overhang))
  const gend = fdir === 'x'
    ? { x: 0, z: d / 2 + .64, ry: 0 }
    : { x: (d / 2 + .6) * w / d + .05, z: 0, ry: Math.PI / 2 };
  parts.push({ geo: new THREE.CircleGeometry(.5, 12), color: '#e8e2d4', x: gend.x, y: h + roofH * .45, z: gend.z, ry: gend.ry });
  // dormers on the front roof slope (only when the ridge runs along x)
  if (fdir === 'x' && R() < .55) {
    const dn = R() < .4 ? 2 : 1;
    for (let i = 0; i < dn; i++) {
      const dx = dn === 1 ? rr(-w * .15, w * .15) : (i === 0 ? -w * .26 : w * .26);
      const dy = h + .5 + roofH * .38, dz = d * .24;
      parts.push({ geo: new THREE.BoxGeometry(1.9, 1.7, 2.0), color: wallC, x: dx, y: dy, z: dz });
      parts.push({ geo: new THREE.BoxGeometry(2.3, .2, 2.4), color: roofHex, x: dx, y: dy + .95, z: dz, rx: -.26 });
      parts.push({ geo: new THREE.BoxGeometry(1.5, 1.1, .12), color: '#f0ece0', x: dx, y: dy, z: dz + 1.02 });
      glass.push({ geo: new THREE.BoxGeometry(1.1, .8, .14), color: '#8fb0c2', x: dx, y: dy, z: dz + 1.06 });
    }
  }
  const trimMesh = new THREE.Mesh(colored(parts), VCOL());
  trimMesh.castShadow = trimMesh.receiveShadow = true;
  g.add(trimMesh);
  if (glass.length) g.add(new THREE.Mesh(colored(glass), GLASSM));
  door(g, 1.8, 2.6, px, d / 2 + .2, 0, pick(['#7a3b2e', '#2e4a5f', '#4a5d3a']));
  // garage
  const gw = w * .55;
  const gx = w / 2 + gw / 2 - .5, gz = rr(-d * .15, d * .15);
  const gar = box(gw, 3.4, d * .8, null, gx, 0, gz);
  gar.material = wallMats(wallMaps, roofM);
  g.add(gar);
  const gr = gableRoof(gw, 1.8, d * .8, roofM); gr.position.set(gx, 3.4, gz); g.add(gr);
  const gdoor = new THREE.Mesh(new THREE.PlaneGeometry(gw * .72, 2.7), garageDoorMat());
  gdoor.position.set(gx, 1.6, gz + d * .4 + .02); g.add(gdoor);
  // garage door frame trim (merges into the global VCOL bucket)
  const gtm = new THREE.Mesh(colored([
    { geo: new THREE.BoxGeometry(gw * .78, .2, .16), color: '#f0ece0', x: gx, y: 2.98, z: gz + d * .4 + .1 },
    { geo: new THREE.BoxGeometry(.16, 2.9, .16), color: '#f0ece0', x: gx - gw * .38, y: 1.45, z: gz + d * .4 + .1 },
    { geo: new THREE.BoxGeometry(.16, 2.9, .16), color: '#f0ece0', x: gx + gw * .38, y: 1.45, z: gz + d * .4 + .1 },
  ]), VCOL()); gtm.castShadow = gtm.receiveShadow = true; g.add(gtm);
  // driveway + mailbox + walkway
  const drv = plane(gw * .8, 8, mat('#8f9296'), gx, .32, gz + d * .4 + 4);
  g.add(drv);
  const mb = new THREE.Mesh(colored([
    { geo: new THREE.BoxGeometry(.12, 1.1, .12), color: '#6a5a44', x: 0, y: .55, z: 0 },
    { geo: new THREE.BoxGeometry(.55, .35, .3), color: '#3a4a55', x: 0, y: 1.2, z: 0 },
    { geo: new THREE.BoxGeometry(.08, .3, .1), color: '#c0392b', x: .3, y: 1.35, z: 0 },
  ]), VCOL());
  mb.position.set(gx + gw * .4, 0, gz + d * .4 + 7.4); mb.castShadow = true;
  g.add(mb);
  // chimney (+ cap + flue, vertex-colored so it merges)
  if (R() < .5) {
    g.add(box(1, 2.8, 1, new M({ map: brickTexture('#8d6a55') }), w * .3, h + roofH * .4, -d * .2));
    const cc = new THREE.Mesh(colored([
      { geo: new THREE.BoxGeometry(1.35, .22, 1.35), color: '#4d5257', x: w * .3, y: h + roofH * .4 + 2.85, z: -d * .2 },
      { geo: new THREE.BoxGeometry(.44, .38, .44), color: '#33383c', x: w * .3, y: h + roofH * .4 + 3.1, z: -d * .2 },
    ]), VCOL()); cc.castShadow = true; g.add(cc);
  }
  return g;
}

function cottage(s = {}) {
  return house({ w: rr(11, 13), d: rr(9, 11), h: rr(4.5, 5.5) });
}

function duplex(s = {}) {
  const g = new THREE.Group();
  const w = s.w || 16, d = s.d || 11, h = rr(6, 7.5);
  const roofM = (R() < .5 ? M_ROOFGRAY(w / 7, d / 7, pick(ROOF_COLORS)) : M_ROOFCLAY(w / 7, d / 7, pick(ROOF_COLORS)));
  const wallMaps = R() < .5
    ? { map: sidingTexture(pick(HOUSE_COLORS)), bump: sidingSkin().bump, rough: sidingSkin().rough }
    : facadeMaps({ base: pick(HOUSE_COLORS), rows: 2, cols: 5, win: '#33424e', brickLines: false, cornice: false });
  g.add(box(w + .3, .5, d + .3, mat('#9aa0a3'), 0, 0, 0));
  const body = box(w, h, d, null, 0, .4, 0);
  body.material = wallMats(wallMaps, roofM);
  g.add(body);
  const roof = gableRoof(w, 3, d, roofM); roof.position.y = h + .4; g.add(roof);
  door(g, 1.7, 2.5, -w * .25, d / 2 + .2, 0, '#5a4632', { recess: true });
  door(g, 1.7, 2.5, w * .25, d / 2 + .2, 0, '#324a5a', { recess: true });
  // entry stoops + party wall band + eave fascia/gutters + downspouts
  const parts = [
    { geo: new THREE.BoxGeometry(3, .3, 1.6), color: '#b9ac94', x: -w * .25, y: .05, z: d / 2 + 1 },
    { geo: new THREE.BoxGeometry(3, .3, 1.6), color: '#b9ac94', x: w * .25, y: .05, z: d / 2 + 1 },
    { geo: new THREE.BoxGeometry(.3, h, .35), color: '#efe9dc', x: 0, y: h / 2 + .4, z: d / 2 + .1 },
    // frieze boards on the gable ends (ridge runs along z) + gutters on the eaves
    { geo: new THREE.BoxGeometry(w + 1.1, .22, .14), color: '#efe9dc', x: 0, y: h + .35, z: d / 2 + .5 },
    { geo: new THREE.BoxGeometry(w + 1.1, .22, .14), color: '#efe9dc', x: 0, y: h + .35, z: -d / 2 - .5 },
    { geo: new THREE.BoxGeometry(.13, .1, d + .9), color: '#c9ced2', x: w / 2 + .5, y: h + .3, z: 0 },
    { geo: new THREE.BoxGeometry(.13, .1, d + .9), color: '#c9ced2', x: -w / 2 - .5, y: h + .3, z: 0 },
  ];
  for (const sx of [-1, 1]) {
    parts.push({ geo: new THREE.BoxGeometry(.13, h, .13), color: '#c9ced2', x: sx * (w / 2 + .44), y: h / 2 + .1, z: d / 2 - .4 });
    // stoop handrails beside each entry step
    for (const rx of [-1.3, 1.3])
      parts.push({ geo: new THREE.BoxGeometry(.06, .9, .06), color: '#3a3e42', x: sx * w * .25 + rx, y: .9, z: d / 2 + 1.5 });
  }
  const glass = [];
  houseWindow(parts, -w * .38, 3.2, d / 2 + .05, { w: 1.4, h: 1.6 }, glass);
  houseWindow(parts, -w * .12, 3.2, d / 2 + .05, { w: 1.4, h: 1.6 }, glass);
  houseWindow(parts, w * .12, 3.2, d / 2 + .05, { w: 1.4, h: 1.6 }, glass);
  houseWindow(parts, w * .38, 3.2, d / 2 + .05, { w: 1.4, h: 1.6 }, glass);
  houseWindow(parts, -w * .25, 5.6, d / 2 + .05, { w: 1.4, h: 1.5, shutters: false }, glass);
  houseWindow(parts, w * .25, 5.6, d / 2 + .05, { w: 1.4, h: 1.5, shutters: false }, glass);
  const tm = new THREE.Mesh(colored(parts), VCOL());
  tm.castShadow = tm.receiveShadow = true;
  g.add(tm);
  if (glass.length) g.add(new THREE.Mesh(colored(glass), GLASSM));
  return g;
}

/* full-height skyscraper — triple-setback glass shaft, lit crown, beacon mast */
function skyscraper(s) {
  const g = new THREE.Group();
  const { w, d, h } = s;
  const tint = pick(['#6e96b0', '#5f8ba6', '#87a8bd', '#7ba0ae']);
  const podH = 9;
  const pod = box(w, podH, d, null);
  pod.material = wallMats(facadeMaps({ base: pick(['#7d8a92', '#8a8f94', '#96a0a6']),
    rows: 2, cols: Math.round(w / 6), storefront: true,
    signText: s.sign || null, signBg: '#20313d' }), flatRoofMat());
  g.add(pod);
  parapet(g, w, d, podH, { ph: rr(1.1, 1.5) });
  clutter(g, w, d, podH, { skylights: false });
  facadeDress(g, w, d, podH, { pilasters: true });
  winDressMesh(g, w, d, podH, { rows: 2, cols: Math.round(w / 6), storefront: true,
    faces: 'fbs', transom: true, fins: true, reveal: true });
  storefrontKitMesh(g, w, d, podH, { cols: Math.round(w / 6), faces: 'fbs' });
  // shaft — 3 setback tiers of glass curtain wall
  let y = podH, ww = w * .88, dd = d * .88;
  for (const share of [.5, .3, .2]) {
    const th = (h - podH - 4) * share;
    const b = box(ww, th, dd, null, 0, y, 0);
    b.material = wallMats(glassFacadeMaps({
      rows: Math.max(4, Math.round(th / 3)), cols: Math.max(4, Math.round(ww / 3.4)),
      litRatio: .2, tint }), mat('#6d787e'));
    g.add(b);
    parapet(g, ww, dd, y + th);
    g.add(box(ww + .6, .55, dd + .6, mat('#dde3e6'), 0, y + th, 0));  // accent band
    y += th; ww *= .82; dd *= .82;
  }
  // lit crown — glows cool blue at dusk
  const crownM = new M({ color: '#2e3f4a', roughness: .4 });
  crownM.emissive = new THREE.Color('#58b6e8'); crownM.emissiveIntensity = 0;
  crownM.userData.lit = true;
  g.add(box(ww * 1.04, 2.4, dd * 1.04, crownM, 0, y, 0));
  /* sprint-03 crown variation (contract A3): s.crown pins the silhouette;
     pick() fallback keeps unsigned towers distinct. Lit band + beacon stay. */
  const profile = s.crown || pick(['spire', 'lantern', 'chamfer', 'deck']);
  const beaconM = new M({ color: '#442222', roughness: .5 });
  beaconM.emissive = new THREE.Color('#ff4444'); beaconM.emissiveIntensity = 0;
  beaconM.userData.lit = true;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 6), beaconM);
  let beaconY = y + 6;
  const _cr = g.children.length;
  if (profile === 'spire') {
    // stepped penthouse + articulated mast with crossarms — the skyline's peak
    g.add(box(ww * .5, 2.6, dd * .5, mat('#7d868c'), 0, y + 2.4, 0));
    const mh = rr(14, 18);
    g.add(cyl(.14, .42, mh, mat('#4a4e52'), 0, y + 5, 0));
    g.add(box(3.6, .13, .13, mat('#4a4e52'), 0, y + 5 + mh * .55, 0));
    g.add(box(2.4, .11, .11, mat('#4a4e52'), 0, y + 5 + mh * .75, 0));
    beaconY = y + 5 + mh + .3;
  } else if (profile === 'lantern') {
    // glowing glass lantern + corner fins — clean modern cap
    const lm = new M({ color: '#3d5a68', roughness: .25, metalness: .35 });
    lm.emissive = new THREE.Color('#58b6e8'); lm.emissiveIntensity = 0;
    lm.userData.lit = true;
    g.add(box(ww * .6, 4.8, dd * .6, lm, 0, y + 2.4, 0));
    for (const [fx, fz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      g.add(box(.5, 5.6, .5, mat('#d9d2c0'), fx * ww * .34, y + 2.2, fz * dd * .34));
    g.add(cyl(.06, .1, 5, mat('#4a4e52'), ww * .16, y + 7.2, dd * .16));
    beaconY = y + 12.6;
  } else if (profile === 'chamfer') {
    // diagonal clipped cap — rotated slab + step-back + offset antenna
    const cap = box(ww * 1.02, 1.7, dd * 1.02, mat('#5d6a72'), 0, y + 2.4, 0);
    cap.rotation.y = Math.PI / 4; cap.scale.set(.78, 1, .78); g.add(cap);
    g.add(box(ww * .7, 1.1, dd * .7, mat('#7d868c'), 0, y + 4.1, 0));
    const chm = rr(5, 8);
    g.add(cyl(.07, .14, chm, mat('#4a4e52'), -ww * .3, y + 5.2, 0));
    beaconY = y + 5.2 + chm + .4;
  } else { // 'deck' — rooftop aviation deck: ring + roundel + rails + low mast
    const rr2 = Math.min(ww, dd) * .4;
    g.add(box(ww * .8, .5, dd * .8, mat('#4a5560'), 0, y + 2.4, 0));
    const dk = new THREE.Mesh(new THREE.TorusGeometry(rr2, .16, 6, 40), mat('#d4b23a'));
    dk.rotation.x = Math.PI / 2; dk.position.set(0, y + 3.05, 0); dk.castShadow = true;
    g.add(dk);
    const hdT = signTexture('H', { bg: '#4a5560', fg: '#ffd23e', w: 64, h: 64, font: 'bold 48px Arial', border: false });
    const hd = new THREE.Mesh(new THREE.PlaneGeometry(rr2 * 1.2, rr2 * 1.2), new M({ map: hdT }));
    hd.rotation.x = -Math.PI / 2; hd.position.set(0, y + 2.98, 0); g.add(hd);
    for (const sx of [-1, 1]) g.add(box(.12, .9, dd * .8, mat('#8a9094'), sx * ww * .4, y + 2.9, 0));
    g.add(cyl(.06, .1, 4, mat('#4a4e52'), ww * .3, y + 2.9, dd * .3));
    beaconY = y + 7.3;
  }
  beacon.position.set(0, beaconY, 0); g.add(beacon);
  heroCrown(profile, g.children.length - _cr, [s.x, s.z]);
  // entrance
  g.add(box(11, .5, 4.4, mat('#3a4a55'), 0, 4.6, d / 2 + 1.8));
  g.add(cyl(.22, .22, 4.6, mat('#666'), -4.4, 0, d / 2 + 3.4));
  g.add(cyl(.22, .22, 4.6, mat('#666'), 4.4, 0, d / 2 + 3.4));
  door(g, 7, 4.6, 0, d / 2 + .2);
  return g;
}

/* brick rowhouse — cornice, stoop, 2-storey bay window. Designed to attach in rows */
const TH_BRICKS = ['#8a4a38', '#9a5a40', '#7a4030', '#a86848', '#8d6a55', '#6f4a3c', '#94644a'];
function townhouse(s = {}) {
  const g = new THREE.Group();
  const w = s.w || rr(8.5, 11), d = s.d || rr(11, 13), h = rr(7.6, 9.4);
  const base = s.color || pick(TH_BRICKS);
  const maps = facadeMaps({ base, rows: Math.max(2, Math.round(h / 3.1)), cols: 3,
    win: '#2c3844', cornice: false, trim: '#e8e0d0' });
  const body = box(w, h, d, null);
  body.material = wallMats(maps, flatRoofMat());
  g.add(body);
  // cornice + low parapet + roof hatch
  g.add(box(w + .5, .7, d + .5, mat('#e8e0d0'), 0, h, 0));
  g.add(box(w + .2, .7, d + .2, mat('#cfc4b0'), 0, h + .55, 0));
  const parts = [], glass = [], fglass = [];
  // lintels/sills on the street face + downspout at the front corner
  // (side walls are shared — nothing protrudes on ±x)
  winDress(parts, w, d, h, { rows: Math.max(2, Math.round(h / 3.1)), cols: 3,
    faces: 'f', trim: '#e8e0d0', transom: true, reveal: true }, fglass);
  quoins(parts, w, d, h, { color: '#e8e0d0', faces: 'f' });
  parts.push({ geo: new THREE.BoxGeometry(.14, h, .16), color: '#6d7276', x: w / 2 - .4, y: h / 2, z: d / 2 + .08 });
  parts.push({ geo: new THREE.BoxGeometry(w * .7, .5, d * .7), color: '#4d5154', x: 0, y: h + 1.15, z: 0 });
  parts.push({ geo: new THREE.BoxGeometry(1.6, 1.4, 1.8), color: '#5d6165', x: w * .2, y: h + 2, z: -d * .15 });
  // stoop: 3 steps + landing, iron rail look via thin posts
  const sx = -w * .26;
  parts.push({ geo: new THREE.BoxGeometry(2.8, .45, 2.4), color: '#9a8c7a', x: sx, y: .22, z: d / 2 + 1.6 });
  parts.push({ geo: new THREE.BoxGeometry(2.4, .4, 1.7), color: '#a89a88', x: sx, y: .6, z: d / 2 + 1.25 });
  parts.push({ geo: new THREE.BoxGeometry(2.0, .35, 1.1), color: '#b5a894', x: sx, y: .95, z: d / 2 + .9 });
  for (const px of [-1.2, 1.2])
    parts.push({ geo: new THREE.BoxGeometry(.07, 1.1, .07), color: '#2e3236', x: sx + px, y: 1.35, z: d / 2 + 2.1 });
  // 2-storey bay window bump-out
  const bx = w * .2, bh = h - 2.4;
  parts.push({ geo: new THREE.BoxGeometry(3.4, bh, 1.1), color: base, x: bx, y: 1.5 + bh / 2, z: d / 2 + .55 });
  parts.push({ geo: new THREE.BoxGeometry(3.6, .28, 1.25), color: '#e8e0d0', x: bx, y: 1.55, z: d / 2 + .55 });
  parts.push({ geo: new THREE.BoxGeometry(3.6, .28, 1.25), color: '#e8e0d0', x: bx, y: h - .8, z: d / 2 + .55 });
  for (let rI = 0; rI < 2; rI++)
    for (const px of [-1.15, 0, 1.15])
      glass.push({ geo: new THREE.BoxGeometry(.9, bh / 2 - .9, .12), color: '#7d9aac',
        x: bx + px, y: 2.6 + rI * (bh / 2 + .3), z: d / 2 + 1.12 });
  const tm = new THREE.Mesh(colored(parts), VCOL());
  tm.castShadow = tm.receiveShadow = true; g.add(tm);
  if (glass.length) g.add(new THREE.Mesh(colored(glass), GLASSM));
  glassMesh(g, fglass);
  door(g, 1.7, 2.5, sx, d / 2 + .75, 0, pick(['#3a2e28', '#54382a', '#2e3e50', '#443726']), { recess: true });
  return g;
}

/* long low ranch — hip roof, picture window, garage or carport */
function ranch(s = {}) {
  const g = new THREE.Group();
  const w = s.w || rr(16, 20), d = s.d || rr(10, 12), h = rr(3.6, 4.4);
  const wallC = pick(HOUSE_COLORS);
  const roofM = (R() < .5 ? M_ROOFGRAY(w / 6, d / 6, pick(ROOF_COLORS))
                          : M_ROOFCLAY(w / 6, d / 6, pick(ROOF_COLORS)));
  const wallMaps = R() < .55
    ? { map: sidingTexture(wallC), bump: sidingSkin().bump, rough: sidingSkin().rough }
    : facadeMaps({ base: wallC, rows: 1, cols: 8, win: '#33424e', brickLines: R() < .4, cornice: false });
  g.add(box(w + .3, .5, d + .3, mat('#9aa0a3'), 0, 0, 0));
  const body = box(w, h, d, null, 0, .4, 0);
  body.material = wallMats(wallMaps, roofM);
  g.add(body);
  const roof = hipRoof(w * 1.36, 2.0, d * 1.36, roofM);
  roof.position.y = h + .35; g.add(roof);
  const parts = [], glass = [];
  // eave gutters (hip roof overhangs every side) + downspouts at the front corners
  const gc = '#c9ced2';
  parts.push({ geo: new THREE.BoxGeometry(w + 1, .09, .12), color: gc, x: 0, y: h + .3, z: d / 2 + .5 });
  parts.push({ geo: new THREE.BoxGeometry(w + 1, .09, .12), color: gc, x: 0, y: h + .3, z: -d / 2 - .5 });
  parts.push({ geo: new THREE.BoxGeometry(.12, .09, d + 1), color: gc, x: w / 2 + .5, y: h + .3, z: 0 });
  parts.push({ geo: new THREE.BoxGeometry(.12, .09, d + 1), color: gc, x: -w / 2 - .5, y: h + .3, z: 0 });
  for (const sx of [-1, 1])
    parts.push({ geo: new THREE.BoxGeometry(.12, h + .2, .13), color: gc, x: sx * (w / 2 - .5), y: h / 2 + .05, z: d / 2 + .42 });
  // porch slab + picture window + one shuttered window
  parts.push({ geo: new THREE.BoxGeometry(w * .55, .35, 2.2), color: '#b9ac94', x: -w * .1, y: .2, z: d / 2 + 1.1 });
  parts.push({ geo: new THREE.BoxGeometry(4.8, 2.0, .14), color: '#f0ece0', x: -w * .28, y: 2.6, z: d / 2 + .06 });
  glass.push({ geo: new THREE.BoxGeometry(4.4, 1.7, .16), color: '#8fb0c2', x: -w * .28, y: 2.6, z: d / 2 + .08 });
  parts.push({ geo: new THREE.BoxGeometry(.1, 1.7, .18), color: '#f0ece0', x: -w * .28, y: 2.6, z: d / 2 + .1 });
  houseWindow(parts, w * .24, 2.6, d / 2 + .05, { w: 1.5, h: 1.6 }, glass);
  // garage or carport on the +x flank
  const gw = w * .42;
  const gx = w / 2 + gw / 2 - .3, gz = rr(-d * .1, d * .1);
  if (R() < .72) {   // garage
    const gar = box(gw, 2.9, d * .75, null, gx, 0, gz);
    gar.material = wallMats(wallMaps, roofM);
    g.add(gar);
    const gr = gableRoof(gw, 1.4, d * .75, roofM); gr.position.set(gx, 2.9, gz); g.add(gr);
    const gd = new THREE.Mesh(new THREE.PlaneGeometry(gw * .7, 2.3), garageDoorMat());
    gd.position.set(gx, 1.4, gz + d * .375 + .02); g.add(gd);
    for (const jx of [-1, 1])   // garage door jamb trim
      parts.push({ geo: new THREE.BoxGeometry(.14, 2.4, .14), color: '#f0ece0', x: gx + jx * gw * .37, y: 1.2, z: gz + d * .375 + .08 });
    parts.push({ geo: new THREE.BoxGeometry(gw * .76, .18, .14), color: '#f0ece0', x: gx, y: 2.46, z: gz + d * .375 + .08 });
  } else {           // carport: flat roof on posts
    parts.push({ geo: new THREE.BoxGeometry(gw, .3, d * .7), color: '#8d8378', x: gx, y: 3.1, z: gz });
    for (const px of [gx - gw / 2 + .3, gx + gw / 2 - .3])
      for (const pz of [gz - d * .3, gz + d * .3])
        parts.push({ geo: new THREE.BoxGeometry(.22, 3, .22), color: '#6e6152', x: px, y: 1.5, z: pz });
  }
  parts.push({ geo: new THREE.PlaneGeometry(gw * .85, 8), color: '#8f9296', x: gx, y: .32, z: gz + d * .38 + 4, rx: -Math.PI / 2 });
  const tm = new THREE.Mesh(colored(parts), VCOL());
  tm.castShadow = tm.receiveShadow = true; g.add(tm);
  if (glass.length) g.add(new THREE.Mesh(colored(glass), GLASSM));
  door(g, 1.7, 2.4, w * .02, d / 2 + .2, 0, pick(['#7a3b2e', '#2e4a5f', '#4a5d3a']), { recess: true });
  if (R() < .5) {
    g.add(box(.9, 2.2, .9, new M({ map: brickTexture('#8d6a55') }), w * .3, h + .8, -d * .2));
    const cc = new THREE.Mesh(colored([
      { geo: new THREE.BoxGeometry(1.2, .2, 1.2), color: '#4d5257', x: w * .3, y: h + 3.02, z: -d * .2 },
      { geo: new THREE.BoxGeometry(.4, .34, .4), color: '#33383c', x: w * .3, y: h + 3.24, z: -d * .2 },
    ]), VCOL()); cc.castShadow = true; g.add(cc);
  }
  return g;
}

/* dispatch */
export function makeBuilding(spec) {
  let g;
  switch (spec.type) {
    case 'hospital': g = hospital(spec); break;
    case 'medhall': g = medhall(spec); break;
    case 'campusb': g = campusb(spec); break;
    case 'medoffice': g = medoffice(spec); break;
    case 'clinic': g = medoffice(spec, { base: '#d6d0c2', awn: '#5b7d5b', signBg: '#476b47' }); break;
    case 'ems': g = ems(spec); break;
    case 'senior': g = senior(spec); break;
    case 'hospice': g = hospice(spec); break;
    case 'civicb': g = civicb(spec); break;
    case 'storefront': g = storefront(spec); break;
    case 'bigbox': g = bigbox(spec, spec.brand); break;
    case 'mall': g = mall(spec); break;
    case 'museum': g = museum(spec); break;
    case 'school': g = school(spec); break;
    case 'fastfood': g = fastfood(spec); break;
    case 'apartment': g = apartment(spec); break;
    case 'tower': g = tower(spec); break;
    case 'skyscraper': g = skyscraper(spec); break;
    case 'townhouse': g = townhouse(spec); break;
    case 'ranch': g = ranch(spec); break;
    case 'church': g = church(spec); break;
    case 'gas': g = gas(spec); break;
    case 'house': g = house(spec); break;
    case 'cottage': g = cottage(spec); break;
    case 'duplex': g = duplex(spec); break;
    default: g = medoffice(spec);
  }
  g.position.set(spec.x, 0, spec.z);
  if (spec.rot) g.rotation.y = spec.rot;
  return g;
}
