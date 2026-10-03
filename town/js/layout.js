// layout.js — Havenbrook town plan. Coordinates in meters. North = -Z.
// Town bounds ~ x[-800,800], z[-740,740]

export const TOWN = {
  name: 'HAVENBROOK',
  bounds: { x: [-840, 840], z: [-760, 760] },
};

/* ---------------- ROADS ----------------
   axis: 'v' vertical (N-S, runs along z) | 'h' horizontal (E-W, along x)
   (a0,a1) = span along travel axis, c = fixed cross coordinate */
export const ROADS = [
  { name: 'University Ave',  axis: 'v', c: -140, a0: -720, a1: 720,  w: 18, arterial: true },
  { name: 'Parkside Dr',     axis: 'v', c: 320,  a0: -720, a1: 700,  w: 16, arterial: true },
  { name: 'Commerce Blvd',   axis: 'h', c: 320,  a0: -800, a1: 800,  w: 20, arterial: true },
  { name: 'Wellness Way',    axis: 'h', c: -360, a0: -800, a1: 800,  w: 16, arterial: true },
  { name: 'Main St',         axis: 'h', c: -40,  a0: -800, a1: 330,  w: 16, arterial: true },
  { name: 'Old Town Rd',     axis: 'h', c: -640, a0: -800, a1: 330,  w: 11 },
  { name: 'Scholar Ln',      axis: 'v', c: -440, a0: -370, a1: -30,  w: 10 },
  { name: 'Midtown Ave',     axis: 'h', c: -180, a0: -720, a1: -120, w: 10 },
  { name: 'Maple St',        axis: 'v', c: -420, a0: -45,  a1: 720,  w: 10 },
  { name: 'Cedar Ave',       axis: 'v', c: -640, a0: -45,  a1: 720,  w: 10 },
  { name: 'Elm St',          axis: 'h', c: 140,  a0: -800, a1: -120, w: 10 },
  { name: 'Schoolhouse Rd',  axis: 'h', c: 425,  a0: -800, a1: -120, w: 11 },
  { name: 'Meadowlark Ln',   axis: 'h', c: -240, a0: 310,  a1: 800,  w: 10 },
  { name: 'Silver Oak Dr',   axis: 'v', c: 560,  a0: -700, a1: -350, w: 11 },
  { name: 'Sunset Ridge Rd', axis: 'h', c: -460, a0: 310,  a1: 800,  w: 10 },
  { name: 'Mercy Dr',        axis: 'v', c: 80,   a0: -466, a1: -345, w: 9 },
  { name: 'Grove St',        axis: 'v', c: 80,   a0: -45,  a1: 328,  w: 10 },
  { name: 'Juniper Ave',     axis: 'h', c: 150,  a0: -150, a1: 330,  w: 10 },
];

/* roads drawn as ground markings only (label on map) */
export const WATER = [
  // pond in Willow Creek Park
  { x: 585, z: 150, r: 62, sx: 1.35, sz: 0.9, rot: 0.5 },
  { x: 470, z: 60,  r: 26, sx: 1.3, sz: 0.8, rot: -0.4 },
];

/* ---------------- BUILDINGS ----------------
   cat: free | health | community | civic | res
   Every purchasable facility has cost (matches official price sheet). */
