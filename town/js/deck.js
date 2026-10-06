// deck.js — PRESENT mode: a cinematic slideshow played inside the live scene.
// Every slide flies the camera onto the building(s) it's about — the town
// itself is the imagery. Keyboard: ←/→ step, space pause, Esc exit.
// DOM-only except window.__flyTo / __endTour / __enterInterior.
import { BUILDINGS } from './layout.js';

const BUDGET = 10_000_000;
const money = n => '$' + (n / 1e6).toFixed(2) + 'M';
const fmt = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + n / 1e3 + 'k';

/* styled after the group's own deck — condensed caps, dash bullets, one
   light scrim, no chrome. The camera moves are the design. */
const css = `
#uiDeck { position:fixed; inset:0; z-index:70; display:none; pointer-events:none;
  font-family:"Segoe UI", system-ui, -apple-system, sans-serif;
  --ink:#eef4f6; --sub:#a7bcc6; --dim:#7e97a2; --rule:rgba(238,244,246,.28); }
#uiDeck.on { display:block; }
#uiDeck .scrim { position:absolute; inset:0;
  background:linear-gradient(10deg, rgba(5,14,18,.8) 0%, rgba(5,14,18,.38) 42%,
    rgba(5,14,18,0) 70%); }
#uiDeck .cap { position:absolute; left:64px; bottom:56px; max-width:620px; color:var(--ink);
  text-shadow:0 1px 10px rgba(0,0,0,.45); }
#uiDeck .cap > * { opacity:0; transform:translateY(14px); }
#uiDeck .cap.in > * { opacity:1; transform:none; transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.3,1); }
#uiDeck .cap.out > * { opacity:0; transform:translateY(-10px); transition:all .32s ease; }
#uiDeck .cap > *:nth-child(1) { transition-delay:.15s } #uiDeck .cap > *:nth-child(2) { transition-delay:.28s }
#uiDeck .cap > *:nth-child(3) { transition-delay:.42s } #uiDeck .cap > *:nth-child(4) { transition-delay:.55s }
#uiDeck h1 { margin:0 0 14px;
  font-family:"Liberation Sans Narrow","Arial Narrow","Oswald","Anton","Helvetica Neue",Arial,sans-serif;
  font-size:52px; line-height:1.02; font-weight:700; letter-spacing:.02em;
  text-transform:uppercase; text-wrap:balance; }
#uiDeck h1.big { font-size:88px; letter-spacing:.03em; }
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
#uiDeck .st b { display:block; font-family:"Liberation Sans Narrow","Arial Narrow","Oswald",Arial,sans-serif;
  font-size:30px; font-weight:700; color:var(--ink); }
#uiDeck .st span { font-size:10px; letter-spacing:1.8px; text-transform:uppercase; color:var(--dim); }
#uiDeck .bud { margin-top:18px; width:min(430px,60vw); }
#uiDeck .bud .track { height:4px; display:flex; border-radius:2px; overflow:hidden;
  background:rgba(238,244,246,.14); }
#uiDeck .bud .track i { height:100%; }
#uiDeck .bud .rows { margin-top:12px; font-size:12.5px; color:var(--sub); line-height:2; }
#uiDeck .bud .rows b { color:var(--ink); font-weight:600; }
#uiDeck .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:8px; vertical-align:1px; }
#uiDeck .x { position:absolute; right:64px; top:26px; font-size:10px; letter-spacing:2px;
  color:var(--dim); text-transform:uppercase; opacity:0; transition:opacity .6s .5s;
  text-shadow:0 1px 6px rgba(0,0,0,.7); }
#uiDeck.on .x { opacity:1; }
#uiDeck .edge { position:absolute; top:0; bottom:0; width:22%; pointer-events:auto; }
#uiDeck .edge.l { left:0 } #uiDeck .edge.r { right:0 }
/* film-cut transition: the scene dips through black on every slide change */
#uiDeck .dip { position:absolute; inset:0; background:#050b0f; opacity:0;
  pointer-events:none; }
/* corner locator: desaturated ortho map of the whole town; the university is
   always marked gold, white dots track where this slide's camera lands */
#uiDeck .mapbox { position:absolute; right:64px; top:56px; width:min(228px,22vw);
  aspect-ratio:89/80; border:1px solid var(--rule); background:#0a1418;
  box-shadow:0 10px 30px rgba(0,0,0,.5); opacity:0; transition:opacity .6s .5s; }
#uiDeck.on .mapbox { opacity:1; }
#uiDeck .mapbox img { position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; display:block; }
#uiDeck .mapbox i { position:absolute; width:7px; height:7px; border-radius:50%;
  transform:translate(-50%,-50%); }
#uiDeck .mapbox i.u { background:#f3d27a; box-shadow:0 0 0 3px rgba(243,210,122,.25); }
#uiDeck .mapbox i.f { background:#f6fbfd; opacity:0;
  box-shadow:0 0 0 4px rgba(246,251,253,.22), 0 1px 6px rgba(0,0,0,.8);
  transition:left .5s ease, top .5s ease, opacity .5s ease; }
#uiDeck .mapbox .ulab { position:absolute; font-style:normal; font-size:7.5px;
  letter-spacing:1.4px; text-transform:uppercase; color:#f3d27a;
  text-shadow:0 1px 4px rgba(0,0,0,.9); transform:translate(11px,-50%);
  white-space:nowrap; }
#uiDeck .mapbox .mtag { position:absolute; left:7px; top:5px; font-size:8px;
  letter-spacing:1.8px; color:rgba(238,244,246,.8);
  text-shadow:0 1px 4px rgba(0,0,0,.9); }
/* MLA works-cited entries — hanging indent */
#uiDeck .refs { list-style:none; margin-top:2px; max-width:560px; }
#uiDeck .refs li { font-size:12.5px; line-height:1.6; color:var(--sub);
  padding-left:1.6em; text-indent:-1.6em; margin-bottom:9px; }
#uiDeck .refs li i { color:var(--ink); }
`;

