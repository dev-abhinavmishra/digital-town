// interior.js — click a building to step inside: a furnished interior unique
const ULTRA = () => typeof window !== 'undefined' &&
  window.__fx && window.__fx.tier === 'ultra';
// to that building (seeded by id — palette drift + layout jitter), rendered on
// its own layer in a sealed room staged beneath the town, plus an info HUD
// carrying the building's name, cost/budget share, purpose and size.
// Esc / EXIT returns.
import * as THREE from 'three';
import { BUILDINGS, APARTMENTS, FILLER, CATEGORY_COLORS } from './layout.js';
import { GeoBin } from './city/geo.js';
import { makeCanvas, canvasTex, signTexture, mulberry32, mat } from './lib.js';

const LYR = 2;                       // interior-only render layer
const STAGE = new THREE.Vector3(0, -180, 0);   // sealed void under the ground plane
const EYE = 1.62;

/* building type → interior archetype (a handful of id overrides where the
   generic type undersells the room, e.g. dental storefronts read as clinics) */
const BY_TYPE = { hospital: 'medical', clinic: 'medical', medoffice: 'medical',
  ems: 'medical', rehab: 'medical', hospice: 'medical', senior: 'medical',
  lab: 'medical', medhall: 'hall', campusb: 'hall', museum: 'museum',
  civicb: 'office', school: 'classroom', storefront: 'shop', bigbox: 'store',
  mall: 'mall', fastfood: 'cafe', church: 'chapel', gas: 'shop',
  tower: 'lobby', skyscraper: 'lobby', house: 'home', cottage: 'home',
  ranch: 'home', duplex: 'home', townhouse: 'home', apartment: 'home',
  zone: 'home', parkzone: null };
const BY_ID = { dental: 'medical', optical: 'medical', coffee: 'cafe',
  orchard: 'cafe', housing: 'home', preservecommons: 'home' };
const ARCH_NAME = { medical: 'Clinic floor', shop: 'Retail floor', store: 'Sales floor',
  cafe: 'Dining room', mall: 'Atrium', hall: 'Great hall', museum: 'Gallery',
  classroom: 'Classroom', office: 'Service counter', home: 'Living space',
  lobby: 'Lobby', chapel: 'Sanctuary' };

/* ---------------- canvas bits ---------------- */
function texCanvas(fn, w = 256, h = 256, tile = null) {
  const [c, x] = makeCanvas(w, h); fn(x, w, h);
  const t = canvasTex(c); if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const woodFloor = () => texCanvas((x, w, h) => {
  x.fillStyle = '#9a7852'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < h; i += 32) {
    x.fillStyle = `rgb(${140 + (i * 7) % 30},${105 + (i * 5) % 22},${70 + (i * 3) % 16})`;
    x.fillRect(0, i, w, 30);
    x.fillStyle = 'rgba(60,40,20,.5)'; x.fillRect(0, i + 30, w, 2);
    x.fillRect((i * 67) % w, i, 3, 30);
  }
}, 256, 256, true);
const tileFloor = (c1 = '#cfd4d6', c2 = '#b8bec2') => texCanvas((x, w, h) => {
  x.fillStyle = c1; x.fillRect(0, 0, w, h);
  x.fillStyle = c2;
  for (let i = 0; i < w; i += 32) for (let j = 0; j < h; j += 32)
    if ((i + j) / 32 % 2) x.fillRect(i, j, 32, 32);
  x.strokeStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i <= w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
}, 256, 256, true);
const windowGlow = () => texCanvas((x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#cfe8ff'); g.addColorStop(.7, '#eef6ff'); g.addColorStop(1, '#d8c9a8');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.fillRect(w / 2 - 3, 0, 6, h); x.fillRect(0, h / 2 - 3, w, 6);
});
const artTex = (bg, fg, txt) => signTexture(txt, { bg, fg, w: 256, h: 160 });
const rugTex = (c1 = '#7d3f38', c2 = '#d8c9a8') => texCanvas((x, w, h) => {
  x.fillStyle = c2; x.fillRect(0, 0, w, h);
  x.fillStyle = c1; x.fillRect(w * .07, h * .07, w * .86, h * .86);
  x.strokeStyle = c2; x.lineWidth = 5;
  x.strokeRect(w * .16, h * .16, w * .68, h * .68);
  x.fillStyle = 'rgba(0,0,0,.12)';
  for (let i = 0; i < 40; i++) x.fillRect((i * 61) % w, (i * 37) % h, 3, 3);
});
/* radial soft blob — reused for floor light pools AND contact-shadow skirts
   (the alpha ramps differ only by colour, one canvas each) */
