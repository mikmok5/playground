// A rate-based simulation of the C. elegans nervous system.
//
// Every neuron is a leaky unit whose activity (0..1) is a sigmoid of its
// voltage. Chemical synapses push the voltage of the postsynaptic cell in
// proportion to synapse count; gap junctions pull the two cells' voltages
// together. Wiring comes straight from the connectome. What the connectome
// does not say (synapse sign and strength) is filled in with simple, stated
// assumptions below, so treat behaviour as a toy model, not a prediction.

// Pathways the anatomy undersells. Electron micrographs count a single
// synapse between the gentle-touch cells and their command partners, yet
// laser ablations show these links carry the touch response.
function boost(pre, post) {
  if (/^(ALM[LR]|AVM)$/.test(pre) && /^(AVD|AVA)[LR]$/.test(post)) return 5;
  if (/^(PLM[LR]|PVM)$/.test(pre) && /^PVC[LR]$/.test(post)) return 6;
  if (/^(AWC|ASER)[LR]?$/.test(pre) && /^AIB[LR]$/.test(post)) return 3;
  if (/^AIB[LR]$/.test(pre) && /^(RIM|AVA)[LR]$/.test(post)) return 3;
  return 1;
}

// GABAergic neurons: their chemical synapses inhibit.
const INHIBITORY = /^(DD\d|VD\d+|RME[LRDV]|RIS|AVL|DVB)$/;

// Glutamate can also inhibit, through glutamate-gated chloride channels.
// The connectome can't tell us which synapses do, so we follow the classic
// readings of the circuit:
//  - AWC -> AIY is inhibitory (odor removal silences AIY), AIY -> AIZ is
//    inhibitory through the ACC-1 chloride channel, and AIB's glutamate
//    output onto the forward command cells is treated as inhibitory.
//  - Touch cells excite the command cells that move the worm away (mostly by
//    gap junctions) and inhibit the opposing ones by chemical synapses
//    (Chalfie et al. 1985). Front touch cells inhibit the forward circuit,
//    back touch cells inhibit the reverse circuit.
//  - The forward (AVB, PVC) and reverse (AVA, AVD, AVE) command cells
//    inhibit each other, so only one direction wins at a time.
const FWD_CMD = /^(AVB|PVC)[LR]$/;
const REV_CMD = /^(AVA|AVD|AVE)[LR]$/;
function inhibitory(pre, post) {
  if (INHIBITORY.test(pre)) return true;
  if (/^AWC[LR]$/.test(pre) && /^AIY[LR]$/.test(post)) return true;
  if (/^AIB[LR]$/.test(pre) && FWD_CMD.test(post)) return true;
  if (/^AIY[LR]$/.test(pre) && /^AIZ[LR]$/.test(post)) return true; // via ACC-1
  if (/^(ALM[LR]|AVM|FLP[LR]|ASH[LR])$/.test(pre) && FWD_CMD.test(post)) return true;
  if (/^(PLM[LR]|PVM)$/.test(pre) && REV_CMD.test(post)) return true;
  if (FWD_CMD.test(pre) && REV_CMD.test(post)) return true;
  if (REV_CMD.test(pre) && FWD_CMD.test(post)) return true;
  return false;
}

export const PARAMS = {
  tau: 0.12, // seconds
  chem: 1.4, // chemical synapse gain
  gap: 0.22, // gap junction coupling
  gain: 7, // sigmoid steepness
  threshold: 0.55,
  noise: 0.18,
  adapt: 1.6, // spike-frequency-style adaptation strength
  tauAdapt: 2.5, // seconds
};

export const P_CMD = { tau: 1.5, adapt: 0.4 };

export const COMMAND = {
  forward: ["AVBL", "AVBR", "PVCL", "PVCR"],
  reverse: ["AVAL", "AVAR", "AVDL", "AVDR", "AVEL", "AVER"],
};

// Sensory entry points the app uses.
export const SENSORS = {
  nose: ["FLPL", "FLPR", "ASHL", "ASHR", "OLQDL", "OLQDR", "OLQVL", "OLQVR", "IL1VL", "IL1VR", "IL1DL", "IL1DR"],
  anterior: ["ALML", "ALMR", "AVM"],
  posterior: ["PLML", "PLMR", "PVM"],
  foodUp: ["ASEL"], // salt/odor rising
  foodDown: ["AWCL", "AWCR", "ASER"], // falling: AWC and ASER fire, AIB drives a reversal
  onFood: ["CEPDL", "CEPDR", "CEPVL", "CEPVR", "ADEL", "ADER", "PDEL", "PDER"],
};

