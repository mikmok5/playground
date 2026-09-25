// Pocket Worm: the app shell. Draws the plate and the brain, wires up the
// tools, the neuron sheet, experiments and the Relay game.

import { World, SEGMENTS, PLATE_RADIUS } from "./worm.js";
import { SENSORS } from "./brain.js";
import { buildGraph, shortestPath, edge } from "./graph.js";
import { describe, transmitter, GROUP_LABEL } from "./neurons.js";
import DATA from "./connectome.json";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("pocketworm." + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("pocketworm." + k, JSON.stringify(v));
    } catch {}
  },
};

const COLORS = {
  sensory: "#e7b76c",
  inter: "#8fb8ff",
  command: "#ffffff",
  motor: "#7fd8be",
  pharynx: "#c49bd6",
};
const WORM_HUES = ["#f3e9d6", "#b9e6ff", "#ffd2e1", "#d9f7c2", "#ffe39a", "#d6ccff"];
const STATE = {
  forward: { word: "Forward", color: "var(--mint)" },
  reverse: { word: "Reversing", color: "var(--coral)" },
  omega: { word: "Omega turn", color: "var(--orchid)" },
};

const world = new World(DATA);
const graph = buildGraph(DATA);
const N = DATA.neurons.length;
const byName = Object.fromEntries(DATA.neurons.map((n, i) => [n.n, i]));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let selected = null; // the worm the HUD and brain show
let tool = "touch";
let view = "plate";
let speed = 1;
let closeUp = true;
let focusNeuron = null; // index shown in the neuron sheet
const ripples = [];

function wormName(w) {
  return `N2 · ${w.label}`;
}

function addWorm(x, y) {
  if (world.worms.length >= 6) {
    toast("The plate holds six worms at most");
    return null;
  }
  const w = world.addWorm(x, y, Math.random() * Math.PI * 2);
  w.label = world.worms.length;
  w.hue = WORM_HUES[(w.label - 1) % WORM_HUES.length];
  w.log("Placed on the plate");
  selectWorm(w);
  return w;
}

function selectWorm(w) {
  selected = w;
  renderChips();
  if (focusNeuron !== null) openNeuron(focusNeuron);
}

function renderChips() {
  const box = $("#wormChips");
  box.innerHTML = "";
  for (const w of world.worms) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (w === selected ? " is-on" : "");
    b.style.setProperty("--c", w.hue);
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", w === selected);
    b.innerHTML = `<i></i>${w.label}`;
    b.onclick = () => selectWorm(w);
    box.appendChild(b);
  }
}

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

// ---------------------------------------------------------------- canvas

function fitCanvas(c) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

// ---------------------------------------------------------------- plate

const plate = $("#plateCanvas");
const cam = { x: 0, y: 0, scale: 60 };
let tracks = null; // offscreen canvas of worm tracks, in world space
const TRACK_RES = 160; // px per mm
let agar = null;

function makeAgar() {
  const size = Math.ceil(PLATE_RADIUS * 2 * 120);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const R = size / 2;
  const grad = g.createRadialGradient(R * 0.8, R * 0.7, R * 0.1, R, R, R);
  grad.addColorStop(0, "#1a2c32");
  grad.addColorStop(0.75, "#13232a");
  grad.addColorStop(1, "#0e1a1f");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  // Specks and tiny bubbles in the agar.
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.98;
    g.fillStyle = `rgba(220,230,235,${0.02 + rnd() * 0.05})`;
    g.beginPath();
    g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, 0.5 + rnd() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  // Darkfield rim: light catches the edge of the dish.
  const rim = g.createLinearGradient(0, 0, size, size);
  rim.addColorStop(0, "rgba(201,166,107,0.75)");
  rim.addColorStop(0.5, "rgba(201,166,107,0.12)");
  rim.addColorStop(1, "rgba(201,166,107,0.4)");
  g.strokeStyle = rim;
  g.lineWidth = size * 0.008;
  g.beginPath();
  g.arc(R, R, R - g.lineWidth, 0, Math.PI * 2);
  g.stroke();
  return c;
}

function makeTracks() {
  const size = Math.ceil(PLATE_RADIUS * 2 * TRACK_RES);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function toWorld(px, py, w, h) {
  return { x: (px - w / 2) / cam.scale + cam.x, y: (py - h / 2) / cam.scale + cam.y };
}

function updateCamera(w, h, dt) {
  const fit = (Math.min(w, h - 40) / (PLATE_RADIUS * 2.1)) * 1;
  let tx = 0,
    ty = 0.08,
    ts = fit;
  if (closeUp && selected) {
    const c = selected.pts[Math.floor(SEGMENTS / 2)];
    ts = Math.max(fit * 2.6, Math.min(w, h) / 1.9);
    tx = c.x;
    ty = c.y;
  }
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 3);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.scale += (ts - cam.scale) * k;
}