const radialTex = inner => texCanvas((x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  g.addColorStop(0, inner); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
/* window light shaft — fades from the window to nothing at the floor */
const shaftTex = () => texCanvas((x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,240,200,.4)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, 128, 256);
const stainedTex = () => texCanvas((x, w, h) => {
  const cols = ['#a83232', '#2e6d8a', '#c9a24e', '#4d7a45', '#7a4a8c'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) {
    x.fillStyle = cols[(i * 10 + j * 3 + j) % 5];
    x.fillRect(i * w / 6, j * h / 10, w / 6 - 3, h / 10 - 3);
  }
  x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(w * .42, 0, w * .16, h);
  x.fillRect(0, h * .42, w, h * .16);
}, 192, 320);

/* shared materials — interior set (kept out of mat()'s cache keyspace is fine,
   colors are unique to these rooms) */
const M = {
  wall: c => mat(c, { roughness: .95 }),
  trim: mat('#ece7dd', { roughness: .8 }),
  dark: mat('#4a4640', { roughness: .9 }),
  metal: mat('#9aa3aa', { roughness: .5, metalness: .5 }),
  glow: mat('#fff4d6', { emissive: '#ffe9b0', emissiveIntensity: 1.6, roughness: .6 }),
  screen: mat('#0d1418', { emissive: '#5fd0ff', emissiveIntensity: .8, roughness: .4 }),
  crt: mat('#b8e6f0', { transparent: true, opacity: .32, side: THREE.DoubleSide, roughness: .4 }),
  sconce: mat('#ffd9a0', { emissive: '#ffbe6a', emissiveIntensity: 1.5, roughness: .5 }),
  candle: mat('#fff6e0', { emissive: '#ffb84d', emissiveIntensity: 2.0, roughness: .4 }),
  exit: mat('#8a1f1f', { emissive: '#ff4438', emissiveIntensity: 1.2, roughness: .6 }),
};

/* ---------------- archetype furniture ----------------
   every builder gets (bin, rng, iw, id, ih) — room half-plan extents & height */
const T = {
  bed: (b, x, z, ry = 0) => {
    b.box(1.1, .55, 2.2, mat('#f2f4f6'), x, .32, z, ry);
    b.box(1.0, .12, 1.4, mat('#9fb6d8'), x, .88, z + .2, ry);
    b.box(.9, .45, .5, mat('#dfe6ea'), x, .55, z - .8, ry);
    b.box(.06, .9, .06, M.metal, x - .62, 0, z + 1); b.box(.06, .9, .06, M.metal, x - .62, 0, z - 1);
    b.box(.7, .04, 2.1, M.metal, x - .62, .9, z);
  },
  shelf: (b, x, z, len, ry = 0) => {
    b.box(len, 2.1, .55, mat('#8a7355'), x, 0, z, ry);
    for (let s = 0; s < 3; s++) b.box(len - .15, .34, .5,
      mat(['#c25b4e', '#4e7bc2', '#c2a94e', '#5a9954'][(x * 7 + z * 3 + s) & 3 | 0]),
      x, .45 + s * .62, z, ry);
  },
  table: (b, x, z, r = .6) => {
    b.plane(r * 2.4, r * 2.4, mat('#7a5233'), x, .72, z);
    const g = new THREE.CylinderGeometry(r, r, .05, 14); g.translate(x, .75, z);
    b.add(g, mat('#8a5f3c'), 0, 0, 0);
    b.box(.08, .72, .08, M.metal, x, 0, z);
  },
  chair: (b, x, z, ry = 0) => {
    b.box(.42, .06, .42, mat('#6d4526'), x, .42, z, ry);
    b.box(.42, .5, .06, mat('#6d4526'), x - Math.sin(ry) * .2, .42, z - Math.cos(ry) * .2, ry);
    for (const [dx, dz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]])
      b.box(.05, .42, .05, M.dark, x + dx * Math.cos(ry) - dz * Math.sin(ry), 0,
        z + dx * Math.sin(ry) + dz * Math.cos(ry), ry);
  },
  desk: (b, x, z, ry = 0) => {
    b.box(1.5, .07, .75, mat('#a08361'), x, .72, z, ry);
    b.box(.08, .72, .7, mat('#8a6d4d'), x - .68 * Math.cos(ry), 0, z + .68 * Math.sin(ry), ry);
    b.box(.08, .72, .7, mat('#8a6d4d'), x + .68 * Math.cos(ry), 0, z - .68 * Math.sin(ry), ry);
    b.box(.5, .34, .05, M.screen, x, .8, z - .12, ry);          // monitor
  },
  sofa: (b, x, z, ry = 0, c = '#5a6e8c') => {
    b.box(2.0, .5, .85, mat(c), x, .18, z, ry);
    b.box(2.0, .55, .22, mat(c), x - Math.sin(ry) * .32, .4, z - Math.cos(ry) * .32, ry);
    for (const s of [-1, 1]) b.box(.24, .62, .85, mat(c),
      x + s * .95 * Math.cos(ry) + Math.sin(ry) * .0, .1, z - s * .95 * Math.sin(ry), ry);
  },
  counter: (b, x, z, len, ry = 0, c = '#9c8a72') => {
    b.box(len, .95, .7, mat(c), x, 0, z, ry);
    b.box(len + .12, .05, .82, mat('#5d4f3f'), x, .95, z, ry);
  },
  planter: (b, x, z) => {
    b.box(.55, .45, .55, mat('#7d5f45'), x, 0, z);
    const c = new THREE.ConeGeometry(.4, .9, 8); c.translate(x, .9, z);
    b.add(c, mat('#4d7a45'), 0, 0, 0);
  },
  pendant: (b, x, z, ih) => {
    b.box(.04, .8, .04, M.dark, x, ih - .8, z);
    const s = new THREE.CylinderGeometry(.02, .22, .22, 10); s.translate(x, ih - .85, z);
    b.add(s, M.glow, 0, 0, 0);
  },
  artFrame: (b, x, z, ry, w = 1.4, hgt = 1.0, tex = null, wallH = 3.2) => {
    const p = new THREE.PlaneGeometry(w, hgt); p.rotateY(ry);
    p.translate(x, wallH * .55, z);
    b.add(p, tex ? new THREE.MeshBasicMaterial({ map: tex }) : M.screen, 0, 0, 0);
  },
  /* soft ground decal — light pool or contact shadow, all merge to one draw */
  disc: (b, m, x, z, rx, rz = rx, y = .012) => {
    const p = new THREE.PlaneGeometry(rx * 2, rz * 2); p.rotateX(-Math.PI / 2);
    p.translate(x, y, z); b.add(p, m, 0, 0, 0);
  },
  rug: (b, x, z, w, d, tex) => {
    const p = new THREE.PlaneGeometry(w, d); p.rotateX(-Math.PI / 2);
    p.translate(x, .02, z);
    b.add(p, new THREE.MeshStandardMaterial({ map: tex, roughness: .96 }), 0, 0, 0);
  },
  plant: (b, x, z, s = 1) => {
    b.box(.42 * s, .4 * s, .42 * s, mat('#6d4f38'), x, 0, z);
    const c = new THREE.SphereGeometry(.34 * s, 8, 6); c.translate(x, .66 * s, z);
    b.add(c, mat('#3f6d3a'), 0, 0, 0);
    const c2 = new THREE.SphereGeometry(.23 * s, 7, 5); c2.translate(x + .15 * s, .92 * s, z - .1 * s);
    b.add(c2, mat('#4f7d44'), 0, 0, 0);
  },
  lamp: (b, x, z) => {
    b.box(.05, 1.5, .05, M.dark, x, 0, z);
    const s = new THREE.CylinderGeometry(.16, .25, .32, 8); s.translate(x, 1.5, z);
    b.add(s, M.glow, 0, 0, 0);
  },
  bookshelf: (b, x, z, len, ry = 0) => {
    b.box(len, 1.95, .36, mat('#5d4433'), x, 0, z, ry);
    for (let s = 0; s < 4; s++) for (let i = 0; i < Math.floor(len / .24); i++) {
      const off = -len / 2 + .16 + i * .24;
      b.box(.15, .3, .24, mat(['#8a3f36', '#3f5d8a', '#8a7a3f', '#3f6d4a', '#6d4a7a'][(i + s) % 5]),
        x + off * Math.cos(ry), .22 + s * .44, z - off * Math.sin(ry), ry);
    }
  },
  stool: (b, x, z) => {
    const c = new THREE.CylinderGeometry(.19, .19, .07, 10); c.translate(x, .6, z);
    b.add(c, mat('#6d4526'), 0, 0, 0);
    b.box(.05, .58, .05, M.metal, x, 0, z);
  },
  kitchenRun: (b, x, z, len, ry = 0) => {
    b.box(len, .9, .66, mat('#c8c0b4'), x, 0, z, ry);                 // lower cabinets
    b.box(len + .1, .06, .74, mat('#4a4038'), x, .9, z, ry);          // worktop
    const e = (len / 2 - .34);
    b.box(.68, 1.9, .68, mat('#d8dee4'), x - e * Math.cos(ry), 0, z + e * Math.sin(ry), ry);   // fridge
    b.box(.66, .86, .64, mat('#3a3f44'), x, 0, z, ry);                // range
    b.box(len * .8, .7, .3, mat('#b8b0a4'), x, 1.45, z - .2 * Math.cos(ry), ry);  // wall cabs
  },
  clock: (b, x, z, ry, y = 2.4) => {
    const p = new THREE.CircleGeometry(.26, 18); p.rotateY(ry);
    p.translate(x, y, z); b.add(p, mat('#f2f0ea'), 0, 0, 0);
    const nx = Math.sin(ry), nz = Math.cos(ry);                       // wall normal
    b.box(.03, .18, .015, M.dark, x + nx * .03, y, z + nz * .03, ry);
    b.box(.13, .03, .015, M.dark, x + nx * .03, y, z + nz * .03, ry);
  },
};

/* mats = { skirtM (contact shadow), poolM (additive light pool),
     wallP(x,z,ry) → (u,n) → [x,z] wall-frame mapper } */
function furnish(kind, bin, rng, iw, id, ih, mats) {
  const R1 = () => rng() * 2 - 1;
  const { skirtM, poolM, wallP } = mats;
  /* wall sconce + warm halo on an end wall (u = along wall, 0 = centre) */
  const sconce = (x, z, ry) => {
    const P = wallP(x, z, ry);
    const [bx, bz] = P(0, .05);
    bin.box(.16, .34, .1, M.sconce, bx, ih * .58, bz, ry);
    const [px, pz] = P(0, .07);
    const pl = new THREE.PlaneGeometry(1.1, 1.8); pl.rotateY(ry);
    pl.translate(px, ih * .58 + .5, pz); bin.add(pl, poolM, 0, 0, 0);
  };
  const sconcePair = () => {          // on both windowless end walls
    sconce(-iw + .16, -id * .4, Math.PI / 2); sconce(-iw + .16, id * .4, Math.PI / 2);
    sconce(iw - .16, -id * .4, -Math.PI / 2); sconce(iw - .16, id * .4, -Math.PI / 2);
  };
  switch (kind) {
    case 'medical': {
      T.counter(bin, -iw * .55, -id + 1.2, iw * .6, 0, '#cfd8dc');
      T.disc(bin, skirtM, -iw * .55, -id + 1.2, iw * .34, .9);
      T.artFrame(bin, -iw * .3, -id + .17, 0, 2.2, 1.1, signTexture('RECEPTION', { bg: '#2e6d5d', w: 512, h: 128 }));
      const beds = Math.max(2, Math.floor(iw / 3.4));
      for (let i = 0; i < beds; i++) {
        const bx = -iw * .1 + i * 3.4, bz = id * .2;
        T.bed(bin, bx, bz);
        T.disc(bin, skirtM, bx, bz, 1.3, 1.5);
        bin.box(.04, 2.0, 1.6, M.crt, bx + 1.45, .4, bz);             // privacy curtain
        bin.box(.05, 1.7, .05, M.metal, bx - .8, 0, bz + 1.15);       // IV pole
        bin.box(.5, .04, .04, M.metal, bx - .8, 1.66, bz + 1.15);     // IV hook bar
      }
      bin.box(iw * .8, 1.1, .4, mat('#7d93a3'), 0, 0, -id * .25);     // low cabinet row
      T.disc(bin, skirtM, 0, -id * .25, iw * .42, .7);
      T.artFrame(bin, 0, id - .17, Math.PI, 1.0, 1.0, signTexture('+', { bg: '#b8352f', fg: '#fff', w: 128, h: 128 }));
      bin.box(.5, .5, .04, M.screen, iw * .45, 1.5, -id + .06, 0);    // vitals monitor
      // waiting nook against the end wall — chairs, side table, plant, clock
      for (let i = 0; i < 4; i++) T.chair(bin, -iw + 1.0, -id * .5 + i * 1.05, Math.PI / 2);
      bin.box(.55, .5, .55, mat('#6d4a30'), -iw + 1.0, 0, id * .55);
      T.plant(bin, -iw + .8, id - 1.0);
      T.clock(bin, iw * .5, id - .16, Math.PI);
      sconcePair();
      break;
    }
    case 'shop': case 'store': {
      const aisles = Math.max(2, Math.min(5, Math.floor(id / 4.4)));
      for (let i = 0; i < aisles; i++) {
        const az = -id * .5 + i * (id * .9 / aisles);
        T.shelf(bin, 0, az, iw * 1.15, 0);
        T.disc(bin, skirtM, 0, az, iw * .6, .7);
        bin.box(1.0, .5, .6, mat('#8a6d4d'), -iw * .6, 0, az);        // end-cap display
        bin.box(1.0, .5, .6, mat('#8a6d4d'), iw * .6, 0, az);
      }
      T.counter(bin, -iw * .2, -id + 1.3, iw * .9, 0, '#6f6250');     // checkout
      T.disc(bin, skirtM, -iw * .2, -id + 1.3, iw * .5, .9);
      for (let i = 0; i < 3; i++) bin.box(.5, .3, .4, mat('#d8d3c8'), -iw * .2 + i * iw * .3, .98, -id + 1.3);
      bin.box(.5, .75, .5, mat('#c9c2b4'), iw * .35, 0, -id + 1.4);   // basket stack
      if (kind === 'store') for (let i = 0; i < 4; i++)               // produce crates
        bin.box(.8, .4, .6, mat(['#5a9954', '#c2a94e', '#c25b4e', '#7a9ab8'][i]), iw * .55 - i * .9, 0, id - 1.0);
      T.artFrame(bin, 0, -id + .17, 0, 3.4, 1.0, signTexture(kind === 'store' ? 'WELCOME — SALES FLOOR' : 'OPEN', { bg: '#1f3a52', w: 640, h: 128 }));
      T.artFrame(bin, -iw + .17, id * .3, Math.PI / 2, 1.6, 1.1, artTex('#7a4b26', '#ffd98a', 'FRESH'));
      sconcePair();
      break;
    }
    case 'cafe': {
      T.counter(bin, 0, -id + 1.1, iw * 1.5, 0, '#5a4634');
      T.disc(bin, skirtM, 0, -id + 1.1, iw * .8, .8);
      bin.box(.9, .5, .6, M.crt, iw * .3, 1.0, -id + 1.1);            // pastry case
      bin.box(.7, .5, .5, mat('#3a3f44'), -iw * .3, 1.0, -id + 1.1);  // espresso machine
      const bo = new THREE.CylinderGeometry(.09, .09, .3, 8); bo.translate(-iw * .3 + .3, 1.35, -id + 1.1);
      bin.add(bo, M.metal, 0, 0, 0);                                  // boiler
      for (let i = 0; i < Math.floor(iw / 2.4); i++)
        T.stool(bin, -iw * .6 + i * 2.2, -id + 2.3);                  // counter stools
      T.artFrame(bin, -iw * .3, -id + .17, 0, 3.0, 1.2, signTexture('MENU', { bg: '#232a20', fg: '#e8d8a8', w: 512, h: 200 }));
      const n = Math.max(3, Math.floor(iw * id / 14));
      for (let i = 0; i < n; i++) {
        const tx = R1() * iw * .7, tz = R1() * id * .55;
        T.table(bin, tx, tz, .5);
        T.disc(bin, skirtM, tx, tz, 1.1);
        T.chair(bin, tx - .75, tz, Math.PI / 2); T.chair(bin, tx + .75, tz, -Math.PI / 2);
      }
      T.plant(bin, iw - 1.0, id - 1.0); T.plant(bin, -iw + 1.0, id - 1.0, .8);
      sconcePair();
      break;
    }
    case 'mall': {
      // storefront facades along both long walls — pilasters, fascia, dark glass
      for (const wz of [-id + .24, id - .24]) {
        for (let fx = -iw + 1.2; fx < iw - 2.4; fx += 6) {
          bin.box(.3, 3.1, .18, mat('#b8a98e'), fx, 0, wz);
          bin.box(.3, 3.1, .18, mat('#b8a98e'), fx + 3.4, 0, wz);
          bin.box(4.0, .5, .22, mat('#8a6d4d'), fx + 1.7, 2.7, wz + (wz < 0 ? -.02 : .02));
          bin.box(2.8, 2.3, .05, mat('#22303a'), fx + 1.7, .15, wz - (wz < 0 ? .05 : -.05));
        }
      }
      for (const s of [-1, 1]) {
        T.planter(bin, s * iw * .6, -id * .4); T.planter(bin, s * iw * .6, id * .4);
        T.disc(bin, skirtM, s * iw * .6, -id * .4, .8); T.disc(bin, skirtM, s * iw * .6, id * .4, .8);
        bin.box(1.8, .45, .5, mat('#8a6d4d'), s * iw * .6, 0, 0);     // benches
        T.disc(bin, skirtM, s * iw * .6, 0, 1.1, .6);
      }
      T.rug(bin, 0, 0, 5.4, 5.4, rugTex('#7a4b56', '#c9b8a8'));       // atrium medallion
      for (let i = 0; i < 3; i++) {                                    // kiosk row
        const kz = -id * .5 + i * id * .5;
        T.counter(bin, 0, kz, 2.2, Math.PI / 2, '#7d6650');
        bin.box(2.6, .12, 2.6, mat('#b8443c'), 0, 2.2, kz);            // kiosk canopy
        T.disc(bin, skirtM, 0, kz, 1.5);
      }
      break;
    }
    case 'hall': case 'museum': {
      const rows = Math.max(2, Math.floor(id / 3.4));
      for (let r = 0; r < rows; r++) for (let i = 0; i < Math.floor(iw / 1.6); i++) {
        T.desk(bin, -iw * .7 + i * 1.6, -id * .5 + r * 3.2, 0);
        T.disc(bin, skirtM, -iw * .7 + i * 1.6, -id * .5 + r * 3.2, .9, .6);
      }
      bin.box(1.6, .5, .8, mat('#6d5638'), 0, 0, id - 2.2);            // podium
      bin.box(.04, .5, .04, M.dark, .3, 1.0, id - 2.2);                // lectern mic
      T.disc(bin, skirtM, 0, id - 2.2, 1.1);
      T.artFrame(bin, 0, id - .17, Math.PI, 4.0, 1.6,
        signTexture(kind === 'museum' ? 'HAVENBROOK — OUR STORY' : 'LECTURE HALL', { bg: '#2c3e50', w: 640, h: 160 }));
      for (const s of [-1, 1]) bin.box(.8, 2.1, .04, mat(s < 0 ? '#8a2830' : '#28496d'), s * 2.6, 1.5, id - .2);  // banners flanking
      if (kind === 'museum') for (let i = 0; i < 4; i++) {
        const px = -iw * .8 + i * iw * .5;
        bin.box(.7, 1.15, .7, mat('#d9d4ca'), px, 0, id * .15);
        bin.box(.34, .34, .34, mat(['#c9a24e', '#7a9ab8', '#b8b0a4', '#8ab87a'][i]), px, 1.15, id * .15);
        bin.box(.9, .7, .9, M.crt, px, 1.15, id * .15);                // glass display case
        T.disc(bin, skirtM, px, id * .15, .8);
      }
      sconcePair();
      break;
    }
    case 'classroom': {
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
        T.desk(bin, -iw * .6 + i * iw * .4, -id * .35 + r * 2.2, 0);
        T.chair(bin, -iw * .6 + i * iw * .4, -id * .35 + r * 2.2 + .75, Math.PI);
      }
      bin.box(4.4, 1.8, .06, mat('#2b4a3a'), 0, 1.2, -id + .05);       // board
      T.desk(bin, 0, -id + 1.6, 0);
      T.chair(bin, 0, -id + .8, 0);
      T.bookshelf(bin, -iw + .5, id - 1.0, id * .5, Math.PI / 2);      // book wall
      T.clock(bin, iw * .55, -id + .16, 0);
      T.artFrame(bin, -iw * .5, -id + .17, 0, 1.4, 1.0, artTex('#3f5d8a', '#e8e0c8', 'MAP'));
      T.artFrame(bin, iw * .5, -id + .17, 0, 1.4, 1.0, artTex('#8a3f36', '#e8e0c8', 'ABC'));
      T.plant(bin, iw - 1.0, -id + 1.4, .8);
      sconcePair();
      break;
    }
    case 'office': {
      T.counter(bin, 0, -id * .15, iw * 1.5, 0, '#8a7a68');
      T.disc(bin, skirtM, 0, -id * .15, iw * .8, .8);
      for (let i = 0; i < 4; i++) {                                    // queue posts + rope
        const qx = -iw * .4 + i * iw * .27;
        bin.box(.07, .95, .07, M.metal, qx, 0, id * .3);
        bin.box(.07, .95, .07, M.metal, qx, 0, id * .3 + 1.4);
        if (i < 3) bin.box(iw * .27, .03, .03, mat('#7a3030'), qx + iw * .27 / 2, .82, id * .3);
      }
      for (let i = 0; i < 3; i++) T.desk(bin, -iw * .4 + i * iw * .4, -id + 1.6, Math.PI);
      for (let i = 0; i < 4; i++) T.chair(bin, iw - 1.0, -id * .4 + i * 1.05, -Math.PI / 2);  // waiting row
      const wc = new THREE.CylinderGeometry(.2, .2, 1.1, 10); wc.translate(-iw + .9, 0, -id + 1.2);
      bin.add(wc, mat('#b8ccd8'), 0, 0, 0);                            // water cooler
      const wb = new THREE.CylinderGeometry(.16, .13, .4, 10); wb.translate(-iw + .9, 1.3, -id + 1.2);
      bin.add(wb, M.crt, 0, 0, 0);
      T.artFrame(bin, -iw + .17, id * .3, Math.PI / 2, 2.0, 1.2, signTexture('DIRECTORY', { bg: '#233038', w: 512, h: 128 }));
      sconcePair();
      break;
    }
    case 'lobby': {
      T.counter(bin, 0, -id * .35, 3.4, 0, '#5d4a3a');
      T.disc(bin, skirtM, 0, -id * .35, 2.0, .8);
      T.rug(bin, 0, id * .15, 3.4, id * .9, rugTex('#3d4f5d', '#9aa8b2'));   // runner
      for (const s of [-1, 1]) {
        bin.box(.6, ih, .6, mat('#b8b0a2'), s * iw * .55, 0, -id * .2);    // columns
        T.disc(bin, skirtM, s * iw * .55, -id * .2, .8);
        T.sofa(bin, s * iw * .5, id * .35, 0, '#7a5a48');
        T.disc(bin, skirtM, s * iw * .5, id * .35, 1.4, .9);
        T.planter(bin, s * iw * .75, id * .6);
        T.lamp(bin, s * iw * .72, id * .28);
      }
      for (let i = 0; i < 3; i++) {
        bin.box(.9, 2.3, .12, M.metal, -1.0 + i, 0, id - .12);          // lifts
        bin.box(.3, .12, .05, M.sconce, -1.0 + i, 2.4, id - .1);        // lift indicators
      }
      T.artFrame(bin, 0, -id + .17, 0, 2.6, .9, signTexture('DIRECTORY', { bg: '#233038', w: 512, h: 128 }));
      T.artFrame(bin, -iw + .17, 0, Math.PI / 2, 1.8, 1.2, artTex('#28496d', '#d8c9a8', 'EST. 1974'));
      sconcePair();
      break;
    }
    case 'chapel': {
      const rows = Math.max(3, Math.floor(id / 2.6));
      T.rug(bin, 0, 0, 1.2, id * 1.6, rugTex('#7a2830', '#c9b8a8'));    // aisle runner
      for (let r = 0; r < rows; r++) for (const s of [-1, 1]) {
        bin.box(iw * .36, .95, .5, mat('#6d4a30'), s * iw * .33, 0, -id * .45 + r * 2.4);
        T.disc(bin, skirtM, s * iw * .33, -id * .45 + r * 2.4, iw * .2, .5);
      }
      bin.box(.8, 1.4, .5, mat('#5a4030'), 0, 0, id - 1.4);             // altar rail
      for (const s of [-1, 1]) {                                        // candle stands
        bin.box(.05, 1.3, .05, M.metal, s * 1.1, 0, id - 1.6);
        for (let i = 0; i < 3; i++) bin.box(.04, .14, .04, M.candle, s * 1.1 - .1 + i * .1, 1.3, id - 1.6);
      }
      bin.box(.14, 2.4, .14, mat('#c9a24e'), 0, 1.2, id - .8);
      bin.box(.9, .14, .14, mat('#c9a24e'), 0, 2.9, id - .8);           // cross
      T.artFrame(bin, 0, -id + .17, 0, 1.6, 2.4, stainedTex(), ih);     // stained glass
      sconcePair();
      break;
    }
    default: {   /* home — living/kitchen/dining open plan */
      T.rug(bin, -iw * .3, id * .1, 3.2, 2.3, rugTex('#8a4a44', '#d8c9a8'));
      T.sofa(bin, -iw * .3, id * .28, Math.PI);
      T.disc(bin, skirtM, -iw * .3, id * .28, 1.5, .9);
      T.chair(bin, -iw * .3 - 1.5, id * .1, Math.PI * .7);              // armchair
      bin.box(1.3, .45, .5, mat('#4a3b2e'), -iw * .3, 0, -id * .18);    // coffee table
      T.disc(bin, skirtM, -iw * .3, -id * .18, .9, .5);
      bin.box(1.8, .9, .14, M.dark, -iw * .3, 0, -id + .5);
      bin.box(1.4, .9, .05, M.screen, -iw * .3, .9, -id + .58);         // TV
      T.kitchenRun(bin, iw * .45, -id * .3, id * .8, Math.PI / 2);
      T.disc(bin, skirtM, iw * .45, -id * .3, .9, id * .45);
      T.table(bin, iw * .35, id * .45, .55);
      T.disc(bin, skirtM, iw * .35, id * .45, 1.0);
      T.chair(bin, iw * .35 - .75, id * .45, Math.PI / 2); T.chair(bin, iw * .35 + .75, id * .45, -Math.PI / 2);
      bin.box(2.1, .65, 1.6, mat('#d8dee4'), iw * .62, 0, id * .8);     // bed in the corner
      bin.box(2.0, .18, 1.0, mat('#7a9ab8'), iw * .62, .65, id * .82);
      T.disc(bin, skirtM, iw * .62, id * .8, 1.5, 1.2);
      bin.box(.45, .45, .45, mat('#6d4a30'), iw * .62 - 1.3, 0, id - .6);  // nightstand
      T.lamp(bin, -iw * .3 + 1.5, id * .42);                             // floor lamp by sofa
      T.bookshelf(bin, -iw + .6, -id * .4, id * .4, Math.PI / 2);        // bookcase
      T.plant(bin, iw - .9, -id + 1.2);
      T.clock(bin, 0, -id + .16, 0);
    }
  }
}

