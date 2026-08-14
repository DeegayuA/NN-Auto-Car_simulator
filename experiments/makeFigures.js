/**
 * makeFigures.js — Render every figure used in the final report as SVG.
 *
 * Reads the JSON produced by runExperiments.js (plus datasetStats.js) and
 * writes self-contained SVG files to experiments/figures/.  Two figures — the
 * network map and the trajectory overlay — re-run short episodes to obtain
 * geometry, so the simulation context is loaded here as well.
 *
 * Usage:  node experiments/makeFigures.js
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
} = require("./harness/env");
const { runEpisode, makeVehicle } = require("./harness/episode");
const { cloneGenome } = require("./harness/ga");
const S = require("./harness/svg");

const RESULTS = path.join(__dirname, "results");
const FIGS = path.join(__dirname, "figures");

const read = (n) => JSON.parse(fs.readFileSync(path.join(RESULTS, n), "utf8"));
const write = (n, svg) => {
  fs.writeFileSync(path.join(FIGS, n), svg);
  console.log("  " + n + "  " + (svg.length / 1024).toFixed(0) + " KB");
};

const ARM_SHORT = {
  "NE-A: as-committed": "NE-A as-committed",
  "NE-B: euclidean fitness": "NE-B Euclidean",
  "NE-C: corrected route fitness": "NE-C route",
  "NE-D: corrected + tournament/crossover": "NE-D route + crossover",
  "Reactive-FSM": "Reactive FSM",
  "P-Controller": "P-controller",
  "Pure-Pursuit (oracle)": "Pure pursuit (oracle)",
  "Random-NN": "Random NN",
};
const short = (a) => ARM_SHORT[a] || a;

/* ------------------------------------------------------------------ *
 * Figure — the ingested road network
 * ------------------------------------------------------------------ */
function figMap(map, testPoses, startMark) {
  const W = 720;
  const H = 430;
  const pad = 26;
  const xs = map.graph.points.map((p) => p.x);
  const ys = map.graph.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad - 40) / (maxY - minY));
  const tx = (x) => pad + (x - minX) * sc;
  const ty = (y) => pad + 34 + (y - minY) * sc;

  let s = S.svgOpen(W, H, "Ingested OpenStreetMap road network");
  s += S.text(
    16,
    22,
    `Ingested road network (${map.graph.points.length} nodes, ${map.graph.segments.length} segments)`,
    { size: 13.5, fill: S.C.ink, weight: 700 }
  );

  for (const b of map.buildings) {
    const pts = b.base.points.map((p) => `${tx(p.x)},${ty(p.y)}`).join(" ");
    s += `<polygon points="${pts}" fill="#f0efec" stroke="none"/>`;
  }
  let d = "";
  for (const seg of map.graph.segments) {
    d += `M${tx(seg.p1.x)} ${ty(seg.p1.y)}L${tx(seg.p2.x)} ${ty(seg.p2.y)}`;
  }
  s += `<path d="${d}" stroke="${S.C.axis}" stroke-width="1.6" fill="none"/>`;

  for (const p of testPoses) {
    s += `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="4" fill="${
      S.C.series[1]
    }" stroke="#ffffff" stroke-width="1.5"/>`;
  }
  s += `<circle cx="${tx(startMark.center.x)}" cy="${ty(
    startMark.center.y
  )}" r="7" fill="${S.C.series[0]}" stroke="#ffffff" stroke-width="2"/>`;

  s += `<circle cx="24" cy="${H - 16}" r="5" fill="${S.C.series[0]}"/>`;
  s += S.text(34, H - 16, "training start pose", { size: 9.5, baseline: "middle" });
  s += `<circle cx="176" cy="${H - 16}" r="4" fill="${S.C.series[1]}"/>`;
  s += S.text(186, H - 16, `${testPoses.length} held-out test poses`, {
    size: 9.5,
    baseline: "middle",
  });
  s += S.text(W - 16, H - 16, "grey fills: generated building footprints", {
    size: 9,
    fill: S.C.muted,
    anchor: "end",
    baseline: "middle",
  });
  return s + S.svgClose();
}

/* ------------------------------------------------------------------ *
 * Figure — data quality: node degree
 * ------------------------------------------------------------------ */