function drawPlate(dt) {
  const { ctx, w, h } = fitCanvas(plate);
  updateCamera(w, h, dt);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);

  // Plate shadow and agar.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 40;
  ctx.drawImage(agar, -PLATE_RADIUS, -PLATE_RADIUS, PLATE_RADIUS * 2, PLATE_RADIUS * 2);
  ctx.restore();

  // Bacterial lawns: thicker at the rim, as OP50 grows on a real plate.
  for (const f of world.food) {
    const r = f.r * Math.sqrt(f.amount);
    const grow = Math.min(1, (world.time - f.born) / 0.6);
    const rr = r * (0.6 + 0.4 * grow);
    const halo = ctx.createRadialGradient(f.x, f.y, rr * 0.5, f.x, f.y, rr * 3);
    halo.addColorStop(0, "rgba(216,194,122,0.10)");
    halo.addColorStop(1, "rgba(216,194,122,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(f.x, f.y, rr * 3, 0, Math.PI * 2);
    ctx.fill();
    const lawn = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
    lawn.addColorStop(0, "rgba(216,194,122,0.22)");
    lawn.addColorStop(0.8, "rgba(216,194,122,0.30)");
    lawn.addColorStop(1, "rgba(232,212,140,0.55)");
    ctx.fillStyle = lawn;
    ctx.beginPath();
    ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tracks left in the agar.
  ctx.globalAlpha = 0.55;
  ctx.drawImage(tracks, -PLATE_RADIUS, -PLATE_RADIUS, PLATE_RADIUS * 2, PLATE_RADIUS * 2);
  ctx.globalAlpha = 1;

  for (const worm of world.worms) drawWorm(ctx, worm);

  // Touch ripples.
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    if (r.t > 0.7) {
      ripples.splice(i, 1);
      continue;
    }
    const k = r.t / 0.7;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 0.03 + k * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Scale bar: 250 µm.
  const bar = 0.25 * cam.scale;
  const bx = 16,
    by = h - 150;
  ctx.strokeStyle = "rgba(233,238,240,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + bar, by);
  ctx.moveTo(bx, by - 4);
  ctx.lineTo(bx, by + 4);
  ctx.moveTo(bx + bar, by - 4);
  ctx.lineTo(bx + bar, by + 4);
  ctx.stroke();
  ctx.fillStyle = "rgba(233,238,240,0.7)";
  ctx.font = "500 10.5px 'IBM Plex Mono', monospace";
  ctx.fillText("250 µm", bx, by - 8);
  ctx.textAlign = "right";
  ctx.fillText(`t ${formatTime(world.time)} · 20 °C`, w - 16, by - 8);
  ctx.textAlign = "left";
}

function stampTracks() {
  const g = tracks.getContext("2d");
  const o = PLATE_RADIUS * TRACK_RES;
  // Old tracks fade slowly.
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "rgba(0,0,0,0.004)";
  g.fillRect(0, 0, tracks.width, tracks.height);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(160,185,190,0.09)";
  for (const w of world.worms) {
    for (const i of [0, SEGMENTS - 1]) {
      const p = w.pts[i];
      g.beginPath();
      g.arc(o + p.x * TRACK_RES, o + p.y * TRACK_RES, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// Body half-width along the body, in mm (s = 0 nose, 1 tail).
function bodyWidth(s) {
  const head = Math.min(1, s / 0.07);
  const tail = Math.min(1, (1 - s) / 0.28);
  return 0.034 * Math.sqrt(head) * (0.35 + 0.65 * Math.sqrt(tail)) + 0.002;
}

function drawWorm(ctx, worm) {
  const pts = worm.pts;
  const n = pts.length;
  const left = [],
    right = [],
    norm = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x,
      dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L;
    dy /= L;
    const nx = -dy,
      ny = dx;
    norm.push({ nx, ny, dx, dy });
    const wdt = bodyWidth(i / (n - 1));
    left.push({ x: pts[i].x + nx * wdt, y: pts[i].y + ny * wdt });
    right.push({ x: pts[i].x - nx * wdt, y: pts[i].y - ny * wdt });
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) {
      const p = left[i - 1],
        q = left[i];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
    for (let i = n - 1; i > 0; i--) {
      const p = right[i],
        q = right[i - 1];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    // Rounded nose.
    const h = pts[0],
      nm = norm[0],
      rw = bodyWidth(0.02);
    ctx.quadraticCurveTo(h.x - nm.dx * rw * 1.6, h.y - nm.dy * rw * 1.6, left[0].x, left[0].y);
    ctx.closePath();
  };

  const isSel = worm === selected;
  // Soft glow under the body, tinted by what the worm is doing.
  ctx.save();
  ctx.shadowColor = worm.state === "forward" ? "rgba(127,216,190,0.45)" : worm.state === "reverse" ? "rgba(255,127,102,0.6)" : "rgba(212,155,255,0.6)";
  ctx.shadowBlur = (isSel ? 18 : 10) * (cam.scale / 120);
  outline();
  ctx.fillStyle = worm.hue;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();

  // Translucent cuticle with a darker gut down the middle.
  ctx.save();
  outline();
  ctx.clip();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(90,80,70,0.35)";
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  for (let i = 3; i < n - 3; i++) {
    const p = pts[i];
    i === 3 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // Pharynx: a corpus and a terminal bulb near the head.
  for (const [idx, rad] of [
    [1, 0.013],
    [2.4, 0.017],
  ]) {
    const i0 = Math.floor(idx),
      f = idx - i0;
    const x = pts[i0].x + (pts[i0 + 1].x - pts[i0].x) * f;
    const y = pts[i0].y + (pts[i0 + 1].y - pts[i0].y) * f;
    ctx.fillStyle = "rgba(120,100,85,0.45)";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body-wall muscles, lit by the motor neurons that drive them.
  for (let row = 0; row < SEGMENTS; row++) {
    const i = Math.min(n - 1, row);
    const nm = norm[i];
    const off = bodyWidth(i / (n - 1)) * 0.72;
    for (const side of [0, 1]) {
      const a = worm.muscle[row * 2 + side];
      if (a < 0.05) continue;
      const sgn = side === 0 ? 1 : -1;
      ctx.fillStyle = `rgba(255,158,94,${Math.min(0.85, a * 0.9)})`;
      ctx.beginPath();
      ctx.arc(pts[i].x + nm.nx * off * sgn, pts[i].y + nm.ny * off * sgn, 0.009, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Nerve ring glow: mean activity of the head's neurons.
  const r = worm.brain.r;
  let act = 0;
  for (let i = 0; i < N; i++) act += r[i];
  act /= N;
  const ring = pts[2];
  const glow = ctx.createRadialGradient(ring.x, ring.y, 0, ring.x, ring.y, 0.08);
  glow.addColorStop(0, `rgba(255,158,94,${Math.min(0.9, 0.15 + act * 3)})`);
  glow.addColorStop(1, "rgba(255,158,94,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Selection mark and label.
  if (isSel && world.worms.length > 1) {
    const m = pts[Math.floor(n / 2)];
    ctx.fillStyle = "rgba(233,238,240,0.75)";
    ctx.font = `500 ${11 / cam.scale}px 'IBM Plex Mono', monospace`;
    ctx.fillText(wormName(worm), m.x + 0.06, m.y - 0.06);
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60),
    s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Plate input: tap to touch, drop food or add a worm; drag to pan.
(() => {
  let down = null;
  plate.addEventListener("pointerdown", (e) => {
    plate.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  });
  plate.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 8) down.moved = true;
    if (down.moved && !closeUp) {
      cam.x = down.cx - dx / cam.scale;
      cam.y = down.cy - dy / cam.scale;
    }
  });
  plate.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = down.moved;
    down = null;
    if (moved) return;
    const rect = plate.getBoundingClientRect();
    const p = toWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    onPlateTap(p);
  });
})();

function onPlateTap(p) {
  const onPlate = Math.hypot(p.x, p.y) < PLATE_RADIUS - 0.05;
  if (tool === "food") {
    if (!onPlate) return;
    world.addFood(p.x, p.y);
    ripples.push({ x: p.x, y: p.y, t: 0, color: "#d8c27a" });
    hideHint();
    return;
  }
  if (tool === "worm") {
    if (!onPlate) return;
    addWorm(p.x, p.y);
    ripples.push({ x: p.x, y: p.y, t: 0, color: "#e9eef0" });
    return;
  }
  // Eyelash: touch the nearest worm within reach.
  const reach = Math.max(0.09, 26 / cam.scale);
  let best = null;
  for (const w of world.worms) {
    const hit = w.nearest(p.x, p.y);
    if (hit.d < reach && (!best || hit.d < best.hit.d)) best = { w, hit };
  }
  ripples.push({ x: p.x, y: p.y, t: 0, color: best ? "#ff9e5e" : "rgba(233,238,240,0.5)" });
  if (!best) return;
  if (best.w !== selected) selectWorm(best.w);
  best.w.touch(best.hit.s);
  if (navigator.vibrate) navigator.vibrate(12);
  hideHint();
}

function hideHint() {
  $("#plateHint").style.opacity = 0;
}

// ---------------------------------------------------------------- HUD

const barcode = $("#barcode");
// Order neurons for the barcode: sensory → inter → command → motor.
const ORDER = ["sensory", "inter", "command", "motor", "pharynx"];
const barOrder = [...DATA.neurons.keys()].sort(
  (a, b) => ORDER.indexOf(DATA.neurons[a].g) - ORDER.indexOf(DATA.neurons[b].g) || DATA.neurons[a].n.localeCompare(DATA.neurons[b].n),
);

function drawHud() {
  const w = selected;
  if (!w) return;
  const st = STATE[w.state];
  const word = $("#stateWord");
  if (word.textContent !== st.word) word.textContent = st.word;
  word.style.setProperty("--state", st.color);
  $("#stateWorm").textContent = `${wormName(w)} · ${(w.distance).toFixed(1)} mm crawled`;
  const cuts = N - w.brain.alive.reduce((a, b) => a + b, 0);
  const cut = $("#stateCut");
  cut.hidden = !cuts;
  cut.textContent = `${cuts} cut`;
  $("#fwdBar").style.width = `${Math.min(100, w.drive.forward * 100)}%`;
  $("#revBar").style.width = `${Math.min(100, w.drive.reverse * 100)}%`;

  const { ctx, w: bw, h: bh } = fitCanvas(barcode);
  const cw = bw / N;
  ctx.clearRect(0, 0, bw, bh);
  for (let k = 0; k < N; k++) {
    const i = barOrder[k];
    const a = w.brain.r[i];
    if (!w.brain.alive[i]) {
      ctx.fillStyle = "rgba(255,127,102,0.5)";
      ctx.fillRect(k * cw, bh - 2, Math.max(1, cw), 2);
      continue;
    }
    ctx.fillStyle = `rgba(255,158,94,${0.06 + Math.min(1, Math.sqrt(a)) * 0.94})`;
    ctx.fillRect(k * cw, 0, Math.max(0.6, cw - 0.3), bh);
  }

  const ev = $("#events");
  const key = w.id + ":" + w.events.length + ":" + (w.events.at(-1)?.t ?? 0);
  if (ev.dataset.key !== key) {
    ev.dataset.key = key;
    ev.innerHTML = w.events
      .slice(-3)
      .map((e) => `<li><time>${formatTime(e.t)}</time><span>${e.text}</span></li>`)
      .join("");
  }
}

// ---------------------------------------------------------------- brain

// Neurons are laid out in bands, sensory at the top down to motor at the
// bottom, so activity reads as flowing down the page.
function layoutBrain(w, h, top, bottom) {
  const bands = ORDER.map((g) => ({
    g,
    ids: [...DATA.neurons.keys()].filter((i) => DATA.neurons[i].g === g).sort((a, b) => DATA.neurons[a].n.localeCompare(DATA.neurons[b].n, "en", { numeric: true })),
  }));
  const pos = new Array(N);
  const padX = 16;
  const usable = w - padX * 2;
  const cols = Math.max(12, Math.floor(usable / 16));
  const rowsOf = (b) => (b.g === "command" ? 1 : Math.ceil(b.ids.length / cols));
  const totalRows = bands.reduce((s, b) => s + rowsOf(b), 0);
  const gap = 22;
  const rowH = Math.min(26, (bottom - top - gap * (bands.length - 1) - 12) / totalRows);
  const totalH = totalRows * rowH + gap * (bands.length - 1) + 12;
  let y = top + Math.max(0, (bottom - top - totalH) / 2);
  const labels = [];
  for (const b of bands) {
    const c = b.g === "command" ? b.ids.length : cols;
    const rows = rowsOf(b);
    labels.push({ g: b.g, y: y - 8 });
    b.ids.forEach((id, k) => {
      const row = Math.floor(k / c),
        col = k % c;
      const inRow = row === rows - 1 ? b.ids.length - row * c : c;
      const step = usable / c;
      const x0 = padX + (usable - step * inRow) / 2 + step / 2;
      pos[id] = { x: x0 + col * step, y: y + row * rowH + rowH / 2 };
    });
    // Command cells carry their names underneath, so leave room.
    y += rows * rowH + gap + (b.g === "command" ? 12 : 0);
  }
  return { pos, labels, rowH };
}

class BrainView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.layout = null;
    this.size = "";
    this.highlight = null; // array of neuron indices forming a path
    this.target = null; // a neuron to ring, for the Relay goal
    this.pressed = null;
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointercancel", () => (this.pressed = null));
  }
  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    let best = -1,
      bd = 22 * 22;
    this.layout.pos.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }
  onDown(e) {
    if (!this.layout) return;
    this.pressed = this.hit(e);
  }
  onUp(e) {
    if (!this.layout || this.pressed === null) return;
    const i = this.hit(e);
    if (i >= 0 && i === this.pressed) this.opts.onTap?.(i);
    this.pressed = null;
  }
  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    const key = `${w}x${h}`;
    if (key !== this.size) {
      this.size = key;
      const top = this.opts.top ?? 56;
      const bottom = h - (this.opts.bottom ?? 40);
      this.layout = layoutBrain(w, h, top, bottom);
    }
    const { pos, labels, rowH } = this.layout;
    const brain = selected?.brain;
    ctx.clearRect(0, 0, w, h);
    if (!brain) return;
    const r = brain.r,
      alive = brain.alive;
    const hl = this.highlight ? new Set(this.highlight) : null;

    ctx.font = "600 9.5px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = "rgba(140,155,163,0.8)";
    for (const l of labels) ctx.fillText(GROUP_LABEL[l.g].toUpperCase(), 16, l.y);

    // Live synapses: only the ones carrying signal right now.
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    const { pre, post, flow } = brain;
    const focus = this.opts.focus?.();
    for (let k = 0; k < pre.length; k++) {
      const f = flow[k];
      const a = pre[k],
        b = post[k];
      const isFocus = focus !== null && focus !== undefined && (a === focus || b === focus);
      if (!isFocus && Math.abs(f) < 0.03) continue;
      if (hl && !isFocus) continue;
      const alpha = isFocus ? 0.25 + Math.min(0.6, Math.abs(f) * 3) : Math.min(0.5, Math.abs(f) * 2.2);
      ctx.strokeStyle = f >= 0 || (isFocus && brain.w[k] > 0) ? `rgba(255,158,94,${alpha})` : `rgba(154,140,255,${alpha})`;
      const p = pos[a],
        q = pos[b];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12,
        my = (p.y + q.y) / 2 - (q.x - p.x) * 0.12;
      ctx.quadraticCurveTo(mx, my, q.x, q.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    // Path highlight for Relay.
    if (this.target !== null && this.target !== undefined) {
      const p = pos[this.target];
      ctx.strokeStyle = "rgba(127,216,190,0.9)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (hl && this.highlight.length > 1) {
      ctx.strokeStyle = "rgba(127,216,190,0.95)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(127,216,190,0.8)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      this.highlight.forEach((i, k) => (k ? ctx.lineTo(pos[i].x, pos[i].y) : ctx.moveTo(pos[i].x, pos[i].y)));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const rad = Math.max(2.4, Math.min(5, rowH * 0.24));
    for (let i = 0; i < N; i++) {
      const p = pos[i];
      const g = DATA.neurons[i].g;
      const big = g === "command";
      const rr = big ? rad * 1.7 : rad;
      if (!alive[i]) {
        ctx.strokeStyle = "rgba(255,127,102,0.8)";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(p.x - rr, p.y - rr);
        ctx.lineTo(p.x + rr, p.y + rr);
        ctx.moveTo(p.x + rr, p.y - rr);
        ctx.lineTo(p.x - rr, p.y + rr);
        ctx.stroke();
        continue;
      }
      // Display gain: resting activity is small, so show it on a sqrt scale.
      const a = Math.min(1, Math.sqrt(r[i]) * 1.15);
      const dim = hl && !hl.has(i) ? 0.25 : 1;
      if (a > 0.15 && !reduceMotion) {
        const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 4);
        gl.addColorStop(0, `rgba(255,158,94,${0.55 * a * dim})`);
        gl.addColorStop(1, "rgba(255,158,94,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = (0.35 + 0.65 * a) * dim;
      ctx.fillStyle = a > 0.5 ? mix(COLORS[g], "#ffd2b0", a - 0.5) : COLORS[g];
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hl?.has(i) || i === focus) {
        ctx.strokeStyle = i === focus ? "#ffffff" : "rgba(127,216,190,1)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Labels for command cells, the focus and the path.
    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    const label = (i, color, below) => {
      const p = pos[i];
      ctx.fillStyle = color;
      ctx.fillText(DATA.neurons[i].n, p.x, below ? p.y + rad * 2.2 + 11 : p.y - rad * 2.2 - 2);
    };
    for (let i = 0; i < N; i++) if (DATA.neurons[i].g === "command" && !hl) label(i, "rgba(233,238,240,0.8)", true);
    if (hl) this.highlight.forEach((i) => label(i, "#7fd8be"));
    if (this.target !== null && this.target !== undefined) label(this.target, "#7fd8be");
    if (focus !== null && focus !== undefined) label(focus, "#ffffff");
    ctx.textAlign = "left";
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * Math.min(1, t * 2));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

const brainView = new BrainView($("#brainCanvas"), {
  top: 60,
  bottom: 96,
  onTap: (i) => openNeuron(i),
  focus: () => focusNeuron,
});
const relayView = new BrainView($("#relayCanvas"), {
  top: 22,
  bottom: 8,
  onTap: (i) => relayTap(i),
  focus: () => null,
});

// ---------------------------------------------------------------- sheet

const history = { idx: null, data: [] };

function openSheet(html) {
  $("#sheetBody").innerHTML = html + '<button type="button" class="sheet-close" aria-label="Close">×</button>';
  $("#sheetBody .sheet-close").onclick = closeSheet;
  $("#sheet").hidden = false;
  $("#scrim").hidden = false;
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#scrim").hidden = true;
  focusNeuron = null;
  holdStim = null;
}
$("#scrim").addEventListener("click", closeSheet);

let holdStim = null;

function openNeuron(i) {
  focusNeuron = i;
  if (history.idx !== i) history.data = [];
  history.idx = i;
  const n = DATA.neurons[i];
  const w = selected;
  const alive = w.brain.alive[i];
  const outs = graph[i].slice(0, 10);
  const ins = [];
  for (let j = 0; j < N; j++) {
    const e = graph[j].find((x) => x.to === i);
    if (e) ins.push({ from: j, ...e });
  }
  ins.sort((a, b) => b.chem + b.gap - (a.chem + a.gap));
  const chip = (j, e) =>
    `<button type="button" class="choice g-${DATA.neurons[j].g}" data-jump="${j}">${DATA.neurons[j].n}<small>${e.chem ? e.chem + " syn" : ""}${e.chem && e.gap ? " · " : ""}${e.gap ? e.gap + " gap" : ""}</small></button>`;
  openSheet(`
    <div class="n-head">
      <span class="n-name">${n.n}</span>
      <span class="n-group" style="--c:${COLORS[n.g]}">${GROUP_LABEL[n.g]}</span>
      ${alive ? "" : '<span class="n-dead">Cut</span>'}
    </div>
    <p class="n-desc">${describe(n)}</p>
    <dl class="n-facts">
      <dt>Transmitter</dt><dd>${transmitter(n)}</dd>
      ${n.f ? `<dt>Senses</dt><dd>${n.f}</dd>` : ""}
      <dt>Outputs</dt><dd>${graph[i].length} partners</dd>
      <dt>Inputs</dt><dd>${ins.length} partners</dd>
      <dt>Activity</dt><dd id="nAct">0.00</dd>
    </dl>
    <canvas class="spark" id="spark" aria-label="Activity over the last ten seconds"></canvas>
    <div class="n-actions">
      <button type="button" class="pill-btn strong" id="nStim" ${alive ? "" : "disabled"}>Hold to stimulate</button>
      <button type="button" class="pill-btn ${alive ? "danger" : ""}" id="nCut">${alive ? "Cut this neuron" : "Restore neuron"}</button>
      <button type="button" class="pill-btn" id="nRoute">Route from here</button>
    </div>
    <div class="n-partners">
      <h3>Sends to</h3><div class="choices">${outs.map((e) => chip(e.to, e)).join("") || '<span class="small">No outputs in this dataset.</span>'}</div>
      <h3>Hears from</h3><div class="choices">${ins.slice(0, 10).map((e) => chip(e.from, e)).join("") || '<span class="small">No inputs in this dataset.</span>'}</div>
    </div>`);
  const stim = $("#nStim");
  const start = (e) => {
    e.preventDefault();
    holdStim = n.n;
  };
  const stop = () => (holdStim = null);
  stim.addEventListener("pointerdown", start);
  stim.addEventListener("pointerup", stop);
  stim.addEventListener("pointerleave", stop);
  stim.addEventListener("pointercancel", stop);
  $("#nCut").onclick = () => {
    selected.brain.setAlive(n.n, !alive);
    toast(alive ? `${n.n} cut from ${wormName(selected)}` : `${n.n} restored`);
    openNeuron(i);
  };
  $("#nRoute").onclick = () => {
    closeSheet();
    $("#finderFrom").value = n.n;
    setView("relay");
    setRelayMode("finder");
    runFinder();
  };
  $$("#sheetBody [data-jump]").forEach((b) => (b.onclick = () => openNeuron(+b.dataset.jump)));
}

function drawSheet() {
  if (focusNeuron === null || $("#sheet").hidden) return;
  const act = $("#nAct");
  if (!act) return;
  const a = selected.brain.r[focusNeuron];
  act.textContent = a.toFixed(2);
  history.data.push(a);
  if (history.data.length > 600) history.data.shift();
  const c = $("#spark");
  const { ctx, w, h } = fitCanvas(c);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(233,238,240,0.08)";
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
  const d = history.data;
  if (d.length < 2) return;
  const x = (k) => w - (d.length - 1 - k) * (w / 600);
  const y = (v) => h - 2 - v * (h - 6);
  ctx.beginPath();
  d.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
  ctx.strokeStyle = "#ff9e5e";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(x(d.length - 1), h);
  ctx.lineTo(x(0), h);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,158,94,0.12)";
  ctx.fill();
  ctx.fillStyle = "#ff9e5e";
  ctx.beginPath();
  ctx.arc(x(d.length - 1), y(d.at(-1)), 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- experiments

const EXPERIMENTS = [
  {
    id: "reverse",
    title: "No reverse gear",
    cut: ["AVAL", "AVAR", "AVDL", "AVDR", "AVEL", "AVER"],
    text: "Cut the reverse command cells. A nose touch can no longer make the worm back up. It pushes forward instead.",
    after: "Now tap its nose with the eyelash.",
  },
  {
    id: "touch",
    title: "Numb body",
    cut: ["ALML", "ALMR", "AVM", "PLML", "PLMR", "PVM"],
    text: "Cut the six gentle-touch receptors, the cells Martin Chalfie's screens were built on. Stroke the body and tail: nothing happens.",
    after: "Stroke the middle of the body.",
  },
  {
    id: "smell",
    title: "Lost the scent",
    cut: ["AIBL", "AIBR"],
    text: "Cut AIB, the interneuron that turns the worm around when food smell fades. It can still crawl, but it stops turning back toward food.",
    after: "Drop bacteria nearby and watch.",
  },
  {
    id: "tail",
    title: "No tail relay",
    cut: ["PVCL", "PVCR"],
    text: "Cut PVC, which carries tail touch to the forward circuit. A tail touch no longer gives the worm a burst of speed.",
    after: "Touch the tail.",
  },
];

function openLab() {
  const w = selected;
  const cuts = [];
  w.brain.alive.forEach((a, i) => !a && cuts.push(DATA.neurons[i].n));
  openSheet(`
    <div class="lab">
      <h2>Ablation lab</h2>
      <p>Biologists learned what these cells do by killing them one at a time with a laser and watching the worm. Try it on ${wormName(w)}.</p>
      ${EXPERIMENTS.map(
        (x) => `
        <div class="exp">
          <strong>${x.title}</strong>
          <button type="button" class="pill-btn strong" data-exp="${x.id}">Run</button>
          <p>${x.text}<br><code>${x.cut.join(" ")}</code></p>
        </div>`,
      ).join("")}
      <div class="exp">
        <strong>${cuts.length ? `${cuts.length} neuron${cuts.length > 1 ? "s" : ""} cut` : "Nothing cut yet"}</strong>
        <button type="button" class="pill-btn" id="healAll" ${cuts.length ? "" : "disabled"}>Restore all</button>
        ${cuts.length ? `<p><code>${cuts.join(" ")}</code></p>` : ""}
      </div>
    </div>`);
  $$("[data-exp]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = EXPERIMENTS.find((e) => e.id === b.dataset.exp);
        x.cut.forEach((n) => selected.brain.setAlive(n, false));
        closeSheet();
        setView("plate");
        tool = "touch";
        syncTools();
        toast(x.after);
      }),
  );
  const heal = $("#healAll");
  if (heal)
    heal.onclick = () => {
      DATA.neurons.forEach((n) => selected.brain.setAlive(n.n, true));
      toast(`${wormName(selected)} restored`);
      openLab();
    };
}

// ---------------------------------------------------------------- relay

const STARTS = ["ASHL", "ALMR", "PLML", "AWCL", "AWAR", "FLPL", "ASEL", "AFDR", "URXL", "PHAL", "CEPDL", "OLQDR", "BAGL", "ADLR"];
const TARGETS = ["AVAL", "AVBR", "VB5", "DA3", "RIML", "SMDVL", "HSNL", "VD7", "RMDDR", "DB4", "AS6", "PVCR", "RIS"];
const game = { from: 0, to: 0, chain: [], best: null, done: false, revealed: false };
let relayMode = "game";

function newRound() {
  for (let tries = 0; tries < 50; tries++) {
    const from = byName[STARTS[(Math.random() * STARTS.length) | 0]];
    const to = byName[TARGETS[(Math.random() * TARGETS.length) | 0]];
    const best = shortestPath(graph, from, to);
    if (best && best.length >= 3) {
      Object.assign(game, { from, to, chain: [from], best, done: false, revealed: false });
      break;
    }
  }
  renderGame();
}

function relayTap(i) {
  if (relayMode !== "game" || game.done) return;
  const last = game.chain.at(-1);
  if (edge(graph, last, i)) extend(i);
  else toast(`${DATA.neurons[last].n} isn't wired to ${DATA.neurons[i].n}`);
}

function extend(i) {
  game.chain.push(i);
  selected?.brain.stimulate([DATA.neurons[i].n], 0.8);
  if (i === game.to) {
    game.done = true;
    const hops = game.chain.length - 1,
      best = game.best.length - 1;
    const stats = store.get("relay", { played: 0, perfect: 0 });
    stats.played++;
    if (hops === best && !game.revealed) stats.perfect++;
    store.set("relay", stats);
  }
  renderGame();
}

function linkLabel(a, b) {
  const e = edge(graph, a, b);
  if (!e) return "";
  const parts = [];
  if (e.chem) parts.push(`${e.chem} syn`);
  if (e.gap) parts.push(`${e.gap} gap`);
  return `<span class="link">→<b>${parts.join(" ")}</b></span>`;
}

function chainHtml(chain) {
  return chain.map((i, k) => (k ? linkLabel(chain[k - 1], i) : "") + `<span class="hop">${DATA.neurons[i].n}</span>`).join("");
}

function renderGame() {
  const nm = (i) => DATA.neurons[i].n;
  $("#gameFrom").textContent = nm(game.from);
  $("#gameTo").textContent = nm(game.to);
  $("#gameMeta").textContent = `Best route: ${game.best.length - 1} hops`;
  $("#gameChain").innerHTML = chainHtml(game.chain);
  const hops = game.chain.length - 1;
  const bestHops = game.best.length - 1;
  const choices = $("#gameChoices");
  if (game.done) {
    const stars = game.revealed ? 0 : hops === bestHops ? 3 : hops === bestHops + 1 ? 2 : 1;
    const msg = game.revealed ? "Route shown" : hops === bestHops ? "Perfect relay" : hops === bestHops + 1 ? "Nearly perfect" : "Signal delivered";
    choices.innerHTML = `<div class="win"><strong>${msg}</strong><span class="small">${hops} hops · best is ${bestHops}. ${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span></div>`;
    $("#gameCopy").textContent = `Shortest route: ${game.best.map(nm).join(" → ")}.`;
  } else {
    const last = game.chain.at(-1);
    const hot = new Set();
    // Partners that are still on some shortest route get a soft hint once
    // the player is two moves in.
    const opts = graph[last].slice(0, 24);
    if (hops >= 2) {
      const rest = shortestPath(graph, last, game.to);
      if (rest) hot.add(rest[1]);
    }
    choices.innerHTML = opts
      .map(
        (e) =>
          `<button type="button" class="choice g-${DATA.neurons[e.to].g}${hot.has(e.to) ? " hot" : ""}" data-next="${e.to}">${nm(e.to)}<small>${e.chem ? e.chem + " syn" : ""}${e.chem && e.gap ? " · " : ""}${e.gap ? e.gap + " gap" : ""}</small></button>`,
      )
      .join("");
    $$("#gameChoices [data-next]").forEach((b) => (b.onclick = () => extend(+b.dataset.next)));
    $("#gameCopy").textContent =
      hops === 0
        ? `Start at ${nm(game.from)} and pass the signal along until it reaches ${nm(game.to)}. Choices are ${nm(last)}'s partners, strongest first. You can also tap cells in the map.`
        : `At ${nm(last)}. Pick where the signal goes next.`;
  }
  $("#gameUndo").disabled = game.chain.length < 2 || game.done;
  $("#gameReveal").disabled = game.done;
  relayView.highlight = game.chain;
  relayView.target = game.to;
  const stats = store.get("relay", { played: 0, perfect: 0 });
  $("#gameScore").textContent = stats.played ? `${stats.played} relays finished · ${stats.perfect} perfect` : "";
}

$("#gameUndo").onclick = () => {
  if (game.chain.length > 1) game.chain.pop();
  renderGame();
};
$("#gameReveal").onclick = () => {
  game.revealed = true;
  game.chain = game.best.slice();
  game.done = true;
  renderGame();
};
$("#gameNext").onclick = newRound;

function runFinder() {
  const a = byName[$("#finderFrom").value.trim().toUpperCase()];
  const b = byName[$("#finderTo").value.trim().toUpperCase()];
  const copy = $("#finderCopy");
  if (a === undefined || b === undefined) {
    $("#finderChain").innerHTML = "";
    copy.textContent = "Type two neuron names, like PLML and VB5.";
    relayView.highlight = null;
    return;
  }
  const path = shortestPath(graph, a, b, selected?.brain.alive);
  if (!path) {
    $("#finderChain").innerHTML = "";
    copy.textContent = `No route from ${DATA.neurons[a].n} to ${DATA.neurons[b].n} in ${selected ? wormName(selected) : "this worm"}. Cut neurons are skipped.`;
    relayView.highlight = [a, b];
    return;
  }
  $("#finderChain").innerHTML = chainHtml(path);
  copy.textContent = `${path.length - 1} hop${path.length === 2 ? "" : "s"}. Routes use chemical synapses in their direction and gap junctions either way, and prefer stronger links when routes tie. Cut neurons are skipped.`;
  relayView.highlight = path;
}
["#finderFrom", "#finderTo"].forEach((s) => $(s).addEventListener("input", runFinder));

function setRelayMode(m) {
  relayMode = m;
  $$("[data-relay]").forEach((b) => b.classList.toggle("is-on", b.dataset.relay === m));
  $("#relayGame").hidden = m !== "game";
  relayView.target = null;
  $("#relayFinder").hidden = m !== "finder";
  if (m === "game") renderGame();
  else runFinder();
}
$$("[data-relay]").forEach((b) => (b.onclick = () => setRelayMode(b.dataset.relay)));

// ---------------------------------------------------------------- chrome

function setView(v) {
  view = v;
  $("#app").dataset.view = v;
  for (const s of ["plate", "brain", "relay", "about"]) $(`#view-${s}`).hidden = s !== v;
  $$(".tab").forEach((t) => {
    t.classList.toggle("is-on", t.dataset.view === v);
    t.setAttribute("aria-current", t.dataset.view === v ? "page" : "false");
  });
  if (v !== "brain") closeSheet();
  store.set("view", v);
}
$$(".tab").forEach((t) => (t.onclick = () => setView(t.dataset.view)));

function syncTools() {
  $$(".tool").forEach((t) => t.classList.toggle("is-on", t.dataset.tool === tool));
  const hint = {
    touch: "Stroke the worm with the eyelash. Tap its nose, its middle, or its tail.",
    food: "Tap the plate to drop a spot of bacteria. Worms smell it from a distance.",
    worm: "Tap the plate to put down another worm.",
  }[tool];
  const h = $("#plateHint");
  h.textContent = hint;
  h.style.opacity = 1;
}
$$(".tool").forEach(
  (t) =>
    (t.onclick = () => {
      tool = t.dataset.tool;
      syncTools();
      if (tool !== "touch") closeUp = false;
      syncZoom();
    }),
);

function syncZoom() {
  $("#zoomBtn").textContent = closeUp ? "Whole plate" : "Follow worm";
}
$("#zoomBtn").onclick = () => {
  closeUp = !closeUp;
  syncZoom();
};

const SPEEDS = [1, 2, 4];
$("#speedBtn").onclick = () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  $("#speedBtn").textContent = `${speed}×`;
  toast(speed === 1 ? "Real time" : `${speed}× faster than real time`);
};

$("#labBtn").onclick = openLab;
const POKES = {
  nose: () => selected.touch(0),
  tail: () => selected.touch(1),
  fade: () => {
    selected.brain.stimulate(SENSORS.foodDown, 1);
    selected.log("Food smell faded");
  },
};
$$("[data-poke]").forEach(
  (b) =>
    (b.onclick = () => {
      POKES[b.dataset.poke]();
      if (navigator.vibrate) navigator.vibrate(10);
    }),
);
$("#findInput").addEventListener("change", (e) => {
  const i = byName[e.target.value.trim().toUpperCase()];
  if (i !== undefined) {
    openNeuron(i);
    e.target.value = "";
    e.target.blur();
  }
});

// Legend and search list.
$("#legend").innerHTML =
  ORDER.map((g) => `<span><i style="--c:${COLORS[g]}"></i>${GROUP_LABEL[g]}</span>`).join("") +
  '<span><i class="syn" style="--c:#ff9e5e"></i>Excites</span><span><i class="syn" style="--c:#9a8cff"></i>Inhibits</span>';
$("#neuronList").innerHTML = DATA.neurons.map((n) => `<option value="${n.n}"></option>`).join("");
$("#aboutCounts").textContent = `${N} neurons`;

// ---------------------------------------------------------------- loop

let last = performance.now();
let stampAcc = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  const simDt = real * speed;
  const steps = simDt > 0 ? Math.max(1, Math.round(simDt / 0.02)) : 0;
  for (let s = 0; s < steps; s++) {
    if (holdStim && selected) selected.brain.stimulate([holdStim], 1);
    world.step(simDt / steps);
  }
  stampAcc += simDt;
  if (stampAcc > 0.05) {
    stampTracks();
    stampAcc = 0;
  }
  if (view === "plate") {
    drawPlate(real);
    drawHud();
  } else if (view === "brain") {
    brainView.draw();
    drawSheet();
  } else if (view === "relay") {
    relayView.draw();
  }
  requestAnimationFrame(frame);
}

function start() {
  agar = makeAgar();
  tracks = makeTracks();
  // Opening scene: one worm, a lawn of bacteria a little way off.
  addWorm(-0.6, 0.35);
  world.addFood(0.9, -0.5, 0.34).born = -10;
  syncTools();
  syncZoom();
  newRound();
  setView(store.get("view", "plate"));
  // Warm up the brain so the first frame shows a worm already moving.
  for (let i = 0; i < 60; i++) world.step(0.02);
  requestAnimationFrame(frame);
}

start();

// Handy in the console while developing.
window.pocketWorm = { world, SENSORS };