/* build (once per building) a sealed furnished room centred at STAGE —
   seed drives palette drift and layout jitter so same-type buildings differ */
function buildRoom(kind, w, d, h, wallHex, floorTex, accentTex, seed) {
  const g = new THREE.Group();
  const bin = new GeoBin();
  const iw = w / 2, id = d / 2;
  const rng = mulberry32(seed);
  const tint = new THREE.Color(wallHex);
  tint.offsetHSL(0, (rng() - .5) * .04, (rng() - .5) * .06);   // per-building palette drift
  const wallM = mat('#' + tint.getHexString(), { roughness: .95 });
  const wainsM = mat('#' + tint.clone().offsetHSL(0, .02, -.08).getHexString(), { roughness: .9 });
  const beamM = mat('#' + tint.clone().offsetHSL(0, 0, -.11).getHexString(), { roughness: .92 });
  const skirtM = new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,.55)'), transparent: true, depthWrite: false });
  const poolM = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,214,140,.5)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  /* wall-frame mapper: P(u, n) → world [x,z], u along wall, n out of it */
  const wallP = (cx, cz, ry) => (u, n) => [cx + Math.cos(ry) * u + Math.sin(ry) * n,
                                          cz - Math.sin(ry) * u + Math.cos(ry) * n];
  const mats = { skirtM, poolM, wallP };

  // floor / ceiling / 4 walls — solid boxes so nothing see-through
  bin.box(w, .12, d, new THREE.MeshStandardMaterial({ map: floorTex, roughness: .9 }), 0, -.12, 0);
  bin.box(w, .12, d, wallM, 0, h, 0);
  const t = .16;
  bin.box(w, h, t, wallM, 0, 0, -id + t / 2); bin.box(w, h, t, wallM, 0, 0, id - t / 2);
  bin.box(t, h, d, wallM, -iw + t / 2, 0, 0); bin.box(t, h, d, wallM, iw - t / 2, 0, 0);
  // wainscot band + chair rail on all four walls
  for (const wz of [-id + .19, id - .19]) {
    bin.box(w, .92, .05, wainsM, 0, 0, wz);
    bin.box(w, .07, .09, M.trim, 0, .92, wz);                    // chair rail
    bin.box(w, .12, .05, M.trim, 0, 0, wz);                      // skirting
    bin.box(w, .08, .07, M.trim, 0, h - .1, wz);                 // crown line
  }
  for (const wx of [-iw + .19, iw - .19]) {
    bin.box(.05, .92, d, wainsM, wx, 0, 0);
    bin.box(.09, .07, d, M.trim, wx, .92, 0);
    bin.box(.05, .12, d, M.trim, wx, 0, 0);
    bin.box(.07, .08, d, M.trim, wx, h - .1, 0);
  }
  // pilasters every ~5m in the formal rooms
  if (['mall', 'hall', 'lobby', 'museum', 'chapel', 'office', 'store'].includes(kind)) {
    for (let px = -iw + 2.2; px < iw - 1.5; px += 5) {
      bin.box(.34, h - .2, .14, wainsM, px, 0, -id + .23);
      bin.box(.34, h - .2, .14, wainsM, px, 0, id - .23);
    }
  }
  // coffered ceiling grid for tall spaces — drops the perceived volume
  if (h >= 4) {
    for (let gx = -iw + 2; gx < iw - 1; gx += 4) bin.box(.26, .22, d - .6, beamM, gx, h - .26, 0);
    for (let gz = -id + 2; gz < id - 1; gz += 4) bin.box(w - .6, .22, .26, beamM, 0, h - .26, gz);
  }

  // entrance door centred on the -z wall — frame, double leaf, exit sign
  {
    const P = wallP(0, -id + .16, 0);
    const [fx, fz] = P(0, .02);
    bin.box(2.1, .14, .12, M.trim, fx, 2.3, fz);                          // head
    for (const s of [-1, 1]) {
      const [jx, jz] = P(s * 1.02, .02);
      bin.box(.14, 2.44, .12, M.trim, jx, 0, jz);                         // jambs
      const [dx, dz] = P(s * .49, .03);
      bin.box(.9, 2.2, .07, mat('#5d4433'), dx, .04, dz);                 // leaf
      const [hx, hz] = P(s * .14, .08);
      bin.box(.05, .16, .05, M.metal, hx, 1.0, hz);                       // handle
    }
    const [ex, ez] = P(0, .1);
    bin.box(.72, .3, .06, M.exit, ex, 2.52, ez);                          // EXIT sign
    T.disc(bin, skirtM, 0, -id + 1.0, 1.4, .9);                           // door mat shadow
  }

  // framed windows on the long walls — slab, sill, mullions, daylight glow
  const winTex = windowGlow();
  const nWin = Math.max(2, Math.floor(w / 6));
  const winAt = (cx, cz, ry) => {
    const P = wallP(cx, cz, ry), y0 = .95;
    let [X, Z] = P(0, .01);
    bin.box(1.95, .12, .06, M.trim, X, y0 + 1.5, Z, ry);                  // head
    [X, Z] = P(0, .05); bin.box(2.0, .1, .14, M.trim, X, y0 - .08, Z, ry); // sill
    [X, Z] = P(-.92, .02); bin.box(.1, 1.68, .07, M.trim, X, y0 - .04, Z, ry);
    [X, Z] = P(.92, .02); bin.box(.1, 1.68, .07, M.trim, X, y0 - .04, Z, ry);
    [X, Z] = P(0, .045);
    const p = new THREE.PlaneGeometry(1.72, 1.55); p.rotateY(ry);
    p.translate(X, y0 + .8, Z); bin.add(p, new THREE.MeshBasicMaterial({ map: winTex }), 0, 0, 0);
    [X, Z] = P(0, .065);
    bin.box(.05, 1.55, .03, M.trim, X, y0 + .02, Z, ry);                  // mullion V
    bin.box(1.75, .05, .03, M.trim, X, y0 + .78, Z, ry);                  // mullion H
    return { P };
  };
  const winXs = [];
  for (let i = 0; i < nWin; i++) {
    const wx = -iw * .7 + i * (iw * 1.4 / Math.max(1, nWin - 1));
    winXs.push(wx);
    winAt(wx, -id + .16, 0);
    winAt(wx, id - .16, Math.PI);
  }
  // slanted daylight shafts from the two outermost -z windows
  for (const wx of [winXs[0], winXs[winXs.length - 1]]) {
    const sh = new THREE.PlaneGeometry(1.7, 3.2);
    sh.rotateX(-.5); sh.translate(wx, 1.7, -id + 1.55);
    bin.add(sh, shaftM, 0, 0, 0);
  }
  if (accentTex) T.artFrame(bin, iw - .18, 0, -Math.PI / 2, 1.6, 1.0, accentTex, h);

  furnish(kind, bin, rng, iw, id, h, mats);

  // ceiling pendants + a warm pool under each on the floor
  const nP = Math.max(1, Math.floor(w / 9));
  for (let i = 0; i < nP; i++) {
    const px = -iw * .5 + i * (iw / Math.max(1, nP - 1));
    T.pendant(bin, px, 0, h);
    T.disc(bin, poolM, px, 0, 2.3, 2.3, .016);
  }
  if (kind === 'mall') bin.box(iw, .07, 1.5, M.glow, 0, h - .09, 0);      // skylight strip
  // gloss streaks on the hard-floor archetypes — reads as a sealed floor
  if (['medical', 'store', 'mall', 'office', 'lobby', 'classroom'].includes(kind)) {
    T.disc(bin, poolM, -iw * .3, -id * .3, 4.5, 1.6, .015);
    T.disc(bin, poolM, iw * .35, id * .35, 4.5, 1.6, .015);
  }
  bin.build(g);
  // interior lights live on the interior layer only
  const amb = new THREE.AmbientLight('#cfc8bd', .5);
  const hemi = new THREE.HemisphereLight('#fff4e0', '#6d6258', .4);   // warm top / floor bounce
  const p1 = new THREE.PointLight('#ffe6b8', 34, 0, 1.9); p1.position.set(0, h - 1.1, 0);
  const p2 = new THREE.PointLight('#fff2d8', 14, 0, 2.0); p2.position.set(0, h - 1.2, d * .3);
  g.add(amb, hemi, p1, p2);
  if (ULTRA()) {
    /* real soft shadows indoors: the key pendant casts a cube shadow map
       (static room — one needsUpdate bake is enough), plus a back-wall
       wash for depth */
    p1.castShadow = true;
    p1.shadow.mapSize.set(1024, 1024);
    p1.shadow.camera.near = .3; p1.shadow.camera.far = 30;
    p1.shadow.bias = -0.004;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const p3 = new THREE.PointLight('#ffd9a8', 10, 0, 2.2);
    p3.position.set(0, h - 1.0, -d * .35);
    g.add(p3);
    if (window.__renderer) window.__renderer.shadowMap.needsUpdate = true;
  }
  g.position.copy(STAGE);
  g.traverse(o => o.layers.set(LYR));
  return g;
}

