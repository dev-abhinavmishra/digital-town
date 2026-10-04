// lib.js — seeded RNG, canvas textures, geometry helpers, merging & instancing
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================= RNG ================= */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const R = mulberry32(20260924);          // global deterministic stream

/* MIN-tier scene density knob — builders thin scattered instanced content
   (trees, cars, people, sprigs, furniture) by this factor. Shared mutable so
   pickTier can set it before any builder runs; 1 = full scene. */
export const DETAIL = { f: 1 };
/* keep a deterministic, evenly-spread subset of a collected placement list —
   preserves species/order mix (drop every Kth slot) */
export const thin = arr => DETAIL.f >= 1 ? arr
  : arr.filter((_, i) => i % Math.max(1, Math.round(1 / DETAIL.f)) === 0);
export const rr = (a, b) => a + R() * (b - a);
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];

/* ============== canvas helpers ============== */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function canvasTex(c, { srgb = true, repeat = null, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/* noise sprinkle helper */
function grain(ctx, w, h, n, alpha, lo = 0, hi = 255) {
  for (let i = 0; i < n; i++) {
    const v = lo + R() * (hi - lo);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
}
/* vertical soft streak stains */
function streaks(x, W, top, h, n, alpha = .05) {
  for (let i = 0; i < n; i++) {
    const sx = R() * W, sw = 1 + R() * 3, sh = h * (.4 + R() * .6);
    const g = x.createLinearGradient(0, top, 0, top + sh);
    g.addColorStop(0, `rgba(30,26,20,${alpha})`); g.addColorStop(1, 'rgba(30,26,20,0)');
    x.fillStyle = g; x.fillRect(sx, top, sw, sh);
  }
}

/* Sobel a grayscale bump canvas into a tangent-space normal map canvas.
   Runs on a downscaled copy (default 512) — normal maps only need to carry
   smooth gradients, and this keeps the bake fast enough for module eval.
   One-time cost per unique painter config (cached alongside the maps). */
function bumpToNormalCanvas(cb, strength = 1.6, res = 384) {
  const w = Math.min(res, cb.width), h = Math.min(res, cb.height);
  const [ds, xds] = makeCanvas(w, h);
  xds.drawImage(cb, 0, 0, w, h);
  const src = xds.getImageData(0, 0, w, h).data;
  // luminance plane first — Sobel then reads a flat Float32Array
  const lum = new Float32Array(w * h);
  for (let i = 0, j = 0; i < src.length; i += 4, j++)
    lum[j] = src[i] * .299 + src[i + 1] * .587 + src[i + 2] * .114;
  const [cn, xn] = makeCanvas(w, h);
  const out = xn.createImageData(w, h);
  const d = out.data, s = strength / 255;
  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h, yp = (y + 1) % h, ro = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (lum[ym * w + xp] + 2 * lum[ro + xp] + lum[yp * w + xp])
               - (lum[ym * w + xm] + 2 * lum[ro + xm] + lum[yp * w + xm]);
      const dy = (lum[yp * w + xm] + 2 * lum[yp * w + x] + lum[yp * w + xp])
               - (lum[ym * w + xm] + 2 * lum[ym * w + x] + lum[ym * w + xp]);
      const nx = -dx * s, ny = dy * s, il = 1 / Math.hypot(nx, ny, 1);
      const o = (ro + x) * 4;
      d[o] = (nx * il * .5 + .5) * 255;
      d[o + 1] = (ny * il * .5 + .5) * 255;
      d[o + 2] = (il * .5 + .5) * 255;
      d[o + 3] = 255;
    }
  }
  xn.putImageData(out, 0, 0);
  return cn;
}

/* ============== ground / landscape ============== */
export function grassTexture() {
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#577c46'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = R();
    x.fillStyle = v < .5 ? 'rgba(60,100,45,.25)' : (v < .8 ? 'rgba(120,160,90,.18)' : 'rgba(90,120,60,.22)');
    x.fillRect(R() * 512, R() * 512, 2, 2 + R() * 3);
  }
  for (let i = 0; i < 60; i++) {
    const bx = R() * 512, by = R() * 512, br = 20 + R() * 60;
    const gr = x.createRadialGradient(bx, by, 0, bx, by, br);
    const col = R() < .5 ? '110,150,80' : '80,115,60';
    gr.addColorStop(0, `rgba(${col},.14)`); gr.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = gr;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      x.beginPath(); x.arc(bx + ox, by + oy, br, 0, 7); x.fill();
    }
  }
  grain(x, 512, 512, 1500, .05);
  return canvasTex(c, { repeat: [60, 60] });
}
export function asphaltTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#3c3f42'; x.fillRect(0, 0, 256, 256);
  grain(x, 256, 256, 5000, .10, 30, 110);
  for (let i = 0; i < 300; i++) {
    x.fillStyle = 'rgba(180,180,175,.08)';
    x.fillRect(R() * 256, R() * 256, 1.5, 1.5);
  }
  return canvasTex(c, { repeat: [40, 40] });
}
export function sidewalkTexture() {
  const [c, x] = makeCanvas(128, 128);
  x.fillStyle = '#9aa0a3'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(60,65,70,.5)'; x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
                                     x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  grain(x, 128, 128, 1200, .07);
  return canvasTex(c, { repeat: [30, 30] });
}
export function plazaTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#b7ac99'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(90,80,65,.45)'; x.lineWidth = 2;
  const s = 32;
  for (let i = 0; i <= 256; i += s) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  grain(x, 256, 256, 1800, .06);
  return canvasTex(c, { repeat: [24, 24] });
}
/* large-scale alpha blotches to break ground tiling (repeat few times over town) */
export function groundOverlayTexture() {
  const [c, x] = makeCanvas(1024, 1024);
  x.clearRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    const bx = R() * 1024, by = R() * 1024, br = 40 + R() * 150;
    const cols = ['88,110,62', '112,138,80', '96,120,66', '124,148,88', '80,102,58'];
    const col = cols[Math.floor(R() * cols.length)];
    const gr = x.createRadialGradient(bx, by, 0, bx, by, br);
    gr.addColorStop(0, `rgba(${col},.30)`); gr.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = gr;
    for (const [ox, oy] of [[0, 0], [1024, 0], [-1024, 0], [0, 1024], [0, -1024]]) {
      x.beginPath(); x.arc(bx + ox, by + oy, br, 0, 7); x.fill();
    }
  }
  // faint dirt patches
  for (let i = 0; i < 60; i++) {
    const bx = R() * 1024, by = R() * 1024, br = 15 + R() * 45;
    const gr = x.createRadialGradient(bx, by, 0, bx, by, br);
    gr.addColorStop(0, 'rgba(140,124,92,.20)'); gr.addColorStop(1, 'rgba(140,124,92,0)');
    x.fillStyle = gr;
    for (const [ox, oy] of [[0, 0], [1024, 0], [-1024, 0], [0, 1024], [0, -1024]]) {
      x.beginPath(); x.arc(bx + ox, by + oy, br, 0, 7); x.fill();
    }
  }
  const t = canvasTex(c, { repeat: [7, 7] });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* fine luminance noise for close-range ground detail — multiplied into the
   diffuse via onBeforeCompile (mean ≈ .94 so it doesn't darken overall);
   faint directional mower streaks sell scale on the big lawn planes */
let _detailN = null;
export function detailNoiseTexture() {
  if (_detailN) return _detailN;
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    const v = 210 + R() * 45;
    x.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},.55)`;
    x.fillRect(R() * 256, R() * 256, 1, 1);
  }
  for (let i = 0; i < 900; i++) {   // grass strokes at random angles — a single
    const v = 200 + R() * 55;     // fixed direction tiles into visible columns
    const px = R() * 256, py = R() * 256, rot = R() * Math.PI;
    x.save(); x.translate(px, py); x.rotate(rot);
    x.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},.3)`;
    x.fillRect(0, 0, 1, 2 + R() * 3);
    x.restore();
  }
  /* mowing-stripe suggestion, broken into jittered segments so it reads as
     worn mow lines instead of a full-width ruler stripe (which crosshatched
     with the stroke layer into a plaid at distance) */
  for (let b = 0; b < 6; b++) {
    const y0 = b * 42 + R() * 8, bandH = 40 + R() * 6;
    for (let sx = 0; sx < 256; sx += 14 + R() * 22) {
      const a = (b % 2 ? .018 : .014) + R() * .012;
      x.fillStyle = `rgba(${b % 2 ? '255,255,255' : '185,185,185'},${a.toFixed(3)})`;
      x.fillRect(sx, y0 + (R() - .5) * 4, 14 + R() * 22, bandH);
    }
  }
  _detailN = canvasTex(c);
  _detailN.wrapS = _detailN.wrapT = THREE.RepeatWrapping;
  return _detailN;
}

