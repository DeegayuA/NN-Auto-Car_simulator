/**
 * runExperiments.js — Full experimental protocol for the capstone evaluation.
 *
 *   E1  Fitness-signal diagnostic   : does the objective separate individuals?
 *   E2  Fixed-policy baselines      : random NN, reactive FSM, P-controller,
 *                                     pure-pursuit reference.
 *   E3  Neuroevolution training     : four arms x S seeds, learning curves.
 *   E4  Ablations                   : architecture, mutation rate, sensing.
 *   E5  Final held-out evaluation   : champions vs baselines on unseen poses.
 *
 * Usage
 *   node experiments/runExperiments.js            # full protocol
 *   node experiments/runExperiments.js --smoke    # tiny config, timing check
 *   node experiments/runExperiments.js --only=E1,E2
 */
const fs = require("fs");
const path = require("path");
const { createSimContext } = require("./harness/loadSim");
const { mulberry32 } = require("./harness/rng");
const {
  SpatialGrid,
  RouteScorer,
  makeNNController,
  makeReactiveController,
  makePController,
  makePursuitController,
} = require("./harness/env");
const { runEpisode, makeVehicle } = require("./harness/episode");
const { evolve, cloneGenome } = require("./harness/ga");
const {
  makeLegacyRouteDiscovery,
  makeLegacyGraph,
} = require("./harness/legacyRouteDiscovery");
const { describe, bootstrapCI, mannWhitneyU, cliffsDelta } = require("./harness/stats");

const RESULTS = path.join(__dirname, "results");
const args = process.argv.slice(2);
const SMOKE = args.includes("--smoke");
const onlyArg = args.find((a) => a.startsWith("--only"));
const ONLY = onlyArg ? onlyArg.split("=")[1].split(",") : null;

/* ------------------------------------------------------------------ *
 * Configuration — every number quoted in the report comes from here.
 * ------------------------------------------------------------------ */
const CONFIG = {
  masterSeed: 2026,
  seeds: SMOKE ? [11, 22] : [11, 22, 33, 44, 55],
  population: SMOKE ? 12 : 60,
  generations: SMOKE ? 4 : 30,
  maxFrames: SMOKE ? 400 : 1200, // 20 s at 60 fps
  maxSpeed: 6, // slider default; 60 km/h on the HUD scale
  layers: [12, 10, 4], // hidden + output widths (input = beam count)
  mutationRate: 0.15,
  boostEvery: 5,
  boostRate: 0.5,
  eliteCount: 2,
  tournamentSize: 3,
  ablationSeeds: SMOKE ? 2 : 3,
  ablationGenerations: SMOKE ? 4 : 20,
  poses: { val: SMOKE ? 3 : 10, test: SMOKE ? 4 : 20 },
  bootstrapIterations: SMOKE ? 200 : 2000,
};

/* ------------------------------------------------------------------ *
 * World construction
 * ------------------------------------------------------------------ */
function buildWorld() {
  const sim = createSimContext(mulberry32(CONFIG.masterSeed), true);
  const map = sim.simulationMap;
  const grid = new SpatialGrid(map.roadBorders, 256);
  const startMark = map.markings.find((m) => m.type === "start");
  const evalScorer = new RouteScorer(sim, map.graph).calculateDistances(startMark.center);
  return { sim, map, grid, startMark, evalScorer, world: { map, grid, evalScorer } };
}

/**
 * Deterministically sample held-out start poses.
 *
 * A pose is a graph node of degree >= 2 that is reachable from the canonical
 * start, together with a heading along one of its incident segments.  Nodes are
 * shuffled with a fixed seed and split into disjoint validation and test sets,
 * so no pose used to choose an ablation ever appears in the reported figures.
 */