function figData(stats) {
  const deg = Object.entries(stats.degreeHistogram)
    .map(([k, v]) => ({ label: `degree ${k}`, value: v }))
    .sort((a, b) => parseInt(a.label.slice(7), 10) - parseInt(b.label.slice(7), 10));
  return S.groupedBars({
    title: "Road-graph node degree distribution",
    subtitle:
      "Degree-1 nodes are dead ends; degree >= 3 nodes are the intersections where most failures occur.",
    groups: deg,
    yLabel: "nodes",
    width: 720,
    height: 250,
  });
}

/* ------------------------------------------------------------------ *
 * Figure — fitness-signal diagnostic
 * ------------------------------------------------------------------ */
function figSignal(e1) {
  const data = e1.rows.map((r, i) => ({
    label: r.variant,
    value: r.distinctFitnessValues,
    color: i === 0 ? S.C.critical : S.C.series[0],
  }));
  return S.barChartH({
    title: "Selection signal: distinct fitness values in one generation",
    subtitle: `Population of ${e1.rows[0].populationSize}. A value of 1 means every individual ties, so selection is a coin flip.`,
    data,
    xLabel: "distinct fitness values out of " + e1.rows[0].populationSize,
    labelW: 235,
    valueFormat: (v) => v.toFixed(0),
  });
}

function figSignalFrames(e1) {
  const data = e1.rows.map((r, i) => ({
    label: r.variant,
    value: r.framesSurvived.mean,
    err: [
      Math.max(0, r.framesSurvived.mean - r.framesSurvived.se * 1.96),
      r.framesSurvived.mean + r.framesSurvived.se * 1.96,
    ],
    color: i === 0 ? S.C.critical : S.C.series[0],
  }));
  return S.barChartH({
    title: "Mean episode length under each objective",
    subtitle:
      "Frames survived before termination (60 fps). Whiskers show the 95% interval on the mean.",
    data,
    xLabel: "frames",
    labelW: 235,
  });
}

/* ------------------------------------------------------------------ *
 * Figure — learning curves
 * ------------------------------------------------------------------ */
function figLearning(e3) {
  const arms = [...new Set(e3.runs.map((r) => r.arm))];
  const series = arms.map((arm) => {
    const runs = e3.runs.filter((r) => r.arm === arm);
    const gens = runs[0].history.length;
    const points = [];
    const band = [];
    for (let g = 0; g < gens; g++) {
      const vals = runs.map((r) => r.history[g].bestRouteProgress).sort((a, b) => a - b);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      points.push([g + 1, mean]);
      band.push([g + 1, vals[0], vals[vals.length - 1]]);
    }
    return { name: short(arm), points, band };
  });
  return S.lineChart({
    title: "Learning curves: best route progress per generation",
    subtitle: `Mean over ${
      e3.runs.filter((r) => r.arm === e3.runs[0].arm).length
    } seeds; shaded band spans min-max across seeds.`,
    series,
    xLabel: "generation",
    yLabel: "route progress (px)",
    width: 720,
    height: 340,
  });
}

function figSelection(e3) {
  const arms = [...new Set(e3.runs.map((r) => r.arm))];
  const series = arms.map((arm) => {
    const runs = e3.runs.filter((r) => r.arm === arm);
    const gens = runs[0].history.length;
    const points = [];
    for (let g = 0; g < gens; g++) {
      const vals = runs.map((r) => r.history[g].distinctFitness);
      points.push([g + 1, vals.reduce((a, b) => a + b, 0) / vals.length]);
    }
    return { name: short(arm), points };
  });
  return S.lineChart({
    title: "Selection pressure over training",
    subtitle:
      "Distinct fitness values per generation. A flat line at 1 means the objective never separates the population.",
    series,
    xLabel: "generation",
    yLabel: "distinct fitness values",
    width: 720,
    height: 300,
  });
}

/* ------------------------------------------------------------------ *
 * Figure — final held-out comparison
 * ------------------------------------------------------------------ */
function figFinal(e5) {
  const data = Object.keys(e5.summary)
    .map((a) => ({
      label: short(a),
      value: e5.summary[a].peakRouteProgress.mean,
      err: [e5.summary[a].meanCI.lo, e5.summary[a].meanCI.hi],
      color: a.startsWith("NE-D")
        ? S.C.series[0]
        : a.includes("oracle")
        ? S.C.muted
        : a.startsWith("NE")
        ? S.C.series[2]
        : S.C.series[1],
    }))
    .sort((a, b) => b.value - a.value);
  return S.barChartH({
    title: "Route progress on held-out start poses",
    subtitle:
      "Mean of per-pose means; whiskers are percentile bootstrap 95% CIs (2000 resamples). Higher is better.",
    data,
    xLabel: "route progress (px)",
    labelW: 205,
  });
}

