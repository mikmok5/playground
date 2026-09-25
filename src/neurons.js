// Plain-language notes on neuron classes, keyed by class name (the neuron
// name without its L/R/D/V side or number). Sources: WormAtlas and the
// standard circuit literature. Anything not listed falls back to its group.

const NOTES = {
  ADA: "Interneuron in the head that relays input from the ring to the ventral cord.",
  ADE: "Dopaminergic cell with a sensory ending in the head. Feels bacteria and helps the worm slow down on food.",
  ADF: "Serotonergic chemosensory neuron. Releases serotonin when food is around.",
  ADL: "Chemosensory neuron that detects repellents and pheromones.",
  AFD: "The worm's thermometer. Tracks temperature changes of a hundredth of a degree.",
  AIA: "First-layer interneuron that integrates smells and tastes, often against each other.",
  AIB: "Interneuron that promotes reversals and turns. Fires when an attractive smell fades.",
  AIY: "Interneuron that keeps the worm running forward when things are getting better.",
  AIZ: "Interneuron in the turning pathway, downstream of AIY and AWA.",
  ALA: "Neuron that brings on sleep-like quiet after stress.",
  ALM: "Gentle-touch receptor in the front half of the body. An eyelash stroke here makes the worm back up.",
  ALN: "Neuron that runs alongside ALM down the body. Its role is not well understood.",
  AQR: "Oxygen-sensing neuron exposed to the body fluid.",
  AS: "Motor neuron in the ventral cord that drives dorsal muscles.",
  ASE: "Salt taster. The left and right cells differ: ASEL likes rising salt, ASER responds to falling salt.",
  ASG: "Chemosensory neuron that helps with salt sensing and dauer decisions.",
  ASH: "The worm's nociceptor. Detects harsh touch on the nose, bitter chemicals and high salt, and triggers escape.",
  ASI: "Chemosensory neuron that helps decide whether to enter the dauer state.",
  ASJ: "Chemosensory neuron that detects light and some pheromones.",
  ASK: "Chemosensory neuron tuned to pheromones and amino acids.",
  AUA: "Interneuron in the head involved in social feeding.",
  AVA: "Command interneuron for backing up. When it fires, the worm reverses.",
  AVB: "Command interneuron for crawling forward.",
  AVD: "Command interneuron that relays front touch to AVA.",
  AVE: "Command interneuron that joins AVA in driving reversals.",
  AVF: "Interneuron that helps coordinate egg laying and locomotion.",
  AVG: "Pioneer neuron that lays down the ventral nerve cord during development.",
  AVH: "Interneuron in the lumbar region.",
  AVJ: "Interneuron that helps time egg laying.",
  AVK: "Interneuron that releases neuropeptides that shape movement.",
  AVL: "GABA neuron that relaxes the gut during defecation.",
  AVM: "Gentle-touch receptor in the front of the body, partner to ALM.",
  AWA: "Smells attractive odors like diacetyl, the buttery smell of bacteria.",
  AWB: "Smells repellent odors.",
  AWC: "Smells attractive odors like benzaldehyde. Fires when the smell goes away, which tells the worm to turn.",
  BAG: "Senses carbon dioxide and low oxygen.",
  BDU: "Interneuron alongside the touch cells.",
  CEP: "Dopaminergic sensory cell in the nose. Feels bacteria and slows the worm down on food.",
  DA: "Motor neuron that bends the body dorsally while backing up.",
  DB: "Motor neuron that bends the body dorsally while crawling forward.",
  DD: "GABA motor neuron that relaxes dorsal muscles while the ventral side contracts.",
  DVA: "Tail interneuron that senses body stretch and tunes the body bend.",
  DVB: "GABA neuron that drives the expulsion step of defecation.",
  DVC: "Tail interneuron that helps suppress reversals.",
  FLP: "Nose-tip and head mechanoreceptor. Detects harsh touch to the head.",
  HSN: "Serotonergic motor neuron that triggers egg laying.",
  IL1: "Lip mechanoreceptor involved in head withdrawal.",
  IL2: "Lip sensory neuron that detects chemicals and helps with nictation.",
  LUA: "Tail interneuron that relays posterior touch.",
  OLL: "Head mechanoreceptor that shapes foraging head movements.",
  OLQ: "Nose mechanoreceptor that helps control head swings.",
  PDE: "Dopaminergic cell in the body that feels bacteria.",
  PHA: "Tail chemosensory neuron that detects repellents, so the worm can stop backing into them.",
  PHB: "Tail chemosensory neuron that works with PHA.",
  PLM: "Gentle-touch receptor in the tail. A touch here makes the worm speed forward.",
  PVC: "Command interneuron that relays tail touch to the forward circuit.",
  PVD: "Tree-like sensory neuron that covers the body, detecting harsh touch and cold.",
  PVM: "Touch-receptor-type cell in the posterior body.",
  PVQ: "Interneuron running from tail to head.",
  PVR: "Tail interneuron.",
  PVT: "Interneuron that keeps the ventral cord axons in order.",
  RIA: "Interneuron that controls head bends and integrates temperature information.",
  RIB: "Interneuron that promotes fast forward movement.",
  RIC: "Octopaminergic interneuron that signals starvation.",
  RID: "Neuron that releases neuropeptides to sustain forward crawling.",
  RIG: "Ring interneuron.",
  RIH: "Serotonergic ring interneuron.",
  RIM: "Tyraminergic interneuron that shapes reversals and suppresses head movement during escape.",
  RIP: "The only link between the pharynx nervous system and the rest of the brain.",
  RIS: "GABA and peptide neuron that puts the worm to sleep.",
  RIV: "Interneuron that sets the direction of the omega turn.",
  RMD: "Head motor neuron that drives head bending.",
  RME: "GABA head motor neuron that limits head bending.",
  RMG: "Hub interneuron for social behaviour and aggregation.",
  SAA: "Head neuron that fine-tunes head steering.",
  SAB: "Motor neuron for the head and neck.",
  SIA: "Neuron that sends processes down the body and shapes head movement.",
  SIB: "Neuron that sends processes down the body and shapes head movement.",
  SMB: "Head motor neuron that sets how wide the body undulates.",
  SMD: "Head motor neuron that steers, especially during turns.",
  URX: "Oxygen sensor. Prefers the low oxygen near bacteria.",
  URY: "Head mechanosensory neuron.",
  VA: "Motor neuron that bends the body ventrally while backing up.",
  VB: "Motor neuron that bends the body ventrally while crawling forward.",
  VC: "Motor neuron that drives the egg-laying muscles.",
  VD: "GABA motor neuron that relaxes ventral muscles while the dorsal side contracts.",
  NSM: "Serotonergic pharynx neuron that senses food in the gut and slows the worm.",
};