export const BUILDINGS = [
  /* ======== FREE — required ======== */
  { id:'medhall',  cat:'free', type:'medhall', name:'Havenbrook University School of Medicine',
    x:40, z:-270, w:124, d:52, h:24, cost:0, label:'univ', num:1,
    desc:'State medical university at the heart of town, beside the hospital district.' },
  { id:'medlib',   cat:'free', type:'campusb', name:'The Marchand Medical Library',
    x:40, z:-100, w:52, d:34, h:12, cost:0, nolabel:true },
  { id:'medwest',  cat:'free', type:'campusb', name:'Whitmore Anatomy Hall',
    x:-90, z:-206, w:66, d:32, h:13, cost:0, nolabel:true },
  { id:'medeast',  cat:'free', type:'campusb', name:'Caldecott Clinical Sciences Hall',
    x:175, z:-196, w:62, d:32, h:13, cost:0, nolabel:true },
  { id:'housing',  cat:'free', type:'zone',    name:'The Preserve at Havenbrook (Housing Development)',
    x:-460, z:150, cost:0, label:'housing', num:2,
    desc:'Mixed housing: student apartments, family homes, senior cottages.' },
  { id:'preservecommons', cat:'free', type:'zone', name:'Preserve Commons Apartments',
    x:-530, z:230, cost:0,
    desc:'Landmark mid-rise apartment court in the housing development — student + family flats.' },

  /* ======== HEALTHCARE (13 facilities) ======== */
  { id:'hospital', cat:'health', type:'hospital', name:'Havenbrook General Hospital',
    x:80, z:-505, w:104, d:74, h:52, cost:1500000, num:3,
    desc:'Full-service hospital & level-II ER — the town\u2019s medical anchor.' },
  { id:'ems',      cat:'health', type:'ems', name:'Hartline EMS Station',
    x:-60, z:-318, w:36, d:26, h:9, cost:400000, num:4,
    desc:'Ambulance & paramedic station at the town\u2019s central junction.' },
  { id:'healthdept', cat:'health', type:'civicb', name:'Havenbrook County Health Department',
    x:262, z:-310, w:52, d:30, h:12, cost:250000, num:5, rot:Math.PI,
    desc:'Vaccinations, inspections, WIC & public-health programs.' },
  { id:'lab',      cat:'health', type:'medoffice', name:'Argus Diagnostics Laboratory',
    x:250, z:-395, w:44, d:26, h:10, cost:100000, num:6,
    desc:'Blood work & imaging lab beside the hospital campus.' },
  { id:'rehab',    cat:'health', type:'medoffice', name:'Stoneleigh Rehabilitation Center',
    x:222, z:-606, w:74, d:42, h:14, cost:750000, num:7,
    desc:'PT/OT, sports injury & post-surgical rehab near the hospital.' },
  { id:'mental',   cat:'health', type:'medoffice', name:'Stillwater Behavioral Health Center',
    x:-192, z:-285, w:46, d:30, h:11, cost:500000, num:8,
    desc:'Counseling & psychiatric care — walking distance for students.' },
  { id:'campuscare', cat:'health', type:'clinic', name:'Thacher Student Health Clinic',
    x:-105, z:-330, w:38, d:24, h:8, cost:200000, num:9,
    desc:'Low-cost urgent & preventive care facing the university campus on Wellness Way.' },
  { id:'dental',   cat:'health', type:'storefront', name:'Marigold Dental Studio',
    x:-80, z:358, w:26, d:20, h:7, cost:300000, num:10, rot:Math.PI,
    desc:'Family & student dentistry on the commercial corridor.' },
  { id:'optical',  cat:'health', type:'storefront', name:'Parallax Optical',
    x:-8, z:358, w:26, d:20, h:7, cost:300000, num:11, rot:Math.PI,
    desc:'Eye exams, glasses & contacts next door to dental.' },
  { id:'famfirst', cat:'health', type:'medoffice', name:'Brookfield Family Physicians (Pediatrics & Family Medicine)',
    x:-192, z:392, w:46, d:28, h:10, cost:400000, num:12,
    desc:'Pediatric & family practice between homes and the school.' },
  { id:'comfort',  cat:'health', type:'clinic', name:'Innisfree Home Health',
    x:430, z:-390, w:36, d:24, h:8, cost:300000, num:13,
    desc:'In-home nursing & therapy visits for senior residents.' },
  { id:'silveroaks', cat:'health', type:'senior', name:'Halcyon House Senior Living',
    x:500, z:-560, w:96, d:68, h:15, cost:750000, num:14,
    desc:'Assisted living + memory-care wing with courtyard gardens.' },
  { id:'hospice',  cat:'health', type:'hospice', name:'Stillpoint Hospice',
    x:712, z:-418, w:56, d:40, h:8, cost:500000, num:15,
    desc:'Peaceful end-of-life care in the quiet northeast district.' },

  /* ======== COMMUNITY (11 locations) ======== */
  { id:'target',   cat:'community', type:'bigbox', name:"Masterson's Department Store",
    x:30, z:480, w:132, d:92, h:14, cost:500000, num:16, brand:'target', rot:Math.PI,
    desc:'Big-box essentials on the Commerce Blvd corridor.' },
  { id:'mall',     cat:'community', type:'mall', name:'Havenbrook Commons Mall',
    x:540, z:498, w:232, d:118, h:16, cost:1000000, num:17,
    desc:'Indoor mall & food court — the town\u2019s shopping hub.' },
  { id:'pharmacy', cat:'community', type:'storefront', name:'Bellwether Pharmacy',
    x:122, z:-66, w:30, d:20, h:8, cost:500000, num:18,
    desc:'Retail pharmacy steps from the medical district.' },
  { id:'museum',   cat:'community', type:'museum', name:'Quarry Hill Museum',
    x:200, z:-296, w:60, d:44, h:13, cost:500000, num:19,
    desc:'Science & local-history museum on the civic plaza.' },
  { id:'school',   cat:'community', type:'school', name:'Havenbrook Unified School District',
    x:-510, z:560, w:120, d:90, h:10, cost:300000, num:20,
    desc:'K-12 campus serving family neighborhoods to the southwest.' },
  { id:'orchard',  cat:'community', type:'storefront', name:'The Orchard Table',
    x:22, z:-66, w:30, d:20, h:8, cost:250000, num:21,
    desc:'Farm-to-table restaurant on Main Street\u2019s storefront row.' },
  { id:'park',     cat:'community', type:'parkzone', name:'Willow Creek Park',
    x:560, z:120, cost:200000, num:22,
    desc:'Central park: pond, playgrounds, trails & ball fields.' },
  { id:'postoffice', cat:'community', type:'civicb', name:'Havenbrook Post Office',
    x:140, z:-310, w:36, d:24, h:9, cost:150000, num:23, rot:Math.PI,
    desc:'Postal services on the civic row along Wellness Way.' },
  { id:'grocery',  cat:'community', type:'bigbox', name:"Olsen's Market",
    x:190, z:455, w:72, d:52, h:12, cost:100000, num:24, brand:'grocery', rot:Math.PI,
    desc:'Everyday groceries mid-way between homes and shops.' },
  { id:'coffee',   cat:'community', type:'storefront', name:'The Whippoorwill Coffeehouse',
    x:-172, z:-318, w:26, d:20, h:7, cost:100000, num:25, rot:Math.PI,
    desc:'Student-favorite café at University Ave & Wellness Way.' },
  { id:'fiesta',   cat:'community', type:'fastfood', name:'The Painted Coyote',
    x:272, z:365, w:26, d:22, h:7, cost:100000, num:26,
    desc:'Mexican fast-food grill with a drive-thru lane.' },
];