function figCollision(e5) {
  const data = Object.keys(e5.summary)
    .map((a) => ({
      label: short(a),
      value: e5.summary[a].collided.mean * 100,
      color: a.startsWith("NE-D") ? S.C.series[0] : S.C.series[1],
    }))
    .sort((a, b) => a.value - b.value);
  return S.barChartH({
    title: "Collision rate on held-out poses",
    subtitle: "Share of episodes ending in contact with a road boundary. Lower is better.",
    data,
    xLabel: "collision rate (%)",
    labelW: 205,
    valueFormat: (v) => v.toFixed(0) + "%",
  });
}

function figTermination(e5) {
  const causes = ["collision", "stagnation", "timeout"];
  const categories = Object.keys(e5.summary).map((a) => ({
    label: short(a),
    parts: causes.map((c) => ({ name: c, value: e5.summary[a].terminationMix[c] || 0 })),
  }));
  return S.stackedBars({
    title: "How episodes end",
    subtitle:
      "Timeout means the agent was still driving when the frame budget expired - the only good outcome here.",
    categories,
    partNames: ["collision", "stagnation / reversal", "survived to timeout"],
    partColors: [S.C.critical, S.C.warning, S.C.good],
    labelW: 205,
  });
}

/* ------------------------------------------------------------------ *
 * Figure — ablations
 * ------------------------------------------------------------------ */
function figAblation(e4, group, title, subtitle) {
  const rows = e4.rows.filter((r) => r.group === group);
  return S.groupedBars({
    title,
    subtitle,
    groups: rows.map((r) => ({
      label: r.name,
      value: r.valMeanRouteProgress.mean,
      err: r.valMeanRouteProgress.sd,
      color:
        r.name.includes("default") || r.name.includes("current") ? S.C.series[0] : S.C.series[2],
    })),
    yLabel: "validation route progress (px)",
    width: 720,
    height: 275,
  });
}

/* ------------------------------------------------------------------ *
 * Figure — trajectory overlay
 * ------------------------------------------------------------------ */
function figTrajectories(sim, map, grid, pose, champion, tunedFsm) {
  const scorer = new RouteScorer(sim, map.graph).calculateDistances(pose.center);
  const world = { map, grid, evalScorer: scorer };
  sim.setGlobal("routeDiscovery", null);

  const specs = [
    { name: "NE-D champion", color: S.C.series[0], make: (v) => makeNNController(sim, v), brain: champion },
    {
      name: "Reactive FSM",
      color: S.C.series[1],
      make: (v) => makeReactiveController(v, tunedFsm),
      brain: null,
    },
  ];
  const runs = [];
  for (const sp of specs) {
    sim.setRng(mulberry32(11));
    const v = makeVehicle(sim, pose, { maxSpeed: 6 });
    if (sp.brain) v.brain = cloneGenome(sp.brain);
    const m = runEpisode(sim, world, v, sp.make(v), { maxFrames: 1200, trace: true });
    runs.push({ ...sp, m });
  }

  const all = runs.flatMap((r) => r.m.trace || []);
  if (all.length < 2) return S.svgOpen(720, 100, "trajectories") + S.svgClose();
  const pad = 110;
  const minX = Math.min(...all.map((p) => p[0])) - pad;
  const maxX = Math.max(...all.map((p) => p[0])) + pad;
  const minY = Math.min(...all.map((p) => p[1])) - pad;
  const maxY = Math.max(...all.map((p) => p[1])) + pad;

  const W = 720;
  const H = 360;
  const sc = Math.min((W - 40) / (maxX - minX), (H - 100) / (maxY - minY));
  const tx = (x) => 20 + (x - minX) * sc;
  const ty = (y) => 56 + (y - minY) * sc;

  let s = S.svgOpen(W, H, "Trajectory overlay");
  s += S.text(16, 22, "Trajectories from one held-out start pose", {
    size: 13.5,
    fill: S.C.ink,
    weight: 700,
  });
  s += S.text(
    16,
    40,
    "Road boundaries in grey. The black dot is the shared start; a cross marks where each run ended.",
    { size: 10.5, fill: S.C.muted }
  );

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const radius = Math.max(maxX - minX, maxY - minY);
  let bd = "";
  for (const b of grid.query({ x: cx, y: cy }, radius)) {
    bd += `M${tx(b.p1.x)} ${ty(b.p1.y)}L${tx(b.p2.x)} ${ty(b.p2.y)}`;
  }
  s += `<path d="${bd}" stroke="${S.C.grid}" stroke-width="1.4" fill="none"/>`;

  runs.forEach((r, i) => {
    const t = r.m.trace;
    if (!t.length) return;
    const d = t.map((p, j) => `${j ? "L" : "M"}${tx(p[0])} ${ty(p[1])}`).join(" ");
    s += `<path d="${d}" stroke="${r.color}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    const last = t[t.length - 1];
    s += `<path d="M${tx(last[0]) - 5} ${ty(last[1]) - 5}l10 10M${tx(last[0]) + 5} ${
      ty(last[1]) - 5
    }l-10 10" stroke="${r.color}" stroke-width="2.4" stroke-linecap="round"/>`;
    s += `<rect x="${20 + i * 300}" y="${H - 22}" width="10" height="10" rx="2" fill="${r.color}"/>`;
    s += S.text(
      34 + i * 300,
      H - 17,
      `${r.name}: ${Math.round(r.m.peakRouteProgress)} px, ended by ${r.m.cause}`,
      { size: 9.5, baseline: "middle" }
    );
  });
  s += `<circle cx="${tx(pose.center.x)}" cy="${ty(pose.center.y)}" r="5" fill="${
    S.C.ink
  }" stroke="#fff" stroke-width="1.5"/>`;
  return s + S.svgClose();
}

