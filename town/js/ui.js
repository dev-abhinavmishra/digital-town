// ui.js — presentation layer: budget tracker, facility directory with camera
// flights, building info cards, guided tour, and the assignment checklist.
// DOM-only module; the world is untouched except via window.__flyTo.
import { BUILDINGS, APARTMENTS, TOWN, CATEGORY_COLORS } from './layout.js';
import { installDeck } from './deck.js';

const BUDGET = 10_000_000;
const money = n => '$' + (n / 1e6).toFixed(2) + 'M';
const CAT_NAME = { free: 'Provided free', health: 'Healthcare', community: 'Community', civic: 'Civic', res: 'Residential' };

/* Havenbrook HUD — light frosted-glass theme. One surface recipe everywhere:
   translucent white + blur, hairline ink border, soft ambient shadow. Dark
   ink text on glass; category colours stay only where they carry data
   (dots, chips, budget segments). */
const css = `
#hudUI * { box-sizing: border-box; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
#hudUI .btn { cursor:pointer; user-select:none; background:rgba(252,253,252,.72);
  color:#22414e; border:1px solid rgba(13,48,64,.12); border-radius:10px;
  padding:6px 12px; font-size:11px; font-weight:600; letter-spacing:.8px;
  backdrop-filter:blur(14px) saturate(1.4); box-shadow:0 1px 2px rgba(12,40,56,.06),
  0 8px 22px -10px rgba(12,40,56,.22); transition:background .15s, transform .15s; }
#hudUI .btn:hover { background:rgba(255,255,255,.92); transform:translateY(-1px); }
#hudUI .btn.on { background:#17556e; border-color:#17556e; color:#f4f9fb; }
#uiTopRight { position:fixed; top:14px; right:14px; display:flex;
  gap:7px; align-items:center; z-index:50; }
#uiTopRight .btn { pointer-events:auto; }
#uiBtns { display:flex; gap:7px; }
#uiTier { font-size:9.5px; letter-spacing:1.1px; color:#5d7380; text-align:right;
  padding:4px 9px; user-select:none; cursor:pointer; background:rgba(252,253,252,.66);
  border:1px solid rgba(13,48,64,.10); border-radius:8px; backdrop-filter:blur(10px);
  box-shadow:0 1px 2px rgba(12,40,56,.06); }
#uiTier:hover { background:rgba(255,255,255,.92); color:#16323e; }
#uiGuide { position:fixed; inset:0; display:none; z-index:60; background:rgba(9,17,23,.44);
  align-items:center; justify-content:center; backdrop-filter:blur(3px); }
#uiGuide.open { display:flex; }
#uiGuide .panel { width:min(680px, 94vw); max-height:86vh; overflow-y:auto;
  background:rgba(252,253,252,.92); border:1px solid rgba(13,48,64,.10);
  border-radius:18px; padding:26px 30px; color:#16323e; backdrop-filter:blur(18px);
  box-shadow:0 24px 70px -20px rgba(9,30,42,.5); }
#uiGuide h2 { margin:0 0 4px; font-size:19px; font-weight:650; letter-spacing:.2px; }
#uiGuide h4 { font-size:10px; letter-spacing:1.6px; color:#8ba0aa; margin:16px 0 6px;
  text-transform:uppercase; font-weight:600; }
#uiGuide .tagline { color:#5d7380; font-size:12.5px; }
#uiGuide table.g { width:100%; border-collapse:collapse; font-size:12.5px; }
#uiGuide table.g td { padding:6px 8px 6px 0; border-bottom:1px solid rgba(13,48,64,.08);
  color:#334f5c; vertical-align:top; }
#uiGuide table.g td:first-child { color:#5d7380; white-space:nowrap; font-weight:600; width:118px; }
#uiGuide .tr { display:flex; align-items:baseline; gap:10px; padding:8px 10px;
  border-radius:10px; cursor:pointer; border:1px solid transparent; transition:background .12s; }
#uiGuide .tr:hover { background:rgba(23,85,110,.05); }
#uiGuide .tr.on { background:rgba(23,85,110,.09); border-color:rgba(23,85,110,.22); }
#uiGuide .tr .nm { font-weight:700; font-size:12px; letter-spacing:.8px; width:52px; flex:none; color:#17556e; }
#uiGuide .tr .ft { flex:1; font-size:11.5px; color:#5d7380; line-height:1.45; }
#uiGuide .tr .bdg { flex:none; font-size:9px; letter-spacing:1px; color:#1a7f5c; font-weight:600; }
#uiGuide .tr.on .bdg::before { content:'\\2713 '; }
#uiGuide .close { float:right; cursor:pointer; color:#8ba0aa; font-size:18px; line-height:1;
  padding:4px 6px; border-radius:8px; }
#uiGuide .close:hover { color:#16323e; background:rgba(13,48,64,.07); }
#uiGuide .note { font-size:10.5px; color:#8ba0aa; margin-top:8px; }
#uiTour { position:fixed; left:14px; bottom:14px; z-index:41; }
#uiDrawer { position:fixed; top:64px; right:-340px; width:320px; height:calc(100% - 64px); z-index:45;
  background:rgba(252,253,252,.82); border-left:1px solid rgba(13,48,64,.10);
  transition:right .25s ease; overflow-y:auto; color:#16323e; backdrop-filter:blur(16px) saturate(1.3);
  box-shadow:-18px 0 40px -24px rgba(9,30,42,.35); }
#uiDrawer.open { right:0; }
#uiDrawer h2 { font-size:11px; letter-spacing:1.6px; padding:14px 16px 8px; color:#5d7380;
  position:sticky; top:0; background:rgba(252,253,252,.9); margin:0; backdrop-filter:blur(8px);
  font-weight:600; }
#uiDrawer .grp { padding:2px 12px 10px; }
#uiDrawer .grp h4 { font-size:10px; letter-spacing:1.4px; color:#8ba0aa; margin:10px 0 5px;
  text-transform:uppercase; font-weight:600; }
#uiDrawer .fi { display:flex; gap:9px; align-items:center; padding:6px 8px; border-radius:9px;
  cursor:pointer; font-size:12.5px; color:#22414e; transition:background .12s; }
#uiDrawer .fi:hover { background:rgba(23,85,110,.06); }
#uiDrawer .fi .n { width:20px; height:20px; border-radius:50%; flex:none; display:flex;
  align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff; }
#uiDrawer .fi .nm { flex:1; }
#uiDrawer .fi .co { color:#8ba0aa; font-size:10.5px; }
#uiCard { position:fixed; left:50%; bottom:18px; transform:translateX(-50%) translateY(140px);
  z-index:46; width:min(520px, 92vw); background:rgba(252,253,252,.88); color:#16323e;
  border:1px solid rgba(13,48,64,.10); border-radius:16px; padding:14px 18px;
  transition:transform .28s cubic-bezier(.2,.9,.3,1.2); backdrop-filter:blur(18px) saturate(1.4);
  box-shadow:0 2px 3px rgba(12,40,56,.05), 0 20px 50px -16px rgba(9,30,42,.38); }
#uiCard.show { transform:translateX(-50%) translateY(0); }
#uiCard .x { position:absolute; top:8px; right:10px; cursor:pointer; color:#8ba0aa; font-size:16px;
  padding:2px 6px; border-radius:8px; }
#uiCard .x:hover { color:#16323e; background:rgba(13,48,64,.07); }
#uiCard h3 { margin:0 0 2px; font-size:16px; padding-right:20px; font-weight:650; letter-spacing:.1px; }
#uiCard .chip { display:inline-block; font-size:9.5px; letter-spacing:.8px; padding:2px 9px;
  border-radius:20px; color:#fff; margin:3px 0 7px; font-weight:600; text-transform:uppercase; }
#uiCard .cost { font-size:12px; color:#17556e; font-weight:600; }
#uiCard p { margin:7px 0 0; font-size:12.5px; line-height:1.6; color:#334f5c; }
#uiCard .fly { margin-top:9px; font-size:11px; color:#1a6fa0; cursor:pointer; font-weight:600; }
#uiCard .fly:hover { text-decoration:underline; }
#uiTourBar { position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
  z-index:44; display:none; align-items:center; gap:10px; width:min(640px,94vw);
  background:rgba(252,253,252,.88); border:1px solid rgba(13,48,64,.10);
  border-radius:16px; padding:12px 16px; color:#16323e; backdrop-filter:blur(18px) saturate(1.4);
  box-shadow:0 2px 3px rgba(12,40,56,.05), 0 20px 50px -16px rgba(9,30,42,.38); }
#uiTourBar.show { display:flex; }
#uiTourBar .cap { flex:1; }
#uiTourBar .cap b { display:block; font-size:13.5px; margin-bottom:2px; font-weight:650; }
#uiTourBar .cap span { font-size:12px; color:#5d7380; line-height:1.5; }
#uiTourBar .nav { flex:none; }
#uiTourBar .step { font-size:10.5px; color:#8ba0aa; text-align:center; margin-top:3px;
  letter-spacing:.6px; }
#uiRubric { position:fixed; inset:0; display:none; z-index:60; background:rgba(9,17,23,.44);
  align-items:center; justify-content:center; backdrop-filter:blur(3px); }
#uiRubric.open { display:flex; }
#uiRubric .panel { width:min(720px, 94vw); max-height:86vh; overflow-y:auto;
  background:rgba(252,253,252,.92); border:1px solid rgba(13,48,64,.10);
  border-radius:18px; padding:26px 30px; color:#16323e; backdrop-filter:blur(18px);
  box-shadow:0 24px 70px -20px rgba(9,30,42,.5); }
#uiRubric h2 { margin:0 0 4px; font-size:19px; font-weight:650; letter-spacing:.2px; }
#uiRubric .tagline { color:#5d7380; font-size:12.5px; margin-bottom:16px; }
#uiRubric table { width:100%; border-collapse:collapse; font-size:12.5px; }
#uiRubric td, #uiRubric th { text-align:left; padding:7px 8px; border-bottom:1px solid rgba(13,48,64,.08); color:#334f5c; }
#uiRubric th { color:#8ba0aa; font-size:10px; letter-spacing:1.4px; text-transform:uppercase; font-weight:600; }
#uiRubric td.ok { color:#1a7f5c; width:26px; }
#uiRubric .close { float:right; cursor:pointer; color:#8ba0aa; font-size:18px; line-height:1;
  padding:4px 6px; border-radius:8px; }
#uiRubric .close:hover { color:#16323e; background:rgba(13,48,64,.07); }
@media (max-width:700px) { #uiDrawer{width:86vw;right:-86vw} #uiDrawer.open{right:0}
  #uiTopRight{flex-wrap:wrap;justify-content:flex-end;max-width:96vw} }
`;