export function installDeck() {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'uiDeck';
  root.innerHTML = `<div class="scrim"></div><div class="dip"></div>
    <div class="x">ESC to exit</div>
    <div class="cap"></div>
    <div class="mapbox"><img src="deck/shots/minimap.jpg" alt="Town locator map">
      <span class="mtag">N &uarr;</span>
      <i class="u" style="left:51.39%;top:39.54%"></i>
      <em class="ulab" style="left:51.39%;top:39.54%">University</em>
      <i class="f"></i><i class="f"></i><i class="f"></i></div>
    <div class="edge l"></div><div class="edge r"></div>`;
  document.body.appendChild(root);

  const cap = root.querySelector('.cap'), dip = root.querySelector('.dip'),
        mapbox = root.querySelector('.mapbox'),
        fdots = [...root.querySelectorAll('.mapbox i.f')];

  const numd = BUILDINGS.filter(b => b.num);
  const spent = numd.reduce((s, b) => s + (b.cost || 0), 0);
  const byCat = {};
  numd.forEach(b => byCat[b.cat] = (byCat[b.cat] || 0) + (b.cost || 0));
  const nH = numd.filter(b => b.cat === 'health').length;
  const nC = numd.filter(b => b.cat === 'community').length;

  const stat = (v, l) => `<div class="st"><b>${v}</b><span>${l}</span></div>`;

  /* shots: [{cam:[px,py,pz,tx,ty,tz], dur}] — each leg is one live camera
     flight onto the building(s) the slide talks about, chained in order.
     Coords are authored in layout space — scale to world space via __ws. */
  const W = () => window.__ws || 1;
  const SLIDES = [
    /* 01 — HAVENBROOK (their cover): a slow two-leg sweep over the whole town */
    { shots: [{ cam: [620, 520, 690, -60, 0, -70], dur: 9 },
              { cam: [430, 420, 770, -40, 0, -40], dur: 9 }], cover: true, hold: 22000, title: 'HAVENBROOK',
      team: 'By: Dinesh Yara, Abhinav Mishra, Davi Ogland — HST · Period 4' },
    /* 02 — THE TOWN (overview): high aerial that pans across all four districts */
    { shots: [{ cam: [60, 780, 560, -20, 0, -60], dur: 11 },
              { cam: [-380, 620, 640, -20, 0, -30], dur: 9 }], hold: 24000, title: 'Zoned around its med school', pts: [
        'The donated campus sits dead centre — every district zones outward from it',
        'Care runs along Wellness Way up north; errands run along Commerce Blvd down south',
        'Housing and the K-12 hold the west; senior care gets the quiet northeast corner',
        'The rules we had to hit: 7+ healthcare sites, 3+ community spots, a name on every building, all inside <b>$10,000,000</b>'],
      stats: [money(spent), 'spent of $10M', `${nH}`, 'healthcare sites', `${nC}`, 'community sites', '18', 'named streets'] },
    /* 03 — WHO LIVES HERE (theirs): flies students → families → seniors */
    { shots: [{ cam: [-330, 130, -120, -540, 8, -260], dur: 6 },   // Scholar's Court + flats by campus
              { cam: [-330, 140, 420, -520, 8, 240], dur: 6 },     // family grid + school
              { cam: [660, 150, -240, 570, 10, -520], dur: 6 }], hold: 26000,   // senior block
      title: 'Who lives here', pts: [
        'Half are <b>college students</b> — flats and a student clinic hug the campus',
        'About a third are <b>families</b> — houses cluster around the K-12',
        'One in five is <b>65+</b> — senior living and hospice sit in the quiet east',
        'That mix is why the map looks the way it does'],
      stats: ['50%', 'college students', '30%', 'families', '20%', 'adults 65+'] },
    /* 04 — UNIVERSITY SCHOOL OF MEDICINE (theirs): dives onto the quad */
    { shots: [{ cam: [280, 90, -40, 40, 22, -260], dur: 7 },
              { cam: [-90, 75, -95, 40, 20, -215], dur: 7 }], hold: 20000, title: 'Havenbrook University School of Medicine', pts: [
        'The Marchand Medical Library, Whitmore Anatomy Hall, and Caldecott Clinical Sciences Hall around one quad',
        'Sits at the town\u2019s centre — every district zones outward from it',
        'Student flats wrap the west and south edges',
        'It\u2019s why the town exists, so it gets the best spot'] },
    /* 05 — THIRTEEN WAYS TO GET CARE (theirs): hospital → EMS/clinic → lab+rehab */
    { shots: [{ cam: [300, 95, -420, 80, 28, -505], dur: 6 },      // Havenbrook General
              { cam: [80, 55, -240, -80, 8, -322], dur: 6 },       // EMS + Thacher across Wellness
              { cam: [330, 80, -360, 235, 10, -575], dur: 6 }], hold: 26000,   // lab + Stoneleigh
      title: 'Thirteen ways to get care', pts: [
        '<b>Emergency:</b> Havenbrook General Hospital and Garrison Medical Transport, a block apart on the Wellness spine',
        '<b>Everyday:</b> Thacher Student Health Clinic, Brookfield Family Physicians, Marigold Dental Studio, Parallax Optical, Meridian Diagnostics Laboratory',
        '<b>Long-term:</b> Stoneleigh Rehabilitation Center, Ashwood Behavioral Health Center, Halcyon House Senior Living, Stillpoint Hospice',
        '<b>Public health:</b> Havenbrook County Health Department · <b>At home:</b> Innisfree Home Health',
        '<b>Why these:</b> every site maps to a resident — students, families, and the 65+ block'] },
    /* 06 — THE PRESERVE (theirs): across the commons to the housing rows */
    { shots: [{ cam: [-250, 140, 390, -480, 8, 180], dur: 7 },
              { cam: [-360, 105, 60, -530, 10, 230], dur: 7 }], hold: 20000, title: 'The Preserve at Havenbrook', pts: [
        'The required housing development — cottages, duplexes, townhouses',
        'Preserve Commons Apartments fill the middle of the neighborhood',
        'Scholar\u2019s Court and Scholar\u2019s Walk apartments plus University Lofts take the students; Midtown Flats takes downtown',
        'Nobody is more than a short walk from campus or a bus route'] },
    /* 07 — COMMUNITY (theirs): mall → Bardsley's/Olsen's → Main St row */
    { shots: [{ cam: [400, 120, 650, 540, 10, 500], dur: 6 },      // Commons Mall
              { cam: [150, 80, 560, 60, 8, 468], dur: 6 },        // Bardsley's + Olsen's
              { cam: [90, 45, 15, 60, 8, -66], dur: 6 }], hold: 26000,   // Main St storefronts
      title: 'The parts that aren\u2019t medicine', pts: [
        '<b>Errands:</b> Havenbrook Commons Mall, Bardsley\u2019s Department Store, Olsen\u2019s Market, Bellwether Pharmacy',
        '<b>Food:</b> The Orchard Table, Mariposa Cantina, The Whippoorwill Coffeehouse',
        '<b>Outside:</b> Willow Creek Park — pond, trails, bandshell',
        '<b>The boring-but-needed:</b> Havenbrook Post Office, Havenbrook Unified School District, Quarry Hill Museum'] },
    /* 08 — A PLACE TO GROW OLD (theirs): Halcyon House then Stillpoint */
    { shots: [{ cam: [420, 95, -430, 500, 12, -560], dur: 6 },
              { cam: [630, 75, -330, 712, 8, -418], dur: 6 }], hold: 20000, title: 'A place to grow old', pts: [
        'Halcyon House Senior Living — assisted living + memory care around a courtyard garden',
        'Stillpoint Hospice next door, so the hardest visits stay short and private',
        'Innisfree Home Health means seniors keep their own homes longer',
        'The whole block sits on Sunset Ridge — farthest from traffic, closest to quiet'] },
    /* 09 — SHOPPING AND ENTERTAINMENT (theirs): mall → Bardsley's → museum */
    { shots: [{ cam: [480, 110, 630, 540, 10, 500], dur: 6 },
              { cam: [140, 70, 555, 30, 8, 480], dur: 6 },
              { cam: [250, 95, -120, 200, 10, -296], dur: 6 }], hold: 24000, title: 'Shopping and entertainment', pts: [
        '<b>Havenbrook Commons Mall</b> — the anchor of the Commerce Blvd corridor',
        '<b>Bardsley\u2019s Department Store</b> and <b>Olsen\u2019s Market</b> for the essentials',
        '<b>Quarry Hill Museum</b> on the civic plaza — the rainy-day option',
        '<b>Willow Creek Park</b> and <b>The Whippoorwill Coffeehouse</b> for the slower afternoons'] },
    /* 10 — HOW WE LAID IT OUT (theirs): the grid, then down the Wellness spine */
    { shots: [{ cam: [60, 780, 560, -20, 0, -60], dur: 8 },
              { cam: [150, 160, -240, -100, 10, -360], dur: 8 }], hold: 24000, title: 'How we laid it out', pts: [
        'Streets first: two arterials cross at the campus, 18 named streets fill the grid',
        'Hospital and EMS share the Wellness Way spine — minutes from anywhere',
        'Shops run along Commerce Blvd; the K-12 sits inside the neighborhoods',
        'Every address is within two blocks of a through-street — that\u2019s the EMS rule'] },
    /* 11 — HAVEN DOWNTOWN (theirs): the old-town skyline + plaza */
    { shots: [{ cam: [-150, 150, -160, -480, 10, -520], dur: 9 },
              { cam: [-330, 110, -300, -490, 15, -500], dur: 7 }], hold: 22000, title: 'Haven downtown', pts: [
        'A walkable core where the campus, the hospital district, and the shops share a few busy blocks',
        'Students can go class → clinic → coffee without ever needing a car',
        'The plaza and the old-town skyline — Pinnacle Health Plaza, Foundry One — give it a real centre'] },
    /* 12 — SCHOOL DISTRICT (theirs): orbits the K-12 campus */
    { shots: [{ cam: [-720, 170, 330, -510, 10, 560], dur: 8 },
              { cam: [-390, 120, 660, -510, 10, 560], dur: 8 }], hold: 22000, title: 'Havenbrook Unified School District', pts: [
        'The K-12 anchor for the family neighborhoods on the southwest side',
        'Health-science electives and athletics feed straight into the university pipeline',
        'Sits inside the neighborhoods it serves — kids walk, not bus'] },
    /* 13 — WHAT WE TRADED: medical district wide, then the south side */
    { shots: [{ cam: [300, 110, -620, 20, 26, -440], dur: 9 },
              { cam: [-140, 320, 620, -20, 0, 300], dur: 9 }], hold: 22000, title: 'What we traded', pts: [
        'The two donated sites freed ~$4.5M — so we bought 13 small facilities instead of one mega-campus',
        'Picked the mall over a second park — the Preserve already covers green space',
        'Senior care went to the quiet east instead of paying downtown frontage',
        'Stopped at 26 buildings and banked the leftover <b>$50,000</b> instead of forcing a 27th'] },
    /* 14 — THE BUDGET: straight overhead while the ledger runs */
    { shots: [{ cam: [60, 1250, 640, 0, 0, -20], dur: 10 }], dark: true, hold: 26000, nomap: true, title: 'Where the money went', sheet: true },
    /* 15 — WHY IT WORKS: back to a sweeping aerial */
    { shots: [{ cam: [620, 540, 720, -60, 0, -60], dur: 9 },
              { cam: [700, 480, 280, -60, 0, -60], dur: 8 }], cover: true, hold: 22000, title: 'Why it works', pts: [
        'Students get the campus, the flats, the Thacher Student Health Clinic, and the Whippoorwill — no car needed',
        'Families get the school, Brookfield Family Physicians, Olsen\u2019s Market, and Willow Creek Park',
        'Seniors get the full care loop — Innisfree Home Health visits all the way to Stillpoint Hospice',
        `And the whole town lands at <b>${money(spent)}</b>, under the $10M cap`], nomap: true },
    /* 16 — WORKS CITED (MLA format) */
    { shots: [{ cam: [620, 520, 690, -60, 0, -70], dur: 9 }], dark: true, hold: 18000, nomap: true, title: 'Works Cited', refs: [
        'American Planning Association. <i>Complete Communities</i>. American Planning Association, www.planning.org/planning/complete-communities/. Accessed 5 Oct. 2026.',
        '<i>Our Town Healthcare System: Digital Project Instructions</i>. Class handout, HST Period 4, Oct. 2026.',
        'United States Census Bureau. \u201cQuickFacts.\u201d <i>Census.gov</i>, U.S. Dept. of Commerce, www.census.gov/quickfacts/. Accessed 5 Oct. 2026.',
        '\u201cThree.js.\u201d <i>Three.js</i>, threejs.org. Accessed 5 Oct. 2026.'],
      team: 'Dinesh Yara · Abhinav Mishra · Davi Ogland · HST · Period 4' },
  ];

  const HOLD_MS = 12000;
  /* price-sheet kinds the rubric makes us spell out (restaurant type, fast-food type) */
  const KIND = { orchard: 'farm-to-table restaurant', fiesta: 'Mexican fast-food grill' };
  let on = false, i = -1, timer = 0, capTimer = 0, paused = false, seq = 0;

  function caption(s, idx) {
    const bits = [];
    if (s.pts) {
      bits.push(`<ul class="pts">${s.pts.map(p => `<li>${p}</li>`).join('')}</ul>`);
    } else if (s.refs) {
      bits.push(`<ul class="refs">${s.refs.map(r => `<li>${r}</li>`).join('')}</ul>`);
    } else if (s.sheet) {
      const mk = cat => numd.filter(b => b.cat === cat)
        .map(b => `<div class="row"><i>${String(b.num).padStart(2, '0')}</i><em>${b.name}${KIND[b.id] ? ' · ' + KIND[b.id] : ''}</em><b>${fmt(b.cost)}</b></div>`).join('');
      bits.push(`<div class="sheet">` +
        `<div class="col"><div class="colh">Healthcare <span>${money(byCat.health || 0)}</span></div>${mk('health')}</div>` +
        `<div class="col"><div class="colh">Community <span>${money(byCat.community || 0)}</span></div>${mk('community')}</div></div>` +
        `<div class="foot">Spent <b>${money(spent)}</b> of ${money(BUDGET)} · <b>${money(BUDGET - spent)}</b> unspent · university + housing were donated</div>`);
    } else if (!s.stats && s.body) {
      bits.push(`<div class="body">${s.body}</div>`);
    }
    // pts and stats coexist — overview/demographics bullets sit above the stat row
    if (s.stats) {
      bits.push(`<div class="stats">${Array.from({ length: s.stats.length / 2 }, (_, k) => stat(s.stats[k * 2], s.stats[k * 2 + 1])).join('')}</div>`);
    }
    return `<h1${s.cover ? ' class="big"' : ''}>${s.title}</h1>` + bits.join('') +
      (s.team ? `<div class="team">${s.team}</div>` : '');
  }

  /* chain this slide's camera legs; each leg = one zoom onto a named building */
  function flyShots(s) {
    const id = ++seq;
    const w = W();
    const legs = s.shots || [];
    let leg = 0;
    const go = () => {
      if (id !== seq || !on || leg >= legs.length) return;
      const L = legs[leg++];
      window.__flyTo(...L.cam.map(v => v * w), L.dur);
      setTimeout(go, L.dur * 1000 + 400);   // small settle between legs
    };
    go();
  }

  function show(idx) {
    i = idx;
    const s = SLIDES[i];
    // film-cut: the scene dips through black between slides (skipped on open)
    if (idx > 0 && dip.animate) dip.animate(
      [{ opacity: 0 }, { opacity: .62, offset: .42 }, { opacity: 0 }],
      { duration: 900, easing: 'ease-in-out' });
    flyShots(s);
    /* locator dots: one per unique place this slide's camera looks at. The ortho
       map covers ±890×±800 WORLD units — layout coords scale by __ws (.62). */
    mapbox.style.display = s.nomap ? 'none' : '';
    const w2 = W();
    const spots = [...new Map((s.shots || []).map(L =>
      [L.cam[3] + ',' + L.cam[5], [L.cam[3], L.cam[5]]])).values()];
    fdots.forEach((d, k) => {
      const t = spots[k];
      if (!t) { d.style.opacity = 0; return; }
      d.style.opacity = 1;
      d.style.left = ((t[0] * w2 + 890) / 1780 * 100).toFixed(2) + '%';
      d.style.top = ((t[1] * w2 + 800) / 1600 * 100).toFixed(2) + '%';
    });
    cap.classList.remove('in'); cap.classList.add('out');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => {
      cap.innerHTML = caption(s, i);
      cap.classList.remove('out'); cap.classList.add('in');
    }, 360);
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
    window.__setPaused && window.__setPaused(false);   // live scene must render the flights
    root.classList.add('on');
    // interior exit restores the saved outdoor pose at +190ms — let it land
    // before the opening flight, or the snap stomps the tween mid-flight
    wasIn ? setTimeout(() => on && show(0), 260) : show(0);
  }
  function exit() {
    if (!on) return;
    on = false; i = -1; paused = false; seq++;   // kill any queued camera legs
    clearTimeout(timer); clearTimeout(capTimer);
    cap.classList.remove('in', 'out'); cap.innerHTML = '';
    root.classList.remove('on');
    HUD_CHROME.forEach(id => { const el = document.getElementById(id);
      if (el) el.style.display = hudStash[id] ?? ''; });
    document.getElementById('uiBtnDeck')?.classList.remove('on');
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
