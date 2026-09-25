# Pocket Worm

A *C. elegans* that lives on your phone. Its behaviour comes from the real
wiring diagram of the worm's nervous system: 300 neurons, about 2,300
chemical synapses and 550 gap junctions, mapped by electron microscopy.

- **Plate.** Stroke a worm with an eyelash (nose, body or tail), drop
  bacteria and watch it find them by smell, or add up to six worms.
- **Brain.** Every neuron lights up live. Tap one to read about it, stimulate
  it, or cut it out.
- **Experiments.** Classic laser-ablation experiments in one tap, such as
  removing the reverse command neurons so the worm can't back up.
- **Relay.** A game where you route a signal from a sense organ to a target
  neuron in as few hops as possible, plus a pathfinder between any two cells.

## Run it

It's a single HTML file with no dependencies. Open `dist/index.html` in a
browser, or host `dist/` anywhere. On a phone, use your browser's
"Add to Home Screen" and it opens full screen like an app.

## Develop

```sh
npm run build   # bundle src/ into dist/index.html and dist/pocket-worm.html
npm test        # behaviour tests: touch reflexes, chemotaxis, ablations
```

| File | What it does |
| --- | --- |
| `src/brain.js` | Rate-based neural simulation of the connectome |
| `src/worm.js` | Worm body, plate, food, sensing and behaviour states |
| `src/graph.js` | Shortest paths through the wiring |
| `src/neurons.js` | Plain-language notes on each neuron class |
| `src/app.js` | Drawing, controls and the Relay game |
| `tools/build_data.py` | Rebuilds `src/connectome.json` from the source spreadsheet |
| `tools/build.mjs` | Bundles everything into one HTML file |

## The model

Each neuron is a leaky unit with a sigmoid output. Chemical synapses are
weighted by the number of contacts in the micrographs, gap junctions couple
voltages, and GABA neurons inhibit. The connectome doesn't say which
glutamate synapses excite and which inhibit, so a few pathways follow the
classic circuit papers (touch circuit after Chalfie et al. 1985, AWC→AIY,
AIY→AIZ, forward/reverse command cells inhibiting each other). Every such
rule is spelled out at the top of `src/brain.js`.

The forward (AVB, PVC) and reverse (AVA, AVD, AVE) command cells set the
direction, head motor neurons steer, and the body follows its head's track
the way a worm does on agar. It's a toy model: it reproduces the famous
behaviours, but it doesn't predict what a real worm would do.

## Data

Wiring and transmitters come from OpenWorm's `CElegansNeuronTables.xls`
(ConnectomeToolbox), based on Varshney et al. 2011, *PLoS Comput Biol*
7:e1001066, and White et al. 1986. Neuron notes are adapted from WormAtlas.