export function installUI() {
  if (typeof document === 'undefined') return;
  const root = document.createElement('div');
  root.id = 'hudUI';
  document.body.appendChild(root);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const numd = BUILDINGS.filter(b => b.num);
  const spent = numd.reduce((s, b) => s + (b.cost || 0), 0);

  /* ---------------- top-right controls — one row ---------------- */
  root.insertAdjacentHTML('beforeend', `
    <div id="uiTopRight">
      <div id="uiBtns">
        <div class="btn" id="uiBtnDir">&#8801; FACILITIES</div>
        <div class="btn" id="uiBtnTour">&#9654; TOUR</div>
        <div class="btn" id="uiBtnDeck">&#9673; PRESENT</div>
        <div class="btn" id="uiBtnRubric">&#10003; PROJECT BRIEF</div>
        <div class="btn" id="uiBtnGuide">&#9432; GUIDE</div>
      </div>
      <div id="uiTier" title="Render quality — click to change"></div>
    </div>
    <div id="uiDrawer"><h2>${TOWN.name} — FACILITY DIRECTORY
      <span id="uiDrawerX" style="float:right;cursor:pointer;color:#8a99a3">&times;</span></h2></div>
    <div id="uiCard"></div>
    <div id="uiTourBar"></div>
    <div id="uiGuide"><div class="panel">
      <span class="close" id="uiGuideX">&times;</span>
      <h2>${TOWN.name} — Guide</h2>
      <div class="tagline">How to explore the town — and how to tune render quality for your device.</div>
      <h4>Getting around</h4>
      <table class="g">
        <tr><td>Fly</td><td>Drag to look &middot; WASD move &middot; Q/E down/up &middot; Shift = fast &middot; wheel = speed &middot; double-click = orbit</td></tr>
        <tr><td>Visit a facility</td><td>Click its map label, or pick it in FACILITIES — the camera flies there</td></tr>
        <tr><td>Step inside</td><td>Click the building itself (or &#8220;step inside&#8221; on its card) — WASD to walk, Esc to leave</td></tr>
        <tr><td>Guided tour</td><td>TOUR plays an 8-stop narrated route explaining why each facility sits where it does</td></tr>
        <tr><td>Budget &amp; brief</td><td>PROJECT BRIEF maps the assignment — total spend, free sites, healthcare coverage</td></tr>
      </table>
      <h4>Render quality — running <b id="uiGuideRun"></b></h4>
      <div id="uiGuideTiers"></div>
      <div class="note">Click a tier to switch — the scene reloads and your choice is remembered for next time.</div>
    </div></div>
    <div id="uiRubric"><div class="panel">
      <span class="close" id="uiRubricX">&times;</span>
      <h2>${TOWN.name} — Project Brief</h2>
      <div class="tagline">A digital town planned around care: a medical university anchors the
      town centre; healthcare radiates along Wellness Way; community life fills the south.<br>
      <b>Team — Abhinav Mishra · Dinesh Yara · Davi Ogland</b></div>
      <table id="uiRubricTbl"></table>
    </div></div>
  `);

  const $ = s => root.querySelector(s);

  /* ---------------- guide + render-quality tiers ---------------- */
  const tierChip = $('#uiTier'), guide = $('#uiGuide');
  const TIERS = [
    ['auto', 'Adapts to this device — picks high / low / min from GPU, CPU cores and memory.'],
    ['ultra','Maximum — 8K shadows, 4x MSAA, 2.5x pixels, deeper ambient occlusion, shadowed interiors, every chunk loaded. Fastest machines only.'],
    ['high', 'Full fidelity — 4K soft shadows, ambient occlusion, bloom, SMAA, 1.5x pixels, 85% scene detail.'],
    ['med',  'Balanced — 2K shadows, bloom + SMAA, no ambient occlusion, 70% scene detail, chunked map loading.'],
    ['low',  'Performance — 1K shadows, SMAA only (no AO / bloom), 45% scene detail, chunked map loading. For weak GPUs / low RAM.'],
    ['min',  'Minimal — no shadows or post-fx, no moving traffic or pedestrians, 12% scene detail with chunked map culling (~360k tris at street level). For very weak devices.'],
  ];
  let savedPref = 'auto';
  try { savedPref = localStorage.getItem('dt_q') || 'auto'; } catch {}
  $('#uiGuideTiers').innerHTML = TIERS.map(([q, ft]) =>
    `<div class="tr${q === savedPref ? ' on' : ''}" data-q="${q}">
      <span class="nm">${q.toUpperCase()}</span><span class="ft">${ft}</span>
      <span class="bdg"></span>
    </div>`).join('');
  $('#uiGuideTiers').addEventListener('click', e => {
    const row = e.target.closest('.tr');
    if (!row) return;
    const q = row.dataset.q;
    try { q === 'auto' ? localStorage.removeItem('dt_q')
                       : localStorage.setItem('dt_q', q); } catch {}
    /* a ?q=/?quality= in the URL would beat the saved pref after reload —
       strip the overrides (keep ?time, ?view, etc.) so the pick applies */
    const u = new URL(location.href);
    u.searchParams.delete('q'); u.searchParams.delete('quality');
    location.href = u.toString();
  });
  function openGuide() {
    /* __fx is created after installUI — read the effective tier lazily */
    const running = (window.__fx && window.__fx.tier) || '';
    $('#uiGuideRun').textContent = running ? running.toUpperCase() : '—';
    guide.querySelectorAll('.tr').forEach(el => {
      const marks = [];
      if (el.classList.contains('on')) marks.push('SAVED');
      if (el.dataset.q === running) marks.push('RUNNING NOW');
      el.querySelector('.bdg').textContent = marks.join(' · ');
    });
    guide.classList.add('open');
    drawer.classList.remove('open');
  }
  $('#uiBtnGuide').addEventListener('click', openGuide);
  tierChip.addEventListener('click', e => { e.stopPropagation(); openGuide(); });
  $('#uiGuideX').addEventListener('click', () => guide.classList.remove('open'));
  guide.addEventListener('click', e => { if (e.target === guide) guide.classList.remove('open'); });

  /* ---------------- facility directory ---------------- */
  const drawer = $('#uiDrawer');
  const groups = [['free', 'Provided by the town'], ['health', 'Healthcare facilities'], ['community', 'Community locations']];
  let html = drawer.innerHTML;
  for (const [cat, title] of groups) {
    const list = numd.filter(b => b.cat === cat).sort((a, b) => a.num - b.num);
    if (!list.length) continue;
    html += `<div class="grp"><h4>${title} (${list.length})</h4>` +
      list.map(b => `<div class="fi" data-id="${b.id}">
        <span class="n" style="background:${CATEGORY_COLORS[cat]}">${b.num}</span>
        <span class="nm">${b.name}</span><span class="co">${b.cost ? money(b.cost) : 'free'}</span>
      </div>`).join('') + '</div>';
  }
  drawer.innerHTML = html;
  $('#uiBtnDir').addEventListener('click', () => drawer.classList.toggle('open'));
  $('#uiDrawerX').addEventListener('click', () => drawer.classList.remove('open'));
  drawer.addEventListener('click', e => {
    const fi = e.target.closest('.fi');
    if (!fi) return;
    showCard(BUILDINGS.find(b => b.id === fi.dataset.id), true);
  });

  /* ---------------- info card ---------------- */
  const card = $('#uiCard');
  function showCard(b, fly) {
    if (!b) return;
    card.innerHTML = `<span class="x" id="uiCardX">&times;</span>
      <h3>${b.num ? `<span style="color:${CATEGORY_COLORS[b.cat]}">#${b.num}</span> ` : ''}${b.name}</h3>
      <span class="chip" style="background:${CATEGORY_COLORS[b.cat] || '#555'}">${CAT_NAME[b.cat] || b.cat}</span>
      <div class="cost">${b.cost ? 'Cost ' + money(b.cost) : 'Provided free under the town plan'}</div>
      ${b.desc ? `<p>${b.desc}</p>` : ''}
      <div class="fly">&#x2708; fly there</div>
      ${b.w && b.id ? `<div class="fly" data-act="in" style="color:#1a7f5c">&#x1F6AA; step inside</div>` : ''}`;
    card.classList.add('show');
    $('#uiCardX').onclick = () => card.classList.remove('show');
    card.querySelector('.fly').onclick = () => flyToBuilding(b);
    const inL = card.querySelector('[data-act="in"]');
    if (inL) inL.onclick = () => { card.classList.remove('show'); drawer.classList.remove('open'); window.__enterInterior && window.__enterInterior(b.id); };
    if (fly) flyToBuilding(b);
  }
  const W = () => window.__ws || 1;   // layout coords → world coords
  function flyToBuilding(b) {
    const w = W();
    const dist = Math.max(b.w || 30, b.d || 30) * 1.7 + 26;
    const ang = Math.atan2(b.x, b.z) + .6;   // approach from the south-east quadrant
    const px = b.x + Math.sin(ang) * dist, pz = b.z + Math.cos(ang) * dist;
    const py = Math.max(30, (b.h || 8) * 1.6 + 24);
    window.__flyTo(px * w, py * w, pz * w, b.x * w, (b.h || 8) * .5 * w, b.z * w, 1.8);
  }
  // label clicks open the card — labels carry the num badge
  document.getElementById('labels')?.addEventListener('click', e => {
    const el = e.target.closest('.lbl');
    if (!el) return;
    const num = +el.querySelector('.num')?.textContent || 0;
    const b = numd.find(b => b.num === num);
    if (b) showCard(b, false);
  });
  window.__uiShowCard = id => showCard(BUILDINGS.find(b => b.id === id), false);

  /* ---------------- guided tour ---------------- */
  const TOUR = [
    { b: 'medhall',  t: 'Anchored free: the University School of Medicine', c: 'The town is planned around a medical university — donated land, quadrangle, and research halls at the centre of town.' },
    { b: 'hospital', t: 'Havenbrook General Hospital ($1.5M)', c: 'The largest single spend sits on Wellness Way, one block from the EMS station — the care spine of the town.' },
    { b: 'ems',      t: 'Hartline EMS ($400k)', c: 'Placed at the Midtown/Main junction so ambulances reach every district along arterials in minutes.' },
    { b: 'silveroaks', t: 'Halcyon House Senior Living ($750k)', c: 'Senior care sits east, quiet and leafy, between the hospice and the park — a full ageing-in-place loop.' },
    { b: 'park',     t: 'Willow Creek Park ($200k)', c: 'Community green space with ponds, sports fields and the bandshell — the town\'s social heart.' },
    { b: 'mall',     t: 'Havenbrook Commons Mall ($1.0M)', c: 'Commerce Blvd concentrates retail south of downtown — walkable, on the same corridor as the pharmacy and grocery.' },
    { b: 'preservecommons', t: 'The Preserve (free housing)', c: 'The donated housing development fills Residential West — Preserve Commons anchors it: twin mid-rise slabs around a resident courtyard.' },
    { b: 'school',   t: 'Havenbrook Unified School District ($300k)', c: 'School district on Schoolhouse Rd with its own athletic park — buses staged on the frontage.' },
  ];
  const tourBar = $('#uiTourBar');
  tourBar.innerHTML = `<div class="cap"></div>
    <div class="nav"><div class="btn" id="uiTourNext">NEXT &#9654;</div></div>`;
  tourBar.addEventListener('mousedown', e => e.stopPropagation());   // NEXT clicks mustn't end the tour
  $('#uiTourNext').onclick = e => { e.stopPropagation(); tourStop(tourI + 1); };
  let tourI = -1, tourTimer = 0;
  function tourStop(i) {
    tourI = i;
    if (i < 0 || i >= TOUR.length) { endTour(); return; }
    const s = TOUR[i], b = BUILDINGS.find(b => b.id === s.b);
    if (!b) { tourStop(i + 1); return; }
    tourBar.querySelector('.cap').innerHTML = `<b>${s.t}</b><span>${s.c}</span>
      <div class="step">${i + 1} / ${TOUR.length} — click anywhere or press Esc to exit</div>`;
    $('#uiTourNext').innerHTML = i === TOUR.length - 1 ? 'FINISH' : 'NEXT &#9654;';
    tourBar.classList.add('show');
    flyToBuilding(b);
    clearTimeout(tourTimer);
    tourTimer = setTimeout(() => tourStop(i + 1), 9000);
  }
  function endTour() {
    tourI = -1; clearTimeout(tourTimer);
    tourBar.classList.remove('show');
    $('#uiBtnTour').classList.remove('on');
    const w = W();
    window.__flyTo(540 * w, 620 * w, 660 * w, -30 * w, 0, -40 * w, 2.2);   // return to the aerial
  }
  window.__endTour = endTour;   // interior entry stops an in-flight tour
  $('#uiBtnTour').addEventListener('click', () => {
    if (tourI >= 0) { endTour(); return; }
    $('#uiBtnTour').classList.add('on');
    card.classList.remove('show');
    tourStop(0);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && tourI >= 0) endTour(); });
  addEventListener('mousedown', () => { if (tourI >= 0) endTour(); }, { once: false, capture: false });

  /* ---------------- present mode (cinematic slide deck) ---------------- */
  const deck = installDeck();
  if (window.__mapOn) $('#uiBtnDeck').style.display = 'none';   // no flights in ortho map view
  $('#uiBtnDeck').addEventListener('click', e => {
    e.stopPropagation();
    if (deck.on) { deck.exit(); return; }
    $('#uiBtnDeck').classList.add('on');
    if (tourI >= 0) endTour();
    rub.classList.remove('open'); guide.classList.remove('open');
    deck.start();
  });

  /* ---------------- rubric / brief overlay ---------------- */
  const rub = $('#uiRubric');
  const nHealth = numd.filter(b => b.cat === 'health').length;
  const nComm = numd.filter(b => b.cat === 'community').length;
  $('#uiRubricTbl').innerHTML = [
    ['REQUIREMENT', 'HOW HAVENBROOK ANSWERS IT', ''],
    ['Town name', `${TOWN.name} — "a community planned around care"`, '&#10003;'],
    ['University Medical School', `#1 ${BUILDINGS.find(b => b.id === 'medhall').name} + library, anatomy & clinical halls on a real campus quad`, '&#10003;'],
    ['Housing Development', `#2 ${BUILDINGS.find(b => b.id === 'housing').name} — cottage rows, duplexes and townhouses across Residential West`, '&#10003;'],
    ['≥7 healthcare facilities', `${nHealth} numbered sites — hospital, EMS, health dept, lab, rehab, behavioral, student clinic, dental, optical, family medicine, home health, senior living, hospice`, '&#10003;'],
    ['≥3 community locations', `${nComm} numbered sites — Masterson's, mall, pharmacy, museum, school, restaurant, park, post office, grocery, coffeehouse, diner`, '&#10003;'],
    ['Every facility uniquely named', 'Every building carries a proper name — click any label or the Facilities drawer for its card', '&#10003;'],
    ['Realistic layout', '18 named streets on a legible grid, zoned districts (medical campus centre, hospital N, senior E, downtown NW, residential W, school S), signalized junctions, parking, curbside life', '&#10003;'],
    ['Budget ≤ $10M', `${money(spent)} spent of ${money(BUDGET)} — health $${((numd.filter(b => b.cat === 'health').reduce((s, b) => s + (b.cost || 0), 0)) / 1e6).toFixed(2)}M, community $${((numd.filter(b => b.cat === 'community').reduce((s, b) => s + (b.cost || 0), 0)) / 1e6).toFixed(2)}M`, '&#10003;'],
    ['Placement explained', 'Take the guided tour (&#9654;) — each stop narrates why it sits where it does', '&#10003;'],
  ].map(r => r[0] === 'REQUIREMENT'
    ? `<tr><th>${r[0]}</th><th>${r[1]}</th><th></th></tr>`
    : `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="ok">${r[2]}</td></tr>`).join('');
  $('#uiBtnRubric').addEventListener('click', () => rub.classList.add('open'));
  $('#uiRubricX').addEventListener('click', () => rub.classList.remove('open'));
  rub.addEventListener('click', e => { if (e.target === rub) rub.classList.remove('open'); });
}