/* ------------------------------------------------------------------ *
 * Figure — system architecture
 * ------------------------------------------------------------------ */
function figArchitecture() {
  const W = 720;
  const H = 400;
  let s = S.svgOpen(W, H, "System architecture");
  s += S.text(16, 22, "End-to-end pipeline", { size: 13.5, fill: S.C.ink, weight: 700 });

  const box = (x, y, w, h, label, sub, color) => {
    let o = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="${color}" stroke-width="1.8"/>`;
    o += S.text(x + w / 2, y + (sub ? 20 : h / 2 + 4), label, {
      size: 11,
      anchor: "middle",
      fill: S.C.ink,
      weight: 700,
    });
    if (sub) {
      sub.split("\n").forEach((ln, i) => {
        o += S.text(x + w / 2, y + 38 + i * 13, ln, { size: 9.2, anchor: "middle", fill: S.C.muted });
      });
    }
    return o;
  };
  const arrow = (x1, y1, x2, y2, label) => {
    let o = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${S.C.axis}" stroke-width="1.6" marker-end="url(#ah)"/>`;
    if (label) {
      o += S.text((x1 + x2) / 2 + 4, (y1 + y2) / 2 - 5, label, {
        size: 8.8,
        anchor: "middle",
        fill: S.C.muted,
      });
    }
    return o;
  };

  s += `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${S.C.axis}"/></marker></defs>`;

  s += box(20, 46, 150, 62, "OpenStreetMap", "Overpass extract\nnodes + ways", S.C.series[2]);
  s += box(20, 140, 150, 76, "Graph builder", "envelopes, polygon\nunion, road borders", S.C.series[2]);
  s += box(20, 248, 150, 76, "Dijkstra field", "route progress\nper node", S.C.series[2]);

  s += box(230, 46, 160, 62, "LiDAR array", "5 rays, pi/2 FOV\n220 px range", S.C.series[1]);
  s += box(230, 140, 160, 76, "MLP policy", "5-12-10-4,\nstep activation", S.C.series[0]);
  s += box(230, 248, 160, 76, "Kinematics", "speed, friction,\nheading-coupled turn", S.C.series[1]);

  s += box(450, 46, 170, 62, "Fitness", "route progress at\ntermination", S.C.series[0]);
  s += box(450, 140, 170, 76, "Genetic algorithm", "elitism, tournament,\nuniform crossover", S.C.series[0]);
  s += box(450, 248, 170, 76, "Evaluation", "held-out poses,\nbootstrap + MWU", S.C.series[3]);

  s += arrow(95, 108, 95, 140);
  s += arrow(95, 216, 95, 248);
  s += arrow(170, 178, 230, 178, "borders");
  s += arrow(310, 108, 310, 140, "sensors");
  s += arrow(310, 216, 310, 248, "4 bits");
  s += arrow(390, 286, 450, 108, "");
  s += arrow(535, 108, 535, 140, "score");
  s += arrow(535, 216, 535, 248, "champion");
  s += arrow(450, 178, 390, 178, "genome");

  s += S.text(
    20,
    H - 14,
    "Green: data engineering.   Orange: simulation.   Blue: learning.   Yellow: measurement.",
    { size: 9, fill: S.C.muted }
  );
  return s + S.svgClose();
}

