/**
 * verifyHarness.js — Verification checks for the evaluation harness.
 *
 * Three properties are asserted empirically rather than argued:
 *
 *   V1  Episode determinism   — the same seed reproduces an episode exactly.
 *   V2  Culling equivalence   — passing the grid-culled boundary subset
 *                               produces a bit-identical trajectory to passing
 *                               every boundary segment, so the spatial index is
 *                               behaviour-preserving and not an approximation.
 *   V3  Training determinism  — the same seed reproduces a training run's
 *                               entire fitness history exactly.
 *
 * Usage:  node experiments/verifyHarness.js
 */
const fs = require("fs");
const path = require("path");
const { createSimContext } = require("./harness/loadSim");
const { mulberry32 } = require("./harness/rng");
const { SpatialGrid, RouteScorer, makeNNController } = require("./harness/env");
const { runEpisode, makeVehicle } = require("./harness/episode");
const { evolve } = require("./harness/ga");

const OUT = path.join(__dirname, "results", "verification.json");
const SEED = 2026;

function episodeSignature(m) {
  return [
    m.frames,
    m.cause,
    m.peakRouteProgress.toFixed(9),
    m.pathLength.toFixed(9),
    m.netDisplacement.toFixed(9),
    m.rmsJerk.toFixed(9),
    m.meanLateral.toFixed(9),
  ].join("|");
}

function main() {
  const sim = createSimContext(mulberry32(SEED), true);
  const map = sim.simulationMap;
  const grid = new SpatialGrid(map.roadBorders, 256);
  const startMark = map.markings.find((m) => m.type === "start");
  const scorer = new RouteScorer(sim, map.graph).calculateDistances(startMark.center);
  const world = { map, grid, evalScorer: scorer };
  sim.setGlobal("routeDiscovery", scorer);

  /* ---- V1: episode determinism ---------------------------------- */
  const sigs = [];
  for (let rep = 0; rep < 3; rep++) {
    sim.setRng(mulberry32(SEED));
    const v = makeVehicle(sim, startMark, { maxSpeed: 6 });
    v.brain = new sim.BrainArchitecture([v.lidar.beamCount, 12, 10, 4]);
    sigs.push(
      episodeSignature(runEpisode(sim, world, v, makeNNController(sim, v), { maxFrames: 1200 }))
    );
  }
  const v1 = sigs.every((s) => s === sigs[0]);
  console.log(`V1 episode determinism : ${v1 ? "PASS" : "FAIL"}`);

  /* ---- V2: culling equivalence ---------------------------------- */
  // A grid whose single cell spans the entire world returns every segment, so
  // querying it is equivalent to passing the full boundary list unculled.
  const fullGrid = new SpatialGrid(map.roadBorders, 1e9);
  const worldFull = { map, grid: fullGrid, evalScorer: scorer };

  const pairs = [];
  for (let trial = 0; trial < 8; trial++) {
    const seed = SEED + trial;

    sim.setRng(mulberry32(seed));
    const a = makeVehicle(sim, startMark, { maxSpeed: 6 });
    a.brain = new sim.BrainArchitecture([a.lidar.beamCount, 12, 10, 4]);
    const genome = JSON.parse(JSON.stringify(a.brain));
    const ma = runEpisode(sim, world, a, makeNNController(sim, a), {
      maxFrames: 1200,
      cullRadius: 400,
    });

    sim.setRng(mulberry32(seed));
    const b = makeVehicle(sim, startMark, { maxSpeed: 6 });
    b.brain = genome;
    const mb = runEpisode(sim, worldFull, b, makeNNController(sim, b), {
      maxFrames: 1200,
      cullRadius: 1e9,
    });

    pairs.push({
      trial,
      culled: episodeSignature(ma),
      full: episodeSignature(mb),
      identical: episodeSignature(ma) === episodeSignature(mb),
    });
  }
  const v2 = pairs.every((p) => p.identical);
  console.log(
    `V2 culling equivalence : ${v2 ? "PASS" : "FAIL"}  (${
      pairs.filter((p) => p.identical).length
    }/${pairs.length} trajectories identical)`
  );

  /* ---- V3: training determinism --------------------------------- */
  const histories = [];
  for (let rep = 0; rep < 2; rep++) {
    sim.setRng(mulberry32(SEED ^ 0xa5a5));
    const res = evolve(
      sim,
      world,
      {
        population: 20,
        generations: 5,
        operator: "tournament-crossover",
        maxFrames: 600,
        startMark,
      },
      mulberry32(SEED)
    );
    histories.push(JSON.stringify(res.history));
  }
  const v3 = histories[0] === histories[1];
  console.log(`V3 training determinism: ${v3 ? "PASS" : "FAIL"}`);

  const out = {
    seed: SEED,
    node: process.version,
    determinism: { pass: v1, repetitions: sigs.length, signature: sigs[0] },
    cullingEquivalence: {
      pass: v2,
      trials: pairs.length,
      identical: pairs.filter((p) => p.identical).length,
      culledRadiusPx: 400,
      beamLengthPx: 220,
      vehicleDiagonalPx: Math.round(Math.hypot(30, 50)),
    },
    evolutionDeterminism: { pass: v3, generations: 5, population: 20 },
    allPass: v1 && v2 && v3,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    `\n${out.allPass ? "ALL CHECKS PASS" : "SOME CHECKS FAILED"} -> ${path.relative(
      process.cwd(),
      OUT
    )}`
  );
  if (!out.allPass) process.exitCode = 1;
}

main();