/* soft radial blob for cheap contact shadows under buildings/cars — the
   "grounding" cue that sells depth far more than ambient AO alone */
let _blobT = null;
export function blobShadowTexture() {
  if (_blobT) return _blobT;
  const [c, x] = makeCanvas(256, 256);
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,.78)');
  g.addColorStop(.62, 'rgba(0,0,0,.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  _blobT = canvasTex(c);
  return _blobT;
}

/* warm radial glow — lamp pools, dusk halos */
let _glowT = null;
export function warmGlowTexture() {
  if (_glowT) return _glowT;
  const [c, x] = makeCanvas(256, 256);
  const g = x.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,196,110,.9)');
  g.addColorStop(.45, 'rgba(255,160,70,.38)');
  g.addColorStop(1, 'rgba(255,140,50,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  _glowT = canvasTex(c);
  return _glowT;
}

/* drifting cloud shadows — big soft blobs scrolled across the ground, the
   aerial-view depth cue games get from real shadow maps */
let _cloudShT = null;
export function cloudShadowTexture() {
  if (_cloudShT) return _cloudShT;
  const [c, x] = makeCanvas(512, 512);
  x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const cx = R() * 512, cy = R() * 512, r = 40 + R() * 110;
    const d = .15 + R() * .20;
    // wrapped copies keep the gradient centered on each offset copy
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
      const gx = cx + ox, gy = cy + oy;
      if (gx + r < 0 || gx - r > 512 || gy + r < 0 || gy - r > 512) continue;
      const g = x.createRadialGradient(gx, gy, r * .1, gx, gy, r);
      g.addColorStop(0, `rgba(0,0,0,${d})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
  }
  _cloudShT = canvasTex(c);
  _cloudShT.wrapS = _cloudShT.wrapT = THREE.RepeatWrapping;
  return _cloudShT;
}
/* chain onto any material: multiplies a drifting cloud-shadow field sampled
   in WORLD xz (one continuous field across every surface it lands on).
   scale = cloud-texture repeats per meter; speed = uv units per second */
export function attachDriftShadow(mat0, scale = .0015, speed = .004, strength = .3) {
  if (mat0.userData.__drift) return mat0;          // pbr() shares materials —
  mat0.userData.__drift = 1;                       // never attach twice
  const prev = mat0.onBeforeCompile;
  mat0.onBeforeCompile = sh => {
    if (prev) prev(sh);
    sh.uniforms.uCSh = { value: cloudShadowTexture() };
    sh.uniforms.uDriftT = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCShXZ;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wp4 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp4 = instanceMatrix * wp4;
    #endif
    vCShXZ = (modelMatrix * wp4).xz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCSh;\nuniform float uDriftT;\nvarying vec2 vCShXZ;')
      .replace('#include <map_fragment>',
        `#include <map_fragment>
  diffuseColor.rgb *= mix(1.0, texture2D(uCSh, vCShXZ * ${scale.toFixed(7)} + uDriftT * ${speed.toFixed(5)}).r, ${strength.toFixed(3)});`);
  };
  // baked-in params + chained callback make this shader variant unique —
  // without it three.js could reuse another material's compiled program
  const prevKey = prev ? prev.toString() : '';
  mat0.customProgramCacheKey = () =>
    `drift:${scale}:${speed}:${strength}:${prevKey.length}:${prevKey.slice(0, 40)}`;
  mat0.needsUpdate = true;
}

/* deterministic z-order for the stacked surface kit — roads, pads, gutters,
   markings, aprons sit millimetres apart on the ground plane, far inside
   depth-buffer epsilon at aerial range, so they z-fight into angle-dependent
   colour flicker. A per-material polygonOffset rank makes the physically
   higher layer always win; rank mirrors the Y offsets (higher = closer). */
export function lift(m, rank = 1) {
  if (!m || m.userData.__lift === rank) return m;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -rank;
  m.polygonOffsetUnits = -rank;
  m.userData.__lift = rank;
  return m;
}

/* ============== facades ============== */
const texCache = new Map();
function cachedTex(key, maker) {
  if (!texCache.has(key)) {
    const t0 = performance.now();
    const v = maker();
    (window.__prof ||= []).push(['tex:' + key.slice(0, 12), Math.round(performance.now() - t0)]);
    texCache.set(key, v);
  }
  return texCache.get(key);
}

/* generic multi-storey facade — richer painter: brick jitter, deep reveals,
   stone lintels/sills, per-pane sky variance, grime streaks, cornice dentils,
   storefront interiors. Returns {map,bump}. */
export function facadeMaps({ base = '#b8a58e', win = '#24333d', rows = 4, cols = 8,
                                litRatio = 0.13, band = null, brickLines = true,
                                storefront = false, signText = null, signBg = '#223',
                                trim = '#ddd6c8', cornice = true } = {}) {
  const key = 'fac' + JSON.stringify([base, win, rows, cols, litRatio, band, brickLines,
    storefront, signText, signBg, trim, cornice]);
  return cachedTex(key, () => {
    const SS = 2, W = 512, H = 512;             // logical painter space; diffuse canvas supersampled 2x
    const [c, x] = makeCanvas(W * SS, H * SS);   x.scale(SS, SS);
    const [cb, xb] = makeCanvas(W, H);          // bump stays 512 — feeds the normal bake
    const [ce, xe] = makeCanvas(W / 2, H / 2);  // emissive quarter-res — soft glow anyway
    const [cr, xr] = makeCanvas(W / 2, H / 2);  // roughness quarter-res — low-frequency data
    xr.scale(.5, .5);
    xb.fillStyle = '#808080'; xb.fillRect(0, 0, W, H);
    xe.fillStyle = '#000'; xe.fillRect(0, 0, W / 2, H / 2);
    xe.scale(.5, .5);
    xr.fillStyle = '#e0e0e0'; xr.fillRect(0, 0, W, H);   // matte wall baseline (~0.88)

    x.fillStyle = base; x.fillRect(0, 0, W, H);
    // subtle vertical weathering gradient
    const vg = x.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'rgba(255,255,255,.05)'); vg.addColorStop(.7, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,16,12,.10)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    // sun-bleach on the crown + faint panel tone patches (rougher where weathered)
    const sb = x.createLinearGradient(0, 0, 0, H * .45);
    sb.addColorStop(0, 'rgba(255,250,235,.08)'); sb.addColorStop(1, 'rgba(255,250,235,0)');
    x.fillStyle = sb; x.fillRect(0, 0, W, H * .45);
    for (let i = 0; i < 7; i++) {
      const px = R() * W, py = R() * H, pw = 60 + R() * 150, ph = 40 + R() * 130;
      x.fillStyle = `rgba(${R() < .5 ? '255,244,225' : '30,25,18'},${.03 + R() * .05})`;
      x.fillRect(px, py, pw, ph);
      xr.fillStyle = 'rgba(255,255,255,.08)';
      xr.fillRect(px, py, pw, ph);
    }
    streaks(x, W, 6, 110, 5, .05);    // drip lines bleeding down from the parapet
    grain(x, W, H, 9000, .05);

    if (brickLines) {
      // per-brick hue jitter + mortar
      const bh = 16, bw = 64;
      for (let yy = 0, r = 0; yy < H; yy += bh, r++) {
        for (let px = -bw + (r % 2) * (bw / 2); px < W; px += bw) {
          const j = (R() - .5) * 14;
          x.fillStyle = `rgba(${j > 0 ? '255,240,225' : '20,10,5'},${Math.abs(j) / 100})`;
          x.fillRect(px + 1, yy + 1, bw - 2, bh - 2);
          xb.fillStyle = `rgb(${118 + j},${118 + j},${118 + j})`;
          xb.fillRect(px + 1, yy + 1, bw - 2, bh - 2);
        }
      }
      x.strokeStyle = 'rgba(0,0,0,.13)'; x.lineWidth = 1;
      xb.strokeStyle = 'rgba(70,70,70,.9)'; xb.lineWidth = 2;
      for (let yy = 0; yy < H; yy += bh) {
        x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
        xb.beginPath(); xb.moveTo(0, yy); xb.lineTo(W, yy); xb.stroke();
      }
      for (let yy = 0, r = 0; yy < H; yy += bh, r++)
        for (let px = (r % 2) * 32; px < W; px += 64) {
          x.beginPath(); x.moveTo(px, yy); x.lineTo(px, yy + bh); x.stroke();
          xb.beginPath(); xb.moveTo(px, yy); xb.lineTo(px, yy + bh); xb.stroke();
        }
    }

    const top = storefront ? 190 : 14;
    const mh = H - top - 14;
    const cw = W / cols, rh = mh / rows;

    const glassPane = (wx, wy, ww, wh, lit) => {
      const gg = x.createLinearGradient(wx, wy, wx, wy + wh);
      if (lit) {
        gg.addColorStop(0, '#ffe9b0'); gg.addColorStop(1, '#e8b35c');
        const eg = xe.createLinearGradient(wx, wy, wx, wy + wh);
        eg.addColorStop(0, '#ffdf9e'); eg.addColorStop(1, '#d8912f');
        xe.fillStyle = eg; xe.fillRect(wx, wy, ww, wh);
        // curtain shadow on the glow so it doesn't read as a flat lamp
        xe.fillStyle = 'rgba(60,30,0,.35)'; xe.fillRect(wx, wy, ww * .28, wh);
      } else {
        const t1 = ['#5d7d94', '#4a657c', '#3d5a70', '#6d8aa0'][Math.floor(R() * 4)];
        gg.addColorStop(0, '#9db8c8'); gg.addColorStop(.4, t1); gg.addColorStop(1, '#1d2b36');
      }
      x.fillStyle = gg; x.fillRect(wx, wy, ww, wh);
      // diagonal sky glare
      x.fillStyle = 'rgba(255,255,255,.20)';
      x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx + ww * .55, wy);
      x.lineTo(wx, wy + wh * .55); x.closePath(); x.fill();
      xr.fillStyle = lit ? '#606060' : '#484848';    // glass stays glossy
      xr.fillRect(wx, wy, ww, wh);
    };

    for (let r = 0; r < rows; r++) {
      // floor slab shadow/highlight
      x.fillStyle = 'rgba(0,0,0,.20)'; x.fillRect(0, top + r * rh - 3, W, 5);
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, top + r * rh + 2, W, 2);
      for (let col = 0; col < cols; col++) {
        const wx = col * cw + cw * .16, wy = top + r * rh + rh * .14;
        const ww = cw * .68, wh = rh * .64;
        const lit = R() < litRatio;
        const blinds = !lit && R() < .22;
        // stone lintel
        x.fillStyle = trim; x.fillRect(wx - 5, wy - 8, ww + 10, 4);
        x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(wx - 5, wy - 4, ww + 10, 4);
        // deep reveal
        x.fillStyle = 'rgba(0,0,0,.42)'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        xb.fillStyle = '#3a3a3a'; xb.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        xr.fillStyle = '#b4b4b4'; xr.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        // frame
        x.fillStyle = '#d8d5cc'; x.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        xr.fillStyle = '#a8a8a8'; xr.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        glassPane(wx, wy, ww, wh, lit);
        if (blinds) {
          x.fillStyle = 'rgba(230,225,210,.55)';
          for (let by = wy + 3; by < wy + wh - 2; by += 5) x.fillRect(wx + 1, by, ww - 2, 2);
        }
        // mullions
        x.fillStyle = 'rgba(240,238,230,.6)';
        x.fillRect(wx + ww * .5 - 1, wy, 2, wh);
        x.fillRect(wx, wy + wh * .5 - 1, ww, 2);
        // sill + drip shadow + grime streak below
        x.fillStyle = '#cfcabb'; x.fillRect(wx - 4, wy + wh + 2, ww + 8, 4);
        xr.fillStyle = '#c8c8c8'; xr.fillRect(wx - 4, wy + wh + 2, ww + 8, 4);
        x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(wx - 4, wy + wh + 6, ww + 8, 5);
        if (R() < .3) streaks(x, W, wy + wh + 10, Math.min(40, H - wy - wh - 12), 1, .07);
        // occasional AC unit
        if (!storefront && R() < .07) {
          x.fillStyle = '#b9bcbe'; x.fillRect(wx + ww * .3, wy + wh + 8, ww * .4, 10);
          x.strokeStyle = 'rgba(0,0,0,.4)'; x.strokeRect(wx + ww * .3, wy + wh + 8, ww * .4, 10);
        }
      }
    }
    if (band) { x.fillStyle = band; x.fillRect(0, top - 8, W, 6); xr.fillStyle = '#c0c0c0'; xr.fillRect(0, top - 8, W, 6); }

    if (cornice && !storefront) {
      x.fillStyle = trim; x.fillRect(0, 4, W, 8);
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 12, W, 3);
      xr.fillStyle = '#c8c8c8'; xr.fillRect(0, 4, W, 12);
      for (let px = 4; px < W; px += 18) { x.fillStyle = trim; x.fillRect(px, 8, 8, 5); }
    }

    if (storefront) {
      // bulkhead + recessed glazing with interior hints
      x.fillStyle = '#222b31'; x.fillRect(0, H - 190, W, 190);
      xb.fillStyle = '#909090'; xb.fillRect(0, H - 190, W, 190);
      xr.fillStyle = '#909090'; xr.fillRect(0, H - 190, W, 190);
      for (let i = 0; i < cols; i++) {
        const wx = i * cw + 6, ww = cw - 12;
        const gg = x.createLinearGradient(wx, H - 176, wx, H - 16);
        const warm = R() < .4;
        gg.addColorStop(0, warm ? '#c9a86a' : '#7e9aac');
        gg.addColorStop(.55, warm ? '#5d4a30' : '#31434e');
        gg.addColorStop(1, '#1b2830');
        x.fillStyle = gg; x.fillRect(wx, H - 176, ww, 150);
        if (warm) {  // shop interior spills light at dusk
          const eg = xe.createLinearGradient(wx, H - 176, wx, H - 16);
          eg.addColorStop(0, '#c08038'); eg.addColorStop(1, '#4a2c10');
          xe.fillStyle = eg; xe.fillRect(wx, H - 176, ww, 150);
        }
        // interior: shelf/counter silhouette + lamp dots
        x.fillStyle = 'rgba(0,0,0,.35)';
        x.fillRect(wx + 4, H - 70, ww - 8, 26);
        for (let d = 0; d < 3; d++) {
          x.fillStyle = 'rgba(255,220,150,.5)';
          x.beginPath(); x.arc(wx + ww * (0.25 + d * .25), H - 150, 2.5, 0, 7); x.fill();
        }
        x.strokeStyle = '#0f171c'; x.lineWidth = 3; x.strokeRect(wx, H - 176, ww, 150);
        // transom
        x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(wx, H - 176, ww, 14);
        x.fillStyle = 'rgba(255,255,255,.16)';
        x.beginPath(); x.moveTo(wx, H - 176); x.lineTo(wx + ww * .5, H - 176);
        x.lineTo(wx, H - 96); x.closePath(); x.fill();
        // kick plate
        x.fillStyle = '#3a4147'; x.fillRect(wx, H - 28, ww, 12);
        xr.fillStyle = '#2e2e2e'; xr.fillRect(wx, H - 176, ww, 150);   // shopfront glass glossy
        xr.fillStyle = '#969696'; xr.fillRect(wx, H - 28, ww, 12);
      }
      // entrance double door (center bay)
      const dx = W / 2 - cw / 2 + 6;
      x.fillStyle = '#10181d'; x.fillRect(dx, H - 170, cw - 12, 144);
      x.strokeStyle = '#5a6a72'; x.lineWidth = 3; x.strokeRect(dx + 3, H - 167, cw - 18, 141);
      x.fillStyle = 'rgba(160,190,205,.35)'; x.fillRect(dx + 6, H - 164, cw - 24, 100);
      xr.fillStyle = '#585858'; xr.fillRect(dx, H - 170, cw - 12, 144);
      if (signText) {
        x.fillStyle = signBg; x.fillRect(0, 62, W, 92);
        x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, 150, W, 8);
        x.fillStyle = '#f4f6f4'; x.font = 'bold 54px Arial';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(signText.toUpperCase(), W / 2, 108, W - 30);
        xr.fillStyle = '#b0b0b0'; xr.fillRect(0, 62, W, 92);
      }
    }
    // base grime + top AO
    const gr = x.createLinearGradient(0, H - 60, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,16,10,.30)');
    x.fillStyle = gr; x.fillRect(0, H - 60, W, 60);
    const gr2 = x.createLinearGradient(0, 0, 0, 26);
    gr2.addColorStop(0, 'rgba(0,0,0,.25)'); gr2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr2; x.fillRect(0, 0, W, 26);
    // device-resolution micro grain — keeps the 2x canvas from reading as upscaled
    x.setTransform(1, 0, 0, 1, 0, 0);
    grain(x, W * SS, H * SS, 7000, .05);
    grain(xb, W, H, 4500, .12, 96, 168);
    const normal = canvasTex(bumpToNormalCanvas(cb, 1.5), { srgb: false });
    const map = canvasTex(c);
    const rough = canvasTex(cr, { srgb: false });
    const emis = canvasTex(ce);
    const bump = canvasTex(cb, { srgb: false });
    map.userData.v2 = { rough, normal, bump, glass: false };
    return { map, bump, emis, rough, normal };
  });
}
/* back-compat wrapper */
export function facadeTexture(opts = {}) { return facadeMaps(opts).map; }

/* big glass curtain wall (hospital / offices) */
export function glassFacadeMaps({ tint = '#7fa6bd', rows = 10, cols = 12,
  litRatio = .12, frame = '#c6cfd4', banded = false } = {}) {
  const key = 'glass' + JSON.stringify([tint, rows, cols, litRatio, frame, banded]);
  return cachedTex(key, () => {
    const SS = 2, W = 512, H = 512;
    const [c, x] = makeCanvas(W * SS, H * SS);   x.scale(SS, SS);
    const [cb, xb] = makeCanvas(W, H);
    const [ce, xe] = makeCanvas(W / 2, H / 2);  // quarter-res emissive — soft glow anyway
    const [cr, xr] = makeCanvas(W / 2, H / 2);  // quarter-res roughness
    xr.scale(.5, .5);
    xb.fillStyle = '#808080'; xb.fillRect(0, 0, W, H);
    xe.fillStyle = '#000'; xe.fillRect(0, 0, W / 2, H / 2);
    xe.scale(.5, .5);
    xr.fillStyle = '#8c8c8c'; xr.fillRect(0, 0, W, H);   // frame/spandrel mid-rough
    x.fillStyle = frame; x.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows,
          /* banded = thick dark spandrel strip per floor (banded curtain wall);
             default keeps the thin band and the original cell metrics */
          sb = banded ? Math.max(5, Math.round(rh * .34)) : 3,
          spand = '#' + new THREE.Color(frame).multiplyScalar(.42).getHexString();
    /* lit windows in coherent runs — real buildings light bays and corridors,
       not a uniform scatter; a run lights 2-6 adjacent panes with stragglers */
    const litGrid = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      let col = 0;
      while (col < cols) {
        if (R() < litRatio * 2.4) {
          const len = 2 + Math.floor(R() * 5);
          for (let k = 0; k < len && col < cols; k++, col++)
            if (R() < .85) litGrid[r * cols + col] = 1;
        } else col++;
      }
    }
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const wx = col * cw + 3, wy = r * rh + (banded ? sb + 2 : 3),
            ww = cw - 6, wh = rh - (banded ? sb + 5 : 6);
      const lit = litGrid[r * cols + col] === 1;
      const gg = x.createLinearGradient(wx, wy, wx, wy + wh);
      if (lit) {
        gg.addColorStop(0, '#ffedb8'); gg.addColorStop(1, '#e8a850');
        xe.fillStyle = '#ffb85c'; xe.fillRect(wx, wy, ww, wh);
        xe.fillStyle = 'rgba(255,230,180,.9)'; xe.fillRect(wx, wy, ww, wh * .3);
      } else {
        const v = R() * .25;
        gg.addColorStop(0, '#b0cbd9'); gg.addColorStop(.5, tint);
        gg.addColorStop(1, `rgb(${61 - v * 60},${85 - v * 60},${104 - v * 60})`);
      }
      x.fillStyle = gg; x.fillRect(wx, wy, ww, wh);
      xb.fillStyle = '#565656'; xb.fillRect(wx, wy, ww, wh);
      xr.fillStyle = lit ? '#303030' : '#1e1e1e';   // vision glass near-mirror (v2: sharper panes)
      xr.fillRect(wx, wy, ww, wh);
      // glare streak
      x.fillStyle = 'rgba(255,255,255,.22)';
      x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx + ww * .6, wy);
      x.lineTo(wx, wy + wh * .6); x.closePath(); x.fill();
      // lit interiors: ceiling light dots
      if (lit) {
        x.fillStyle = 'rgba(255,255,255,.7)';
        for (let d = 0; d < 2; d++) { x.beginPath(); x.arc(wx + ww * (.3 + d * .4), wy + 5, 1.8, 0, 7); x.fill(); }
      }
      // spandrel + mullion
      x.fillStyle = banded ? spand : 'rgba(30,40,50,.4)';
      x.fillRect(col * cw, r * rh, cw, sb);
      x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(col * cw + cw / 2 - 1, r * rh, 2, rh);
      xb.fillStyle = '#a0a0a0'; xb.fillRect(col * cw, r * rh, cw, sb);
      xb.fillRect(col * cw + cw / 2 - 1, r * rh, 2, rh);
      xr.fillStyle = '#9a9a9a'; xr.fillRect(col * cw, r * rh, cw, sb);   // matte spandrel band
      xr.fillRect(col * cw + cw / 2 - 1, r * rh, 2, rh);
    }
    // micro grain at device res
    x.setTransform(1, 0, 0, 1, 0, 0);
    grain(x, W * SS, H * SS, 4000, .04);
    grain(xb, W, H, 2000, .10, 96, 168);
    const normal = canvasTex(bumpToNormalCanvas(cb, 1.2), { srgb: false });
    const map = canvasTex(c);
    const rough = canvasTex(cr, { srgb: false });
    const emis = canvasTex(ce);
    const bump = canvasTex(cb, { srgb: false });
    map.userData.v2 = { rough, normal, bump, glass: true };
    return { map, bump, emis, rough, normal };
  });
}
export function glassFacade(opts = {}) { return glassFacadeMaps(opts).map; }

/* siding / house wall */
export function sidingTexture(hex = '#d9cbb2') {
  return cachedTex('sid' + hex, () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = hex; x.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 10) {
      x.fillStyle = 'rgba(0,0,0,.10)'; x.fillRect(0, y + 8, 128, 2);
      x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, y, 128, 2);
    }
    grain(x, 128, 128, 700, .05);
    return canvasTex(c);
  });
}
export function brickTexture(hex = '#96543f') {
  return cachedTex('brk' + hex, () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = hex; x.fillRect(0, 0, 128, 128);
    for (let y = 0, r = 0; y < 128; y += 16, r++)
      for (let px = -32 + (r % 2) * 16; px < 128; px += 32) {
        const j = (R() - .5) * 20;
        x.fillStyle = `rgba(${j > 0 ? '255,235,215' : '15,8,4'},${Math.abs(j) / 90})`;
        x.fillRect(px + 1, y + 1, 30, 14);
      }
    x.strokeStyle = 'rgba(255,235,210,.30)'; x.lineWidth = 2;
    for (let y = 0, r = 0; y < 128; y += 16, r++) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke();
      for (let px = (r % 2) * 16; px < 128; px += 32) {
        x.beginPath(); x.moveTo(px, y); x.lineTo(px, y + 16); x.stroke();
      }
    }
    grain(x, 128, 128, 900, .07);
    return canvasTex(c);
  });
}
export function fieldTexture() {  // farmland rows
  const [c, x] = makeCanvas(256, 256);
  const cols = ['#a8b06a', '#8fa05c', '#b5a069', '#9cae62', '#a08a54'];
  const band = 256 / cols.length;
  for (let i = 0; i < cols.length; i++) {
    x.fillStyle = cols[i]; x.fillRect(0, i * band, 256, band);
    x.fillStyle = 'rgba(0,0,0,.08)';
    for (let r = 0; r < band; r += 5) x.fillRect(0, i * band + r, 256, 1.5);
  }
  grain(x, 256, 256, 1500, .06);
  return canvasTex(c, { repeat: [8, 8] });
}
/* crop sprig card — corn stalks or wheat heads, alpha-tested cross quads */
export function cropTexture(kind) {
  return cachedTex('crop' + kind, () => {
    const [c, x] = makeCanvas(128, 128);
    x.clearRect(0, 0, 128, 128);
    const n = kind === 'wheat' ? 60 : 30;
    for (let i = 0; i < n; i++) {
      const bx = rr(4, 124), h = rr(kind === 'wheat' ? 55 : 70, 120),
            sw = rr(-12, 12);
      const g = x.createLinearGradient(0, 128, 0, 128 - h);
      if (kind === 'wheat') {
        g.addColorStop(0, `rgba(${120 + rr(0, 30) | 0},${95 + rr(0, 25) | 0},${45 + rr(0, 15) | 0},.95)`);
        g.addColorStop(1, `rgba(${215 + rr(0, 30) | 0},${185 + rr(0, 30) | 0},${95 + rr(0, 25) | 0},.95)`);
      } else {
        g.addColorStop(0, `rgba(${30 + rr(0, 20) | 0},${65 + rr(0, 25) | 0},${25 + rr(0, 15) | 0},.95)`);
        g.addColorStop(1, `rgba(${85 + rr(0, 40) | 0},${135 + rr(0, 35) | 0},${55 + rr(0, 25) | 0},.9)`);
      }
      x.strokeStyle = g; x.lineWidth = rr(1.8, 3.6); x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx, 128);
      x.quadraticCurveTo(bx + sw * .4, 128 - h * .55, bx + sw, 128 - h); x.stroke();
      if (kind === 'wheat') {           // seed head dot at the tip
        x.fillStyle = 'rgba(230,200,110,.95)';
        x.beginPath(); x.arc(bx + sw, 128 - h, rr(2, 3.4), 0, 6.28); x.fill();
      }
    }
    return canvasTex(c);
  });
}
export function roofTexture(hex = '#5a5f66') {
  return cachedTex('roof' + hex, () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = hex; x.fillRect(0, 0, 128, 128);
    for (let y = 0, r = 0; y < 128; y += 12, r++)
      for (let px = -16 + (r % 2) * 8; px < 128; px += 16) {
        const j = (R() - .5) * 16;
        x.fillStyle = `rgba(${j > 0 ? '255,255,255' : '0,0,0'},${Math.abs(j) / 110})`;
        x.fillRect(px + 1, y + 1, 14, 10);
      }
    x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2;
    for (let y = 0; y < 128; y += 12) { x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke(); }
    grain(x, 128, 128, 800, .08);
    return canvasTex(c);
  });
}
export function garageDoorTexture() {
  return cachedTex('garage', () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = '#e6e2d8'; x.fillRect(0, 0, 128, 128);
    for (let ry = 0; ry < 4; ry++) for (let cx = 0; cx < 4; cx++) {
      const px = 8 + cx * 30, py = 8 + ry * 30;
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(px, py, 24, 22);
      x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(px + 2, py + 2, 20, 18);
      if (ry === 0) { x.fillStyle = '#546a7a'; x.fillRect(px + 4, py + 5, 16, 9); }
    }
    return canvasTex(c);
  });
}
export function awningTexture(c1 = '#7a2e2e', c2 = '#e8e0d0') {
  return cachedTex('awn' + c1 + c2, () => {
    const [c, x] = makeCanvas(128, 64);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? c1 : c2;
      x.fillRect(i * 16, 0, 16, 64);
    }
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 64);
    return canvasTex(c);
  });
}

/* ============== signs / misc ============== */
export function signTexture(text, { bg = '#20313d', fg = '#ffffff', w = 512, h = 96,
                                    font = 'bold 52px Arial', border = true } = {}) {
  return cachedTex('sign' + JSON.stringify([text, bg, fg, w, h, font, border]), () => {
    const [c, x] = makeCanvas(w, h);
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    if (border) { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, h - 6); }
    x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const px = parseInt(font, 10) || 52;
    const lh = px * 1.15;
    lines.forEach((ln, i) =>
      x.fillText(ln, w / 2, h / 2 + 2 + (i - (lines.length - 1) / 2) * lh, w - 24));
    return canvasTex(c);
  });
}
/* drawn analog clock face for the medhall tower (replaces the '◷' glyph) */
export function clockTexture() {
  return cachedTex('clockface', () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = '#4a3428'; x.fillRect(0, 0, 128, 128);          // brick-colored plate
    x.fillStyle = '#f5f1e6';
    x.beginPath(); x.arc(64, 64, 56, 0, 7); x.fill();
    x.strokeStyle = '#8a7a5a'; x.lineWidth = 5;
    x.beginPath(); x.arc(64, 64, 56, 0, 7); x.stroke();
    // hour ticks
    x.strokeStyle = '#333'; x.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
      x.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
      x.stroke();
    }
    // hands at 10:09
    const hand = (a, len, wd) => {
      x.strokeStyle = '#222'; x.lineWidth = wd; x.lineCap = 'round';
      x.beginPath(); x.moveTo(64, 64);
      x.lineTo(64 + Math.cos(a - Math.PI / 2) * len, 64 + Math.sin(a - Math.PI / 2) * len);
      x.stroke();
    };
    hand((10 + 9 / 60) / 12 * Math.PI * 2, 28, 7);   // hour
    hand(9 / 60 * Math.PI * 2, 42, 5);               // minute
    x.fillStyle = '#8e2f26'; x.beginPath(); x.arc(64, 64, 5, 0, 7); x.fill();
    return canvasTex(c);
  });
}
export function crossTexture() { // hospital red cross
  return cachedTex('cross', () => {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = '#f2f4f5'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#c0392b';
    x.fillRect(48, 16, 32, 96); x.fillRect(16, 48, 96, 32);
    return canvasTex(c);
  });
}
export function parkingTexture() {
  const [c, x] = makeCanvas(256, 256);
  x.fillStyle = '#43464a'; x.fillRect(0, 0, 256, 256);
  grain(x, 256, 256, 4000, .09, 30, 110);
  return canvasTex(c, { repeat: [20, 20] });
}

/* ============== procedural sky ============== */
/* equirect sky canvas → used for background AND PMREM environment.
   sun azimuth/elevation must match the directional light. */
export function skyTexture({ mode = 'day', sunAz = 0, sunEl = .6 } = {}) {
  const W = 2048, H = 1024;
  const [c, x] = makeCanvas(W, H);
  const pal = mode === 'golden'
    ? { zen: '#3a4a72', mid: '#9a7a90', hor: '#f4b370', glow: '#ffdcae', cloud: '#e8b48e', cloudTop: '#fbe0c4' }
    : mode === 'dusk'
    ? { zen: '#1c2742', mid: '#4a3a5e', hor: '#c86a4e', glow: '#ff9a5e', cloud: '#5e4460', cloudTop: '#c88a72' }
    : mode === 'night'
    ? { zen: '#04060d', mid: '#0a1120', hor: '#16202e', glow: '#aebdd4', cloud: '#101828', cloudTop: '#24334e' }
    : { zen: '#2e6cb0', mid: '#7db6dd', hor: '#dcecF4', glow: '#fff3d8', cloud: '#dfe9ee', cloudTop: '#ffffff' };
  const g = x.createLinearGradient(0, 0, 0, H * .62);
  g.addColorStop(0, pal.zen); g.addColorStop(.62, pal.mid); g.addColorStop(1, pal.hor);
  x.fillStyle = g; x.fillRect(0, 0, W, H * .62);
  x.fillStyle = pal.hor; x.fillRect(0, H * .62, W, H * .38);
  // haze band at horizon — dimmer at night (city light dome rather than haze)
  const hz = x.createLinearGradient(0, H * .56, 0, H * .66);
  const hzA = mode === 'night' ? .14 : .35;
  hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(.5, `rgba(255,255,255,${hzA})`);
  hz.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hz; x.fillRect(0, H * .56, W, H * .1);
  // starfield — wrapped-drawn, zenith-weighted, a few bright anchors
  if (mode === 'night') {
    const Rs = mulberry32(9101);                // dedicated stream: drawing from
    // global R() would reshuffle every downstream seed between day and night
    for (let i = 0; i < 480; i++) {
      const sr = Rs(), sx2 = Rs() * W, sy = Rs() * Rs() * H * .55;
      x.fillStyle = `rgba(235,240,252,${(.2 + sr * .65).toFixed(3)})`;
      for (const ox of [-W, 0, W])
        x.fillRect(sx2 + ox, sy, sr > .86 ? 2 : 1, sr > .86 ? 2 : 1);
    }
  }

  // sun disc + glow — matches three.js equirect sampling:
  // u = atan2(dir.z, dir.x)/2π + .5 ; v = asin(dir.y)/π + .5
  const su = (0.5 + sunAz / (Math.PI * 2)) * W;
  const sv = (0.5 - sunEl / Math.PI) * H;
  const glowR = mode === 'dusk' ? 190 : mode === 'golden' ? 240 : mode === 'night' ? 150 : 300;
  x.globalAlpha = mode === 'night' ? .55 : .95;      // moon glow is gentler than sun
  for (const ox of [-W, 0, W]) {                    // wrap-drawn: equirect edge-safe
    const glow = x.createRadialGradient(su + ox, sv, 0, su + ox, sv, glowR);
    glow.addColorStop(0, pal.glow); glow.addColorStop(.12, pal.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = glow;
    x.beginPath(); x.arc(su + ox, sv, glowR, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = mode === 'day' ? '#fffdf4' : mode === 'night' ? '#e8eef8' : '#fff2dc';
  for (const ox of [-W, 0, W]) {
    x.beginPath(); x.arc(su + ox, sv, mode === 'day' ? 26 : mode === 'night' ? 15 : 40, 0, 7); x.fill();
  }

  // painterly clouds — puffy blobs clustered in horizontal bands
  const puff = (cx, cy, s, alpha) => {
    // elongated banks: horizontal ellipses only. Round blobs projected through
    // the equirect read as a honeycomb of rings (worst at dusk); stretched
    // smudges read as distant cloud banks
    const n = 5 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const px = cx + (R() - .5) * s * 5.2, py = cy + (R() - .5) * s * .5;
      const pr = s * (.5 + R() * .6);
      x.globalAlpha = alpha * (.4 + R() * .4);
      for (const ox of [-W, 0, W]) {
        x.save();
        x.translate(px + ox, py);
        x.scale(3.1, .52);
        const grd = x.createRadialGradient(0, -pr * .15, 0, 0, 0, pr);
        grd.addColorStop(0, pal.cloudTop); grd.addColorStop(.7, pal.cloud);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = grd;
        x.beginPath(); x.arc(0, 0, pr, 0, 7); x.fill();
        x.restore();
      }
    }
    x.globalAlpha = 1;
  };
  const nCl = mode === 'dusk' ? 11 : 16;
  for (let i = 0; i < nCl; i++) {
    const cy = H * (.08 + R() * .4);
    const s = 30 + R() * 80;
    puff(R() * W, cy, s, mode === 'day' ? .55 : .45);
  }
  // high cirrus streaks
  x.globalAlpha = .3;
  for (let i = 0; i < 14; i++) {
    const cy = H * (.05 + R() * .25), w2 = 100 + R() * 300;
    const grd = x.createLinearGradient(0, cy - 8, 0, cy + 8);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(.5, pal.cloudTop);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(R() * W, cy - 8, w2, 16);
  }
  x.globalAlpha = 1;
  const t = canvasTex(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* cumulus sprite — lobes cluster along a flat base line and the alpha
   silhouette is then shaded top-to-bottom via source-atop, giving a lit
   crown and gray underside instead of a uniform white blob. v=0 keeps the
   exact R() draw sequence the old texture consumed; extra variants draw
   from dedicated streams so the global seed order never shifts. */
export function cloudSpriteTexture(v = 0) {
  return cachedTex('cloudspr' + v, () => {
    const [c, x] = makeCanvas(256, 128);
    const src = v === 0 ? () => R() : mulberry32(7100 + v * 97);
    for (let i = 0; i < 30; i++) {
      const gx = 40 + src() * 176, gyRaw = 45 + src() * 40,
            r = 12 + src() * 26;
      const gy = Math.min(gyRaw, 94 - r * .4);           // big lobes ride high
      const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      gr.addColorStop(0, 'rgba(255,255,255,.72)');
      gr.addColorStop(.7, 'rgba(245,250,252,.4)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'source-atop';          // shade within the silhouette
    const sh = x.createLinearGradient(0, 18, 0, 118);
    sh.addColorStop(0, 'rgba(255,255,255,.55)');
    sh.addColorStop(.55, 'rgba(232,240,248,.3)');
    sh.addColorStop(1, 'rgba(158,172,196,.85)');
    x.fillStyle = sh; x.fillRect(0, 0, 256, 128);
    x.globalCompositeOperation = 'source-over';
    return canvasTex(c);
  });
}

/* ============== animated shaders ============== */
export const uTime = { value: 0 };   // shared clock uniform

/* rippling water — MeshStandardMaterial with sine-perturbed normals */
/* water v2 — animated normals + fresnel depth tint + rim shore fade/foam + sun glint.
   Animated through shared uTime only, so B's ?freeze=1 pin makes it deterministic.
   All users are CircleGeometry → planar UV gives rim distance in-shader. */
const _wq = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const _wt = (_wq && _wq.get('time')) || 'day';
export const WATERFX = !(_wq && _wq.has('nowaterfx'));
const WATER_T = {
  day:    { sunDir: [900, 750, 620],   sunCol: 0xfff2dd, deep: '#0e2430', foam: '#cfe6ea', glint: .5,  foamAmt: .5  },
  golden: { sunDir: [-1500, 210, 700], sunCol: 0xffb268, deep: '#1d2a33', foam: '#e8c9a0', glint: .85, foamAmt: .4  },
  dusk:   { sunDir: [-1200, 120, 500], sunCol: 0xff9a6a, deep: '#141820', foam: '#4a4a58', glint: .3,  foamAmt: .22 },
  night:  { sunDir: [-500, 1100, -350], sunCol: 0xaebdd4, deep: '#081018', foam: '#33404c', glint: .35, foamAmt: .22 },
};
const _wp = WATER_T[_wt] || WATER_T.day;

export function waterMaterial({ color = '#2b4a58', deep = null, roughness = .12 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness, metalness: .55, envMapIntensity: 1.5,
    transparent: WATERFX,
  });
  if (!WATERFX) return m;                       // ?nowaterfx=1 → stock material
  m.userData.waterV2 = true;
  m.defines = { USE_UV: '' };                   // rim fade needs the uv attribute — no map is present
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uTime;
    sh.uniforms.uSunDir = { value: new THREE.Vector3(..._wp.sunDir).normalize() };
    sh.uniforms.uSunCol = { value: new THREE.Color(_wp.sunCol) };
    sh.uniforms.uDeep = { value: new THREE.Color(deep || _wp.deep) };
    sh.uniforms.uFoam = { value: new THREE.Color(_wp.foam) };
    sh.uniforms.uGlint = { value: _wp.glint };
    sh.uniforms.uFoamAmt = { value: _wp.foamAmt };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec2 vUvW;')
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz; vUvW = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uGlint, uFoamAmt;
        uniform vec3 uSunDir, uSunCol, uDeep, uFoam;
        varying vec3 vWp; varying vec2 vUvW;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wq = vWp.xz;
          vec2 g = vec2(0.);
          g += vec2(sin(dot(wq, vec2(.55,.48)) + uT*1.15), cos(dot(wq, vec2(.48,-.55)) + uT*.9)) * .045;
          g += vec2(sin(dot(wq, vec2(1.9,1.35)) - uT*1.7), cos(dot(wq, vec2(-1.35,1.9)) + uT*1.35)) * .026;
          g += vec2(sin(dot(wq, vec2(4.2,3.3)) + uT*2.6), cos(dot(wq, vec2(3.3,-4.2)) - uT*2.2)) * .012;
          g += vec2(sin(dot(wq, vec2(.85,.62)) + g.x*22. + uT*.55), 0.) * .010;
          vec3 wn = normalize(vec3(-g.x, 1., -g.y));
          normal = normalize((viewMatrix * vec4(wn, 0.)).xyz);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float rim = length(vUvW - .5) * 2.;
          diffuseColor.a *= 1. - smoothstep(.955, 1., rim);          // shore alpha fade (outer ~4.5%)
          float fband = smoothstep(.78, .9, rim) * (1. - smoothstep(.92, .985, rim));
          float fn = sin(rim*30. - uT*1.3 + sin(vWp.x*.75 + vWp.z*.55)*2.2) * .5 + .5;
          fband *= .45 + .55*fn;                                    // broken foam band
          diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, fband * uFoamAmt);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float fres = pow(1. - max(dot(normal, Vv), 0.), 3.);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDeep, fres * .7);          // depth tint at grazing angles
          vec3 sV = normalize((viewMatrix * vec4(uSunDir, 0.)).xyz);
          vec3 H = normalize(sV + Vv);
          float spec = pow(max(dot(normal, H), 0.), 320.);
          vec2 toFrag = vWp.xz - cameraPosition.xz;
          float az = max(dot(toFrag / max(length(toFrag), 1e-3), normalize(uSunDir.xz)), 0.);
          float flick = .55 + .45 * sin(uT*6.5 + vWp.x*2.9 + vWp.z*2.3);
          totalEmissiveRadiance += uSunCol * spec * az * az * flick * uGlint;  // sun streak toward sun azimuth
        }`);
  };
  return m;
}
/* waving flag — vertices sway by distance from pole (uv.x) */
export function flagMaterial(color = '#b3423a') {
  const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fw = uv.x;
        transformed.z += sin(uT*3.2 + uv.x*6.0 + uv.y*2.0) * .22 * fw;
        transformed.y += sin(uT*2.4 + uv.x*4.0) * .08 * fw;`);
  };
  return m;
}

/* ============== materials cache ============== */
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key))
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: .02, ...opts }));
  return matCache.get(key);
}
export function flat(color, opts = {}) {   // unlit-ish for map mode / props
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
/* vertex-colored shared material — every colored() prop merges into one draw call */
export const VCOL = () => vcolMat;
const vcolMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .03 });

/* ============== small geometry helpers ============== */
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
/* gable/hip roof via extruded triangle */
export function gableRoof(w, h, d, material, overhang = 0.6) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0); shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(0, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -d / 2 - overhang);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
/* hip-ish roof: squashed pyramid */
export function hipRoof(w, h, d, material) {
  const g = new THREE.CylinderGeometry(0.001, 1, 1, 4, 1);
  const m = new THREE.Mesh(g, material);
  m.scale.set(w * .78, h, d * .78);
  m.rotation.y = Math.PI / 4;
  m.castShadow = true;
  return m;
}
export function plane(w, h, material, x = 0, y = 0, z = 0, rotX = -Math.PI / 2, tile = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (tile > 0) { // world-scale UVs: texture repeats every `tile` meters
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  }
  const m = new THREE.Mesh(g, material);
  m.rotation.x = rotX; m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/* ============== merging & instancing ============== */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(),
      _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1),
      _e = new THREE.Euler();

/* colored(parts) — merge primitive geoms with baked vertex colors → one geometry.
   part: { geo, color, x,y,z, rx,ry,rz, sx,sy,sz } */
export function colored(parts) {
  const geos = [];
  for (const p of parts) {
    const g = p.geo.clone();
    _e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _q.setFromEuler(_e);
    _p.set(p.x || 0, p.y || 0, p.z || 0);
    _s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _m4.compose(_p, _q, _s);
    g.applyMatrix4(_m4);
    const col = new THREE.Color(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    geos.push(g);
  }
  /* index everything so the merge stays indexed — de-indexing triples
     vertex memory for zero visual gain; mergeVertices welds identical
     verts on the rare non-indexed custom buffer instead */
  const merged = mergeGeometries(
    geos.map(g => g.index ? g : mergeVertices(g)), false);
  geos.forEach(g => g.dispose());
  return merged;
}

/* one InstancedMesh from a geometry + list of transforms */
export function instances(geo, material, list, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  const e = new THREE.Euler(), q = new THREE.Quaternion(),
        p = new THREE.Vector3(), s = new THREE.Vector3(), m = new THREE.Matrix4();
  list.forEach((t, i) => {
    e.set(t.rx || 0, t.ry || 0, t.rz || 0); q.setFromEuler(e);
    p.set(t.x || 0, t.y || 0, t.z || 0);
    s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    m.compose(p, q, s); im.setMatrixAt(i, m);
    if (t.color) im.setColorAt(i, new THREE.Color(t.color));
  });
  im.castShadow = shadow; im.receiveShadow = shadow;
  im.instanceMatrix.needsUpdate = true;
  // marker for the MIN-tier chunk splitter: this helper is only used for
  // never-animated scatter content (trees, grass, litter, furniture…)
  im.userData.staticInst = true;
  return im;
}

/* splitInstanced(im, chunk) — rebucket a static InstancedMesh into one
   InstancedMesh per grid cell so far cells can be culled like merge chunks.
   Shares geometry/material, copies instanceColor and shadow flags, tags each
   child with the cell centre (userData.ccx/ccz). Only call on meshes whose
   matrices are never rewritten at runtime (userData.staticInst). */
export function splitInstanced(im, chunk) {
  const cells = new Map();
  const mm = im.instanceMatrix.array;
  for (let i = 0; i < im.count; i++) {
    const x = mm[i * 16 + 12], z = mm[i * 16 + 14];
    const k = (Math.floor(x / chunk) + 512) * 1024
            + Math.floor(z / chunk) + 512;
    let c = cells.get(k);
    if (!c) { c = { ids: [], x0: x, x1: x, z0: z, z1: z }; cells.set(k, c); }
    c.ids.push(i);
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
    if (z < c.z0) c.z0 = z; if (z > c.z1) c.z1 = z;
  }
  const out = new THREE.Group();
  const cm = new THREE.Matrix4(), cc = new THREE.Color();
  for (const [k, c] of cells) {
    const idx = c.ids;
    const sub = new THREE.InstancedMesh(im.geometry, im.material, idx.length);
    idx.forEach((src, dst) => {
      im.getMatrixAt(src, cm); sub.setMatrixAt(dst, cm);
      if (im.instanceColor) { im.getColorAt(src, cc); sub.setColorAt(dst, cc); }
    });
    sub.castShadow = im.castShadow; sub.receiveShadow = im.receiveShadow;
    sub.renderOrder = im.renderOrder;
    if (im.customDepthMaterial) sub.customDepthMaterial = im.customDepthMaterial;
    sub.instanceMatrix.needsUpdate = true;
    if (sub.instanceColor) sub.instanceColor.needsUpdate = true;
    sub.userData.staticInst = true;
    sub.userData.ccx = (Math.floor(k / 1024) - 512 + .5) * chunk;
    sub.userData.ccz = (k % 1024 - 512 + .5) * chunk;
    /* true instance bounds padded for local geo extent — the MIN culler tests
       these, not the cell centre, so nothing vanishes beneath the camera */
    sub.userData.cb = { x0: c.x0 - 16, z0: c.z0 - 16, x1: c.x1 + 16, z1: c.z1 + 16 };
    out.add(sub);
  }
  return out;
}

/* splitMesh — yield {geo, mat} per material (handles material arrays via groups) */
function* splitMesh(geo, material) {
  if (!Array.isArray(material)) { yield { geo, mat: material }; return; }
  const ni = geo.index ? geo.toNonIndexed() : geo;
  for (const grp of geo.groups) {
    const sub = new THREE.BufferGeometry();
    for (const name in ni.attributes) {
      const a = ni.attributes[name];
      sub.setAttribute(name, new THREE.BufferAttribute(
        a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize),
        a.itemSize, a.normalized));
    }
    yield { geo: sub, mat: material[grp.materialIndex] };
  }
}

/* mergeStatic(root, {chunk}) — bake every static mesh's world transform, bucket by
   material, merge into one mesh per material. Skips InstancedMesh, Points, Sprites
   and anything flagged userData.dynamic or userData.noMerge. Massive draw-call cut.
   With chunk > 0 each material bucket is further split by grid cell — one mesh per
   material per cell — so a merged mesh never spans the whole town: street views
   frustum-cull the far side of the map, and the MIN tier can distance-cull whole
   cells (userData.ccx/ccz = cell centre baked on each chunk mesh). */
export function mergeStatic(root, { chunk = 0 } = {}) {
  const buckets = new Map();
  const doomed = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isPoints || o.isSprite) return;
    if (o.userData.dynamic || o.userData.noMerge) return;
    let p = o.parent, skip = false;
    while (p) { if (p.userData.dynamic || p.userData.noMerge) { skip = true; break; } p = p.parent; }
    if (skip) return;
    for (const { geo, mat } of splitMesh(o.geometry, o.material)) {
      const g = geo.clone().applyMatrix4(o.matrixWorld);
      // normalize attributes so merge never fails: ensure uv exists
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(
          new Float32Array(g.attributes.position.count * 2), 2));
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      let b = buckets.get(mat);
      if (!b) { b = { geos: [], cast: false, recv: false }; buckets.set(mat, b); }
      b.geos.push(g);
      b.cast = b.cast || o.castShadow; b.recv = b.recv || o.receiveShadow;
    }
    doomed.push(o);
  });
  for (const o of doomed) o.parent && o.parent.remove(o);
  const out = new THREE.Group();
  out.name = 'merged';
  const cellKey = g => {
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox.getCenter(_cellV);
    return (Math.floor(c.x / chunk) + 512) * 1024 + Math.floor(c.z / chunk) + 512;
  };
  for (const [material, b] of buckets) {
    const cells = new Map();
    for (const g of b.geos) {
      const k = chunk ? cellKey(g) : 0;
      let cell = cells.get(k);
      if (!cell) { cell = []; cells.set(k, cell); }
      cell.push(g);
    }
    for (const [k, geos] of cells) {
      // indexed merge — weld the rare non-indexed parts (see colored())
      const merged = mergeGeometries(
        geos.map(g => g.index ? g : mergeVertices(g)), false);
      merged.computeBoundingBox();
      const bb = merged.boundingBox;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
      mesh.matrixAutoUpdate = false;
      /* world-baked xz bounds — the MIN culler tests these, so a geometry
         that spans many cells (ground plane, mountain ring, district-wide
         decals) stays visible wherever its bounds actually reach */
      mesh.userData.cb = { x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z };
      if (chunk) {
        mesh.userData.ccx = (Math.floor(k / 1024) - 512 + .5) * chunk;
        mesh.userData.ccz = (k % 1024 - 512 + .5) * chunk;
      }
      out.add(mesh);
    }
    b.geos.forEach(g => g.dispose());
  }
  root.add(out);
  return out;
}
const _cellV = new THREE.Vector3();
/* runtime state populated by main.js's material pass - lets async-loaded
   assets (glTF landmarks) apply the same time-of-day env/emissive gains that
   the one-shot traverse applied to everything loaded synchronously */
export const RUNENV = { envScale: 1, litI: 0 };