/* ------------------------------------------------------------------ */
function main() {
  console.log("Rendering figures...");
  const stats = read("dataset_stats.json");
  const e1 = read("e1_fitness_signal.json");
  const e3 = read("e3_training.json");
  const e4 = read("e4_ablations.json");
  const e5 = read("e5_final.json");
  const tuning = read("e2a_baseline_tuning.json");

  const sim = createSimContext(mulberry32(2026), true);
  const map = sim.simulationMap;
  const grid = new SpatialGrid(map.roadBorders, 256);
  const startMark = map.markings.find((m) => m.type === "start");

  write("fig_map.svg", figMap(map, e5.config.testPoses, startMark));
  write("fig_data.svg", figData(stats));
  write("fig_signal.svg", figSignal(e1));
  write("fig_signal_frames.svg", figSignalFrames(e1));
  write("fig_learning.svg", figLearning(e3));
  write("fig_selection.svg", figSelection(e3));
  write("fig_final.svg", figFinal(e5));
  write("fig_collision.svg", figCollision(e5));
  write("fig_termination.svg", figTermination(e5));
  write(
    "fig_ablation_arch.svg",
    figAblation(
      e4,
      "architecture",
      "Ablation: network architecture",
      "Champion evaluated on validation poses; error bars are the standard deviation over seeds."
    )
  );
  write(
    "fig_ablation_mut.svg",
    figAblation(e4, "mutation", "Ablation: mutation rate", "Same protocol; all other settings fixed.")
  );
  write(
    "fig_ablation_sense.svg",
    figAblation(e4, "sensing", "Ablation: sensor geometry", "Beam count and beam range, varied independently.")
  );
  write("fig_architecture.svg", figArchitecture());

  // Trajectory overlay: best NE-D champion vs the tuned FSM on the first test
  // pose. The heading is recovered from the graph exactly as samplePoses does.
  const best = e3.runs
    .filter((r) => r.arm.startsWith("NE-D"))
    .sort((a, b) => b.bestFitness - a.bestFitness)[0];
  // Choose the pose where the two controllers most disagree, so the figure
  // shows a real behavioural difference rather than two overlapping lines.
  const dArm = "NE-D: corrected + tournament/crossover";
  const fArm = "Reactive-FSM";
  let bestIdx = 0;
  let bestGap = -1;
  e5.config.testPoses.forEach((_, i) => {
    const gap = Math.abs(e5.poseMeans[dArm][i] - e5.poseMeans[fArm][i]);
    if (gap > bestGap) {
      bestGap = gap;
      bestIdx = i;
    }
  });
  const p0 = e5.config.testPoses[bestIdx];
  console.log(
    `  (trajectory pose ${p0.id}: NE-D ${Math.round(e5.poseMeans[dArm][bestIdx])} px vs FSM ${Math.round(
      e5.poseMeans[fArm][bestIdx]
    )} px)`
  );
  const node = map.graph.points.reduce(
    (bestP, p) =>
      Math.hypot(p.x - p0.x, p.y - p0.y) < Math.hypot(bestP.x - p0.x, bestP.y - p0.y) ? p : bestP,
    map.graph.points[0]
  );
  const seg = map.graph.segments.find((s) => s.p1 === node || s.p2 === node);
  const nb = seg.p1 === node ? seg.p2 : seg.p1;
  const pose = {
    id: p0.id,
    center: { x: node.x, y: node.y },
    directionVector: sim.normalizeVector(sim.subPoints(nb, node)),
  };
  write("fig_traj.svg", figTrajectories(sim, map, grid, pose, best.bestGenome, tuning.best["Reactive-FSM"].params));

  console.log("Done.");
}

main();