function samplePoses(sim, map, evalScorer, counts) {
  const rand = mulberry32(CONFIG.masterSeed ^ 0x5eed);
  const graph = map.graph;

  const degree = new Map();
  const incident = new Map();
  for (const s of graph.segments) {
    for (const pair of [
      [s.p1, s.p2],
      [s.p2, s.p1],
    ]) {
      const a = pair[0];
      const b = pair[1];
      degree.set(a, (degree.get(a) || 0) + 1);
      if (!incident.has(a)) incident.set(a, []);
      incident.get(a).push(b);
    }
  }

  const candidates = graph.points.filter((p) => {
    const idx = evalScorer.index.get(p);
    return (degree.get(p) || 0) >= 2 && Number.isFinite(evalScorer.distances[idx]);
  });

  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = t;
  }

  const take = counts.val + counts.test;
  const chosen = shuffled.slice(0, take).map((p, i) => {
    const nb = incident.get(p)[0];
    const dir = sim.normalizeVector(sim.subPoints(nb, p));
    // Per-pose scorer: route progress is measured relative to that pose.
    const scorer = new RouteScorer(sim, graph).calculateDistances(p);
    return {
      id: `P${i}`,
      center: { x: p.x, y: p.y },
      directionVector: dir,
      scorer,
    };
  });

  return { val: chosen.slice(0, counts.val), test: chosen.slice(counts.val) };
}

/* ------------------------------------------------------------------ *
 * Evaluation helpers
 * ------------------------------------------------------------------ */
function evalControllerAtPose(sim, ctxWorld, pose, factory, opts = {}) {
  const world = { ...ctxWorld, evalScorer: pose.scorer };
  const vehicle = makeVehicle(sim, pose, {
    maxSpeed: CONFIG.maxSpeed,
    beamCount: opts.beamCount,
    beamLength: opts.beamLength,
  });
  if (opts.brain) vehicle.brain = cloneGenome(opts.brain);
  const controller = factory(vehicle, pose);
  return runEpisode(sim, world, vehicle, controller, {
    maxFrames: CONFIG.maxFrames,
    maxSpeed: CONFIG.maxSpeed,
  });
}

const METRICS = [
  "peakRouteProgress",
  "frames",
  "pathLength",
  "meanSpeed",
  "rmsJerk",
  "steeringReversalsPer1k",
  "meanLateral",
  "offRouteShare",
  "collided",
];

function stripTrace(m) {
  const copy = { ...m };
  delete copy.trace;
  return copy;
}

function summarise(records) {
  const out = {};
  for (const m of METRICS) out[m] = describe(records.map((r) => r[m]));
  out.terminationMix = records.reduce((acc, r) => {
    acc[r.cause] = (acc[r.cause] || 0) + 1;
    return acc;
  }, {});
  // Mean distance between failures: total distance driven per collision.
  const totalPath = records.reduce((a, r) => a + r.pathLength, 0);
  const collisions = records.reduce((a, r) => a + r.collided, 0);
  out.mdbf = collisions > 0 ? totalPath / collisions : null;
  out.episodes = records.length;
  return out;
}