/* palette + footprint per archetype (w/d shrink to the room shell) */
function roomSpec(kind, b) {
  const w = Math.min(Math.max((b.w || 22) - 1.6, 9), 34);
  const d = Math.min(Math.max((b.d || 18) - 1.6, 8), 26);
  const tall = { mall: 5.2, hall: 4.6, lobby: 4.2, chapel: 5.0, store: 4.0 };
  const h = tall[kind] || 3.3;
  const wall = { medical: '#dfe8ec', shop: '#e6dfd2', store: '#e0dcd2', cafe: '#e8d8c4',
    mall: '#e4e0d8', hall: '#ddd8cc', museum: '#e2ddd4', classroom: '#e0ddd0',
    office: '#d8dce0', home: '#e6dccb', lobby: '#d9d4cc', chapel: '#e8e0cc' }[kind] || '#e0dcd0';
  const floor = { medical: tileFloor('#dfe4e6', '#c9cfd2'), store: tileFloor('#dcd8cf', '#c8c4ba'),
    mall: tileFloor('#e0d8cc', '#cfc6b8'), office: tileFloor('#d8dad4', '#c6c8c2'),
    lobby: tileFloor('#d0ccc4', '#bab6ac'), classroom: tileFloor('#d8d4c8', '#c6c2b6') }[kind] || woodFloor();
  return { w, d, h, wall, floor };
}

