// deck.js — PRESENT mode: a cinematic slideshow played inside the live scene.
// Each slide is a slow camera flight with an editorial caption block; the town
// itself is the imagery. Keyboard: ←/→ step, space pause, Esc exit.
// DOM-only except window.__flyTo / __endTour / __enterInterior.
import { BUILDINGS, TOWN } from './layout.js';

const BUDGET = 10_000_000;
const money = n => '$' + (n / 1e6).toFixed(2) + 'M';
const fmt = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + n / 1e3 + 'k';

/* editorial, not corporate-template: one ink scrim + hairline rules,
   palatino-class display serif + system sans, letterboxed frame, and every
   caption element reveals with a staggered rise. No cards on cards. */
const css = `
#uiDeck { position:fixed; inset:0; z-index:70; display:none; pointer-events:none;
  font-family:"Segoe UI", system-ui, -apple-system, sans-serif;
  --ink:#eef4f6; --sub:#a7bcc6; --dim:#7e97a2; --rule:rgba(238,244,246,.28); }
#uiDeck.on { display:block; }
#uiDeck .bar { position:absolute; left:0; right:0; height:0; background:#050b0f;
  transition:height .9s cubic-bezier(.7,0,.3,1); }
#uiDeck .bar.t { top:0 } #uiDeck .bar.b { bottom:0 }
#uiDeck.on .bar { height:56px; }
#uiDeck .scrim { position:absolute; inset:0;
  background:linear-gradient(12deg, rgba(5,16,22,.82) 0%, rgba(5,16,22,.38) 34%,
    rgba(5,16,22,0) 62%),
  radial-gradient(120% 90% at 50% 0%, rgba(5,16,22,0) 60%, rgba(5,16,22,.24) 100%); }
#uiDeck .cap { position:absolute; left:64px; bottom:88px; max-width:620px; color:var(--ink); }
#uiDeck .cap > * { opacity:0; transform:translateY(14px); }
#uiDeck .cap.in > * { opacity:1; transform:none; transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.3,1); }
#uiDeck .cap.out > * { opacity:0; transform:translateY(-10px); transition:all .32s ease; }
#uiDeck .cap > *:nth-child(1) { transition-delay:.15s } #uiDeck .cap > *:nth-child(2) { transition-delay:.28s }
#uiDeck .cap > *:nth-child(3) { transition-delay:.42s } #uiDeck .cap > *:nth-child(4) { transition-delay:.55s }
#uiDeck .kick { font-size:11px; letter-spacing:3.2px; font-weight:600; color:var(--sub);
  text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:12px; }
#uiDeck .kick::after { content:''; height:1px; width:44px; background:var(--rule); }
#uiDeck h1 { margin:0 0 14px; font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  font-size:46px; line-height:1.06; font-weight:500; letter-spacing:.2px; text-wrap:balance; }
#uiDeck h1.big { font-size:74px; letter-spacing:.5px; }
#uiDeck .body { font-size:14.5px; line-height:1.65; color:var(--sub); max-width:470px; }
#uiDeck .pts { list-style:none; margin-top:2px; max-width:600px; }
#uiDeck .pts li { font-size:13.5px; line-height:1.5; color:var(--sub);
  padding-left:18px; position:relative; margin-bottom:7px; }
#uiDeck .pts li::before { content:'\\2014'; position:absolute; left:0; color:var(--dim); }
#uiDeck .pts li b { color:var(--ink); font-weight:600; }
#uiDeck .sheet { margin-top:14px; display:flex; gap:30px; max-width:680px; }
#uiDeck .sheet .col { flex:1; }
#uiDeck .sheet .colh { font-size:10px; letter-spacing:2px; text-transform:uppercase;
  color:var(--ink); font-weight:600; margin-bottom:8px;
  display:flex; justify-content:space-between; gap:10px; }
#uiDeck .sheet .colh span { color:var(--dim); font-weight:400; }
#uiDeck .sheet .row { display:flex; font-size:10.8px; line-height:1.9; color:var(--sub); }
#uiDeck .sheet .row i { font-style:normal; color:var(--dim); width:20px; flex:none; }
#uiDeck .sheet .row em { font-style:normal; flex:1; padding-right:10px; }
#uiDeck .sheet .row b { color:var(--ink); font-weight:600; white-space:nowrap; }
#uiDeck .sheet .foot { margin-top:12px; font-size:11px; color:var(--dim);
  letter-spacing:.4px; border-top:1px solid var(--rule); padding-top:9px; max-width:680px; }
#uiDeck .sheet .foot b { color:var(--ink); font-weight:600; }
#uiDeck .stats { display:flex; gap:26px; margin-top:20px; }
#uiDeck .cap .team { margin-top:16px; font-size:10.5px; letter-spacing:2.4px;
  color:var(--dim); text-transform:uppercase; }
#uiDeck .st b { display:block; font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  font-size:26px; font-weight:500; color:var(--ink); }
#uiDeck .st span { font-size:10px; letter-spacing:1.8px; text-transform:uppercase; color:var(--dim); }
#uiDeck .bud { margin-top:18px; width:min(430px,60vw); }
#uiDeck .bud .track { height:4px; display:flex; border-radius:2px; overflow:hidden;
  background:rgba(238,244,246,.14); }
#uiDeck .bud .track i { height:100%; }
#uiDeck .bud .rows { margin-top:12px; font-size:12.5px; color:var(--sub); line-height:2; }
#uiDeck .bud .rows b { color:var(--ink); font-weight:600; }
#uiDeck .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:8px; vertical-align:1px; }
#uiDeck .meta { position:absolute; right:64px; bottom:88px; text-align:right; color:var(--dim); }
#uiDeck .meta > * { opacity:0; transition:opacity .6s .5s; }
#uiDeck.on .meta > * { opacity:1; }
#uiDeck .cnt { font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  font-size:20px; color:var(--ink); letter-spacing:1px; }
#uiDeck .cnt i { font-style:normal; color:var(--dim); font-size:14px; margin:0 4px; }
#uiDeck .keys { font-size:10px; letter-spacing:1.6px; margin-top:8px; text-transform:uppercase; }
#uiDeck .prog { position:absolute; left:64px; right:64px; bottom:64px; height:1px;
  background:rgba(238,244,246,.16); opacity:0; transition:opacity .6s .5s; }
#uiDeck.on .prog { opacity:1; }
#uiDeck .prog i { display:block; height:100%; width:0; background:rgba(238,244,246,.75);
  transition:width .5s ease; }
#uiDeck .brand { position:absolute; left:64px; top:14px; font-size:10px; letter-spacing:2.6px;
  color:var(--dim); text-transform:uppercase; opacity:0; transition:opacity .6s .5s; }
#uiDeck.on .brand { opacity:1; }
#uiDeck .x { position:absolute; right:64px; top:14px; font-size:10px; letter-spacing:2px;
  color:var(--dim); text-transform:uppercase; opacity:0; transition:opacity .6s .5s; }
#uiDeck.on .x { opacity:1; }
#uiDeck .edge { position:absolute; top:0; bottom:0; width:22%; pointer-events:auto; }
#uiDeck .edge.l { left:0 } #uiDeck .edge.r { right:0 }
/* video background: a pre-rendered orbit of the town replaces live camera
   flights so PRESENT mode costs a video decode instead of the whole scene */
#uiDeck .bgvid { position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; background:#050b0f; }
/* film-cut transition: the video dips through black on every slide change */
#uiDeck .dip { position:absolute; inset:0; background:#050b0f; opacity:0;
  pointer-events:none; }
`;

