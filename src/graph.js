// Path finding over the wiring diagram, for the Relay game and pathfinder.
// Chemical synapses are one-way; gap junctions conduct both ways.

export function buildGraph(data) {
  const N = data.neurons.length;
  const out = Array.from({ length: N }, () => new Map());
  const add = (a, b, w, kind) => {
    const e = out[a].get(b);
    if (!e) out[a].set(b, { to: b, chem: 0, gap: 0, [kind]: w });
    else e[kind] += w;
  };
  for (const [a, b, w] of data.chem) add(a, b, w, "chem");
  for (const [a, b, w] of data.gap) {
    add(a, b, w, "gap");
    add(b, a, w, "gap");
  }
  return out.map((m) => [...m.values()].sort((x, y) => y.chem + y.gap - (x.chem + x.gap)));
}

// Fewest hops; among equally short routes, prefer the ones with more
// synapses along the way.
export function shortestPath(graph, from, to, alive) {
  const N = graph.length;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  cost[from] = 0;
  for (;;) {
    let u = -1,
      best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && cost[i] < best) (best = cost[i]), (u = i);
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of graph[u]) {
      if (alive && !alive[e.to]) continue;
      const c = cost[u] + 1 + 0.2 / (e.chem + e.gap);
      if (c < cost[e.to]) (cost[e.to] = c), (prev[e.to] = u);
    }
  }
  if (cost[to] === Infinity) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

export function edge(graph, a, b) {
  return graph[a].find((e) => e.to === b) || null;
}