export class Brain {
  constructor(data, rng = Math.random) {
    this.data = data;
    this.rng = rng;
    const N = (this.N = data.neurons.length);
    this.names = data.neurons.map((x) => x.n);
    this.index = Object.fromEntries(this.names.map((n, i) => [n, i]));
    this.v = new Float32Array(N);
    this.a = new Float32Array(N); // slow adaptation
    this.r = new Float32Array(N);
    this.input = new Float32Array(N); // external drive, decays each step
    this.alive = new Uint8Array(N).fill(1);

    // Chemical synapses as a sparse list, weights normalised by the
    // postsynaptic cell's total input so hub neurons do not saturate.
    const inTotal = new Float32Array(N);
    for (const [, b, w] of data.chem) inTotal[b] += w;
    const E = data.chem.length;
    this.pre = new Uint16Array(E);
    this.post = new Uint16Array(E);
    this.w = new Float32Array(E);
    data.chem.forEach(([a, b, n], k) => {
      const inhib = inhibitory(this.names[a], this.names[b]);
      this.pre[k] = a;
      this.post[k] = b;
      const gain = boost(this.names[a], this.names[b]);
      this.w[k] = ((inhib ? -1.6 : 1) * n * gain) / Math.sqrt(inTotal[b] * 6 + 1);
    });

    const G = data.gap.length;
    this.ga = new Uint16Array(G);
    this.gb = new Uint16Array(G);
    this.gw = new Float32Array(G);
    data.gap.forEach(([a, b, n], k) => {
      this.ga[k] = a;
      this.gb[k] = b;
      const gain = Math.max(boost(this.names[a], this.names[b]), boost(this.names[b], this.names[a]));
      this.gw[k] = (Math.sqrt(Math.min(n, 9)) / 3) * gain;
    });

    // Command interneurons hold their state for seconds (AVA shows plateau
    // potentials), so they integrate more slowly and adapt less.
    this.tau = new Float32Array(N).fill(1);
    this.adaptScale = new Float32Array(N).fill(1);
    for (const n of [...COMMAND.forward, ...COMMAND.reverse]) {
      this.tau[this.index[n]] = P_CMD.tau;
      this.adaptScale[this.index[n]] = P_CMD.adapt;
    }
    this.cmdF = COMMAND.forward.map((n) => this.index[n]);
    this.cmdR = COMMAND.reverse.map((n) => this.index[n]);
    this.acc = new Float32Array(N);
    // Last-step flow along each chemical synapse, for drawing live edges.
    this.flow = new Float32Array(E);
  }

  idx(name) {
    return this.index[name];
  }

  stimulate(names, amount = 1) {
    for (const n of names) {
      const i = this.index[n];
      if (i !== undefined) this.input[i] = Math.max(this.input[i], amount);
    }
  }

  setAlive(name, alive) {
    const i = this.index[name];
    if (i === undefined) return;
    this.alive[i] = alive ? 1 : 0;
    if (!alive) this.v[i] = this.r[i] = this.a[i] = 0;
  }

  step(dt) {
    const { v, a, r, input, alive, acc, pre, post, w, flow } = this;
    const P = PARAMS;
    const N = this.N;
    acc.fill(0);
    for (let k = 0; k < pre.length; k++) {
      const f = r[pre[k]] * w[k];
      flow[k] = f;
      acc[post[k]] += P.chem * f;
    }
    for (let k = 0; k < this.ga.length; k++) {
      const a = this.ga[k],
        b = this.gb[k];
      if (!alive[a] || !alive[b]) continue;
      const d = P.gap * this.gw[k] * (v[b] - v[a]);
      acc[a] += d;
      acc[b] -= d;
    }
    const k0 = dt / P.tau;
    const sn = P.noise * Math.sqrt(dt);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) {
        v[i] = r[i] = 0;
        continue;
      }
      const noise = sn * (this.rng() + this.rng() - 1) * 2.4;
      const k = k0 / this.tau[i];
      v[i] += k * (-v[i] + acc[i] + 1.4 * input[i] - P.adapt * this.adaptScale[i] * a[i]) + noise;
      if (v[i] > 2.5) v[i] = 2.5;
      else if (v[i] < -1.5) v[i] = -1.5;
      r[i] = 1 / (1 + Math.exp(-P.gain * (v[i] - P.threshold)));
      a[i] += (dt / P.tauAdapt) * (r[i] - a[i]);
      input[i] *= Math.exp(-dt / 0.35);
    }
  }

  // Positive: the forward circuit is winning. Negative: reversal.
  drive() {
    const { r, alive } = this;
    const mean = (ids) => {
      let s = 0,
        c = 0;
      for (const i of ids) if (alive[i]) (s += r[i]), c++;
      return c ? s / c : 0;
    };
    return { forward: mean(this.cmdF), reverse: mean(this.cmdR) };
  }
}