const GROUP_NOTES = {
  sensory: "Sensory neuron.",
  inter: "Interneuron.",
  command: "Command interneuron for locomotion.",
  motor: "Motor neuron.",
  pharynx: "Neuron of the pharynx, the worm's pumping throat. It has its own small nervous system.",
};

export const GROUP_LABEL = {
  sensory: "Sensory",
  inter: "Interneuron",
  command: "Command",
  motor: "Motor",
  pharynx: "Pharynx",
};

export function neuronClass(name) {
  const m = name.match(/^(AS|DA|DB|DD|VA|VB|VC|VD)\d+$/);
  if (m) return m[1];
  for (let len = 3; len >= 2; len--) {
    const c = name.slice(0, len);
    if (NOTES[c]) return c;
  }
  return name.replace(/(D?[LR]|[DV][LR]?)$/, "");
}

export function describe(neuron) {
  const note = NOTES[neuronClass(neuron.n)];
  const base = note || GROUP_NOTES[neuron.g];
  return base;
}

const NT_LABEL = {
  Acetylcholine: "acetylcholine",
  Glutamate: "glutamate",
  GABA: "GABA",
  Dopamine: "dopamine",
  Serotonin: "serotonin",
  FMRFamide: "FMRFamide peptides",
  Octapamine: "octopamine",
  Serotonin_Acetylcholine: "serotonin and acetylcholine",
  Acetylcholine_Tyramine: "acetylcholine and tyramine",
  Serotonin_Glutamate: "serotonin and glutamate",
};

export function transmitter(neuron) {
  return NT_LABEL[neuron.nt] || neuron.nt || "unknown";
}
