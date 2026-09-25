// The plate, its food, and the worms crawling on it.
//
// Units are millimetres and seconds. An adult C. elegans is about 1 mm long
// and crawls at roughly 0.2 mm/s. The body is a kinematic chain: whichever
// end leads (head going forward, tail in reverse) sweeps side to side and
// the rest of the body follows its track, which is how a worm moves on agar.

import { Brain, SENSORS } from "./brain.js";

export const SEGMENTS = 24; // one per row of body-wall muscles
export const LENGTH = 1.0;
export const PLATE_RADIUS = 2.6;

const SEG = LENGTH / (SEGMENTS - 1);

export class Food {
  constructor(x, y, r = 0.32) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.amount = 1;
    this.born = 0;
  }
  // Odor spreads well past the edge of the lawn.
  smell(x, y) {
    const d2 = (x - this.x) ** 2 + (y - this.y) ** 2;
    const s = this.r * 2.6;
    return this.amount * Math.exp(-d2 / (2 * s * s));
  }
  contains(x, y) {
    return (x - this.x) ** 2 + (y - this.y) ** 2 < this.r * this.r * this.amount;
  }
}

let nextId = 1;

export class Worm {
  constructor(data, world, x = 0, y = 0, heading = Math.random() * Math.PI * 2, rng = Math.random) {
    this.id = nextId++;
    this.world = world;
    this.rng = rng;
    this.brain = new Brain(data, rng);
    this.pts = [];
    for (let i = 0; i < SEGMENTS; i++) {
      this.pts.push({ x: x - Math.cos(heading) * SEG * i, y: y - Math.sin(heading) * SEG * i });
    }
    this.heading = heading; // mean heading of the leading end
    this.phase = 0;
    this.state = "forward";
    this.stateTime = 0;
    this.lastReverse = 0;
    this.turnDir = 1;
    this.smell = 0;
    this.dSmell = 0;
    this.drive = { forward: 0, reverse: 0 };
    this.onFood = false;
    this.eaten = 0;
    this.distance = 0;
    this.events = []; // recent behaviour changes, newest last
    this.muscle = new Float32Array(SEGMENTS * 2); // dorsal, ventral per row
    this.touchCooldown = 0;

    this.nmj = data.nmj.map(([n, m, w]) => {
      const name = data.muscles[m];
      const row = parseInt(name.slice(3), 10) - 1;
      const side = name[1] === "D" ? 0 : 1;
      return [n, row * 2 + side, w];
    });
  }

  get head() {
    return this.pts[0];
  }

  log(text) {
    this.events.push({ t: this.world.time, text });
    if (this.events.length > 6) this.events.shift();
  }

  // Touch the body at fraction s along it (0 = nose, 1 = tail).
  touch(s, strength = 1) {
    if (s < 0.1) this.brain.stimulate(SENSORS.nose, strength);
    if (s < 0.55) this.brain.stimulate(SENSORS.anterior, strength * (s < 0.1 ? 0.6 : 1));
    if (s > 0.45) this.brain.stimulate(SENSORS.posterior, strength);
    this.log(s < 0.1 ? "Nose touched" : s < 0.55 ? "Body touched" : "Tail touched");
  }