/* apartment & housing archetypes get generated procedurally in zones below */
export const APARTMENTS = [
  { name: "Scholar's Court Apartments", x:-618, z:-296, w:58, d:32, h:15 },
  { name: "Scholar's Court Apartments B", x:-618, z:-232, w:58, d:32, h:15 },
  { name: "Scholar's Walk Apartments", x:-300, z:-290, w:60, d:34, h:15 },
  { name: 'University Lofts', x:-262, z:-224, w:48, d:28, h:13 },
  { name: 'Midtown Flats', x:-620, z:-110, w:50, d:28, h:12 },
];

/* residential auto-fill blocks: houses along edges facing streets */
export const HOUSE_BLOCKS = [
  // family grid between Main St & Commerce Blvd (west side)
  // counts tuned so lot spacing ≥ ~26m — a house's garage wing (+x flank,
  // to ~14.2m out) or a ranch (+18.1m) can never touch the next house's wall
  { x0:-792, x1:-668, z0: 62, z1:128,  face:'h', count:4 },   // N of Elm
  { x0:-792, x1:-668, z0:162, z1:300,  face:'h', count:8 },
  { x0:-612, x1:-448, z0: 62, z1:128,  face:'h', count:6 },
  { x0:-612, x1:-448, z0:162, z1:300,  face:'h', count:12 },
  { x0:-392, x1:-168, z0: 62, z1:128,  face:'h', count:8 },
  { x0:-392, x1:-168, z0:162, z1:300,  face:'h', count:14 },
  // south of Commerce, along Schoolhouse Rd (north side of school)
  { x0:-792, x1:-668, z0:352, z1:406,  face:'h', count:4 },
  { x0:-612, x1:-448, z0:352, z1:406,  face:'h', count:6 },
  { x0:-392, x1:-230, z0:352, z1:406,  face:'h', count:6 },
  // east of school, west of University Ave
  { x0:-280, x1:-168, z0:452, z1:660,  face:'v', count:8 },
  // duplexes south of Midtown (young families / grad students)
  { x0:-392, x1:-168, z0:-160, z1:-72, face:'h', count:8, duplex:true },
  { x0:-700, x1:-500, z0:-160, z1:-72, face:'h', count:7, duplex:true },
  // Grove District townhomes (between Main St & Commerce, E of University Ave)
  { x0:-120, x1:62,  z0:-16, z1:140, face:'h', count:8, duplex:true },
  { x0:100,  x1:300, z0:-16, z1:140, face:'h', count:9, duplex:true },
  { x0:-120, x1:62,  z0:162, z1:300, face:'h', count:9, duplex:true },
  { x0:100,  x1:300, z0:162, z1:300, face:'h', count:9, duplex:true },
];

