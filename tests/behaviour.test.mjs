// The famous behaviours should come out of the wiring, and the classic
// ablations should take them away again.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Brain, SENSORS } from "../src/brain.js";
import { World } from "../src/worm.js";
import { buildGraph, shortestPath } from "../src/graph.js";

const DATA = JSON.parse(fs.readFileSync(new URL("../src/connectome.json", import.meta.url)));

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// Net forward-minus-reverse drive over the 4 s after a stimulus.
function response(stim, cut = []) {
  const b = new Brain(DATA, seeded(7));
  cut.forEach((n) => b.setAlive(n, false));
  let net = 0;
  for (let t = 0; t < 300; t++) {
    if (stim && t >= 100 && t < 115) b.stimulate(SENSORS[stim], 1);
    b.step(0.02);
    if (t >= 100) {
      const d = b.drive();
      net += (d.forward - d.reverse) * 0.02;
    }
  }
  return net;
}

test("connectome loads", () => {
  assert.equal(DATA.neurons.length, 300);
  assert.ok(DATA.chem.length > 2000);
  assert.ok(DATA.gap.length > 500);
});

test("resting brain stays quiet", () => {
  assert.ok(Math.abs(response(null)) < 0.1);
});

test("nose touch drives reversal", () => {
  assert.ok(response("nose") < -0.3);
});

test("front body touch drives reversal", () => {
  assert.ok(response("anterior") < -0.3);
});

test("tail touch drives forward", () => {
  assert.ok(response("posterior") > 0.15);
});

test("fading food smell drives reversal", () => {
  assert.ok(response("foodDown") < -0.15);
});

test("without reverse command cells, a nose touch cannot reverse", () => {
  assert.ok(response("nose", ["AVAL", "AVAR", "AVDL", "AVDR", "AVEL", "AVER"]) > 0);
});

test("without touch receptors, body touch does nothing", () => {
  assert.ok(Math.abs(response("anterior", ["ALML", "ALMR", "AVM"])) < 0.1);
});

test("without AIB, fading smell does nothing", () => {
  assert.ok(Math.abs(response("foodDown", ["AIBL", "AIBR"])) < 0.1);
});

test("worms find food by smell", () => {
  let found = 0;
  for (const seed of [3, 11, 29]) {
    const world = new World(DATA, seeded(seed));
    world.addFood(1.2, 0.8);
    const worm = world.addWorm(-1.2, -0.8, 0.5);
    for (let t = 0; t < 150 / 0.02 && !worm.onFood; t++) world.step(0.02);
    if (worm.onFood) found++;
  }
  assert.ok(found >= 2, `only ${found} of 3 worms found food`);
});

test("a nose touch makes a crawling worm back up", () => {
  const world = new World(DATA, seeded(5));
  const worm = world.addWorm(0, 0, 0);
  for (let t = 0; t < 100; t++) world.step(0.02);
  worm.touch(0);
  let reversed = false;
  for (let t = 0; t < 100; t++) {
    world.step(0.02);
    if (worm.state === "reverse") reversed = true;
  }
  assert.ok(reversed);
});

test("pathfinder finds the touch reflex route", () => {
  const g = buildGraph(DATA);
  const idx = Object.fromEntries(DATA.neurons.map((n, i) => [n.n, i]));
  const path = shortestPath(g, idx.PLML, idx.AVBL);
  assert.ok(path && path.length <= 3, "PLM reaches AVB in two hops via PVC");
  assert.equal(DATA.neurons[path[0]].n, "PLML");
});