export function installDeck() {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'uiDeck';
  root.innerHTML = `<div class="bar t"></div><div class="bar b"></div>
    <video class="bgvid" src="deck/town-orbit.mp4" muted loop playsinline preload="auto"></video><div class="scrim"></div><div class="dip"></div>
    <div class="brand">${TOWN.name} — a community planned around care</div>
    <div class="x">ESC to exit</div>
    <div class="cap"></div>
    <div class="meta"><div class="cnt"></div><div class="keys">&#8592; &#8594; navigate &middot; space autoplay</div></div>
    <div class="prog"><i></i></div>
    <div class="edge l"></div><div class="edge r"></div>`;
  document.body.appendChild(root);

  const cap = root.querySelector('.cap'), cnt = root.querySelector('.cnt'),
        prog = root.querySelector('.prog i'), dip = root.querySelector('.dip');

  const numd = BUILDINGS.filter(b => b.num);
  const spent = numd.reduce((s, b) => s + (b.cost || 0), 0);
  const byCat = {};
  numd.forEach(b => byCat[b.cat] = (byCat[b.cat] || 0) + (b.cost || 0));
  const nH = numd.filter(b => b.cat === 'health').length;
  const nC = numd.filter(b => b.cat === 'community').length;

  const stat = (v, l) => `<div class="st"><b>${v}</b><span>${l}</span></div>`;
  const find = id => BUILDINGS.find(b => b.id === id);

  /* cam: [px,py,pz → tx,ty,tz], dur = seconds of flight (the glide IS the shot).
     Coords are authored in layout space — scale to world space via __ws. */
  const W = () => window.__ws || 1;
  const SLIDES = [
    { cam: [620, 520, 690, -60, 0, -70], dur: 12, cover: true,
      kick: 'Our Town Healthcare System project', title: 'HAVENBROOK',
      body: 'The town we designed around a med school — 26 buildings, all named, all budgeted.',
      team: 'Abhinav Mishra · Dinesh Yara · Davi Ogland' },
    { cam: [60, 780, 560, -20, 0, -60], dur: 11,
      kick: 'Town overview', title: 'A town zoned around its med school', pts: [
        'The donated campus sits dead centre — every district zones outward from it',
        'Care runs along Wellness Way up north; errands run along Commerce Blvd down south',
        'Housing and the K-12 hold the west; senior care gets the quiet northeast corner',
        'The rules we had to hit: 7+ healthcare sites, 3+ community spots, a name on every building, all inside <b>$10,000,000</b>'],
      stats: [money(spent), 'spent of $10M', `${nH}`, 'healthcare sites', `${nC}`, 'community sites', '18', 'named streets'] },
    { cam: [-270, 150, 430, -500, 8, 190], dur: 10,
      kick: 'Population & demographics', title: 'Who lives here', pts: [
        'Half are <b>college students</b> — flats and a student clinic hug the campus',
        'About a third are <b>families</b> — houses cluster around the K-12',
        'One in five is <b>65+</b> — senior living and hospice sit in the quiet east',
        'That mix is why the map looks the way it does'],
      stats: ['50%', 'college students', '30%', 'families', '20%', 'adults 65+'] },
    { cam: [230, 110, -40, 40, 16, -250], dur: 10,
      kick: 'The anchor · donated, off-budget', title: 'Havenbrook University School of Medicine', pts: [
        'The Marchand Medical Library, Whitmore Anatomy Hall, and Caldecott Clinical Sciences Hall around one quad',
        'Sits at the town\u2019s centre — every district zones outward from it',
        'Student flats wrap the west and south edges',
        'It\u2019s why the town exists, so it gets the best spot'] },
    { cam: [300, 110, -620, 20, 26, -440], dur: 10,
      kick: '#3–15 · Wellness Way', title: 'Thirteen ways to get care', pts: [
        '<b>Emergency:</b> Havenbrook General Hospital and Garrison Medical Transport, a block apart on the Wellness spine',
        '<b>Everyday:</b> Thacher Student Health Clinic, Brookfield Family Physicians, Marigold Dental Studio, Parallax Optical, Meridian Diagnostics Laboratory',
        '<b>Long-term:</b> Stoneleigh Rehabilitation Center, Ashwood Behavioral Health Center, Halcyon House Senior Living, Stillpoint Hospice',
        '<b>Public health:</b> Havenbrook County Health Department · <b>At home:</b> Innisfree Home Health',
        '<b>Why these:</b> every site maps to a resident — students, families, and the 65+ block'] },
    { cam: [-270, 150, 430, -500, 8, 190], dur: 10,
      kick: '#2 · Residential West · donated, off-budget', title: 'The Preserve at Havenbrook', pts: [
        'The required housing development — cottages, duplexes, townhouses',
        'Preserve Commons Apartments fill the middle of the neighborhood',
        'Scholar\u2019s Court and Scholar\u2019s Walk apartments plus University Lofts take the students; Midtown Flats takes downtown',
        'Nobody is more than a short walk from campus or a bus route'] },
    { cam: [330, 130, 330, 575, 6, 130], dur: 10,
      kick: 'Community · 11 locations', title: 'The parts that aren\u2019t medicine', pts: [
        '<b>Errands:</b> Havenbrook Commons Mall, Bardsley\u2019s Department Store, Olsen\u2019s Market, Bellwether Pharmacy',
        '<b>Food:</b> The Orchard Table, Mariposa Cantina, The Whippoorwill Coffeehouse',
        '<b>Outside:</b> Willow Creek Park — pond, trails, bandshell',
        '<b>The boring-but-needed:</b> Havenbrook Post Office, Havenbrook Unified School District, Quarry Hill Museum'] },
    { cam: [640, 100, -330, 520, 12, -550], dur: 10,
      kick: '#14–15 · the quiet east', title: 'A place to grow old', pts: [
        'Halcyon House Senior Living — assisted living + memory care around a courtyard garden',
        'Stillpoint Hospice next door, so the hardest visits stay short and private',
        'Innisfree Home Health means seniors keep their own homes longer',
        'The whole block sits on Sunset Ridge — farthest from traffic, closest to quiet'] },
    { cam: [60, 780, 560, -20, 0, -60], dur: 11,
      kick: 'Layout & placement', title: 'How we laid it out', pts: [
        'Streets first: two arterials cross at the campus, 18 named streets fill the grid',
        'Hospital and EMS share the Wellness Way spine — minutes from anywhere',
        'Shops run along Commerce Blvd; the K-12 sits inside the neighborhoods',
        'Every address is within two blocks of a through-street — that\u2019s the EMS rule'] },
    { cam: [300, 110, -620, 20, 26, -440], dur: 10,
      kick: 'Decision-making', title: 'What we traded', pts: [
        'The two donated sites freed ~$4.5M — so we bought 13 small facilities instead of one mega-campus',
        'Picked the mall over a second park — the Preserve already covers green space',
        'Senior care went to the quiet east instead of paying downtown frontage',
        'Stopped at 26 buildings and banked the leftover <b>$50,000</b> instead of forcing a 27th'] },
    { cam: [60, 780, 560, -20, 0, -60], dur: 12, dark: true, hold: 24000,
      kick: 'The budget', title: 'Where the money went', sheet: true },
    { cam: [620, 540, 720, -60, 0, -60], dur: 12, cover: true,
      kick: 'Conclusion', title: 'Why it works', pts: [
        'Students get the campus, the flats, the Thacher Student Health Clinic, and the Whippoorwill — no car needed',
        'Families get the school, Brookfield Family Physicians, Olsen\u2019s Market, and Willow Creek Park',
        'Seniors get the full care loop — Innisfree Home Health visits all the way to Stillpoint Hospice',
        `And the whole town lands at <b>${money(spent)}</b>, under the $10M cap`] },
    { cam: [620, 520, 690, -60, 0, -70], dur: 10, dark: true,
      kick: 'References', title: 'Where our numbers came from', pts: [
        'Our Town Healthcare System — project brief + budget sheet (class handout)',
        'U.S. Census QuickFacts — the 50 / 30 / 20 college-town mix',
        'American Planning Association — complete-communities siting guidance',
        'Three.js — we built and rendered the town as a walkable 3D world'],
      team: 'Abhinav Mishra · Dinesh Yara · Davi Ogland' },
  ];

  const HOLD_MS = 12000;
  /* price-sheet kinds the rubric makes us spell out (restaurant type, fast-food type) */
  const KIND = { orchard: 'farm-to-table restaurant', fiesta: 'Mexican fast-food grill' };
  let on = false, i = -1, timer = 0, capTimer = 0, paused = false, vidOK = false;

  function caption(s, idx) {
    const bits = [];
    if (s.pts) {
      bits.push(`<ul class="pts">${s.pts.map(p => `<li>${p}</li>`).join('')}</ul>`);
    } else if (s.sheet) {
      const mk = cat => numd.filter(b => b.cat === cat)
        .map(b => `<div class="row"><i>${String(b.num).padStart(2, '0')}</i><em>${b.name}${KIND[b.id] ? ' · ' + KIND[b.id] : ''}</em><b>${fmt(b.cost)}</b></div>`).join('');
      bits.push(`<div class="sheet">` +
        `<div class="col"><div class="colh">Healthcare <span>${money(byCat.health || 0)}</span></div>${mk('health')}</div>` +
        `<div class="col"><div class="colh">Community <span>${money(byCat.community || 0)}</span></div>${mk('community')}</div></div>` +
        `<div class="foot">Spent <b>${money(spent)}</b> of ${money(BUDGET)} · <b>${money(BUDGET - spent)}</b> unspent · university + housing were donated</div>`);
    } else if (!s.stats) {
      bits.push(`<div class="body">${s.body}</div>`);
    }
    // pts and stats coexist — overview/demographics bullets sit above the stat row
    if (s.stats) {
      bits.push(`<div class="stats">${Array.from({ length: s.stats.length / 2 }, (_, k) => stat(s.stats[k * 2], s.stats[k * 2 + 1])).join('')}</div>`);
    }
    return `<div class="kick">${s.kick}</div><h1${s.cover ? ' class="big"' : ''}>${s.title}</h1>` + bits.join('') +
      (s.team ? `<div class="team">${s.team}</div>` : '');
  }

  function show(idx) {
    i = idx;
    const s = SLIDES[i];
    // film-cut: background dips through black between slides (skipped on open)
    if (idx > 0 && dip.animate) dip.animate(
      [{ opacity: 0 }, { opacity: .62, offset: .42 }, { opacity: 0 }],
      { duration: 900, easing: 'ease-in-out' });
    if (!vidOK) {   // fallback: live camera flight when the video can't play
      const w = W();
      window.__flyTo(...s.cam.map(v => v * w), Math.max(1.8, s.dur * .72));
    }
    cap.classList.remove('in'); cap.classList.add('out');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => {
      cap.innerHTML = caption(s, i);
      cap.classList.remove('out'); cap.classList.add('in');
    }, 360);
    cnt.innerHTML = `${String(i + 1).padStart(2, '0')}<i>/</i>${String(SLIDES.length).padStart(2, '0')}`;
    prog.style.width = `${(i + 1) / SLIDES.length * 100}%`;
    clearTimeout(timer);
    if (!paused) timer = setTimeout(() => i >= SLIDES.length - 1 ? exit() : show(i + 1), s.hold || HOLD_MS);
  }

  const HUD_CHROME = ['hudUI', 'hint', 'compass', 'labels', 'legend', 'titlecard', 'hud'];
  const hudStash = {};
  async function start() {
    if (on || window.__mapOn) return;   // ortho map view can't fly the slide shots
    on = true; paused = true;   // presenters drive with ←/→; space resumes autoplay
    window.__endTour && window.__endTour();
    const wasIn = window.__interior?.on;
    if (wasIn) window.__exitInterior?.();   // interior HUD sits above the deck layer
    document.getElementById('uiCard')?.classList.remove('show');
    document.getElementById('uiDrawer')?.classList.remove('open');
    HUD_CHROME.forEach(id => { const el = document.getElementById(id);
      if (el) { hudStash[id] = el.style.display; el.style.display = 'none'; } });
    root.classList.add('on');
    // video background: the orbit loop plays over a paused 3D renderer —
    // PRESENT then costs a video decode, not the whole town per frame.
    // If the file can't play (missing/unsupported) the live flights stay.
    const vid = root.querySelector('.bgvid');
    vid.muted = true;
    // whenever play() actually resolves (now or later), flip to video mode —
    // a 2.5s bound keeps a stalled fetch from freezing the opening slide
    const played = vid.play().then(() => {
      vidOK = true;
      window.__setPaused && window.__setPaused(true);
    }).catch(() => {});
    await Promise.race([played, new Promise(r => setTimeout(r, 2500))]);
    // interior exit restores the saved outdoor pose at +190ms — let it land
    // before the opening flight, or the snap stomps the tween mid-flight
    wasIn ? setTimeout(() => on && show(0), 260) : show(0);
  }
  function exit() {
    if (!on) return;
    on = false; i = -1; paused = false;
    clearTimeout(timer); clearTimeout(capTimer);
    cap.classList.remove('in', 'out'); cap.innerHTML = '';
    root.classList.remove('on');
    HUD_CHROME.forEach(id => { const el = document.getElementById(id);
      if (el) el.style.display = hudStash[id] ?? ''; });
    document.getElementById('uiBtnDeck')?.classList.remove('on');
    root.querySelector('.bgvid')?.pause();
    vidOK = false;
    window.__setPaused && window.__setPaused(false);   // live scene resumes
    const w = W();
    window.__flyTo(540 * w, 620 * w, 660 * w, -30 * w, 0, -40 * w, 2.2);   // home aerial
  }

  const step = d => { if (on) { const n = i + d;
    n < 0 ? show(0) : n >= SLIDES.length ? exit() : show(n); } };
  root.querySelector('.edge.l').addEventListener('click', () => step(-1));
  root.querySelector('.edge.r').addEventListener('click', () => step(1));
  addEventListener('keydown', e => {
    if (!on) return;
    if (e.key === 'Escape') exit();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
    else if (e.key === ' ') { e.preventDefault();
      paused = !paused; clearTimeout(timer);
      if (!paused && i >= 0) timer = setTimeout(() => i >= SLIDES.length - 1 ? exit() : show(i + 1), SLIDES[i].hold || HOLD_MS); }
  });

  window.__deck = { start, exit, next: () => step(1), prev: () => step(-1),
    get on() { return on; }, get i() { return i; }, get n() { return SLIDES.length; } };
  return { start, exit, get on() { return on; } };
}