/* senior cottages along Meadowlark Ln (z=-240) & Sunset Ridge Rd (z=-460) */
export const COTTAGE_ROWS = [
  { x0:392, x1:788, z:-206, face:'n', count:9 },
  { x0:392, x1:788, z:-278, face:'s', count:9 },
  { x0:376, x1:520, z:-505, face:'s', count:4 },
  { x0:376, x1:636, z:-415, face:'n', count:7 },
  { x0:660, x1:788, z:-505, face:'s', count:3 },
];

/* ---------------- PARKING / LOTS (asphalt rects) ---------------- */
export const LOTS = [
  { x:225, z:-492, w:150, d:96, name:'Hospital visitor parking' },   // E of hospital
  { x:66,  z:-458, w:68,  d:20, plain:true, name:'ER ambulance bay' }, // apron at ER canopy
  { x:-60, z:-290, w:30,  d:16, plain:true },                        // EMS pad
  { x:-520, z:-430, w:70, d:34 },                                   // old-town lot behind the square
  { x:64,  z:386,  w:102, d:76 },                                    // Target front lot
  { x:190, z:384,  w:110, d:56 },                                    // grocery lot
  { x:540, z:384,  w:290, d:78 },                                    // mall north lot
  { x:540, z:584,  w:290, d:44 },                                    // mall south lot
  { x:-58, z:339,  w:120, d:14 },                                    // strip parking dental/optical
  { x:272, z:392,  w:44,  d:22 },                                    // fiesta lot
  { x:-510,z:462,  w:110, d:34 },                                    // school lot
  { x:170, z:-150, w:60, d:24 },                                    // university staff lot, quad east
  { x:-192,z:362,  w:40,  d:16 },                                    // famfirst lot
  { x:500, z:-640, w:80,  d:40 },                                    // halcyon house lot
  { x:70,  z:548,  w:100, d:26 },                                    // athletic park lot
];

/* park green zones (darker grass + trees + paths) */
export const PARK_ZONE = { x0:352, x1:800, z0:-60, z1:300 };
export const GREEN_BELT = { x0:-800, x1:-740, z0:-720, z1:700 };  // west edge woods
export const SE_GREEN = { x0:340, x1:800, z0:620, z1:740 };

/* Programmed green parcels — every formerly-bare lawn quadrant gets an
   explicit use. Rendered by js/city/greens.js, occupancy + audit-checked.
   Verified free of roads/buildings/lots/water/cottages before commit. */
export const GREENS = [
  { id: 'westwood-grove',  name: 'Westwood Memorial Grove',   use: 'grove',
    x0: -795, x1: -750, z0: -24,  z1: 128  },   // church grounds, W of Cedar
  { id: 'scholar-pocket',  name: 'Scholar Green',             use: 'pocketpark',
    x0: -622, x1: -455, z0: -24,  z1: 55   },   // N of Elm, between Scholar/Cedar
  { id: 'research-green',  name: 'Quarry Research Green',     use: 'pocketpark',
    x0: 218, x1: 302, z0: -265, z1: -245 },   // campus edge, E of Caldecott
  { id: 'tranquil-grove',  name: 'Tranquil Grove',            use: 'grove',
    x0: 650,  x1: 795,  z0: -610, z1: -552 },   // hospice backdrop, N of Sunset Ridge
  { id: 'northsenior',     name: 'North Meadow',              use: 'meadow',
    x0: 648,  x1: 795,  z0: -700, z1: -616 },   // NE corner behind senior district
  { id: 'heritage-garden', name: 'Heritage Wellness Garden',  use: 'garden',
    x0: 645,  x1: 790,  z0: -345, z1: -292 },   // senior district community garden
  { id: 'commons-orchard', name: 'Commons Orchard & Pond',    use: 'orchard',
    x0: 692,  x1: 795,  z0: 435,  z1: 615  },   // E of mall on Commerce corridor
  { id: 'sunrise-meadow',  name: 'Sunrise Meadow',            use: 'meadow',
    x0: 345,  x1: 795,  z0: 625,  z1: 735  },   // SE_GREEN corner, programmed
  { id: 'northwoods',      name: 'Northwoods Buffer',         use: 'grove',
    x0: -640, x1: -350, z0: -715, z1: -665 },   // behind the med campus
];