  // Closest point on the body to (x, y): distance and fraction along.
  nearest(x, y) {
    let best = Infinity,
      bi = 0;
    this.pts.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best) (best = d), (bi = i);
    });
    return { d: Math.sqrt(best), s: bi / (SEGMENTS - 1) };
  }

  sense(dt) {
    const h = this.head;
    const c = this.world.smell(h.x, h.y);
    const d = (c - this.smell) / dt;
    this.smell = c;
    this.dSmell += (d - this.dSmell) * Math.min(1, dt / 0.4);
    const k = 18;
    if (this.dSmell < -0.004) this.brain.stimulate(SENSORS.foodDown, Math.min(1, -this.dSmell * k));
    if (this.dSmell > 0.004) this.brain.stimulate(SENSORS.foodUp, Math.min(1, this.dSmell * k));

    this.onFood = this.world.food.some((f) => f.contains(h.x, h.y));
    if (this.onFood) this.brain.stimulate(SENSORS.onFood, 0.5);

    // Spontaneous reversals: AIB activity drifts on its own in real worms.
    if (this.rng() < dt / 25) this.brain.stimulate(["AIBL", "AIBR"], 0.9);

    // The plate wall and other worms are felt with the nose.
    this.touchCooldown -= dt;
    if (this.touchCooldown <= 0) {
      const r = Math.hypot(h.x, h.y);
      let bumped = r > PLATE_RADIUS - 0.05 && this.state === "forward";
      for (const o of this.world.worms) {
        if (o === this || bumped) continue;
        if (o.nearest(h.x, h.y).d < 0.045) bumped = true;
      }
      if (bumped) {
        this.brain.stimulate(SENSORS.nose, 0.9);
        this.touchCooldown = 1.5;
      }
    }
  }

  behave(dt) {
    const d = this.brain.drive();
    this.drive = d;
    const net = d.forward - d.reverse;
    this.stateTime += dt;
    if (this.state === "forward" && net < -0.1) {
      this.setState("reverse");
    } else if (this.state === "reverse" && net > -0.03 && this.stateTime > 0.6) {
      // Long reversals usually end in a sharp omega turn.
      if (this.stateTime > 1.2 && this.rng() < 0.7) this.setState("omega");
      else this.setState("forward");
    } else if (this.state === "omega" && this.stateTime > 1.4) {
      this.setState("forward");
    }
  }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
    if (s === "omega") this.turnDir = this.rng() < 0.5 ? -1 : 1;
    this.log({ forward: "Crawling forward", reverse: "Backing up", omega: "Omega turn" }[s]);
  }

  move(dt) {
    const d = this.drive;
    const food = this.onFood ? 0.45 : 1; // dopamine slowing on bacteria
    let speed, amp, freq;
    // Heading swings of about a radian give a track wavelength of ~0.65
    // body lengths and an amplitude of ~0.1 mm, close to a real worm on agar.
    if (this.state === "forward") {
      speed = (0.13 + 0.25 * d.forward) * food;
      amp = 1.0;
      freq = speed / 0.65;
    } else if (this.state === "reverse") {
      speed = 0.2 + 0.2 * d.reverse;
      amp = 0.9;
      freq = speed / 0.6;
    } else {
      speed = 0.12;
      amp = 1.2;
      freq = 0.3;
    }
    this.phase += Math.PI * 2 * freq * dt;

    // Steering. Head neurons that drive the dorsal vs ventral neck muscles
    // bias the heading; during forward crawling the worm also steers up the
    // odor gradient by comparing smell across its head swings (klinotaxis).
    let turn = 0;
    for (let row = 0; row < 4; row++) turn += this.muscle[row * 2] - this.muscle[row * 2 + 1];
    turn *= 0.8;
    if (this.state === "forward") turn += 40 * this.dSmell * Math.sin(this.phase);
    if (this.state === "omega") turn = this.turnDir * 2.6;
    turn += (this.rng() - 0.5) * 0.6;
    this.heading += turn * dt;

    const reverse = this.state === "reverse";
    const pts = reverse ? this.pts.slice().reverse() : this.pts;
    const lead = pts[0];
    const dir = this.heading + (reverse ? Math.PI : 0) + amp * Math.sin(this.phase);
    lead.x += Math.cos(dir) * speed * dt;
    lead.y += Math.sin(dir) * speed * dt;

    // Keep the leading end on the plate.
    const r = Math.hypot(lead.x, lead.y);
    if (r > PLATE_RADIUS - 0.02) {
      lead.x *= (PLATE_RADIUS - 0.02) / r;
      lead.y *= (PLATE_RADIUS - 0.02) / r;
      if (reverse) this.heading += dt * 2;
    }

    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / L) * SEG;
      b.y = a.y + (dy / L) * SEG;
    }
    // Heading tracks where the body actually points so it never drifts away
    // from the leading end during reversals.
    if (reverse) {
      const t = pts[1];
      this.heading = Math.atan2(t.y - lead.y, t.x - lead.x) - amp * Math.sin(this.phase);
    }
    this.distance += speed * dt;
  }

  muscles() {
    const m = this.muscle;
    m.fill(0);
    const r = this.brain.r;
    for (const [n, idx, w] of this.nmj) m[idx] += r[n] * w * 0.25;
    for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i]);
  }

  eat(dt) {
    if (!this.onFood) return;
    const h = this.head;
    for (const f of this.world.food) {
      if (f.contains(h.x, h.y)) {
        f.amount = Math.max(0, f.amount - dt * 0.004);
        this.eaten += dt;
      }
    }
  }

  step(dt) {
    this.sense(dt);
    this.brain.step(dt);
    this.muscles();
    this.behave(dt);
    this.move(dt);
    this.eat(dt);
  }
}

export class World {
  constructor(data, rng = Math.random) {
    this.data = data;
    this.rng = rng;
    this.time = 0;
    this.worms = [];
    this.food = [];
  }
  addWorm(x, y, heading) {
    const w = new Worm(this.data, this, x, y, heading, this.rng);
    this.worms.push(w);
    return w;
  }
  addFood(x, y, r) {
    const f = new Food(x, y, r);
    f.born = this.time;
    this.food.push(f);
    if (this.food.length > 6) this.food.shift();
    return f;
  }
  smell(x, y) {
    let c = 0;
    for (const f of this.food) c += f.smell(x, y);
    return c;
  }
  step(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    for (const w of this.worms) w.step(dt);
    this.food = this.food.filter((f) => f.amount > 0.05);
  }
}
