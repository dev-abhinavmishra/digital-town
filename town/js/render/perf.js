/* perf.js — adaptive quality tiers. Full fidelity on capable GPUs
   (tier HIGH is today's pipeline, untouched); weaker devices start one
   notch down, and a device that keeps losing its WebGL context is pinned
   to LOW on the next boot instead of crash-looping forever.

   ?q=high|med|low forces a tier (eval + manual override). */

const CRASH_KEY = 'dt_ctxlost';
const TIER_KEY = 'dt_q';            // user-saved tier pref (ui settings popover)
const WINDOW_MS = 15 * 60 * 1000;   // strikes older than this age out and retry
const MAX_STRIKES = 8;

/* strikes = timestamps of context losses. Keeping history (not a bare count)
   means losses late in a session still accumulate — a device that crashes at
   second 55 of every boot reaches the LOW threshold instead of seeing one
   fresh strike per boot. There is no "stable boot" reset: a long clean run
   simply lets old strikes age out of the window. */
function strikes() {
  try {
    const v = JSON.parse(localStorage.getItem(CRASH_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function crashes() {
  const now = Date.now();
  const s = strikes().filter(t => now - t < WINDOW_MS);
  if (s.length !== strikes().length)
    try { localStorage.setItem(CRASH_KEY, JSON.stringify(s)); } catch {}
  return s.length;
}
export function noteContextLost() {
  const s = strikes(); s.push(Date.now());
  try { localStorage.setItem(CRASH_KEY, JSON.stringify(s.slice(-MAX_STRIKES))); } catch {}
}

function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
                     : gl.getParameter(gl.RENDERER);
    const lc = gl.getExtension('WEBGL_lose_context');
    if (lc) lc.loseContext();
    return String(name || '');
  } catch { return ''; }
}

/* user override saved by the settings popover (AUTO = key absent) */
export function savedTier() {
  try {
    const v = localStorage.getItem(TIER_KEY);
    return v === 'ultra' || v === 'high' || v === 'med' || v === 'low' || v === 'min' ? v : null;
  } catch { return null; }
}
export function setTierPref(v) {
  try {
    if (v) localStorage.setItem(TIER_KEY, v);
    else localStorage.removeItem(TIER_KEY);
  } catch {}
}

const TIER_ORD = { min: 0, low: 1, med: 2, high: 3, ultra: 4 };
const lower = (a, b) => TIER_ORD[a] <= TIER_ORD[b] ? a : b;

export function pickTier(params) {
  const q = (params.get('q') || params.get('quality') || '').toLowerCase();
  if (q === 'ultra' || q === 'high' || q === 'med' || q === 'medium' || q === 'low' || q === 'min')
    return q === 'medium' ? 'med' : q;

  let pick = savedTier();
  if (!pick) {
    const mem = navigator.deviceMemory || 8;   // powers of two, capped at 8
    const cores = navigator.hardwareConcurrency || 8;
    const weak = /swiftshader|llvmpipe|softpipe|software|basic render|mali-[g4]?[0-9]{1,2}\b|powervr|adreno [1-4][0-9]{2}|intel.*(hd|uhd|gma)/i
      .test(gpuName());
    /* <=4GB RAM means a Pentium-class iGPU too — a full scene can't
       rasterize; the thinned MIN scene is what actually runs */
    if (mem <= 4) pick = 'min';
    else if (cores <= 4 || weak) pick = 'low';
    else pick = 'high';
  }
  /* crash strikes act as a ceiling over BOTH a saved pref and auto-detect —
     a device that keeps losing its WebGL context must not keep reloading the
     tier that crashes it (only an explicit ?q= URL beats this) */
  const n = crashes();
  if (n >= 2) return lower(pick, 'min');
  if (n >= 1) return lower(pick, 'low');
  return pick;
}

/* per-tier budget. HIGH reproduces the previous pipeline verbatim. */
export const TIER_CFG = {
  /* ULTRA — everything on max: 8K adaptive shadow box, 8x MSAA, up to 3x
     pixels, deep GTAO (32 samples, hotter blend), shadowed interiors */
  ultra:{ maxRatio: 3,   msaa: 8, ao: true,  bloom: true, smaa: true,  shadow: 8192, detail: 1 },
  high: { maxRatio: 2,   msaa: 4, ao: true,  bloom: true, smaa: true,  shadow: 4096, detail: 1 },
  med:  { maxRatio: 1.5, msaa: 2, ao: false, bloom: true, smaa: true,  shadow: 2048, detail: 1 },
  low:  { maxRatio: 1,   msaa: 0, ao: false, bloom: false, smaa: true,  shadow: 1024, detail: 1 },
  /* thinned scene for devices that cannot rasterize the full town —
     ~12% of scattered instanced content + 320m-chunk distance culling in
     main.js, no shadow pass, .6x pixels */
  min:  { maxRatio: .6,  msaa: 0, ao: false, bloom: false, smaa: false, shadow: 0,    detail: .12 },
};