/* sidewalk plaza downtown */
/* the town square — relocated with the downtown block to the NW parcel
   when the medical campus moved to the centre */
export const PLAZA = { x:-480, z:-520, w:150, d:70 };

/* generic downtown infill — unsigned background shops/offices for urban fabric */
export const FILLER = [
  { type:'storefront', x:-95,  z:-66,  w:24, d:20, h:7 },
  { type:'storefront', x:-50,  z:-66,  w:26, d:20, h:7 },
  { type:'storefront', x:-20,  z:-66,  w:24, d:20, h:7 },
  { type:'storefront', x:68,   z:-66,  w:26, d:20, h:7 },
  { type:'storefront', x:170,  z:-66,  w:26, d:20, h:7 },
  { type:'storefront', x:214,  z:-66,  w:26, d:20, h:7 },
  { type:'storefront', x:258,  z:-66,  w:24, d:20, h:7 },
  { type:'storefront', x:290,  z:-160, w:30, d:22, h:9, rot:Math.PI / 2 },
  { type:'storefront', x:290,  z:-230, w:30, d:22, h:9, rot:Math.PI / 2 },
  { type:'medoffice',  x:-480, z:-395, w:40, d:26, h:12 },
  { type:'medoffice',  x:-340, z:-395, w:36, d:26, h:12 },
  { type:'storefront', x:-640, z:-395, w:30, d:22, h:8 },
  { type:'storefront', x:-160, z:356,  w:20, d:18, h:7, rot:Math.PI },
  { type:'storefront', x:-115, z:358,  w:24, d:18, h:7, rot:Math.PI },
  // shops facing the plaza's south edge
  { type:'storefront', x:-580, z:-395, w:26, d:20, h:7 },
  { type:'storefront', x:-540, z:-395, w:24, d:20, h:7 },
  // downtown mid-rise towers — give the skyline real depth
  { type:'tower', x:-450, z:-575, w:34, d:26, h:44, sign:'HAVENBROOK TOWER', crown:'deck' },
  { type:'tower', x:-575, z:-440, w:30, d:24, h:33, sign:'TRUST BANK' },
  { type:'tower', x:-400, z:-580, w:26, d:22, h:27 },
  { type:'tower', x:-520, z:-465, w:30, d:24, h:37, sign:'MIDTOWN PLACE' },
  { type:'tower', x:-640, z:-545, w:28, d:22, h:26 },
  // community church on Cedar Ave & gas station on Commerce Blvd
  { type:'church', x:-730, z:-18, w:24, d:18, h:9, rot: Math.PI / 2 },
  { type:'gas', x:365, z:382, w:34, d:26, h:8, rot: Math.PI },
  // skyscrapers — anchor the skyline behind the mid-rises (distinct crowns, s03)
  { type:'skyscraper', x:-580, z:-560, w:36, d:30, h:78, sign:'PINNACLE HEALTH PLAZA', crown:'spire' },
  { type:'skyscraper', x:-370, z:-455, w:30, d:28, h:62, crown:'lantern' },
  // anchor of the old-town skyline, facing the square's west end
  { type:'skyscraper', x:-620, z:-460, w:28, d:26, h:54, rot:Math.PI, sign:'FOUNDRY ONE', crown:'chamfer' },
];

/* brownstone row lining the north side of Midtown Ave — attached townhouses facing the street.
   Broken around Scholar Ln (x -445..-435) so no unit straddles the roadbed. */
const TH_X0 = -585, TH_STEP = 11.4, TH_W = 10.4;
for (let i = 0; i < 26; i++) {
  const x = TH_X0 + i * TH_STEP;
  if (x + TH_W / 2 > -446 && x - TH_W / 2 < -434) continue;
  FILLER.push({ type: 'townhouse', x, z: -196, w: TH_W, d: 12, rot: 0 });
}

/* labels to show on map/aerial views */
export function labeledBuildings() {
  return BUILDINGS.filter(b => b.label !== undefined || b.num !== undefined);
}
export const CATEGORY_COLORS = {
  free:'#e8a020', health:'#c0392b', community:'#2471a3', civic:'#7d3c98', res:'#5d6d7e',
};