/* ---------------- footprint picking ---------------- */
const LOCAL = (b, px, pz) => {
  const rot = b.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  const dx = px - b.x, dz = pz - b.z;
  return [dx * c - dz * s, dx * s + dz * c];
};
const inRect = (b, px, pz, pad = 0) => {
  const [lx, lz] = LOCAL(b, px, pz);
  return Math.abs(lx) <= (b.w || 0) / 2 + pad && Math.abs(lz) <= (b.d || 0) / 2 + pad;
};
// zones carry no w/d — give the two named zones a generous implicit rect
const ZONE_RECT = { housing: { w: 460, d: 290 }, preservecommons: { w: 120, d: 90 },
  park: { w: 448, d: 360 } };   // PARK_ZONE x0:352..800, z0:-60..300

export function pickBuildingAt(px, pz) {
  let best = null, bestArea = 1e12;
  const tryB = (b, cat, name) => {
    const w = b.w || (ZONE_RECT[b.id] && ZONE_RECT[b.id].w) || 0;
    const d = b.d || (ZONE_RECT[b.id] && ZONE_RECT[b.id].d) || 0;
    if (!w) return;
    const bb = { ...b, w, d };
    if (inRect(bb, px, pz, 1.5) && w * d < bestArea) { best = { ...bb, cat: cat || b.cat, name: name || b.name }; bestArea = w * d; }
  };
  for (const b of BUILDINGS) tryB(b);
  for (const f of FILLER) tryB({ ...f, cat: 'civic', name: f.sign || ({ tower: 'Downtown office', skyscraper: 'Downtown tower' }[f.type] || 'Town building') });
  for (const a of APARTMENTS) tryB({ ...a, type: 'apartment', cat: 'res' });
  if (best) return best;
  // unregistered filler/house: nearest centre within ~16m of the hit point
  let near = null, nd = 16;
  for (const f of [...FILLER, ...APARTMENTS]) {
    const dist = Math.hypot(f.x - px, f.z - pz);
    if (dist < nd) { nd = dist; near = f; }
  }
  return near ? { ...near, cat: 'res', name: near.name || 'Residential building' } : null;
}

