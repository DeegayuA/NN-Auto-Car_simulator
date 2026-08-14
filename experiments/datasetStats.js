/**
 * datasetStats.js — Exploratory analysis of the ingested OpenStreetMap world.
 *
 * Produces the descriptive statistics quoted in the "Data Preparation &
 * Engineering" section of the final report: graph size, connectivity, segment
 * length distribution, node degree histogram, spatial extent, and the
 * reachability of the road network from the designated start marking.
 *
 * Usage:  node experiments/datasetStats.js
 */
const fs = require("fs");
const path = require("path");
const { createSimContext } = require("./harness/loadSim");
const { mulberry32 } = require("./harness/rng");

const OUT = path.join(__dirname, "results", "dataset_stats.json");

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const variance = s.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    min: s[0],
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    max: s[n - 1],
    mean,
    sd: Math.sqrt(variance),
  };
}

function main() {
  const t0 = Date.now();
  const ctx = createSimContext(mulberry32(1), true);
  const loadMs = Date.now() - t0;

  const map = ctx.simulationMap;
  const graph = map.graph;

  // ---- Spatial extent -----------------------------------------------------
  const xs = graph.points.map((p) => p.x);
  const ys = graph.points.map((p) => p.y);
  const bbox = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  bbox.widthPx = bbox.maxX - bbox.minX;
  bbox.heightPx = bbox.maxY - bbox.minY;

  // ---- Segment lengths ----------------------------------------------------
  const segLengths = graph.segments.map((s) => ctx.calcDist(s.p1, s.p2));
  const borderLengths = map.roadBorders.map((s) => ctx.calcDist(s.p1, s.p2));

  // ---- Node degree --------------------------------------------------------
  const degree = new Map();
  graph.points.forEach((p) => degree.set(p, 0));
  for (const seg of graph.segments) {
    degree.set(seg.p1, (degree.get(seg.p1) || 0) + 1);
    degree.set(seg.p2, (degree.get(seg.p2) || 0) + 1);
  }
  const degreeHistogram = {};
  for (const d of degree.values()) degreeHistogram[d] = (degreeHistogram[d] || 0) + 1;

  // ---- Marking type census ------------------------------------------------
  const markingTypes = {};
  for (const m of map.markings) markingTypes[m.type] = (markingTypes[m.type] || 0) + 1;

  // ---- Connectivity / reachability from start ----------------------------
  const startNodes = map.markings.filter((m) => m.type === "start");
  const startPoint = startNodes.length ? startNodes[0].center : graph.points[0];

  const route = new ctx.RouteDiscovery(graph);
  const tRoute = Date.now();
  route.calculateDistances(startPoint);
  const routeMs = Date.now() - tRoute;

  const dists = Array.from(route.distances.values());
  const reachable = dists.filter((d) => Number.isFinite(d));
  const unreachable = dists.length - reachable.length;

  // Undirected connected components of the raw graph (data-quality check:
  // OSM extracts routinely contain islands that no vehicle can ever reach).
  const idIndex = new Map(graph.points.map((p, i) => [p, i]));
  const adj = graph.points.map(() => []);
  for (const s of graph.segments) {
    const a = idIndex.get(s.p1);
    const b = idIndex.get(s.p2);
    if (a === undefined || b === undefined) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  const comp = new Array(graph.points.length).fill(-1);
  const compSizes = [];
  for (let i = 0; i < graph.points.length; i++) {
    if (comp[i] !== -1) continue;
    const id = compSizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const v of adj[u]) {
        if (comp[v] === -1) {
          comp[v] = id;
          stack.push(v);
        }
      }
    }
    compSizes.push(size);
  }
  compSizes.sort((a, b) => b - a);

  // ---- One-way / directedness --------------------------------------------
  const oneWay = graph.segments.filter((s) => s.oneWay && s.oneWay !== "no").length;

  const stats = {
    generatedBy: "experiments/datasetStats.js",
    sourceFile: "simulation/simulationData.js",
    sourceBytes: fs.statSync(
      path.resolve(__dirname, "..", "simulation", "simulationData.js")
    ).size,
    loadMs,
    world: {
      roadWidthPx: map.roadWidth,
      roadRoundness: map.roadRoundness,
      buildingWidthPx: map.buildingWidth,
      treeSizePx: map.treeSize,
    },
    counts: {
      graphNodes: graph.points.length,
      graphSegments: graph.segments.length,
      roadBorderSegments: map.roadBorders.length,
      laneGuides: map.laneGuides.length,
      buildings: map.buildings.length,
      trees: map.trees.length,
      markings: map.markings.length,
      envelopes: map.envelopes.length,
      oneWaySegments: oneWay,
    },
    markingTypes,
    bbox,
    segmentLengthPx: describe(segLengths),
    roadBorderLengthPx: describe(borderLengths),
    degreeHistogram,
    connectivity: {
      components: compSizes.length,
      largestComponent: compSizes[0],
      largestComponentShare: compSizes[0] / graph.points.length,
      componentSizesTop10: compSizes.slice(0, 10),
    },
    reachabilityFromStart: {
      startPoint: { x: startPoint.x, y: startPoint.y },
      nodesScored: dists.length,
      reachable: reachable.length,
      unreachable,
      reachableShare: reachable.length / dists.length,
      maxRouteDistancePx: Math.max(...reachable),
      dijkstraMs: routeMs,
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify(stats, null, 2));
}

main();
