/**
 * probeBug.js — Diagnostic probe for the route-progress fitness signal.
 *
 * Confirms (or refutes) the hypothesis that RouteDiscovery produces a constant
 * fitness of 0 for every vehicle pose, and measures the downstream effect on
 * episode length under the live termination rules.
 *
 * Usage:  node experiments/probeBug.js
 */
const { createSimContext } = require("./harness/loadSim");
const { mulberry32 } = require("./harness/rng");

const sim = createSimContext(mulberry32(42), true);
const map = sim.simulationMap;
const graph = map.graph;

console.log("=== 1. Node identity after NodeGraph.load ===");
const p0 = graph.points[0];
console.log("point[0] own keys :", JSON.stringify(Object.keys(p0)));
console.log("point[0].id       :", p0.id);
console.log(
  "points with defined id:",
  graph.points.filter((p) => p.id !== undefined).length,
  "/",
  graph.points.length
);

console.log("\n=== 2. Dijkstra output ===");
const route = new sim.RouteDiscovery(graph);
console.log(
  "adjacency map size:",
  route.adjacency.size,
  "(expected " + graph.points.length + ")"
);
const startMark = map.markings.find((m) => m.type === "start");
route.calculateDistances(startMark.center);
console.log("distance map size :", route.distances.size);
console.log("distance entries  :", JSON.stringify([...route.distances.entries()]));

console.log("\n=== 3. Fitness field sampled across the map ===");
const rows = [];
for (let i = 0; i < 8; i++) {
  const p = graph.points[Math.floor((i * graph.points.length) / 8)];
  rows.push({
    x: Math.round(p.x),
    y: Math.round(p.y),
    navScore: route.getScoreAtLocation(p),
  });
}
console.table(rows);

console.log("\n=== 4. Episode length under live termination rules ===");
sim.setGlobal("routeDiscovery", route);

const startAngle = -sim.getAngle(startMark.directionVector) + Math.PI / 2;
const results = [];
for (let trial = 0; trial < 5; trial++) {
  const v = new sim.AutonomousVehicle(
    startMark.center.x,
    startMark.center.y,
    30,
    50,
    "AI",
    startAngle,
    6
  );
  let frames = 0;
  while (!v.damaged && frames < 3000) {
    v.update(map.roadBorders, []);
    frames++;
  }
  results.push({
    trial,
    framesSurvived: frames,
    finalNavScore: Number(v.survivalScore.toFixed(3)),
    killedByStagnation: !!v.isStagnant,
  });
}
console.table(results);

console.log("\n=== 5. Same episodes with the route scorer disabled ===");
sim.setGlobal("routeDiscovery", null);
const fallback = [];
for (let trial = 0; trial < 5; trial++) {
  const v = new sim.AutonomousVehicle(
    startMark.center.x,
    startMark.center.y,
    30,
    50,
    "AI",
    startAngle,
    6
  );
  let frames = 0;
  while (!v.damaged && frames < 3000) {
    v.update(map.roadBorders, []);
    frames++;
  }
  fallback.push({
    trial,
    framesSurvived: frames,
    finalEuclideanScore: Number(v.survivalScore.toFixed(2)),
    killedByStagnation: !!v.isStagnant,
  });
}
console.table(fallback);