function writeJson(name, obj) {
  const file = path.join(RESULTS, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  console.log(`  -> ${path.relative(process.cwd(), file)}`);
}

/* ------------------------------------------------------------------ *
 * E1 — Fitness-signal diagnostic
 * ------------------------------------------------------------------ */
function experiment1(ctx) {
  console.log("\n[E1] Fitness-signal diagnostic");
  const { sim, map, startMark, world } = ctx;

  // Pinned as-committed behaviour: the original scorer *and* the original
  // id-stripping loader, so the baseline arm is unaffected by the repairs
  // applied to utils/pathfinder.js and utils/nodeGraph.js.
  const LegacyRouteDiscovery = makeLegacyRouteDiscovery(sim);
  const shippedScorer = new LegacyRouteDiscovery(makeLegacyGraph(sim, map.graph));
  shippedScorer.calculateDistances(startMark.center);

  const variants = [
    {
      name: "as-committed (RouteDiscovery)",
      set: () => sim.setGlobal("routeDiscovery", shippedScorer),
    },
    { name: "euclidean fallback", set: () => sim.setGlobal("routeDiscovery", null) },
    {
      name: "corrected route scorer",
      set: () => sim.setGlobal("routeDiscovery", world.evalScorer),
    },
  ];

  const rows = [];
  for (const v of variants) {
    sim.setRng(mulberry32(CONFIG.masterSeed));
    v.set();
    const records = [];
    for (let i = 0; i < CONFIG.population; i++) {
      const vehicle = makeVehicle(sim, startMark, { maxSpeed: CONFIG.maxSpeed });
      vehicle.brain = new sim.BrainArchitecture([vehicle.lidar.beamCount, ...CONFIG.layers]);
      records.push(
        runEpisode(sim, world, vehicle, makeNNController(sim, vehicle), {
          maxFrames: CONFIG.maxFrames,
          maxSpeed: CONFIG.maxSpeed,
        })
      );
    }
    const fits = records.map((r) => r.trainingFitness);
    const row = {
      variant: v.name,
      populationSize: records.length,
      distinctFitnessValues: new Set(fits.map((f) => f.toFixed(6))).size,
      fitness: describe(fits),
      framesSurvived: describe(records.map((r) => r.frames)),
      terminationMix: records.reduce((a, r) => {
        a[r.cause] = (a[r.cause] || 0) + 1;
        return a;
      }, {}),
      routeProgressAchieved: describe(records.map((r) => r.peakRouteProgress)),
    };
    rows.push(row);
    console.log(
      `  ${v.name.padEnd(30)} distinct fitness = ${row.distinctFitnessValues}` +
        `/${records.length}, mean frames = ${row.framesSurvived.mean.toFixed(1)}`
    );
  }

  sim.setGlobal("routeDiscovery", null);
  const out = { config: { population: CONFIG.population, maxFrames: CONFIG.maxFrames }, rows };
  writeJson("e1_fitness_signal.json", out);
  return out;
}

/* ------------------------------------------------------------------ *
 * E2 — Fixed-policy baselines
 * ------------------------------------------------------------------ */
/**
 * Tune the rule-based baselines on the validation poses.
 *
 * A comparison is only meaningful if the baseline is presented at its best, so
 * each hand-written controller gets the same courtesy the learned agent gets:
 * a grid search over its own parameters, selected on validation poses that
 * never appear in the reported test figures.
 */
function tuneBaselines(ctx, poses) {
  console.log("\n[E2a] Baseline tuning on validation poses");
  const { sim, world } = ctx;
  sim.setGlobal("routeDiscovery", null);

  const score = (factory) => {
    const vals = poses.val.map(
      (pose) => evalControllerAtPose(sim, world, pose, factory).peakRouteProgress
    );
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const fsmGrid = [];
  for (const blockThreshold of [0.35, 0.45, 0.55, 0.65, 0.75]) {
    for (const brakeThreshold of [0.75, 0.85, 0.95]) {
      for (const asymmetry of [0.1, 0.25, 0.5]) {
        const params = { blockThreshold, brakeThreshold, asymmetry };
        fsmGrid.push({ params, val: score((v) => makeReactiveController(v, params)) });
      }
    }
  }
  fsmGrid.sort((a, b) => b.val - a.val);

  const pGrid = [];
  for (const kp of [0.8, 1.5, 2.2, 3.5, 5.0, 8.0]) {
    for (const deadband of [0.02, 0.05, 0.08, 0.15]) {
      for (const brakeThreshold of [0.75, 0.85, 0.95]) {
        const params = { kp, deadband, brakeThreshold };
        pGrid.push({ params, val: score((v) => makePController(v, params)) });
      }
    }
  }
  pGrid.sort((a, b) => b.val - a.val);

  const pursuitGrid = [];
  for (const lookahead of [120, 180, 220, 300, 400, 550]) {
    pursuitGrid.push({
      params: { lookahead },
      val: score((v, pose) => makePursuitController(v, pose.scorer, lookahead)),
    });
  }
  pursuitGrid.sort((a, b) => b.val - a.val);

  const best = {
    "Reactive-FSM": fsmGrid[0],
    "P-Controller": pGrid[0],
    "Pure-Pursuit (oracle)": pursuitGrid[0],
  };
  for (const [k, v] of Object.entries(best)) {
    console.log(`  ${k.padEnd(22)} best ${JSON.stringify(v.params)} -> ${v.val.toFixed(1)} px`);
  }

  const out = {
    note: "Selected on validation poses only; test poses never used for tuning.",
    grids: { "Reactive-FSM": fsmGrid, "P-Controller": pGrid, "Pure-Pursuit (oracle)": pursuitGrid },
    best,
  };
  writeJson("e2a_baseline_tuning.json", out);
  return best;
}

function experiment2(ctx, poses, tuned) {
  console.log("\n[E2] Fixed-policy baselines on held-out poses");
  const { sim, world } = ctx;
  sim.setGlobal("routeDiscovery", null);

  const arms = {
    "Random-NN": (vehicle) => makeNNController(sim, vehicle),
    "Reactive-FSM": (vehicle) => makeReactiveController(vehicle, tuned["Reactive-FSM"].params),
    "P-Controller": (vehicle) => makePController(vehicle, tuned["P-Controller"].params),
    "Pure-Pursuit (oracle)": (vehicle, pose) =>
      makePursuitController(vehicle, pose.scorer, tuned["Pure-Pursuit (oracle)"].params.lookahead),
  };

  const records = [];
  for (const entry of Object.entries(arms)) {
    const arm = entry[0];
    const factory = entry[1];
    for (const split of ["val", "test"]) {
      for (const pose of poses[split]) {
        // Random-NN is stochastic; average over the seed set. The others are
        // deterministic given a pose, so one episode is exhaustive.
        const seeds = arm === "Random-NN" ? CONFIG.seeds : [CONFIG.masterSeed];
        for (const seed of seeds) {
          sim.setRng(mulberry32(seed));
          const m = evalControllerAtPose(sim, world, pose, factory);
          records.push({ arm, split, pose: pose.id, seed, ...stripTrace(m) });
        }
      }
    }
    const testRecs = records.filter((r) => r.arm === arm && r.split === "test");
    console.log(
      `  ${arm.padEnd(22)} test route = ${describe(
        testRecs.map((r) => r.peakRouteProgress)
      ).mean.toFixed(1)} px, collisions = ${testRecs.reduce((a, r) => a + r.collided, 0)}/${
        testRecs.length
      }`
    );
  }

  const summary = {};
  for (const arm of Object.keys(arms)) {
    summary[arm] = {
      val: summarise(records.filter((r) => r.arm === arm && r.split === "val")),
      test: summarise(records.filter((r) => r.arm === arm && r.split === "test")),
    };
  }
  const out = { config: { poses: CONFIG.poses, maxFrames: CONFIG.maxFrames }, records, summary };
  writeJson("e2_baselines.json", out);
  return out;
}

/* ------------------------------------------------------------------ *
 * E3 — Neuroevolution training arms
 * ------------------------------------------------------------------ */
function experiment3(ctx) {
  console.log("\n[E3] Neuroevolution training arms");
  const { sim, map, startMark, world } = ctx;

  // Pinned as-committed behaviour: the original scorer *and* the original
  // id-stripping loader, so the baseline arm is unaffected by the repairs
  // applied to utils/pathfinder.js and utils/nodeGraph.js.
  const LegacyRouteDiscovery = makeLegacyRouteDiscovery(sim);
  const shippedScorer = new LegacyRouteDiscovery(makeLegacyGraph(sim, map.graph));
  shippedScorer.calculateDistances(startMark.center);

  const arms = [
    {
      name: "NE-A: as-committed",
      fitness: () => sim.setGlobal("routeDiscovery", shippedScorer),
      operator: "clone-elite",
    },
    {
      name: "NE-B: euclidean fitness",
      fitness: () => sim.setGlobal("routeDiscovery", null),
      operator: "clone-elite",
    },
    {
      name: "NE-C: corrected route fitness",
      fitness: () => sim.setGlobal("routeDiscovery", world.evalScorer),
      operator: "clone-elite",
    },
    {
      name: "NE-D: corrected + tournament/crossover",
      fitness: () => sim.setGlobal("routeDiscovery", world.evalScorer),
      operator: "tournament-crossover",
    },
  ];

  const runs = [];
  for (const arm of arms) {
    for (const seed of CONFIG.seeds) {
      const t0 = Date.now();
      arm.fitness();
      const rand = mulberry32(seed);
      sim.setRng(mulberry32(seed ^ 0xa5a5));
      const res = evolve(
        sim,
        world,
        {
          population: CONFIG.population,
          generations: CONFIG.generations,
          operator: arm.operator,
          eliteCount: CONFIG.eliteCount,
          tournamentSize: CONFIG.tournamentSize,
          mutationRate: CONFIG.mutationRate,
          boostEvery: CONFIG.boostEvery,
          boostRate: CONFIG.boostRate,
          layers: CONFIG.layers,
          maxFrames: CONFIG.maxFrames,
          maxSpeed: CONFIG.maxSpeed,
          startMark,
        },
        rand
      );
      const last = res.history[res.history.length - 1];
      runs.push({
        arm: arm.name,
        operator: arm.operator,
        seed,
        wallMs: Date.now() - t0,
        episodes: res.episodes,
        history: res.history,
        bestFitness: res.bestFitness,
        finalBestRouteProgress: last.bestRouteProgress,
        bestGenome: res.bestGenome,
      });
      console.log(
        `  ${arm.name.padEnd(38)} seed ${seed}: best fitness ${res.bestFitness.toFixed(1)}, ` +
          `final-gen best route ${last.bestRouteProgress.toFixed(1)} px, ${(
            (Date.now() - t0) /
            1000
          ).toFixed(1)} s`
      );
    }
  }

  sim.setGlobal("routeDiscovery", null);
  const out = { config: CONFIG, runs };
  writeJson("e3_training.json", out);
  return out;
}

/* ------------------------------------------------------------------ *
 * E4 — Ablations (selected on the validation poses only)
 * ------------------------------------------------------------------ */
function experiment4(ctx, poses) {
  console.log("\n[E4] Ablations");
  const { sim, startMark, world } = ctx;

  const variants = [
    { group: "architecture", name: "no hidden layer [5-4]", layers: [4] },
    { group: "architecture", name: "checkpoint [5-6-4]", layers: [6, 4] },
    { group: "architecture", name: "current [5-12-10-4]", layers: [12, 10, 4] },
    { group: "architecture", name: "wide [5-24-16-4]", layers: [24, 16, 4] },
    { group: "mutation", name: "rate 0.05", mutationRate: 0.05 },
    { group: "mutation", name: "rate 0.15 (default)", mutationRate: 0.15 },
    { group: "mutation", name: "rate 0.30", mutationRate: 0.3 },
    { group: "mutation", name: "rate 0.50", mutationRate: 0.5 },
    { group: "sensing", name: "3 beams", beamCount: 3 },
    { group: "sensing", name: "5 beams (default)", beamCount: 5 },
    { group: "sensing", name: "7 beams", beamCount: 7 },
    { group: "sensing", name: "range 120 px", beamLength: 120 },
    { group: "sensing", name: "range 220 px (default)", beamLength: 220 },
    { group: "sensing", name: "range 320 px", beamLength: 320 },
  ];

  const seeds = CONFIG.seeds.slice(0, CONFIG.ablationSeeds);
  const rows = [];

  for (const v of variants) {
    const layers = v.layers || CONFIG.layers;
    const mutationRate = v.mutationRate === undefined ? CONFIG.mutationRate : v.mutationRate;
    const beamCount = v.beamCount === undefined ? 5 : v.beamCount;
    const beamLength = v.beamLength === undefined ? 220 : v.beamLength;

    const perSeed = [];
    for (const seed of seeds) {
      sim.setGlobal("routeDiscovery", world.evalScorer);
      sim.setRng(mulberry32(seed ^ 0xa5a5));
      const rand = mulberry32(seed);

      const res = evolve(
        sim,
        world,
        {
          population: CONFIG.population,
          generations: CONFIG.ablationGenerations,
          operator: "tournament-crossover",
          eliteCount: CONFIG.eliteCount,
          tournamentSize: CONFIG.tournamentSize,
          mutationRate,
          layers,
          beamCount,
          beamLength,
          maxFrames: CONFIG.maxFrames,
          maxSpeed: CONFIG.maxSpeed,
          startMark,
        },
        rand
      );

      sim.setGlobal("routeDiscovery", null);
      const valScores = poses.val.map(
        (pose) =>
          evalControllerAtPose(sim, world, pose, (veh) => makeNNController(sim, veh), {
            brain: res.bestGenome,
            beamCount,
            beamLength,
          }).peakRouteProgress
      );

      perSeed.push({
        seed,
        trainBestFitness: res.bestFitness,
        valMeanRouteProgress: valScores.reduce((a, b) => a + b, 0) / valScores.length,
      });
    }

    const row = {
      group: v.group,
      name: v.name,
      layers,
      mutationRate,
      beamCount,
      beamLength,
      parameters: countParameters(beamCount, layers),
      trainBestFitness: describe(perSeed.map((s) => s.trainBestFitness)),
      valMeanRouteProgress: describe(perSeed.map((s) => s.valMeanRouteProgress)),
      perSeed,
    };
    rows.push(row);
    console.log(
      `  ${(v.group + "/" + v.name).padEnd(38)} val route = ${row.valMeanRouteProgress.mean.toFixed(
        1
      )} +/- ${row.valMeanRouteProgress.sd.toFixed(1)} px`
    );
  }

  const out = { config: { seeds, generations: CONFIG.ablationGenerations }, rows };
  writeJson("e4_ablations.json", out);
  return out;
}

function countParameters(inputs, layers) {
  const widths = [inputs, ...layers];
  let p = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    p += widths[i] * widths[i + 1] + widths[i + 1];
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * E5 — Final held-out comparison
 * ------------------------------------------------------------------ */
function experiment5(ctx, poses, e3, tuned) {
  console.log("\n[E5] Final held-out evaluation");
  const { sim, world } = ctx;
  sim.setGlobal("routeDiscovery", null);

  const records = [];

  for (const run of e3.runs) {
    for (const pose of poses.test) {
      sim.setRng(mulberry32(run.seed));
      const m = evalControllerAtPose(sim, world, pose, (veh) => makeNNController(sim, veh), {
        brain: run.bestGenome,
      });
      records.push({ arm: run.arm, seed: run.seed, pose: pose.id, ...stripTrace(m) });
    }
  }

  const fixedArms = {
    "Reactive-FSM": (vehicle) => makeReactiveController(vehicle, tuned["Reactive-FSM"].params),
    "P-Controller": (vehicle) => makePController(vehicle, tuned["P-Controller"].params),
    "Pure-Pursuit (oracle)": (vehicle, pose) =>
      makePursuitController(vehicle, pose.scorer, tuned["Pure-Pursuit (oracle)"].params.lookahead),
  };
  for (const entry of Object.entries(fixedArms)) {
    const arm = entry[0];
    const factory = entry[1];
    for (const pose of poses.test) {
      sim.setRng(mulberry32(CONFIG.masterSeed));
      const m = evalControllerAtPose(sim, world, pose, factory);
      records.push({ arm, seed: CONFIG.masterSeed, pose: pose.id, ...stripTrace(m) });
    }
  }

  // Pose-wise aggregation: one value per (arm, pose), averaged over seeds.
  const arms = [...new Set(records.map((r) => r.arm))];
  const poseMeans = {};
  for (const arm of arms) {
    poseMeans[arm] = poses.test.map((pose) => {
      const rs = records.filter((r) => r.arm === arm && r.pose === pose.id);
      return rs.reduce((a, r) => a + r.peakRouteProgress, 0) / rs.length;
    });
  }

  const summary = {};
  for (const arm of arms) summary[arm] = summarise(records.filter((r) => r.arm === arm));

  const boot = mulberry32(CONFIG.masterSeed ^ 0xb007);
  for (const arm of arms) {
    summary[arm].meanCI = bootstrapCI(poseMeans[arm], boot, CONFIG.bootstrapIterations);
  }

  const comparisons = [];
  const reference = "NE-D: corrected + tournament/crossover";
  for (const arm of arms) {
    if (arm === reference || !poseMeans[reference]) continue;
    comparisons.push({
      a: reference,
      b: arm,
      metric: "peakRouteProgress (pose means)",
      mannWhitney: mannWhitneyU(poseMeans[reference], poseMeans[arm]),
      cliffsDelta: cliffsDelta(poseMeans[reference], poseMeans[arm]),
      meanA: describe(poseMeans[reference]).mean,
      meanB: describe(poseMeans[arm]).mean,
    });
  }

  for (const arm of arms) {
    console.log(
      `  ${arm.padEnd(38)} route ${summary[arm].peakRouteProgress.mean.toFixed(1)} px, ` +
        `collision rate ${(summary[arm].collided.mean * 100).toFixed(0)}%`
    );
  }

  const out = {
    config: { testPoses: poses.test.map((p) => ({ id: p.id, x: p.center.x, y: p.center.y })) },
    records,
    poseMeans,
    summary,
    comparisons,
  };
  writeJson("e5_final.json", out);
  return out;
}

/* ------------------------------------------------------------------ *
 * Driver
 * ------------------------------------------------------------------ */
function main() {
  const tStart = Date.now();
  console.log(`Building world (smoke=${SMOKE}) ...`);
  const ctx = buildWorld();
  console.log(
    `  graph: ${ctx.map.graph.points.length} nodes / ${ctx.map.graph.segments.length} segments, ` +
      `${ctx.map.roadBorders.length} border segments`
  );

  const poses = samplePoses(ctx.sim, ctx.map, ctx.evalScorer, CONFIG.poses);
  console.log(`  poses: ${poses.val.length} validation, ${poses.test.length} test`);

  const want = (id) => !ONLY || ONLY.includes(id);
  const store = {};

  if (want("E1")) store.e1 = experiment1(ctx);

  let tuned = null;
  const tunedPath = path.join(RESULTS, "e2a_baseline_tuning.json");
  if (want("E2") || want("E5")) {
    tuned = fs.existsSync(tunedPath) && !want("E2")
      ? JSON.parse(fs.readFileSync(tunedPath, "utf8")).best
      : tuneBaselines(ctx, poses);
  }

  if (want("E2")) store.e2 = experiment2(ctx, poses, tuned);
  if (want("E3")) store.e3 = experiment3(ctx);
  if (want("E4")) store.e4 = experiment4(ctx, poses);
  if (want("E5")) {
    const e3 =
      store.e3 || JSON.parse(fs.readFileSync(path.join(RESULTS, "e3_training.json"), "utf8"));
    store.e5 = experiment5(ctx, poses, e3, tuned);
  }

  const elapsed = (Date.now() - tStart) / 1000;
  writeJson("run_manifest.json", {
    smoke: SMOKE,
    config: CONFIG,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    elapsedSeconds: elapsed,
    experiments: Object.keys(store),
  });
  console.log(`\nDone in ${elapsed.toFixed(1)} s`);
}

main();
