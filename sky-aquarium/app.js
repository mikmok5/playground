/* Sky Aquarium: live aircraft near you, drawn as fish in a side-view tank.
 *
 * Tank axes:  x = east/west offset from you, y = altitude (surface = 45,000 ft),
 *             depth (size + haze) = north/south offset.
 * Data:       readsb-style JSON from ADSB.lol or adsb.fi. Neither sends CORS headers, so the
 *             browser reaches them through the Sky Aquarium relay (see ../relay). Routes come
 *             from adsbdb and hexdb, which browsers can call directly.
 *             Positions are dead-reckoned between polls so fish keep moving smoothly.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const ALT_MAX = 45000;          // ft at the water surface
  const STALE_MS = 40000;         // drop an aircraft this long after its last report
  const OVERHEAD_KM = 4;          // "look up!" radius
  const NM_KM = 1.852;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION = REDUCED ? 0.35 : 1;

  const PLACES = [
    { name: 'London', lat: 51.47, lon: -0.45 },
    { name: 'New York', lat: 40.69, lon: -73.86 },
    { name: 'Los Angeles', lat: 33.94, lon: -118.4 },
    { name: 'Atlanta', lat: 33.64, lon: -84.43 },
    { name: 'Amsterdam', lat: 52.31, lon: 4.76 },
    { name: 'Frankfurt', lat: 50.03, lon: 8.57 },
    { name: 'Dubai', lat: 25.25, lon: 55.36 },
    { name: 'Singapore', lat: 1.36, lon: 103.99 },
    { name: 'Tokyo', lat: 35.6, lon: 139.8 },
    { name: 'Sydney', lat: -33.94, lon: 151.18 },
  ];

  const AIRLINES = {
    AAL: 'American Airlines', ACA: 'Air Canada', AFR: 'Air France', AIC: 'Air India', ANA: 'All Nippon Airways',
    ANZ: 'Air New Zealand', ASA: 'Alaska Airlines', AUA: 'Austrian', BAW: 'British Airways', BEL: 'Brussels Airlines',
    CCA: 'Air China', CES: 'China Eastern', CPA: 'Cathay Pacific', CSN: 'China Southern', DAL: 'Delta',
    DLH: 'Lufthansa', EIN: 'Aer Lingus', EJU: 'easyJet Europe', ENY: 'Envoy Air', ETD: 'Etihad', EVA: 'EVA Air',
    EWG: 'Eurowings', EZY: 'easyJet', FDX: 'FedEx', FFT: 'Frontier', FIN: 'Finnair', IBE: 'Iberia', JAL: 'Japan Airlines',
    JBU: 'JetBlue', JST: 'Jetstar', KAL: 'Korean Air', KLM: 'KLM', NKS: 'Spirit', QFA: 'Qantas', QTR: 'Qatar Airways',
    RPA: 'Republic Airways', RYR: 'Ryanair', SAS: 'SAS', SIA: 'Singapore Airlines', SKW: 'SkyWest', SWA: 'Southwest',
    SWR: 'Swiss', TAP: 'TAP Air Portugal', THY: 'Turkish Airlines', UAE: 'Emirates', UAL: 'United', UPS: 'UPS',
    VIR: 'Virgin Atlantic', VOZ: 'Virgin Australia', WJA: 'WestJet', WZZ: 'Wizz Air', VLG: 'Vueling', SHT: 'BA Shuttle',
    LOT: 'LOT Polish', AEE: 'Aegean', ICE: 'Icelandair', GTI: 'Atlas Air', CLX: 'Cargolux', MXY: 'Breeze',
  };

  const TYPES = {
    A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A318: 'Airbus A318', A319: 'Airbus A319',
    A320: 'Airbus A320', A321: 'Airbus A321', A306: 'Airbus A300', A332: 'Airbus A330-200', A333: 'Airbus A330-300',
    A339: 'Airbus A330-900', A343: 'Airbus A340-300', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
    A388: 'Airbus A380', BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300', B737: 'Boeing 737-700',
    B738: 'Boeing 737-800', B739: 'Boeing 737-900', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
    B744: 'Boeing 747-400', B748: 'Boeing 747-8', B752: 'Boeing 757-200', B753: 'Boeing 757-300',
    B763: 'Boeing 767-300', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B77W: 'Boeing 777-300ER',
    B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', MD11: 'McDonnell Douglas MD-11',
    E170: 'Embraer 170', E75L: 'Embraer 175', E190: 'Embraer 190', E195: 'Embraer 195', E290: 'Embraer E190-E2',
    E295: 'Embraer E195-E2', CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900',
    DH8D: 'Dash 8 Q400', AT72: 'ATR 72', AT76: 'ATR 72-600', AT45: 'ATR 42-500', C172: 'Cessna 172',
    C152: 'Cessna 152', C182: 'Cessna 182', C208: 'Cessna Caravan', SR22: 'Cirrus SR22', PC12: 'Pilatus PC-12',
    P28A: 'Piper Cherokee', DA40: 'Diamond DA40', GLF6: 'Gulfstream G650', GLEX: 'Bombardier Global Express',
    C68A: 'Cessna Citation Latitude', CL35: 'Challenger 350', EC35: 'Airbus H135', EC45: 'Airbus H145',
    A139: 'Leonardo AW139', R44: 'Robinson R44', S76: 'Sikorsky S-76', B06: 'Bell 206', F16: 'F-16 Fighting Falcon',
    EUFI: 'Eurofighter Typhoon', C17: 'Boeing C-17', K35R: 'KC-135 Stratotanker', A400: 'Airbus A400M',
  };

  // Airline schools share a hue. Private and unknown operators are sandy.
  const HUES = [8, 22, 40, 52, 96, 140, 168, 186, 204, 222, 262, 288, 318, 340];

  // ---------------------------------------------------------------- species
  // size is relative to the base fish length, which scales with screen width.
  const SPECIES = {
    whale:     { name: 'Blue Whale',     what: 'Heavy jets: 747, 777, 787, A330, A350, A380', size: 1.0,  face: true },
    barracuda: { name: 'Barracuda',      what: 'Boeing 757 class',                             size: 0.72, face: true },
    tuna:      { name: 'Bluefin Tuna',   what: 'Airliners: 737, A320 family, A220, E-Jets',    size: 0.6,  face: true },
    angel:     { name: 'Angelfish',      what: 'Regional jets, turboprops and bizjets',        size: 0.44, face: true },
    guppy:     { name: 'Guppy',          what: 'Light aircraft: Cessnas, Pipers, Cirrus',      size: 0.32, face: true },
    sword:     { name: 'Swordfish',      what: 'Fast military jets',                           size: 0.56, face: true },
    jelly:     { name: 'Moon Jellyfish', what: 'Helicopters',                                  size: 0.34, face: false },
    manta:     { name: 'Manta Ray',      what: 'Gliders and ultralights',                      size: 0.5,  face: true },
    puffer:    { name: 'Pufferfish',     what: 'Balloons, airships and drones',                size: 0.34, face: true },
    crab:      { name: 'Hermit Crab',    what: 'Anything on the ground',                       size: 0.3,  face: false },
    mystery:   { name: 'Mystery Fish',   what: 'Aircraft type not broadcast',                  size: 0.46, face: true },
  };

  const CAT_SPECIES = {
    A1: 'guppy', A2: 'angel', A3: 'tuna', A4: 'barracuda', A5: 'whale', A6: 'sword', A7: 'jelly',
    B1: 'manta', B2: 'puffer', B4: 'manta', B6: 'puffer', C1: 'crab', C2: 'crab', C3: 'crab',
  };
  const HEAVY = ['B74', 'B77', 'B78', 'B76', 'A33', 'A34', 'A35', 'A38', 'A30', 'A310', 'MD11', 'DC10', 'A124', 'IL76', 'A400', 'K35R', 'KC10', 'B52', 'A3ST'];
  const HEAVY_EXACT = ['C17', 'C5', 'C5M']; // exact, so a Cessna C172 is not mistaken for a C-17
  const HELI = ['EC', 'H1', 'H6', 'AS3', 'AS5', 'AS6', 'R22', 'R44', 'R66', 'B06', 'B407', 'B412', 'B429', 'S76', 'S92', 'A109', 'A119', 'A139', 'A169', 'A189', 'AW', 'H47', 'H60', 'UH1', 'EH10', 'NH90', 'MD5'];
  const FAST = ['F16', 'F15', 'F18', 'F35', 'F22', 'EUFI', 'TOR', 'HAWK', 'T38', 'A10', 'RFAL', 'GRIF', 'F5', 'M2K'];
  const LARGE = ['A31', 'A32', 'A2', 'A19N', 'B73', 'B3', 'B71', 'E19', 'E29', 'E17', 'BCS', 'MD8', 'MD9', 'C130', 'B717'];
  const SMALL = ['CRJ', 'E75', 'E14', 'E13', 'E13', 'AT4', 'AT7', 'DH8', 'SF34', 'J41', 'C25', 'C56', 'C68', 'C750', 'CL3', 'CL6', 'GLF', 'GL5', 'GL7', 'GLEX', 'FA', 'LJ', 'E55', 'E50', 'BE20', 'BE9', 'B350', 'PC12', 'PC24', 'H25', 'C208'];
  const LIGHT = ['C1', 'C2', 'C3', 'P28', 'P32', 'PA', 'SR2', 'DA4', 'DA2', 'DA6', 'BE3', 'M20', 'C82', 'RV', 'TB', 'AA5', 'DR4', 'CUB', 'J3', 'PC6', 'C42', 'EV97', 'TBM'];

  const startsAny = (s, list) => list.some(p => s.startsWith(p));

  function speciesOf(a) {
    if (a.ground) return 'crab';
    const t = (a.type || '').toUpperCase();
    if (t) {
      if (t === 'GLID') return 'manta';
      if (t === 'BALL' || t === 'SHIP') return 'puffer';
      if (HEAVY_EXACT.includes(t) || startsAny(t, HEAVY)) return 'whale';
      if (t.startsWith('B75')) return 'barracuda';
      if (startsAny(t, HELI)) return 'jelly';
      if (startsAny(t, FAST)) return 'sword';
      if (startsAny(t, SMALL)) return 'angel';
      if (startsAny(t, LARGE)) return 'tuna';
      if (startsAny(t, LIGHT)) return 'guppy';
    }
    if (CAT_SPECIES[a.cat]) return CAT_SPECIES[a.cat];
    return 'mystery';
  }

  function airlineOf(callsign) {
    const m = /^([A-Z]{3})\d/.exec(callsign || '');
    return m ? m[1] : null;
  }
  function hueOf(code) {
    if (!code) return null;
    let h = 0;
    for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HUES[h % HUES.length];
  }

  // ---------------------------------------------------------------- state
  const store = {
    get(k, d) { try { const v = localStorage.getItem('skyaq.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('skyaq.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  let place = store.get('place', null);
  const firstRun = !place;
  if (!place) place = PLACES[0];
  let radiusNm = store.get('nm', 50);
  let showLabels = store.get('labels', true);
  let soundOn = store.get('sound', true);
  let alertsOn = store.get('alerts', true);
  let lightMode = store.get('light', 'auto'); // auto | day | night

  const fishes = new Map();
  let selected = null;
  let bubbles = [];
  let ripples = [];
  let snow = [];
  let weeds = [];
  let sonarBig = false;
  let sourceName = '';
  let lastDataAt = 0;
  let mode = 'wait'; // wait | live | demo

  // ---------------------------------------------------------------- canvas + layout
  const $ = s => document.querySelector(s);
  const canvas = $('#tank');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, BASE = 60;
  const Lay = { surface: 0, top: 0, bottom: 0, sand: 0, left: 0, right: 0 };
  let bgGrad = null, sandGrad = null;

  function cssPx(name) {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:var(${name})`;
    document.body.appendChild(probe);
    const v = probe.getBoundingClientRect().height;
    probe.remove();
    return v || 0;
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    const sat = cssPx('--sat'), sab = cssPx('--sab');
    BASE = Math.max(46, Math.min(96, Math.min(W, H * 0.75) * 0.17));
    Lay.surface = sat + 66;
    Lay.top = sat + 104;
    Lay.sand = H - sab - 64;
    Lay.bottom = Lay.sand - 34;
    Lay.left = 46;
    Lay.right = W - 18;

    buildWater();
    sandGrad = ctx.createLinearGradient(0, Lay.sand - 10, 0, H);
    sandGrad.addColorStop(0, '#7a6d50');
    sandGrad.addColorStop(0.35, '#51472f');
    sandGrad.addColorStop(1, '#231d12');

    buildScenery();
    for (const f of fishes.values()) f.init = false;
  }

  // ---------------------------------------------------------------- sun + light
  // Solar elevation in degrees (NOAA low-precision formula, good to ~1 degree).
  function sunElevation(lat, lon, date = new Date()) {
    const rad = Math.PI / 180;
    const d = date.getTime() / 86400000 - 10957.5; // days since J2000
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = (gmst * 15 + lon) * rad - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
  }

  const WATER = {
    day:   [[15, 86, 115], [10, 62, 89], [6, 42, 64], [3, 18, 29]],
    dusk:  [[78, 62, 110], [43, 53, 96], [13, 35, 64], [4, 15, 28]],
    night: [[9, 27, 50], [6, 19, 38], [3, 12, 25], [1, 6, 13]],
  };
  const light = { level: 1, dusk: 0, sunEl: 45, phase: 'day' };

  function updateLight() {
    const el = sunElevation(place.lat, place.lon);
    light.sunEl = el;
    if (lightMode === 'day') { light.level = 1; light.dusk = 0; }
    else if (lightMode === 'night') { light.level = 0; light.dusk = 0; }
    else {
      light.level = clamp((el + 10) / 16, 0, 1);            // dark below -10 deg, full day above 6 deg
      light.dusk = clamp(1 - Math.abs(el + 2) / 8, 0, 1);    // peaks around sunset/sunrise
    }
    light.phase = light.level > 0.75 ? 'day' : light.level < 0.2 ? 'night' : 'twilight';
    buildWater();
    const pn = document.getElementById('placeName');
    if (pn) pn.textContent = `${place.name} · ${light.phase}`;
    const hint = document.getElementById('sunHint');
    if (hint) hint.textContent = `The sun is ${Math.abs(Math.round(el))}° ${el >= 0 ? 'above' : 'below'} the horizon at ${place.name}. Real sun keeps the tank in step with it.`;
  }

  function buildWater() {
    if (!H) return;
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const stops = WATER.day.map((d, i) => mix(mix(WATER.night[i], d, light.level), WATER.dusk[i], light.dusk * 0.8));
    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    [0, 0.18, 0.6, 1].forEach((at, i) => bgGrad.addColorStop(at, `rgb(${stops[i].map(Math.round).join(',')})`));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${stops[0].map(v => Math.round(v * 0.5)).join(',')})`);
  }

  function sandY(x) {
    return Lay.sand + Math.sin(x * 0.013) * 6 + Math.sin(x * 0.031 + 1.3) * 3;
  }

  function buildScenery() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    weeds = [];
    const n = Math.max(6, Math.round(W / 55));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.2 + rnd() * 0.6) * (W / n);
      if (Math.abs(x - W / 2) < 34) continue; // keep the "you" beacon clear
      weeds.push({
        x, h: 34 + rnd() * 80, w: 3 + rnd() * 4,
        hue: 145 + rnd() * 35, light: 22 + rnd() * 14, phase: rnd() * 6, front: rnd() < 0.3,
        coral: rnd() < 0.18,
      });
    }
    snow = [];
    const m = Math.round((W * H) / 9000);
    for (let i = 0; i < m; i++) snow.push({ x: rnd() * W, y: rnd() * H, r: 0.5 + rnd() * 1.4, v: 3 + rnd() * 8, p: rnd() * 6 });
  }

  // ---------------------------------------------------------------- geometry
  function toWorld(lat, lon) {
    const dx = (lon - place.lon) * 111.32 * Math.cos(place.lat * Math.PI / 180);
    const dn = (lat - place.lat) * 110.57;
    return { dx, dn };
  }
  function fromWorld(dx, dn) {
    return {
      lat: place.lat + dn / 110.57,
      lon: place.lon + dx / (111.32 * Math.cos(place.lat * Math.PI / 180)),
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function worldAt(f, now) {
    const a = f.a;
    const dt = clamp((now - f.t0) / 1000, 0, 90);
    const spd = (a.gs || 0) * NM_KM / 3600;
    const tr = (a.track || 0) * Math.PI / 180;
    const alt = a.ground ? 0 : Math.max(0, a.alt + (a.vrate || 0) / 60 * Math.min(dt, 30));
    return { dx: f.w0.dx + Math.sin(tr) * spd * dt, dn: f.w0.dn + Math.cos(tr) * spd * dt, alt };
  }

  function project(w, ground) {
    const R = radiusNm * NM_KM;
    const half = (Lay.right - Lay.left) / 2;
    const cx = (Lay.left + Lay.right) / 2;
    const x = cx + (w.dx / R) * half;
    const z = clamp((w.dn / R + 1) / 2, 0, 1);
    const t = clamp(w.alt / ALT_MAX, 0, 1);
    const y = ground ? sandY(x) - 6 : Lay.bottom - Math.pow(t, 0.85) * (Lay.bottom - Lay.top);
    return { x, y, z, scale: 1.18 - 0.52 * z };
  }

  // ---------------------------------------------------------------- data sources
  // The relay adds the CORS headers these APIs leave out. Direct calls stay last in the list
  // so the app starts working on its own if an upstream ever enables CORS.
  const defaultRelay = (window.SKY_AQUARIUM && window.SKY_AQUARIUM.relay) || '';
  let relayUrl = store.get('relay', '') || defaultRelay;
  const relayBase = () => relayUrl.trim().replace(/\/+$/, '');
  const at = () => [place.lat.toFixed(4), place.lon.toFixed(4)];

  function providers() {
    const list = [];
    const r = relayBase();
    if (r) {
      list.push({ name: 'ADSB.lol', every: 5000, url: () => `${r}/adsblol/v2/lat/${at()[0]}/lon/${at()[1]}/dist/${radiusNm}`, parse: parseReadsb });
      list.push({ name: 'adsb.fi', every: 5000, url: () => `${r}/adsbfi/api/v3/lat/${at()[0]}/lon/${at()[1]}/dist/${radiusNm}`, parse: parseReadsb });
    }
    list.push({ name: 'ADSB.lol', every: 6000, url: () => `https://api.adsb.lol/v2/lat/${at()[0]}/lon/${at()[1]}/dist/${radiusNm}`, parse: parseReadsb });
    list.push({ name: 'adsb.fi', every: 6000, url: () => `https://opendata.adsb.fi/api/v3/lat/${at()[0]}/lon/${at()[1]}/dist/${radiusNm}`, parse: parseReadsb });
    return list;
  }

  function parseReadsb(j) {
    const list = j.ac || j.aircraft || [];
    return list.map(a => {
      const ground = a.alt_baro === 'ground';
      return {
        id: a.hex, hex: (a.hex || '').replace('~', ''),
        callsign: (a.flight || '').trim(), reg: a.r || '', type: a.t || '', desc: a.desc || '',
        lat: a.lat ?? a.lastPosition?.lat, lon: a.lon ?? a.lastPosition?.lon,
        ground, alt: ground ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0) || 0,
        gs: a.gs ?? 0, track: a.track ?? a.true_heading ?? a.mag_heading ?? 0,
        vrate: a.baro_rate ?? a.geom_rate ?? 0, cat: a.category || '', squawk: a.squawk || '',
        age: a.seen_pos ?? a.seen ?? 0, origin: '',
      };
    }).filter(a => a.id && a.lat != null && a.lon != null);
  }

  const OS_CAT = { 2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A5', 7: 'A6', 8: 'A7', 9: 'B1', 10: 'B2', 12: 'B4', 14: 'B6', 16: 'C1', 17: 'C2' };
  function parseOpenSky(j) {
    const now = j.time || Date.now() / 1000;
    return (j.states || []).map(s => ({
      id: s[0], hex: s[0], callsign: (s[1] || '').trim(), reg: '', type: '', desc: '',
      lat: s[6], lon: s[5], ground: !!s[8], alt: s[8] ? 0 : ((s[7] ?? s[13] ?? 0) * 3.28084),
      gs: (s[9] || 0) * 1.94384, track: s[10] || 0, vrate: (s[11] || 0) * 196.85,
      cat: OS_CAT[s[17]] || '', squawk: s[14] || '', age: Math.max(0, now - (s[3] || now)), origin: s[2] || '',
    })).filter(a => a.lat != null && a.lon != null);
  }

  async function fetchJSON(url, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Demo waters: plausible traffic when no live source answers.
  const demo = { planes: null, at: 0 };
  const DEMO_FLEET = [
    ['B77W', 'UAE', 490, [31000, 39000]], ['A388', 'QTR', 480, [34000, 40000]], ['B789', 'BAW', 485, [33000, 41000]],
    ['A359', 'DLH', 480, [33000, 41000]], ['B744', 'GTI', 470, [30000, 36000]], ['A333', 'DAL', 470, [30000, 38000]],
    ['B738', 'RYR', 440, [2000, 37000]], ['A320', 'EZY', 430, [2000, 37000]], ['A321', 'AAL', 440, [3000, 36000]],
    ['B38M', 'SWA', 440, [2000, 38000]], ['A20N', 'WZZ', 430, [4000, 37000]], ['BCS3', 'SWR', 420, [3000, 35000]],
    ['E190', 'KLM', 400, [3000, 34000]], ['B752', 'UPS', 450, [8000, 37000]], ['CRJ9', 'SKW', 380, [3000, 30000]],
    ['DH8D', 'EIN', 300, [3000, 22000]], ['AT76', 'FIN', 260, [3000, 20000]], ['GLF6', null, 470, [39000, 45000]],
    ['C172', null, 105, [1500, 5500]], ['SR22', null, 160, [2500, 8000]], ['P28A', null, 110, [1500, 4500]],
    ['EC35', null, 120, [700, 2000]], ['A139', null, 140, [800, 2500]], ['EUFI', null, 420, [12000, 30000]],
    ['GLID', null, 60, [3000, 6000]], ['BALL', null, 8, [2000, 4000]], ['B772', 'UAL', 480, [32000, 40000]],
  ];
  function demoPlanes() {
    const R = radiusNm * NM_KM;
    const now = Date.now();
    if (!demo.planes || demo.key !== place.name + radiusNm) {
      demo.key = place.name + radiusNm;
      demo.planes = DEMO_FLEET.map(([type, al, gs, [lo, hi]], i) => {
        const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * 0.95;
        const alt = Math.round((lo + Math.random() * (hi - lo)) / 100) * 100;
        const climbing = alt < 20000 && gs > 200;
        const reg = al ? '' : 'N' + (100 + i * 37) + ['AB', 'SK', 'QF', 'CT'][i % 4];
        return {
          id: 'demo' + i, hex: 'demo' + i, type, callsign: al ? al + (100 + ((i * 739) % 8900)) : reg,
          reg, dx: Math.cos(ang) * r, dn: Math.sin(ang) * r, alt, gs, track: Math.random() * 360,
          vrate: climbing ? (Math.random() < 0.5 ? 1800 : -1200) : 0, cat: '', squawk: '', age: 0, origin: '', ground: false,
        };
      });
      demo.planes.push({ id: 'demo-gnd', hex: 'demo-gnd', type: 'A320', callsign: 'EZY42', reg: '', dx: R * 0.12, dn: 0, alt: 0, gs: 12, track: 90, vrate: 0, cat: 'C1', squawk: '', age: 0, origin: '', ground: true });
      demo.at = now;
    }
    const dt = (now - demo.at) / 1000;
    demo.at = now;
    for (const p of demo.planes) {
      const tr = p.track * Math.PI / 180, spd = p.gs * NM_KM / 3600;
      p.dx += Math.sin(tr) * spd * dt;
      p.dn += Math.cos(tr) * spd * dt;
      if (!p.ground) p.alt = clamp(p.alt + p.vrate / 60 * dt, 800, 44000);
      if (p.alt >= 36000 || p.alt <= 800) p.vrate = 0;
      if (Math.hypot(p.dx, p.dn) > R) { p.dx = -p.dx * 0.97; p.dn = -p.dn * 0.97; }
      if (p.ground && Math.abs(p.dx) > R * 0.3) p.track = (p.track + 180) % 360;
    }
    return demo.planes.map(p => ({ ...p, ...fromWorld(p.dx, p.dn) }));
  }

  let pollTimer = 0, pollToken = 0, providerIdx = 0, failStreak = 0, demoWanted = false;

  async function poll() {
    clearTimeout(pollTimer);
    if (document.hidden) { pollTimer = setTimeout(poll, 2000); return; }
    const token = ++pollToken;
    const list = providers();
    if (providerIdx >= list.length) providerIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const idx = (providerIdx + i) % list.length;
      const pv = list[idx];
      try {
        const planes = pv.parse(await fetchJSON(pv.url(), 10000));
        if (token !== pollToken) return;
        providerIdx = idx;
        failStreak = 0;
        demoWanted = false;
        sourceName = pv.name + (relayBase() && pv.url().startsWith(relayBase()) ? ' via your relay' : '');
        ingest(planes, false);
        if (mode !== 'live') hideOffline();
        setMode('live');
        pollTimer = setTimeout(poll, pv.every);
        return;
      } catch (err) {
        if (token !== pollToken) return;
        console.warn('[sky-aquarium]', pv.name, err.message || err);
      }
    }
    failStreak++;
    if (demoWanted) {
      if (mode !== 'demo') setMode('demo');
      sourceName = 'Demo';
      ingest(demoPlanes(), true);
    } else if (mode !== 'offline' && (failStreak >= 2 || mode === 'wait')) {
      setMode('offline');
      showOffline();
    }
    pollTimer = setTimeout(poll, demoWanted ? 20000 : 8000);
  }

  // Keep demo fish fed between live retries so they never go stale.
  setInterval(() => { if (mode === 'demo' && !document.hidden) ingest(demoPlanes(), true); }, 5000);

  function ingest(list, isDemo) {
    const now = performance.now();
    const R = radiusNm * NM_KM;
    lastDataAt = Date.now();
    for (const a of list) {
      const w0 = toWorld(a.lat, a.lon);
      if (Math.hypot(w0.dx, w0.dn) > R * 1.05) continue;
      let f = fishes.get(a.id);
      if (!f || f.leaving) {
        f = newFish(a);
        fishes.set(a.id, f);
        if (!isDemo) queueRoute(f);
      }
      f.a = a;
      f.w0 = w0;
      f.t0 = now - clamp(a.age || 0, 0, 30) * 1000;
      f.lastSeen = now;
      f.demo = isDemo;
      const sp = speciesOf(a);
      if (sp !== f.species) f.species = sp;
    }
    if (!isDemo) for (const f of fishes.values()) if (f.demo) f.leaving = true;
    updateStatus();
  }

  function newFish(a) {
    const code = airlineOf(a.callsign);
    return {
      id: a.id, a, w0: { dx: 0, dn: 0 }, t0: 0, lastSeen: 0,
      species: speciesOf(a), airline: code, hue: hueOf(code),
      phase: Math.random() * 10, face: 1, facing: 1, alpha: 0, leaving: false, init: false,
      sx: 0, sy: 0, z: 0.5, scale: 1, kx: 0, ky: 0, boost: 0, bubbleT: Math.random(),
      hitR: 20, dist: 0, w: null, overhead: false, route: undefined, photo: undefined,
    };
  }

  // ---------------------------------------------------------------- colors
  const colorCache = new Map();
  function colorsFor(f, z) {
    const zb = Math.round(z * 8);
    const key = (f.hue ?? 'p') + ':' + zb + ':' + f.species;
    let c = colorCache.get(key);
    if (c) return c;
    const k = 1 - 0.45 * (zb / 8);
    let h = f.hue, s = 68;
    if (h == null) { h = 38; s = 30; }
    if (f.species === 'jelly') s = Math.min(s, 45);
    c = {
      top: `hsl(${h},${(s * k).toFixed(0)}%,${(30 * k + 8).toFixed(0)}%)`,
      mid: `hsl(${h},${(s * k).toFixed(0)}%,${(50 * k + 9).toFixed(0)}%)`,
      belly: `hsl(${h},${(28 * k).toFixed(0)}%,${(80 * k + 6).toFixed(0)}%)`,
      fin: `hsla(${h},${(s * k).toFixed(0)}%,${(62 * k + 6).toFixed(0)}%,0.85)`,
      stripe: `hsla(${(h + 200) % 360},35%,12%,${(0.32 * k + 0.08).toFixed(2)})`,
      glow: `hsla(${h ?? 38},85%,65%,`,
    };
    colorCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- drawing: creatures
  function bodyPath(c, L, bh, nose = 0.5, back = -0.44) {
    c.beginPath();
    c.moveTo(L * nose, 0);
    c.bezierCurveTo(L * nose * 0.85, -bh * 1.08, L * back * 0.4, -bh * 1.1, L * back, 0);
    c.bezierCurveTo(L * back * 0.4, bh * 1.1, L * nose * 0.85, bh * 1.08, L * nose, 0);
    c.closePath();
  }
  function vGrad(c, bh, col) {
    const g = c.createLinearGradient(0, -bh, 0, bh);
    g.addColorStop(0, col.top); g.addColorStop(0.5, col.mid); g.addColorStop(1, col.belly);
    return g;
  }
  function eye(c, x, y, r) {
    c.fillStyle = 'rgba(236,250,255,0.95)';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#04141d';
    c.beginPath(); c.arc(x + r * 0.25, y, r * 0.58, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(x + r * 0.05, y - r * 0.3, r * 0.2, 0, Math.PI * 2); c.fill();
  }

  const FISH_SHAPES = {
    tuna:      { h: 0.2,  tail: 0.26, tailH: 1.5, dorsal: 0.55, stripes: 'h', wag: 7 },
    barracuda: { h: 0.13, tail: 0.2,  tailH: 1.7, dorsal: 0.6,  stripes: 'v', wag: 6 },
    angel:     { h: 0.38, tail: 0.2,  tailH: 0.8, dorsal: 1.1,  stripes: 'v', wag: 8 },
    guppy:     { h: 0.22, tail: 0.38, tailH: 1.9, dorsal: 0.5,  stripes: null, wag: 11 },
    sword:     { h: 0.15, tail: 0.26, tailH: 1.9, dorsal: 1.2,  stripes: null, wag: 7, bill: true },
    mystery:   { h: 0.27, tail: 0.24, tailH: 1.2, dorsal: 0.6,  stripes: null, wag: 7, spots: true },
  };

  function drawFishShape(c, L, col, t, f, o) {
    const w = Math.sin(t * o.wag * MOTION * (1 + f.boost * 2) + f.phase);
    const bh = L * o.h;
    const lw = Math.max(1, L * 0.022);
    // tail
    c.save();
    c.translate(-L * 0.4, 0);
    c.rotate(w * 0.32);
    c.fillStyle = col.fin;
    c.beginPath();
    c.moveTo(L * 0.05, 0);
    c.lineTo(-L * o.tail, -bh * o.tailH);
    c.quadraticCurveTo(-L * o.tail * 0.55, 0, -L * o.tail, bh * o.tailH);
    c.closePath();
    c.fill();
    c.restore();
    // dorsal + anal fins
    c.fillStyle = col.fin;
    c.beginPath();
    c.moveTo(-L * 0.22, -bh * 0.78);
    c.quadraticCurveTo(-L * 0.12, -bh * (1.1 + o.dorsal * 1.4), L * 0.12, -bh * 0.9);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-L * 0.24, bh * 0.75);
    c.quadraticCurveTo(-L * 0.16, bh * (1.05 + o.dorsal * 0.9), L * 0.0, bh * 0.88);
    c.closePath();
    c.fill();
    // body
    bodyPath(c, L, bh);
    c.fillStyle = vGrad(c, bh, col);
    c.fill();
    if (o.stripes || o.spots) {
      c.save();
      bodyPath(c, L, bh);
      c.clip();
      c.strokeStyle = col.stripe;
      c.fillStyle = col.stripe;
      c.lineWidth = Math.max(1.2, L * 0.045);
      if (o.stripes === 'v') {
        for (let i = 0; i < 3; i++) { const x = L * (0.1 - i * 0.17); c.beginPath(); c.moveTo(x, -bh * 1.2); c.lineTo(x - L * 0.03, bh * 1.2); c.stroke(); }
      } else if (o.stripes === 'h') {
        c.lineWidth = Math.max(1, L * 0.025);
        c.beginPath(); c.moveTo(L * 0.45, -bh * 0.05); c.quadraticCurveTo(0, bh * 0.1, -L * 0.45, 0); c.stroke();
      } else {
        for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(L * (0.15 - i * 0.12), -bh * (0.35 - (i % 2) * 0.3), Math.max(1, L * 0.025), 0, Math.PI * 2); c.fill(); }
      }
      c.restore();
    }
    // gill line
    c.strokeStyle = col.stripe;
    c.lineWidth = lw;
    c.beginPath();
    c.arc(L * 0.08, 0, bh * 0.75, -0.8, 0.8);
    c.stroke();
    // pectoral fin
    c.save();
    c.translate(L * 0.1, bh * 0.25);
    c.rotate(0.5 + w * 0.3);
    c.fillStyle = col.fin;
    c.beginPath();
    c.ellipse(-L * 0.06, 0, L * 0.08, Math.max(1, L * 0.028), 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    if (o.bill) {
      c.strokeStyle = col.mid;
      c.lineWidth = Math.max(1.3, L * 0.028);
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(L * 0.46, -bh * 0.08); c.lineTo(L * 0.92, -bh * 0.16); c.stroke();
    }
    eye(c, L * 0.3, -bh * 0.22, Math.max(1.4, L * 0.048));
  }

  function drawWhale(c, L, col, t, f) {
    const w = Math.sin(t * 2.1 * MOTION * (1 + f.boost) + f.phase);
    const bh = L * 0.19;
    const ty = w * bh * 0.35;
    // fluke
    c.fillStyle = col.top;
    c.save();
    c.translate(-L * 0.56, ty);
    c.rotate(w * 0.35);
    c.beginPath();
    c.moveTo(L * 0.04, 0);
    c.quadraticCurveTo(-L * 0.06, -bh * 0.9, -L * 0.16, -bh * 0.75);
    c.quadraticCurveTo(-L * 0.08, 0, -L * 0.16, bh * 0.75);
    c.quadraticCurveTo(-L * 0.06, bh * 0.9, L * 0.04, 0);
    c.fill();
    c.restore();
    // body
    c.beginPath();
    c.moveTo(L * 0.52, bh * 0.15);
    c.bezierCurveTo(L * 0.54, -bh * 0.95, L * 0.1, -bh * 1.2, -L * 0.22, -bh * 0.72);
    c.quadraticCurveTo(-L * 0.44, -bh * 0.35, -L * 0.56, ty - bh * 0.1);
    c.lineTo(-L * 0.56, ty + bh * 0.1);
    c.quadraticCurveTo(-L * 0.4, bh * 0.55, -L * 0.1, bh * 0.95);
    c.bezierCurveTo(L * 0.2, bh * 1.2, L * 0.5, bh * 0.95, L * 0.52, bh * 0.15);
    c.closePath();
    c.fillStyle = vGrad(c, bh, col);
    c.fill();
    // throat grooves
    c.save();
    c.clip();
    c.strokeStyle = col.stripe;
    c.lineWidth = Math.max(0.8, L * 0.008);
    for (let i = 0; i < 5; i++) {
      const y = bh * (0.45 + i * 0.13);
      c.beginPath(); c.moveTo(L * 0.46, y - bh * 0.1); c.quadraticCurveTo(L * 0.2, y + bh * 0.08, -L * 0.05, y); c.stroke();
    }
    c.restore();
    // small dorsal fin
    c.fillStyle = col.top;
    c.beginPath();
    c.moveTo(-L * 0.28, -bh * 0.6);
    c.quadraticCurveTo(-L * 0.3, -bh * 0.95, -L * 0.36, -bh * 0.98);
    c.lineTo(-L * 0.38, -bh * 0.45);
    c.fill();
    // flipper
    c.save();
    c.translate(L * 0.18, bh * 0.45);
    c.rotate(0.55 + w * 0.12);
    c.fillStyle = col.fin;
    c.beginPath();
    c.ellipse(-L * 0.1, 0, L * 0.13, Math.max(1.2, L * 0.03), 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // mouth + eye
    c.strokeStyle = col.stripe;
    c.lineWidth = Math.max(1, L * 0.01);
    c.beginPath(); c.moveTo(L * 0.5, bh * 0.2); c.quadraticCurveTo(L * 0.35, bh * 0.35, L * 0.2, bh * 0.28); c.stroke();
    eye(c, L * 0.27, bh * 0.08, Math.max(1.3, L * 0.022));
  }

  function drawJelly(c, L, col, t, f) {
    const p = Math.sin(t * 2.4 * MOTION + f.phase);
    const r = L * 0.5;
    const sq = 1 + p * 0.08;
    c.strokeStyle = col.fin;
    c.lineWidth = Math.max(1, L * 0.025);
    c.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      let x = i * r * 0.32;
      c.moveTo(x, 0);
      for (let k = 1; k <= 4; k++) {
        x += Math.sin(t * 3 * MOTION + i + k + f.phase) * r * 0.1;
        c.lineTo(x, k * r * 0.34 * (1 - p * 0.08));
      }
      c.stroke();
    }
    const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, 'rgba(240,250,255,0.9)');
    g.addColorStop(1, col.fin);
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, r * sq, r * 0.78 / sq, 0, Math.PI, Math.PI * 2);
    c.quadraticCurveTo(0, r * 0.18, -r * sq, 0);
    c.fill();
    // four moon-jelly rings
    c.strokeStyle = col.stripe;
    c.lineWidth = Math.max(0.8, L * 0.02);
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.arc((i - 1.5) * r * 0.36, -r * 0.3, r * 0.12, 0, Math.PI * 2); c.stroke();
    }
    // rotor, for the helicopter in disguise
    const rw = r * 1.3 * Math.abs(Math.cos(t * 18 * MOTION + f.phase));
    c.strokeStyle = 'rgba(230,248,255,0.6)';
    c.lineWidth = Math.max(1, L * 0.03);
    c.beginPath(); c.moveTo(-rw, -r * 0.95); c.lineTo(rw, -r * 0.95); c.stroke();
    c.beginPath(); c.moveTo(0, -r * 0.95); c.lineTo(0, -r * 0.78); c.stroke();
  }

  function drawManta(c, L, col, t, f) {
    const fl = Math.sin(t * 2.6 * MOTION + f.phase);
    c.strokeStyle = col.top;
    c.lineWidth = Math.max(1, L * 0.02);
    c.beginPath();
    c.moveTo(-L * 0.25, 0);
    c.quadraticCurveTo(-L * 0.5, fl * L * 0.05, -L * 0.75, -fl * L * 0.04);
    c.stroke();
    c.fillStyle = vGrad(c, L * 0.4, col);
    c.beginPath();
    c.moveTo(L * 0.35, 0);
    c.quadraticCurveTo(L * 0.15, -L * 0.1, -L * 0.02, -L * 0.42 * (0.7 + 0.3 * fl));
    c.quadraticCurveTo(-L * 0.08, -L * 0.12, -L * 0.3, 0);
    c.quadraticCurveTo(-L * 0.08, L * 0.12, -L * 0.02, L * 0.42 * (0.7 - 0.3 * fl));
    c.quadraticCurveTo(L * 0.15, L * 0.1, L * 0.35, 0);
    c.fill();
    c.fillStyle = col.top;
    c.beginPath(); c.ellipse(L * 0.37, -L * 0.05, L * 0.06, L * 0.02, -0.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(L * 0.37, L * 0.05, L * 0.06, L * 0.02, 0.5, 0, Math.PI * 2); c.fill();
    eye(c, L * 0.24, -L * 0.07, Math.max(1.2, L * 0.03));
  }

  function drawPuffer(c, L, col, t, f) {
    const r = L * 0.4 * (1 + Math.sin(t * 1.5 * MOTION + f.phase) * 0.05);
    const w = Math.sin(t * 9 * MOTION + f.phase);
    c.fillStyle = col.fin;
    c.beginPath();
    c.moveTo(-r * 0.9, 0); c.lineTo(-r * 1.45, -r * 0.4 + w * r * 0.1); c.lineTo(-r * 1.45, r * 0.4 + w * r * 0.1);
    c.fill();
    c.strokeStyle = col.top;
    c.lineWidth = Math.max(1, L * 0.02);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); c.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); c.stroke();
    }
    c.fillStyle = vGrad(c, r, col);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = col.stripe;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-r * 0.5 + (i % 3) * r * 0.3, -r * 0.5 + Math.floor(i / 3) * r * 0.3, Math.max(0.8, r * 0.07), 0, Math.PI * 2); c.fill(); }
    eye(c, r * 0.45, -r * 0.2, Math.max(1.6, r * 0.2));
    c.strokeStyle = col.stripe;
    c.beginPath(); c.arc(r * 0.88, r * 0.2, Math.max(1, r * 0.1), 0, Math.PI * 2); c.stroke();
  }

  function drawCrab(c, L, col, t, f) {
    const w = Math.sin(t * 5 * MOTION + f.phase);
    const bw = L * 0.34, bh = L * 0.22;
    c.strokeStyle = col.top;
    c.lineWidth = Math.max(1.2, L * 0.04);
    c.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 3; i++) {
        const x0 = s * bw * (0.4 + i * 0.22);
        c.beginPath();
        c.moveTo(x0 * 0.8, -bh * 0.2);
        c.lineTo(x0 + s * bw * 0.25, -bh * 0.5 + Math.sin(t * 8 * MOTION + i + s) * bh * 0.15);
        c.lineTo(x0 + s * bw * 0.35, bh * 0.1);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(s * bw * 0.6, -bh * 0.5);
      c.lineTo(s * bw * 1.05, -bh * (1.1 + (s > 0 ? w : -w) * 0.2));
      c.stroke();
      c.fillStyle = col.mid;
      c.beginPath(); c.arc(s * bw * 1.1, -bh * (1.2 + (s > 0 ? w : -w) * 0.2), bh * 0.35, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = vGrad(c, bh, col);
    c.beginPath();
    c.ellipse(0, -bh * 0.3, bw, bh, 0, Math.PI, Math.PI * 2);
    c.quadraticCurveTo(0, bh * 0.2, -bw, -bh * 0.3);
    c.fill();
    c.strokeStyle = col.top;
    c.lineWidth = Math.max(1, L * 0.025);
    c.beginPath(); c.moveTo(-bw * 0.25, -bh * 1.1); c.lineTo(-bw * 0.3, -bh * 1.6); c.moveTo(bw * 0.25, -bh * 1.1); c.lineTo(bw * 0.3, -bh * 1.6); c.stroke();
    eye(c, -bw * 0.3, -bh * 1.7, Math.max(1.2, L * 0.05));
    eye(c, bw * 0.3, -bh * 1.7, Math.max(1.2, L * 0.05));
  }

  function drawCreature(c, species, L, col, t, f) {
    if (species === 'whale') drawWhale(c, L, col, t, f);
    else if (species === 'jelly') drawJelly(c, L, col, t, f);
    else if (species === 'manta') drawManta(c, L, col, t, f);
    else if (species === 'puffer') drawPuffer(c, L, col, t, f);
    else if (species === 'crab') drawCrab(c, L, col, t, f);
    else drawFishShape(c, L, col, t, f, FISH_SHAPES[species] || FISH_SHAPES.mystery);
  }

  // ---------------------------------------------------------------- drawing: scene
  function drawWater(t) {
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // light shafts from the surface
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = ((i + 0.5) / 5) * W + Math.sin(t * 0.15 * MOTION + i * 1.7) * W * 0.06;
      const a = (0.035 + 0.025 * Math.sin(t * 0.4 * MOTION + i * 2.1)) * (0.15 + 0.85 * light.level);
      const g = ctx.createLinearGradient(0, Lay.surface, 0, Lay.sand);
      g.addColorStop(0, `rgba(150,230,255,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 18, Lay.surface);
      ctx.lineTo(x + 26, Lay.surface);
      ctx.lineTo(x + 110 + i * 10, Lay.sand);
      ctx.lineTo(x - 40, Lay.sand);
      ctx.fill();
    }
    ctx.restore();

    // stars in the strip of sky above the surface
    if (light.level < 0.6) {
      ctx.fillStyle = '#e8f4ff';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97.3) % W, sy = 4 + ((i * 53.7) % Math.max(10, Lay.surface - 8));
        ctx.globalAlpha = (0.6 - light.level) * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
        ctx.fillRect(sx, sy, i % 5 ? 1 : 1.6, i % 5 ? 1 : 1.6);
      }
      ctx.globalAlpha = 1;
    }
    // the surface itself, above which is open sky
    ctx.fillStyle = 'rgba(160,230,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, Lay.surface + Math.sin(x * 0.03 + t * 1.2 * MOTION) * 3 + Math.sin(x * 0.011 - t * 0.7 * MOTION) * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,245,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = Lay.surface + Math.sin(x * 0.03 + t * 1.2 * MOTION) * 3 + Math.sin(x * 0.011 - t * 0.7 * MOTION) * 2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function altY(ft) {
    return Lay.bottom - Math.pow(clamp(ft / ALT_MAX, 0, 1), 0.85) * (Lay.bottom - Lay.top);
  }

  function drawGauge() {
    ctx.save();
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (const ft of [40000, 30000, 20000, 10000, 5000]) {
      const y = altY(ft);
      ctx.strokeStyle = 'rgba(180,235,255,0.07)';
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(Lay.left - 4, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(180,225,240,0.5)';
      ctx.fillText(ft >= 10000 ? `FL${ft / 100}` : `${ft / 1000}k ft`, 8, y);
    }
    ctx.fillStyle = 'rgba(180,225,240,0.35)';
    ctx.fillText('W', 8, Lay.bottom + 4);
    ctx.textAlign = 'right';
    ctx.fillText('E', W - 8, Lay.bottom + 4);
    ctx.restore();
  }

  function drawWeeds(t, front) {
    for (const w of weeds) {
      if (w.front !== front) continue;
      const base = sandY(w.x) + 4;
      if (w.coral) {
        ctx.fillStyle = front ? '#b8664a' : '#8a4f3f';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(w.x + (i - 2) * 6, base - 8 - Math.abs(i - 2) * -3 - (i % 2) * 8, 6 + (i % 3), 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.strokeStyle = `hsl(${w.hue},45%,${front ? w.light + 6 : w.light}%)`;
      ctx.lineCap = 'round';
      const segs = 6;
      let x = w.x, y = base;
      for (let s = 1; s <= segs; s++) {
        const k = s / segs;
        const nx = w.x + Math.sin(t * 0.9 * MOTION + w.phase + k * 2) * 9 * k;
        const ny = base - w.h * k;
        ctx.lineWidth = w.w * (1 - k * 0.7);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        x = nx; y = ny;
      }
    }
  }

  function drawSand(t) {
    ctx.fillStyle = sandGrad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, sandY(x));
    ctx.lineTo(W, H);
    ctx.fill();
    // you are here
    const x = W / 2, y = sandY(x);
    const p = (t * (overheadUntil > performance.now() ? 1.8 : 0.6) * MOTION) % 1;
    ctx.strokeStyle = `rgba(63,208,201,${(0.6 * (1 - p)).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, 8 + p * 26, (8 + p * 26) * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3fd0c9';
    ctx.beginPath(); ctx.arc(x, y - 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(63,208,201,0.25)';
    ctx.beginPath(); ctx.arc(x, y - 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(210,250,250,0.85)';
    ctx.fillText('YOU', x, y + 16);
    ctx.textAlign = 'left';
  }

  function drawSnow(dt) {
    ctx.fillStyle = light.level < 0.4 ? 'rgba(120,255,230,0.45)' : 'rgba(210,240,255,0.28)';
    for (const s of snow) {
      s.y += s.v * dt * MOTION;
      s.x += Math.sin(s.p + s.y * 0.02) * 0.1;
      if (s.y > H) { s.y = Lay.surface; s.x = Math.random() * W; }
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }

  function spawnBubbles(x, y, n, spread = 6, size = 1) {
    for (let i = 0; i < n && bubbles.length < 400; i++) {
      bubbles.push({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread,
        r: (1 + Math.random() * 3) * size, vy: 18 + Math.random() * 30, p: Math.random() * 6, life: 1,
      });
    }
  }

  function drawBubbles(dt) {
    ctx.lineWidth = 1;
    const next = [];
    for (const b of bubbles) {
      b.y -= b.vy * dt;
      b.x += Math.sin(b.p + b.y * 0.05) * 0.4;
      b.vy += 6 * dt;
      if (b.y < Lay.surface + 2) { b.life -= dt * 4; }
      if (b.life <= 0) continue;
      next.push(b);
      ctx.strokeStyle = `rgba(210,245,255,${(0.55 * b.life).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(0.35 * b.life).toFixed(3)})`;
      ctx.fillRect(b.x - b.r * 0.4, b.y - b.r * 0.5, Math.max(0.8, b.r * 0.35), Math.max(0.8, b.r * 0.35));
    }
    bubbles = next;
    const rs = [];
    for (const r of ripples) {
      r.t += dt;
      if (r.t > 0.9) continue;
      rs.push(r);
      ctx.strokeStyle = `rgba(190,245,255,${(0.5 * (1 - r.t / 0.9)).toFixed(3)})`;
      ctx.lineWidth = 2 * (1 - r.t / 0.9) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + r.t * 70, 0, Math.PI * 2); ctx.stroke();
    }
    ripples = rs;
  }

  // ---------------------------------------------------------------- sonar (top-down inset)
  const sonar = { x: 0, y: 0, r: 0 };
  function sonarGeom() {
    if (sonarBig) {
      sonar.r = Math.min(W, H) * 0.4;
      sonar.x = W / 2;
      sonar.y = H / 2;
    } else {
      sonar.r = Math.max(38, Math.min(56, W * 0.11));
      sonar.x = W - 14 - sonar.r;
      sonar.y = Lay.sand - sonar.r - 12;
    }
  }

  function drawSonar(t, list) {
    sonarGeom();
    const { x, y, r } = sonar;
    ctx.save();
    if (sonarBig) { ctx.fillStyle = 'rgba(2,12,18,0.55)'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(2,22,32,0.82)';
    ctx.strokeStyle = 'rgba(63,208,201,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(63,208,201,0.16)';
    for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();

    const sweep = (t * 1.1 * MOTION) % (Math.PI * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 14; i++) {
      const a0 = sweep - (i + 1) * 0.06;
      ctx.fillStyle = `rgba(63,208,201,${(0.16 * (1 - i / 14)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0 - Math.PI / 2, a0 + 0.06 - Math.PI / 2); ctx.fill();
    }
    ctx.restore();

    const R = radiusNm * NM_KM;
    for (const f of list) {
      if (!f.w) continue;
      const px = x + (f.w.dx / R) * r, py = y - (f.w.dn / R) * r;
      if (Math.hypot(px - x, py - y) > r) continue;
      let ang = Math.atan2(f.w.dx, f.w.dn);
      if (ang < 0) ang += Math.PI * 2;
      let since = sweep - ang;
      if (since < 0) since += Math.PI * 2;
      const lit = 0.35 + 0.65 * Math.max(0, 1 - since / 2.5);
      const hue = f.hue ?? 38;
      ctx.fillStyle = `hsla(${hue},75%,65%,${(lit * f.alpha).toFixed(3)})`;
      const dr = sonarBig ? 3.5 : 2;
      ctx.beginPath(); ctx.arc(px, py, f === selected ? dr + 1.5 : dr, 0, Math.PI * 2); ctx.fill();
      if (sonarBig && f.a.gs > 30) {
        const tr = (f.a.track || 0) * Math.PI / 180;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(tr) * 10, py - Math.cos(tr) * 10); ctx.stroke();
      }
      if (f === selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(px, py, dr + 5, 0, Math.PI * 2); ctx.stroke();
      }
      if (sonarBig && showLabels && f.a.callsign) {
        ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillStyle = `rgba(200,240,250,${(0.7 * f.alpha).toFixed(3)})`;
        ctx.fillText(f.a.callsign, px + 6, py - 6);
      }
    }
    ctx.fillStyle = '#3fd0c9';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `600 ${sonarBig ? 12 : 9}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(200,245,250,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('N', x, y - r + (sonarBig ? 14 : 9));
    if (sonarBig) {
      ctx.fillStyle = 'rgba(200,245,250,0.6)';
      ctx.fillText(`SONAR · TOP-DOWN · ${radiusNm} NM`, x, y + r + 20);
      ctx.fillText('Tap a blip to meet it, or tap outside to close', x, y + r + 38);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- main loop
  let T = 0, lastFrame = performance.now(), cardTick = 0;
  let drawList = [];

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    T += dt;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWater(T);
    drawGauge();
    drawSnow(dt);
    drawWeeds(T, false);
    drawSand(T);

    // update fish
    drawList = [];
    for (const f of fishes.values()) {
      if (!f.leaving && now - f.lastSeen > STALE_MS) f.leaving = true;
      if (f.leaving) {
        f.alpha -= dt * 1.2;
        if (f.alpha <= 0) {
          fishes.delete(f.id);
          if (selected === f) closeCard();
          continue;
        }
      } else {
        f.alpha = Math.min(1, f.alpha + dt * 1.2);
      }
      const w = worldAt(f, now);
      f.w = w;
      f.dist = Math.hypot(w.dx, w.dn);
      const pr = project(w, f.a.ground);
      if (!f.init) { f.sx = pr.x; f.sy = pr.y; f.init = true; }
      const k = 1 - Math.exp(-dt * 2.5);
      f.sx += (pr.x - f.sx) * k;
      f.sy += (pr.y - f.sy) * k;
      f.z += (pr.z - f.z) * k;
      f.scale = 1.18 - 0.52 * f.z;
      const vx = Math.sin((f.a.track || 0) * Math.PI / 180);
      if (Math.abs(vx) > 0.12 && (f.a.gs || 0) > 5) f.face = vx > 0 ? 1 : -1;
      f.facing += (f.face - f.facing) * Math.min(1, dt * 4);
      const decay = Math.exp(-dt * 3);
      f.kx *= decay; f.ky *= decay;
      f.boost *= Math.exp(-dt * 1.5);
      const sp = SPECIES[f.species];
      f.len = sp.size * BASE * f.scale;
      f.hitR = Math.max(20, f.len * 0.5);
      // climbing aircraft trail bubbles; whales spout now and then
      f.bubbleT -= dt;
      if (f.bubbleT <= 0 && f.alpha > 0.5) {
        if (!f.a.ground && (f.a.vrate || 0) > 600) {
          spawnBubbles(f.sx - f.facing * f.len * 0.45, f.sy, 1, 4, 0.8);
          f.bubbleT = 0.25 + Math.random() * 0.3;
        } else if (f.species === 'whale' && Math.random() < 0.08) {
          spawnBubbles(f.sx + f.facing * f.len * 0.2, f.sy - f.len * 0.2, 5, 5, 0.9);
          f.bubbleT = 2;
        } else {
          f.bubbleT = 0.8;
        }
      }
      // overhead: within OVERHEAD_KM horizontally of you
      if (!f.leaving && !f.a.ground && f.alpha > 0.5) {
        if (!f.overhead && f.dist < OVERHEAD_KM) { f.overhead = true; announceOverhead(f); }
        else if (f.overhead && f.dist > OVERHEAD_KM * 2) f.overhead = false;
      }
      drawList.push(f);
    }
    drawList.sort((a, b) => b.z - a.z);

    if (selected && selected.w) drawPlumb(selected);

    for (const f of drawList) drawOne(f);
    drawBubbles(dt);
    drawWeeds(T, true);
    if (selected && fishes.has(selected.id)) drawHalo(selected);
    drawSonar(T, drawList);

    cardTick -= dt;
    if (selected && cardTick <= 0) { fillCard(); cardTick = 0.5; }
    if (selected) drawPortrait();

    requestAnimationFrame(frame);
  }

  function drawOne(f) {
    const sp = SPECIES[f.species];
    const col = colorsFor(f, f.z);
    const bob = Math.sin(T * 1.3 * MOTION + f.phase) * 2.5 * f.scale;
    const x = f.sx + f.kx, y = f.sy + f.ky + (f.a.ground ? 0 : bob);
    const glow = (1 - light.level) * f.alpha;
    if (glow > 0.05) {
      const r = f.len * 0.85;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, colorsFor(f, 0).glow + (0.5 * glow).toFixed(3) + ')');
      g.addColorStop(1, colorsFor(f, 0).glow + '0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = f.alpha * (1 - f.z * 0.25);
    ctx.translate(x, y);
    if (sp.face) {
      const fx = Math.abs(f.facing) < 0.08 ? 0.08 * Math.sign(f.facing || 1) : f.facing;
      ctx.scale(fx, 1);
      const tilt = f.a.ground ? 0 : clamp((f.a.vrate || 0) / 4000, -0.3, 0.3);
      ctx.rotate(-tilt);
    }
    drawCreature(ctx, f.species, f.len, col, T, f);
    ctx.restore();

    if (showLabels && f.a.callsign && f.alpha > 0.2) {
      const fade = f.alpha * (1 - f.z * 0.45);
      const ly = y + f.len * (f.species === 'jelly' ? 0.75 : 0.34) + 10;
      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(205,240,252,${(0.62 * fade).toFixed(3)})`;
      ctx.fillText(f.a.callsign, x, ly);
      const r = f.route;
      if (r && r.from?.code && r.to?.code) {
        ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillStyle = `rgba(110,232,222,${(0.85 * fade).toFixed(3)})`;
        ctx.fillText(`${r.from.code} → ${r.to.code}`, x, ly + 12);
      }
      ctx.textAlign = 'left';
    }
  }

  function drawPlumb(f) {
    const x = f.sx + f.kx, y = f.sy + f.ky;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(x, y + f.len * 0.3); ctx.lineTo(x, sandY(x)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawHalo(f) {
    const x = f.sx + f.kx, y = f.sy + f.ky;
    const r = f.len * 0.62 + 8 + Math.sin(T * 3) * 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -T * 12;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- interaction
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 14) handleTap(e.clientX, e.clientY);
  });

  function handleTap(x, y) {
    unlockAudio();
    requestWake();
    sonarGeom();
    const inSonar = Math.hypot(x - sonar.x, y - sonar.y) <= sonar.r + 6;
    if (sonarBig) {
      if (inSonar) {
        const R = radiusNm * NM_KM;
        let best = null, bd = 22;
        for (const f of drawList) {
          if (!f.w) continue;
          const px = sonar.x + (f.w.dx / R) * sonar.r, py = sonar.y - (f.w.dn / R) * sonar.r;
          const d = Math.hypot(px - x, py - y);
          if (d < bd) { bd = d; best = f; }
        }
        if (best) { sonarBig = false; select(best); return; }
        return;
      }
      sonarBig = false;
      return;
    }
    if (inSonar) {
      sonarBig = true;
      hideSheets();
      blip(520, 0.12);
      return;
    }
    // front-most fish under the finger
    let hit = null, bestScore = Infinity;
    for (let i = drawList.length - 1; i >= 0; i--) {
      const f = drawList[i];
      const d = Math.hypot(f.sx + f.kx - x, f.sy + f.ky - y);
      if (d < f.hitR + 12) {
        const score = d / (f.hitR + 12) + f.z * 0.3;
        if (score < bestScore) { bestScore = score; hit = f; }
      }
    }
    if (hit) { select(hit); return; }

    // tapped open water: ripple, bubbles, and a startled school
    ripples.push({ x, y, t: 0 });
    spawnBubbles(x, y, 14, 16, 1.2);
    pop();
    for (const f of drawList) {
      const dx = f.sx - x, dy = f.sy - y;
      const d = Math.hypot(dx, dy);
      if (d < 120 && d > 0) {
        const push = (1 - d / 120) * 26;
        f.kx += (dx / d) * push;
        f.ky += (dy / d) * push;
        f.boost = 1;
      }
    }
    if (!settingsEl.hidden || !cardEl.hidden) hideSheets();
  }

  // ---------------------------------------------------------------- overhead alerts
  let lastAlertAt = -Infinity, overheadUntil = 0;
  function announceOverhead(f) {
    const now = performance.now();
    overheadUntil = now + 15000;
    if (!alertsOn || now - lastAlertAt < 20000) return;
    lastAlertAt = now;
    const who = f.a.callsign || f.a.reg || 'An aircraft';
    const sp = SPECIES[f.species];
    const alt = f.w ? fmt(Math.round(f.w.alt / 100) * 100) : fmt(f.a.alt);
    const kind = TYPES[f.a.type] || sp.name.toLowerCase();
    const r = f.route;
    const trip = r && r.from?.name && r.to?.name ? `, flying ${r.from.name} to ${r.to.name},` : ` (${kind})`;
    toast(`Look up! ${who}${trip} is passing over you at ${alt} ft.`, 9000, () => select(f), 'Tap to meet it.');
    f.boost = 1;
    if (f.species === 'whale') whaleSong(); else chime();
    if (navigator.vibrate) try { navigator.vibrate([30, 60, 30]); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- card
  const cardEl = $('#card');
  const settingsEl = $('#settings');
  const portrait = $('#portrait');
  const pctx = portrait.getContext('2d');

  function select(f) {
    selected = f;
    f.boost = 1;
    settingsEl.hidden = true;
    cardEl.hidden = false;
    cardTick = 0;
    enrich(f);
    fillCard();
    blip(330, 0.18);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* ignore */ }
  }
  // ---------------------------------------------------------------- routes
  // adsbdb first (origin, destination and airline in one call), hexdb as a fallback.
  // Both send CORS headers. Results are cached per callsign in memory and for 6 h on the device.
  const routeCache = new Map(), photoCache = new Map(), airportCache = new Map();
  const ROUTE_TTL = 6 * 3600 * 1000;
  const savedRoutes = store.get('routes', {});
  const cleanName = s => (s || '').replace(/\s+(International\s+)?Airport$/i, '').trim();
  const apFromDb = a => ({ code: a.iata_code || a.icao_code, name: a.municipality || cleanName(a.name), airport: a.name || '', country: a.country_name || '', lat: a.latitude, lon: a.longitude });

  function hexAirport(icao) {
    if (!airportCache.has(icao)) {
      airportCache.set(icao, fetchJSON(`https://hexdb.io/api/v1/airport/icao/${encodeURIComponent(icao)}`, 8000)
        .then(a => (a && (a.iata || a.icao) ? { code: a.iata || a.icao, name: cleanName(a.airport) || a.icao, airport: a.airport || '', country: a.country_code || '', lat: a.latitude, lon: a.longitude } : null))
        .catch(() => null));
    }
    return airportCache.get(icao);
  }

  async function fetchRoute(cs) {
    try {
      const fr = (await fetchJSON(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, 8000))?.response?.flightroute;
      if (fr?.origin && fr?.destination) return { from: apFromDb(fr.origin), to: apFromDb(fr.destination), stops: 0, airline: fr.airline?.name || null };
    } catch { /* not in adsbdb */ }
    try {
      const codes = ((await fetchJSON(`https://hexdb.io/api/v1/route/icao/${encodeURIComponent(cs)}`, 8000))?.route || '').split('-').filter(Boolean);
      if (codes.length >= 2) {
        const [a, b] = await Promise.all([hexAirport(codes[0]), hexAirport(codes[codes.length - 1])]);
        if (a && b) return { from: a, to: b, stops: codes.length - 2, airline: null };
      }
    } catch { /* not in hexdb */ }
    return null;
  }

  function lookupRoute(f) {
    const cs = f.a.callsign;
    if (!cs || f.demo) return Promise.resolve(null);
    if (routeCache.has(cs)) return routeCache.get(cs);
    const saved = savedRoutes[cs];
    if (saved && Date.now() - saved.t < ROUTE_TTL) {
      const p = Promise.resolve(saved.r);
      routeCache.set(cs, p);
      return p;
    }
    const p = fetchRoute(cs).then(r => {
      savedRoutes[cs] = { r, t: Date.now() };
      const keys = Object.keys(savedRoutes);
      if (keys.length > 600) for (const k of keys.sort((x, y) => savedRoutes[x].t - savedRoutes[y].t).slice(0, keys.length - 600)) delete savedRoutes[k];
      store.set('routes', savedRoutes);
      return r;
    });
    routeCache.set(cs, p);
    return p;
  }

  // A route database can be stale (callsigns get reused), so keep a route only when the
  // aircraft is roughly on the way between its two airports.
  function plausible(f, r) {
    if (!r || !r.from?.code || !r.to?.code) return false;
    const pts = [r.from.lat, r.from.lon, r.to.lat, r.to.lon];
    if (!pts.every(v => typeof v === 'number')) return true;
    const leg = haversine(r.from.lat, r.from.lon, r.to.lat, r.to.lon);
    const via = haversine(r.from.lat, r.from.lon, f.a.lat, f.a.lon) + haversine(f.a.lat, f.a.lon, r.to.lat, r.to.lon);
    return via <= leg * 1.25 + 150;
  }

  function resolveRoute(f) {
    return lookupRoute(f).then(r => {
      f.route = plausible(f, r) ? r : null;
      if (selected === f) fillCard();
      return f.route;
    });
  }

  // Look routes up for every flight in view, nearest first, a few at a time.
  const routeQueue = [];
  let routeActive = 0;
  function queueRoute(f) {
    if (!f.a.callsign || f.route !== undefined || f.routeQueued) return;
    f.routeQueued = true;
    routeQueue.push(f);
    pumpRoutes();
  }
  function pumpRoutes() {
    while (routeActive < 3 && routeQueue.length) {
      routeQueue.sort((a, b) => (a.dist || 1e9) - (b.dist || 1e9));
      const f = routeQueue.shift();
      if (!fishes.has(f.id) || f.leaving || f.route !== undefined) continue;
      routeActive++;
      resolveRoute(f).catch(() => { f.route = null; }).finally(() => { routeActive--; pumpRoutes(); });
    }
  }

  function lookupPhoto(f) {
    const hex = (f.a.hex || '').toLowerCase();
    if (!hex || f.demo) return Promise.resolve(null);
    if (photoCache.has(hex)) return photoCache.get(hex);
    const p = fetchJSON(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(hex)}`, 8000)
      .then(j => { const a = j?.response?.aircraft; return a ? { url: a.url_photo_thumbnail || a.url_photo || null, owner: a.registered_owner || '' } : null; })
      .catch(() => null);
    photoCache.set(hex, p);
    return p;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }

  function enrich(f) {
    $('#route').hidden = true;
    $('#routeNote').hidden = true;
    $('#photoWrap').hidden = true;
    if (f.demo) return;
    if (f.route === undefined) resolveRoute(f);
    if (f.photo === undefined) lookupPhoto(f).then(p => { f.photo = p; if (selected === f) fillCard(); });
  }

  function fillRoute(f) {
    const r = f.route, routeEl = $('#route'), note = $('#routeNote');
    if (!r || !r.from?.code || !r.to?.code) {
      routeEl.hidden = true;
      note.hidden = f.route !== null;
      setText('routeNote', f.a.callsign ? 'No route on file for this flight.' : 'This aircraft isn\u2019t broadcasting a flight number, so its route is unknown.');
      return;
    }
    routeEl.hidden = false;
    setText('rFrom', r.from.code);
    setText('rFromN', r.from.name);
    setText('rTo', r.to.code);
    setText('rToN', r.to.name);
    let pct = null;
    if ([r.from.lat, r.from.lon, r.to.lat, r.to.lon].every(v => typeof v === 'number')) {
      const pos = f.w ? fromWorld(f.w.dx, f.w.dn) : f.a;
      const a = haversine(r.from.lat, r.from.lon, pos.lat, pos.lon);
      const b = haversine(pos.lat, pos.lon, r.to.lat, r.to.lon);
      if (a + b > 0) pct = a / (a + b);
      note.hidden = false;
      const full = ap => [ap.airport || ap.name, ap.country].filter(Boolean).join(', ');
      setText('routeNote', `${full(r.from)} to ${full(r.to)}${r.stops > 0 ? ` with ${r.stops} stop${r.stops > 1 ? 's' : ''}` : ''} · ${fmt(b)} km to go`);
    } else {
      note.hidden = true;
    }
    const w = pct == null ? '50%' : `${(clamp(pct, 0, 1) * 100).toFixed(1)}%`;
    $('#rBar').style.width = w;
    $('#rPlane').style.left = w;
    if (r.airline && !f.airline) setText('cSub', `${r.airline} · ${TYPES[f.a.type] || f.a.desc || f.a.type || 'Type not broadcast'}`);
  }

  function fillPhoto(f) {
    const wrap = $('#photoWrap'), img = $('#cPhoto');
    const url = f.photo?.url;
    if (!url) { wrap.hidden = true; return; }
    if (img.getAttribute('src') !== url) {
      img.onload = () => { if (selected === f) wrap.hidden = false; };
      img.onerror = () => { wrap.hidden = true; };
      img.alt = `Photo of ${f.a.reg || f.a.callsign || 'this aircraft'}`;
      img.src = url;
    } else if (img.complete && img.naturalWidth) {
      wrap.hidden = false;
    }
  }

  function closeCard() { selected = null; cardEl.hidden = true; }
  function hideSheets() { closeCard(); settingsEl.hidden = true; }

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = deg => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  const setText = (id, v) => { const el = document.getElementById(id); if (el.textContent !== v) el.textContent = v; };

  function fillCard() {
    const f = selected;
    if (!f) return;
    const a = f.a, sp = SPECIES[f.species];
    const w = f.w || worldAt(f, performance.now());
    setText('cSpecies', sp.name + (f.demo ? ' · demo' : ''));
    setText('cTitle', a.callsign || a.reg || (a.hex || '').toUpperCase() || 'Unknown');
    const airline = f.airline ? (AIRLINES[f.airline] || `Operator ${f.airline}`) : (a.origin ? `Registered in ${a.origin}` : 'Private or unlisted operator');
    const typeName = TYPES[a.type] || a.desc || a.type || 'Type not broadcast';
    setText('cSub', `${airline} · ${typeName}`);

    if (a.ground) { setText('sAlt', 'Ground'); setText('sAlt2', 'taxiing'); }
    else {
      const alt = Math.round(w.alt / 100) * 100;
      setText('sAlt', fmt(alt) + ' ft');
      setText('sAlt2', alt >= 18000 ? `FL${Math.round(alt / 100)}` : `${fmt(alt * 0.3048)} m`);
    }
    setText('sSpd', `${fmt(a.gs || 0)} kt`);
    setText('sSpd2', `${fmt((a.gs || 0) * NM_KM)} km/h`);
    setText('sHdg', `${fmt(a.track || 0).padStart(3, '0')}°`);
    setText('sHdg2', `toward ${compass(a.track || 0)}`);
    const vs = a.vrate || 0;
    if (a.ground || Math.abs(vs) < 200) { setText('sVs', 'Level'); setText('sVs2', 'steady'); }
    else { setText('sVs', `${vs > 0 ? '↑' : '↓'} ${fmt(Math.abs(Math.round(vs / 50) * 50))}`); setText('sVs2', vs > 0 ? 'ft/min up' : 'ft/min down'); }
    const km = Math.hypot(w.dx, w.dn);
    const brg = (Math.atan2(w.dx, w.dn) * 180 / Math.PI + 360) % 360;
    const d1 = v => (v < 10 ? v.toFixed(1) : fmt(v));
    setText('sDist', `${d1(km)} km`);
    setText('sDist2', `${d1(km / NM_KM)} nm ${compass(brg)}`);
    setText('sReg', a.reg || '—');
    setText('sReg2', [a.type, a.squawk && `sq ${a.squawk}`].filter(Boolean).join(' · ') || (a.hex || '').toUpperCase());

    const ago = Math.max(0, Math.round((Date.now() - lastDataAt) / 1000));
    setText('cSource', f.demo ? 'Demo fish. Not a real flight.' : `Via ${sourceName} · updated ${ago}s ago`);
    if (f.route !== undefined) fillRoute(f);
    if (f.photo !== undefined) fillPhoto(f);
    const link = $('#cLink');
    link.hidden = !!f.demo;
    const href = `https://globe.adsb.lol/?icao=${encodeURIComponent(a.hex || '')}`;
    if (link.href !== href) link.href = href;
  }

  function drawPortrait() {
    const f = selected;
    const w = portrait.width, h = portrait.height;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, w, h);
    const L = f.species === 'whale' ? w * 0.68 : f.species === 'crab' || f.species === 'jelly' || f.species === 'puffer' ? w * 0.5 : w * 0.6;
    pctx.translate(w / 2 + (f.species === 'whale' ? w * 0.06 : 0), h / 2 + (f.species === 'jelly' ? -h * 0.1 : f.species === 'crab' ? h * 0.18 : 0));
    drawCreature(pctx, f.species, L, colorsFor(f, 0), T, f);
  }

  // ---------------------------------------------------------------- settings
  const placesEl = $('#places');
  for (const p of PLACES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.name;
    b.dataset.place = p.name;
    b.addEventListener('click', () => setPlace(p));
    placesEl.appendChild(b);
  }
  $('#locateBtn').addEventListener('click', () => locate(true));

  function syncSettings() {
    for (const b of placesEl.querySelectorAll('.chip')) {
      const on = b.id === 'locateBtn' ? place.mine === true : (!place.mine && b.dataset.place === place.name);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const b of document.querySelectorAll('#radius button')) b.setAttribute('aria-checked', Number(b.dataset.nm) === radiusNm ? 'true' : 'false');
    $('#labelsToggle').checked = showLabels;
    $('#soundToggle').checked = soundOn;
    $('#alertToggle').checked = alertsOn;
    if (document.activeElement !== $('#relayInput')) $('#relayInput').value = store.get('relay', '') || '';
    for (const b of document.querySelectorAll('#lightMode button')) b.setAttribute('aria-checked', b.dataset.light === lightMode ? 'true' : 'false');
    updateLight();
  }

  function setPlace(p) {
    place = p;
    store.set('place', p);
    resetTank();
    syncSettings();
  }

  function resetTank() {
    fishes.clear();
    selected = null;
    cardEl.hidden = true;
    demo.planes = null;
    failStreak = 0;
    if (mode === 'live' || mode === 'offline') setMode('wait');
    hideOffline();
    poll();
  }

  function locate(userAsked) {
    if (!('geolocation' in navigator)) { if (userAsked) toast('This browser cannot share your location. Pick a city instead.'); return; }
    if (userAsked) toast('Finding you…', 2500);
    navigator.geolocation.getCurrentPosition(pos => {
      setPlace({ name: 'Near you', lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), mine: true });
      if (userAsked) toast('Showing the sky above you.', 2500);
    }, err => {
      if (userAsked || err.code === 1) toast(err.code === 1 ? 'Location is turned off for this site, so the tank shows London. Pick a city in the menu.' : 'Could not get your location. Pick a city instead.', 5000);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  }

  for (const b of document.querySelectorAll('#radius button')) {
    b.addEventListener('click', () => {
      radiusNm = Number(b.dataset.nm);
      store.set('nm', radiusNm);
      syncSettings();
      resetTank();
    });
  }
  $('#alertToggle').addEventListener('change', e => { alertsOn = e.target.checked; store.set('alerts', alertsOn); });
  for (const b of document.querySelectorAll('#lightMode button')) {
    b.addEventListener('click', () => { lightMode = b.dataset.light; store.set('light', lightMode); syncSettings(); });
  }
  $('#labelsToggle').addEventListener('change', e => { showLabels = e.target.checked; store.set('labels', showLabels); });
  $('#soundToggle').addEventListener('change', e => { soundOn = e.target.checked; store.set('sound', soundOn); if (soundOn) { unlockAudio(); pop(); } });

  const openSettings = () => {
    closeCard();
    sonarBig = false;
    settingsEl.hidden = !settingsEl.hidden;
    syncSettings();
    if (!settingsEl.hidden) drawGuide();
  };
  $('#menuBtn').addEventListener('click', openSettings);
  $('#placeBtn').addEventListener('click', openSettings);
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', hideSheets);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideSheets(); sonarBig = false; } });

  let guideBuilt = false;
  const guideCanvases = [];
  function drawGuide() {
    if (!guideBuilt) {
      guideBuilt = true;
      const ul = $('#guide');
      Object.entries(SPECIES).forEach(([key, sp], i) => {
        const li = document.createElement('li');
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 80;
        const txt = document.createElement('div');
        txt.innerHTML = `<b></b><span></span>`;
        txt.querySelector('b').textContent = sp.name;
        txt.querySelector('span').textContent = sp.what;
        li.append(cv, txt);
        ul.appendChild(li);
        guideCanvases.push({ cv, key, fake: { hue: HUES[(i * 5) % HUES.length], phase: i, boost: 0, species: key } });
      });
    }
    for (const g of guideCanvases) {
      const c = g.cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, 128, 80);
      const L = g.key === 'whale' ? 92 : g.key === 'jelly' || g.key === 'puffer' || g.key === 'crab' ? 58 : 76;
      c.translate(g.key === 'whale' ? 70 : 64, g.key === 'jelly' ? 30 : g.key === 'crab' ? 56 : 40);
      drawCreature(c, g.key, L, colorsFor(g.fake, 0), 1.2, g.fake);
    }
  }

  // ---------------------------------------------------------------- status + toast
  const statusEl = $('#status');
  function setMode(m) {
    mode = m;
    statusEl.dataset.state = m;
    updateStatus();
  }
  function updateStatus() {
    let n = 0;
    for (const f of fishes.values()) if (!f.leaving) n++;
    const label = mode === 'live' ? `Live · ${n} fish` : mode === 'demo' ? `Demo · ${n} fish` : mode === 'offline' ? 'Not connected' : 'Connecting';
    setText('statusText', label);
    statusEl.title = mode === 'live' ? `Live data from ${sourceName}` : mode === 'demo' ? 'Simulated traffic, not real flights' : mode === 'offline' ? 'Live flight data is not reachable yet' : 'Looking for aircraft';
  }

  // ---------------------------------------------------------------- offline + relay
  const offlineEl = $('#offline');
  function showOffline() {
    const hasRelay = !!relayBase();
    $('#offlineTitle').textContent = hasRelay ? 'Your relay isn\u2019t answering' : 'Connect live flights';
    offlineEl.querySelector('p').textContent = hasRelay
      ? `The tank can't reach live flights through ${relayBase()}. Check the link in the menu, or open it in your browser to see whether the relay is running. The tank keeps retrying.`
      : 'The flight trackers this tank reads from don\u2019t allow web pages to fetch their data directly, so your browser needs a small relay in between. It\u2019s free, takes about two minutes, and you only set it up once.';
    offlineEl.hidden = false;
  }
  function hideOffline() { offlineEl.hidden = true; }
  $('#demoBtn').addEventListener('click', () => {
    hideOffline();
    demoWanted = true;
    setMode('demo');
    sourceName = 'Demo';
    ingest(demoPlanes(), true);
    toast('These are demo fish, not real flights. Open the menu to connect live data.', 5000);
  });
  $('#haveRelayBtn').addEventListener('click', () => {
    hideOffline();
    openSettings();
    setTimeout(() => $('#relayInput').focus(), 50);
  });
  $('#relayForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#relayInput').value.trim();
    if (v && !/^https:\/\/[^\s/]+/.test(v)) { setText('relayHint', 'The link should start with https:// — copy it from your Cloudflare dashboard.'); return; }
    relayUrl = v || defaultRelay;
    store.set('relay', v);
    setText('relayHint', v ? 'Saved. Connecting through your relay…' : 'Cleared. Using the site default.');
    providerIdx = 0;
    demoWanted = false;
    resetTank();
  });

  let toastTimer = 0, toastAction = null;
  $('#toast').addEventListener('click', () => { const a = toastAction; $('#toast').hidden = true; if (a) a(); });
  function toast(msg, ms = 4000, action = null, cta = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    toastAction = action;
    el.dataset.cta = cta;
    el.classList.toggle('action', !!action);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------------------------------------------------------------- sound
  let actx = null;
  function unlockAudio() {
    if (!soundOn || actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
  }
  function tone(f0, f1, dur, vol) {
    if (!soundOn || !actx) return;
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function chime() {
    tone(880, 1320, 0.25, 0.08);
    setTimeout(() => tone(1175, 1760, 0.3, 0.06), 140);
  }
  // A slow gliding moan with vibrato and a long echo.
  function whaleSong() {
    if (!soundOn || !actx) return;
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const out = actx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.2, t + 0.5);
    out.gain.setValueAtTime(0.2, t + 3.1);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const delay = actx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = actx.createGain();
    fb.gain.value = 0.45;
    delay.connect(fb).connect(delay);
    lp.connect(out);
    out.connect(actx.destination);
    out.connect(delay);
    delay.connect(actx.destination);
    const o1 = actx.createOscillator(), o2 = actx.createOscillator(), g2 = actx.createGain();
    o1.type = 'sine'; o2.type = 'triangle'; g2.gain.value = 0.25;
    const lfo = actx.createOscillator(), lg = actx.createGain();
    lfo.frequency.value = 5; lg.gain.value = 7;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const pts = [[0, 150], [0.9, 330], [1.5, 220], [2.4, 410], [3.6, 180]];
    o1.frequency.setValueAtTime(pts[0][1], t);
    o2.frequency.setValueAtTime(pts[0][1] * 2, t);
    for (const [dt, f] of pts.slice(1)) {
      o1.frequency.exponentialRampToValueAtTime(f, t + dt);
      o2.frequency.exponentialRampToValueAtTime(f * 2, t + dt);
    }
    o1.connect(lp); o2.connect(g2).connect(lp);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + 3.9); }
    setTimeout(() => { try { delay.disconnect(); fb.disconnect(); } catch { /* already gone */ } }, 9000);
  }
  const pop = () => { tone(380 + Math.random() * 200, 1100, 0.09, 0.12); setTimeout(() => tone(600, 1500, 0.06, 0.06), 60); };
  const blip = (f, d) => tone(f, f * 1.9, d, 0.1);

  // ---------------------------------------------------------------- wake lock
  let wake = null;
  async function requestWake() {
    if (wake || !('wakeLock' in navigator)) return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch { /* not granted */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { lastFrame = performance.now(); poll(); }
  });
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- boot
  resize();
  syncSettings();
  setInterval(updateLight, 60000);
  poll();
  requestAnimationFrame(frame);
  if (firstRun) {
    toast('Every fish is a real aircraft in the sky around you. Tap one to meet it.', 6000);
    locate(false);
  } else if (place.mine) {
    locate(false);
  }
})();