/* ---------------- install ---------------- */
export function installInterior({ scene, camera, getOrtho, renderer, fly, syncAnglesFromCam, setActiveCam, camTween }) {
  if (typeof document === 'undefined') return null;
  const dom = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const rooms = new Map();          // archetype → {group, w, d, h}
  const stage = new THREE.Group();  // one parent: only this stays visible inside
  scene.add(stage);
  const I = {
    on: false, b: null, kind: null, spec: null,
    saved: { p: new THREE.Vector3(), q: new THREE.Quaternion(), ortho: false, vis: new Map() },
  };

  /* ---------- HUD ---------- */
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#05080a;opacity:0;pointer-events:none;transition:opacity .34s;z-index:70';
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:18px;bottom:18px;z-index:72;max-width:min(460px,92vw);
    background:rgba(12,17,21,.92);border:1px solid rgba(255,255,255,.16);border-radius:14px;
    padding:14px 18px;color:#e8ecef;font-family:"Segoe UI",system-ui,sans-serif;
    backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,.5);display:none`;
  const hint = document.createElement('div');
  hint.style.cssText = `position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:72;
    background:rgba(12,17,21,.85);border:1px solid rgba(255,255,255,.15);border-radius:9px;
    color:#cdd7dd;font:600 11.5px "Segoe UI",sans-serif;letter-spacing:.5px;padding:7px 14px;display:none`;
  hint.innerHTML = 'INTERIOR — drag to look · WASD to walk · ESC to exit';
  const exitBtn = document.createElement('div');
  exitBtn.style.cssText = `position:fixed;top:14px;right:14px;z-index:72;cursor:pointer;
    background:rgba(120,30,30,.85);border:1px solid rgba(255,255,255,.2);border-radius:9px;
    color:#fff;font:700 11.5px "Segoe UI",sans-serif;letter-spacing:.5px;padding:8px 14px;display:none`;
  exitBtn.textContent = '✕ EXIT BUILDING';
  exitBtn.addEventListener('click', () => exit());
  document.body.append(fade, panel, hint, exitBtn);

  const CAT_NAME = { free: 'Provided free', health: 'Healthcare', community: 'Community',
    civic: 'Civic', res: 'Residential' };
  const money = n => '$' + (n / 1e6).toFixed(2) + 'M';

  function enter(b) {
    if (I.on || !b) return;
    const kind = BY_ID[b.id] ?? BY_TYPE[b.type] ?? (b.type === 'parkzone' ? null : 'shop');
    if (kind === null) { window.__uiShowCard && window.__uiShowCard(b.id); return; }
    window.__endTour && window.__endTour();
    if (camTween) camTween.on = false;
    // capture the outdoor pose synchronously — inside the timeout the tick
    // loop would have already run against a stale spec and clamped the camera
    I.saved.p.copy(camera.position); I.saved.q.copy(camera.quaternion);
    I.saved.ortho = !!getOrtho();
    I.on = true; I.b = b; I.kind = kind; I.spec = null;
    fade.style.opacity = '1';
    setTimeout(() => {
      const key = b.id || b.name || kind;    // per-building room — same type
      let spec = rooms.get(key);             // still yields a distinct interior
      if (!spec) {
        spec = roomSpec(kind, b);
        let seed = 0;
        for (const c of String(key)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
        spec.group = buildRoom(kind, spec.w, spec.d, spec.h, spec.wall, spec.floor,
          b.id ? artTex('#20313d', '#ffd97a', b.name || 'HAVENBROOK') : null, seed);
        stage.add(spec.group);
        rooms.set(key, spec);
      }
      // hide the whole town — sprites ignore depth and would ghost through the
      // sealed room anyway; culling every sibling also makes interiors cheap
      I.saved.vis.clear();
      for (const c of scene.children) { I.saved.vis.set(c, c.visible); c.visible = c === stage; }
      I.spec = spec;
      // every cached room shares the stage — only the current one may render
      for (const r of rooms.values()) r.group.visible = r === spec;
      camera.layers.enable(LYR);
      setActiveCam(camera);
      // spawn in a corner so the furnished middle of the room is in frame
      const cx = -spec.w * .3, cz = spec.d * .32;
      camera.position.set(STAGE.x + cx, STAGE.y + EYE, STAGE.z + cz);
      fly.auto = false; fly.yaw = Math.atan2(cx, cz); fly.pitch = 0;
      camera.quaternion.setFromEuler(new THREE.Euler(0, fly.yaw, 0, 'YXZ'));
      syncAnglesFromCam();
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px">
          <h3 style="margin:0;font-size:16px">${b.num ? `<span style="color:${CATEGORY_COLORS[b.cat]}">#${b.num}</span> ` : ''}${b.name}</h3>
        </div>
        ${b.cat ? `<span style="display:inline-block;font-size:10px;letter-spacing:.6px;padding:2px 8px;border-radius:20px;color:#fff;margin:5px 0;background:${CATEGORY_COLORS[b.cat] || '#555'}">${CAT_NAME[b.cat] || b.cat}</span>` : ''}
        <div style="font-size:12px;color:#ffd97a;font-weight:600">${b.cost ? `Cost ${money(b.cost)} — ${(b.cost / 1e5).toFixed(1)}% of the $10.00M budget` : (b.id || b.desc) ? 'Provided free under the town plan' : 'Not a build-budget line item'}</div>
        ${b.desc ? `<p style="margin:7px 0 0;font-size:12.5px;line-height:1.55;color:#c6d1d8">${b.desc}</p>` : ''}
        <p style="margin:8px 0 0;font-size:11px;color:#8fa1ab">Interior: ${ARCH_NAME[kind] || kind}
          ${b.w ? ` · footprint ${Math.round(b.w)}m × ${Math.round(b.d)}m${b.h ? ` × ${b.h}m tall` : ''}` : ''}
          · furnished interior — walk with WASD</p>`;
      panel.style.display = 'block'; hint.style.display = 'block'; exitBtn.style.display = 'block';
      fade.style.opacity = '0';
    }, 190);
  }
  function exit() {
    if (!I.on) return;
    fade.style.opacity = '1';
    setTimeout(() => {
      camera.position.copy(I.saved.p); camera.quaternion.copy(I.saved.q);
      camera.layers.disable(LYR);
      for (const c of scene.children) if (I.saved.vis.has(c)) c.visible = I.saved.vis.get(c);
      if (I.saved.ortho && getOrtho()) setActiveCam(getOrtho());
      syncAnglesFromCam();
      panel.style.display = 'none'; hint.style.display = 'none'; exitBtn.style.display = 'none';
      I.on = false; I.b = null; I.spec = null; fly.auto = false;
      fade.style.opacity = '0';
    }, 190);
  }

  /* click = short press without drag; picks against the real rendered scene so
     walls, merged facades and props all yield a correct hit point */
  let dx = 0, dy = 0, t0 = 0;
  dom.addEventListener('pointerdown', e => { dx = e.clientX; dy = e.clientY; t0 = performance.now(); });
  dom.addEventListener('pointerup', e => {
    if (I.on) return;
    // distance is the real click/drag discriminator; the time bound stays
    // loose because software-GL input lag can stretch a click past ~1s
    if (Math.hypot(e.clientX - dx, e.clientY - dy) > 6 || performance.now() - t0 > 1000) return;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, getOrtho() || camera);
    ray.far = 4000;
    const hit = ray.intersectObjects(scene.children, true)[0];
    if (!hit) return;
    const b = pickBuildingAt(hit.point.x, hit.point.z);
    if (b) enter(b);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') exit(); });

  /* walk loop — clamped to the room's inner walls */
  I.tick = dt => {
    if (!I.on || !I.spec) return;
    const sp = (fly.keys.ShiftLeft || fly.keys.ShiftRight ? 7 : 3.4) * dt;
    const f = new THREE.Vector3(-Math.sin(fly.yaw), 0, -Math.cos(fly.yaw));
    const r = new THREE.Vector3(-Math.sin(fly.yaw - Math.PI / 2), 0, -Math.cos(fly.yaw - Math.PI / 2));
    const mv = new THREE.Vector3();
    if (fly.keys.KeyW || fly.keys.ArrowUp) mv.add(f);
    if (fly.keys.KeyS || fly.keys.ArrowDown) mv.sub(f);
    if (fly.keys.KeyA || fly.keys.ArrowLeft) mv.sub(r);
    if (fly.keys.KeyD || fly.keys.ArrowRight) mv.add(r);
    if (mv.lengthSq()) camera.position.addScaledVector(mv.normalize(), sp);
    const ix = I.spec.w / 2 - .55, iz = I.spec.d / 2 - .55;
    camera.position.x = Math.max(STAGE.x - ix, Math.min(STAGE.x + ix, camera.position.x));
    camera.position.z = Math.max(STAGE.z - iz, Math.min(STAGE.z + iz, camera.position.z));
    camera.position.y = STAGE.y + EYE;
    camera.quaternion.setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'));
  };
  I.enter = enter; I.exit = exit;
  I.byId = id => { if (id) enter([...BUILDINGS, ...APARTMENTS, ...FILLER].find(b => b.id === id || b.name === id)); };
  window.__enterInterior = I.byId;
  window.__exitInterior = exit;
  window.__interior = I;
  return I;
}
