/**
 * content.js — The report itself, as a block-model document.
 *
 * Every figure quoted in the prose is read out of the experiment JSON through
 * the helpers at the top of this file, so the text cannot drift away from the
 * data.  If an experiment is re-run, rebuilding the report updates the numbers.
 */

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */
const n0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "n/a");
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "n/a");
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const n3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "n/a");
const pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");
const px = (v) => n0(v) + " px";

const ARM = {
  A: "NE-A: as-committed",
  B: "NE-B: euclidean fitness",
  C: "NE-C: corrected route fitness",
  D: "NE-D: corrected + tournament/crossover",
  FSM: "Reactive-FSM",
  P: "P-Controller",
  PP: "Pure-Pursuit (oracle)",
  RND: "Random-NN",
};
const SHORT = {
  [ARM.A]: "NE-A as-committed",
  [ARM.B]: "NE-B Euclidean",
  [ARM.C]: "NE-C route",
  [ARM.D]: "NE-D route + crossover",
  [ARM.FSM]: "Reactive FSM",
  [ARM.P]: "P-controller",
  [ARM.PP]: "Pure pursuit (oracle)",
  [ARM.RND]: "Random NN",
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

function buildContent(D) {
  const { stats, e1, e2, e2a, e3, e4, e5, manifest, verify, git, host } = D;

  /* ---------------- derived quantities ---------------- */
  const runsOf = (arm) => e3.runs.filter((r) => r.arm === arm);
  const armSummary = (arm) => {
    const rs = runsOf(arm);
    return {
      seeds: rs.length,
      bestFitMean: mean(rs.map((r) => r.bestFitness)),
      bestFitSd: sd(rs.map((r) => r.bestFitness)),
      finalRouteMean: mean(rs.map((r) => r.finalBestRouteProgress)),
      finalRouteSd: sd(rs.map((r) => r.finalBestRouteProgress)),
      gen1Route: mean(rs.map((r) => r.history[0].bestRouteProgress)),
      distinct: mean(rs.map((r) => mean(r.history.map((h) => h.distinctFitness)))),
      wallS: mean(rs.map((r) => r.wallMs)) / 1000,
      episodes: rs[0].episodes,
    };
  };
  const S = {
    A: armSummary(ARM.A),
    B: armSummary(ARM.B),
    C: armSummary(ARM.C),
    D: armSummary(ARM.D),
  };
  const varianceRatio = S.C.bestFitSd / Math.max(1e-9, S.D.bestFitSd);
  const F = e5.summary;
  const cmp = (armName) => e5.comparisons.find((c) => c.b === armName) || {};
  const e1row = (i) => e1.rows[i];

  const totalEpisodes =
    e3.runs.reduce((a, r) => a + r.episodes, 0) +
    e4.rows.reduce(
      (a, r) => a + r.perSeed.length * e4.config.generations * manifest.config.population,
      0
    );

  const ablBy = (group) => e4.rows.filter((r) => r.group === group);
  const bestOf = (group) =>
    ablBy(group).reduce((b, r) =>
      r.valMeanRouteProgress.mean > b.valMeanRouteProgress.mean ? r : b
    );

  const testPoseCount = e5.config.testPoses.length;
  const valPoseCount = manifest.config.poses.val;
  const nParams = 5 * 12 + 12 + 12 * 10 + 10 + 10 * 4 + 4;

  const rankFinal = Object.keys(F).sort(
    (a, b) => F[b].peakRouteProgress.mean - F[a].peakRouteProgress.mean
  );

  const fig = (id, file, caption, wide = false) => ({
    t: "fig",
    id,
    file,
    caption,
    wide,
    svg: D.svg[file] || "",
  });

  /** A screenshot of the running application, inlined as a data URI. */
  const shot = (id, file, caption, wide = false) => ({
    t: "fig",
    id,
    file,
    caption,
    wide,
    svg: (D.png && D.png[file])
      ? `<img src="${D.png[file]}" alt="${caption.replace(/"/g, "'")}" style="width:100%;height:auto;display:block;border:0.4pt solid #c3c2b7"/>`
      : "",
  });

  const B = [];
  const p = (text) => B.push({ t: "p", text });
  const h1 = (text, id) => B.push({ t: "h1", text, id });
  const h2 = (text, id) => B.push({ t: "h2", text, id });
  const li = (items, ordered = false) => B.push({ t: "list", items, ordered });

  B.push({ t: "toc" });

  /* ================================================================
   * I. INTRODUCTION
   * ================================================================ */
  h1("Introduction", "intro");

  p(
    "Autonomous driving research is dominated by two kinds of artefact. At one end sit " +
      "photo-realistic simulators such as CARLA [[ref:carla]], which model sensing and dynamics in " +
      "great detail but present the control problem as a closed box: a student who trains a policy " +
      "inside one of them learns how to call an API, not how a perception-to-actuation loop is " +
      "constructed. At the other end sit toy demonstrations on closed oval tracks, where a car that " +
      "learns to hold a constant steering angle can look competent indefinitely. Neither extreme " +
      "forces the practitioner to confront the part of the problem that actually decides whether a " +
      "learned controller works: the quality of the objective it is optimising, and whether the " +
      "environment is structurally rich enough for that objective to mean anything."
  );
  p(
    "This capstone occupies the space between them. The system is a browser-based two-dimensional " +
      "driving simulator built from first principles — kinematics, ray-cast range sensing, polygon " +
      "collision detection, a multilayer perceptron and a genetic algorithm are all hand-written, " +
      "with no machine-learning framework and no game engine. Its world is not a hand-drawn oval but " +
      "a real road topology imported from OpenStreetMap [[ref:osm]]: " +
      `${n0(stats.counts.graphNodes)} nodes and ${n0(stats.counts.graphSegments)} centreline ` +
      `segments, expanded into ${n0(stats.counts.roadBorderSegments)} collision boundaries across a ` +
      `${n0(stats.bbox.widthPx)} x ${n0(stats.bbox.heightPx)} pixel extent. Because every layer is ` +
      "visible, the failure modes are visible too."
  );
  p(
    "That transparency turned out to matter more than expected. The central empirical finding of " +
      "this report is not that neuroevolution works — it does, and the numbers below quantify how " +
      "well — but that the version of the system submitted at the Milestone 2 technical checkpoint " +
      "**could not learn at all**, for a reason that no amount of watching the simulator run would " +
      "have revealed. The route-progress objective driving the genetic algorithm returned exactly " +
      "zero at every location in the world. Every individual in every generation tied. Selection was " +
      "a coin flip, and the visible behaviour — cars driving, dying, respawning, a generation counter " +
      "incrementing, a live network visualiser animating — was indistinguishable from learning. It " +
      "took a measurement harness, not a demonstration, to find it."
  );

  h2("Problem statement", "problem");
  p(
    "The problem addressed is the *evaluation* of neuroevolutionary control strategies for " +
      "autonomous driving in structurally complex road topologies. Concretely: given a vehicle with " +
      "a five-beam range sensor and four binary actuators, operating on a real urban road graph, how " +
      "far can a neural controller evolved by a genetic algorithm travel along the road network " +
      "before failing, and how does that compare against hand-written geometric controllers given " +
      "the same sensing and the same actuators?"
  );
  p(
    "The question is deliberately comparative. A neuroevolutionary result reported on its own is " +
      "uninterpretable: without a baseline, a policy that survives twenty seconds could be a " +
      "sophisticated navigator or a car driving in a large circle. The Milestone 1 project " +
      "definition committed to exactly this comparison — an evolved network against a rule-based " +
      "heuristic — and this report delivers it, together with the reference ceiling supplied by a " +
      "controller that is allowed to see the map."
  );

  h2("Contributions", "contributions");
  li([
    "**An end-to-end system**, from OpenStreetMap ingestion through geometric world construction, " +
      "synthetic range sensing, hand-written neural inference and evolutionary optimisation, to " +
      "quantitative evaluation — with no machine-learning dependencies of any kind.",
    "**A reproducible headless evaluation harness** that loads the unmodified browser simulation " +
      "sources into a Node.js context, installs a seeded pseudo-random generator in place of " +
      `\`Math.random\`, and replays episodes deterministically. Approximately ${n0(totalEpisodes)} ` +
      "training and evaluation episodes underpin the results reported here.",
    "**A diagnosed and repaired silent failure** in the fitness signal, with a controlled " +
      "measurement of its cost: the as-committed objective produced " +
      `${e1row(0).distinctFitnessValues} distinct fitness value across a population of ` +
      `${e1row(0).populationSize}, against ${e1row(2).distinctFitnessValues} for the repaired one.`,
    "**Four tuned baselines** — a random network, a reactive finite-state heuristic, a proportional " +
      "steering controller and a map-privileged pure-pursuit reference — each grid-searched on " +
      "validation poses so that the comparison is not a straw man.",
    "**A held-out generalisation protocol.** Training happens from a single start pose, exactly as " +
      `the interactive system does; evaluation happens on ${testPoseCount} start poses drawn from ` +
      "elsewhere in the road graph and never seen during training or tuning.",
    "**An ablation study** over network depth, mutation rate, sensor count and sensor range, whose " +
      "architecture result contradicts the direction the Milestone 2 checkpoint proposed to take.",
  ]);

  h2("Structure of this report", "structure");
  p(
    "[[sec:related]] positions the work against the neuroevolution and simulation literature. " +
      "[[sec:scope]] states the bounded scope choices and the research questions. [[sec:data]] " +
      "covers data sourcing, geometric engineering and data quality. [[sec:system]] and " +
      "[[sec:method]] describe the system and the learning algorithm. [[sec:baselines]] and " +
      "[[sec:protocol]] describe what the learned agent is measured against and how. " +
      "[[sec:results]] presents the results, [[sec:discussion]] interprets them, and " +
      "[[sec:limitations]] states the limitations and trade-offs. Appendix A is the required " +
      "reproducibility checklist; Appendix C records corrections to the earlier submissions."
  );

  B.push(
    fig(
      "arch",
      "fig_architecture.svg",
      "End-to-end pipeline. Geospatial data is compiled into a drivable world and a Dijkstra route-progress field; the vehicle senses that world through simulated range beams, a multilayer perceptron converts the readings into four actuator bits, and a genetic algorithm selects over the resulting behaviour. Measurement is deliberately kept separate from the training signal.",
      true
    )
  );

  /* ================================================================
   * II. RELATED WORK
   * ================================================================ */
  h1("Background and Related Work", "related");

  h2("Neuroevolution as an alternative to gradient methods");
  p(
    "Neuroevolution optimises the weights, and sometimes the topology, of a neural network with an " +
      "evolutionary algorithm rather than by gradient descent [[ref:holland,neat]]. Its appeal in " +
      "control is structural: the objective need not be differentiable, and no labelled trajectories " +
      "are required. In sequential decision problems the reward is typically sparse and delayed — a " +
      "vehicle either completes a manoeuvre or does not — which is precisely the regime where " +
      "backpropagation has nothing to propagate without an intermediate value function to " +
      "manufacture one."
  );
  p(
    "The practical viability of the approach at scale was demonstrated by Salimans et al., who " +
      "showed that a simple evolution strategy is competitive with policy-gradient reinforcement " +
      "learning on standard control benchmarks while parallelising almost perfectly [[ref:es]]. " +
      "Koutník et al. had earlier evolved recurrent controllers with over a million weights for " +
      "vision-based driving in TORCS [[ref:koutnik]]. Stanley and Miikkulainen's NEAT introduced " +
      "topology evolution with historical markings and speciation [[ref:neat]]; the present work " +
      "uses a fixed topology, a deliberate simplification whose consequences are discussed in " +
      "[[sec:limitations]]. End-to-end supervised imitation [[ref:bojarski]] represents the " +
      "alternative paradigm, and is excluded here precisely because it requires demonstration data " +
      "that this project has no way to obtain."
  );

  h2("Objective specification and deception");
  p(
    "The dominant failure mode of evolutionary control is not slow convergence but a badly " +
      "specified objective. Lehman and Stanley's work on deception showed that an objective function " +
      "can *actively* misdirect search toward dead ends, and that abandoning the objective in favour " +
      "of behavioural novelty often solves deceptive problems more reliably [[ref:novelty]]. The " +
      "wider literature on specification gaming and reward misspecification makes the same point " +
      "from the safety side [[ref:amodei]]."
  );
  p(
    "This report contributes an extreme and instructive case: an objective that is not deceptive but " +
      "*degenerate*. It does not point the search in a wrong direction; it points nowhere at all, " +
      "because it is constant. The distinction matters diagnostically. A deceptive objective produces " +
      "confident, wrong behaviour that improves on its own terms and is therefore detectable by " +
      "inspecting what the agent learned. A degenerate one produces a flat learning curve, a " +
      "population whose fitness values are identical, and a system that still *looks* like it is " +
      "training. Sculley et al.'s catalogue of hidden technical debt in machine-learning systems " +
      "anticipates exactly this class of fault: the entanglement of a data loader with a downstream " +
      "consumer that silently assumes a field the loader never populates [[ref:sculley]]."
  );

  h2("Simulation platforms and the transparency trade-off");
  p(
    "CARLA [[ref:carla]] and comparable platforms provide validated dynamics, sensor models and " +
      "traffic scenarios. The cost is opacity: a result obtained inside such a simulator is " +
      "conditional on modelling decisions the experimenter cannot inspect, and the sim-to-real gap " +
      "is addressed by techniques such as domain randomisation [[ref:tobin]] that presuppose control " +
      "over the very parameters a closed simulator hides. Building the simulator from scratch " +
      "inverts the trade: fidelity is much lower, but every assumption is auditable and every " +
      "failure is attributable. Given that the research question here concerns the *optimisation " +
      "process* rather than physical realism, that is the correct side of the trade to be on — a " +
      "position made concrete by the fact that the defect reported in [[sec:results]] would have " +
      "been invisible behind a simulator API."
  );

  h2("Evaluation methodology in evolutionary and reinforcement learning");
  p(
    "A recurring criticism of empirical work in this area is that results are reported from a " +
      "single run, on the conditions the method was developed against, without a competitive " +
      "baseline. Each of those three omissions is individually sufficient to make a result " +
      "unfalsifiable, and together they describe the Milestone 2 draft of this project accurately. " +
      "The protocol adopted here is a direct response: multiple independent seeds with dispersion " +
      "reported rather than a single champion; a train/validation/test split over initial " +
      "conditions; baselines tuned on the validation split so that the comparison is not decided by " +
      "how much effort each side received; and rank-based tests with effect sizes rather than " +
      "means alone."
  );
  p(
    "Two methodological choices deserve explicit defence because they are less common. First, the " +
      "primary metric is computed with an instrument that is independent of the training signal: an " +
      "arm trained on a broken objective is still scored on a working one. Without this, an arm " +
      "cannot be compared against another that optimised something different, and the central " +
      "experiment of this report would have been impossible to state. Second, a *privileged* " +
      "reference controller is included. Reporting a learned agent's collision rate without knowing " +
      "what a controller with perfect map knowledge achieves on the same plant invites the reader " +
      "to attribute the entire residual to the policy; [[sec:results]] shows that attribution would " +
      "have been wrong by a wide margin."
  );

  h2("Geometric baselines");
  p(
    "Pure pursuit [[ref:coulter]] remains the standard geometric path-tracking baseline: it selects " +
      "a goal point a fixed look-ahead distance along a reference path and computes the curvature " +
      "that reaches it. It requires the path, which a learned agent operating on raw range readings " +
      "does not have, so in this study it serves as a privileged upper reference rather than as a " +
      "competing method. Reactive wall-following and proportional steering on sensor asymmetry are " +
      "the classical non-privileged heuristics, and both are implemented and tuned here."
  );

  /* ================================================================
   * III. SCOPE
   * ================================================================ */
  h1("Problem Definition and Scope", "scope");

  h2("Bounded scope choices");
  p(
    "Following the capstone's scoping framework, the project is defined by four explicit choices, " +
      "unchanged from the Milestone 1 definition:"
  );
  li([
    "**Problem type — control and optimisation.** The system emits actuation commands to maximise " +
      "an objective, rather than predicting a label.",
    "**Data type — graph and synthetic sensor data.** The environment is a geospatial graph " +
      "(OpenStreetMap nodes and ways); the agent observes only synthetic range readings derived from " +
      "ray casting against that geometry.",
    "**Technique category — neuroevolution.** A fixed-topology multilayer perceptron whose weights " +
      "are optimised by a genetic algorithm.",
    "**System context — comparative analysis.** The deliverable is a testbed producing empirical " +
      "comparisons between control strategies, not a deployed product.",
  ]);
  p(
    "No external large language model is used anywhere in the pipeline, so the capstone's " +
      "requirements governing LLM-based projects do not apply to this submission."
  );

  h2("Research questions");
  li([
    "**RQ1.** Does the route-progress objective as committed at the technical checkpoint provide " +
      "usable selection pressure?",
    "**RQ2.** How much does the choice of fitness definition — degenerate route progress, Euclidean " +
      "displacement, or corrected route progress — change what is learned?",
    "**RQ3.** Does replacing the shipped clone-and-mutate reproduction operator with tournament " +
      "selection and uniform crossover improve final performance, its variance, or neither?",
    "**RQ4.** How does the best evolved controller compare with tuned rule-based baselines and with " +
      "a map-privileged reference on start poses never seen during training?",
    "**RQ5.** Which design choices — network depth, mutation rate, sensor count, sensor range — " +
      "actually matter?",
  ]);

  h2("Success criteria");
  p(
    "The project succeeds if it produces a working end-to-end pipeline, a statistically defensible " +
      "comparison against at least one non-trivial baseline, and an honest account of where the " +
      "approach fails. Reaching a particular route-progress figure is explicitly *not* a success " +
      "criterion, because the appropriate figure is unknown a priori; the pure-pursuit reference " +
      "exists to supply that missing context."
  );

  /* ================================================================
   * IV. DATA
   * ================================================================ */
  h1("Data: Sources, Engineering and Quality", "data");

  h2("Source and provenance");
  p(
    "The world derives from OpenStreetMap [[ref:osm]]. Node coordinates and way geometry were " +
      "extracted through the Overpass API, projected into a planar pixel coordinate system, and " +
      "serialised into a single JavaScript module of " +
      `${n1(stats.sourceBytes / 1024 / 1024)} MB (\`simulation/simulationData.js\`, ` +
      `${n0(stats.sourceBytes)} bytes) that the browser loads directly. Deserialisation into live ` +
      `geometry takes ${n0(stats.loadMs)} ms. Committing the extract to the repository rather than ` +
      "querying Overpass at run time is a deliberate reproducibility decision: Overpass responses " +
      "vary with server state and with subsequent edits to the map, so a live query would make the " +
      "experiments unrepeatable."
  );
  p(
    "The second data source is entirely synthetic and generated online: the range readings produced " +
      "by casting rays from the vehicle against the road boundary geometry. These are the only " +
      "observations any learned policy in this study ever receives."
  );

  h2("From a road graph to a drivable world");
  p(
    "The centreline graph alone is not drivable — it has no width, no boundaries and nothing to " +
      "collide with. The world builder performs three geometric transformations. First, each " +
      "centreline segment is expanded into an *envelope*: a rounded rectangle of width " +
      `${stats.world.roadWidthPx} px, generated by sweeping ${stats.world.roadRoundness} points ` +
      "around each endpoint. Second, the envelope polygons are combined by a boolean union that " +
      "splits every pair of intersecting edges at their intersection point and discards edges lying " +
      "inside another polygon; what survives is the outline of the road surface. Third, that outline " +
      `becomes the ${n0(stats.counts.roadBorderSegments)} line segments used for both ray casting ` +
      "and collision detection. Buildings and trees are generated procedurally outside the road " +
      `envelope (${n0(stats.counts.buildings)} and ${n0(stats.counts.trees)} respectively); they are ` +
      "rendered but are not collidable, a modelling limitation recorded in [[sec:limitations]]."
  );

  B.push(
    fig(
      "map",
      "fig_map.svg",
      "The ingested road network. Grey fills are generated building footprints; the large marker is the single start pose used for all training, and the smaller markers are the held-out poses used for evaluation. The topology contains loops, T-junctions, cul-de-sacs and four-way intersections rather than a closed circuit.",
      true
    )
  );

  h2("Descriptive statistics");
  p(
    "[[tab:data]] summarises the ingested world. Two properties dominate the difficulty of the " +
      "control task. First, segment lengths are extremely heterogeneous: a median of " +
      `${n0(stats.segmentLengthPx.median)} px against a mean of ${n0(stats.segmentLengthPx.mean)} px ` +
      `and a maximum of ${n0(stats.segmentLengthPx.max)} px, so a single policy must handle both ` +
      "long straight runs and dense clusters of short segments at junctions. Second, the road " +
      `half-width is ${stats.world.roadWidthPx / 2} px while the vehicle is 30 x 50 px and the ` +
      "steering resolution is a fixed 0.07 rad per frame, which leaves very little lateral margin " +
      "through a tight corner."
  );

  B.push({
    t: "table",
    id: "data",
    prose: true,
    caption: "Descriptive statistics of the ingested world",
    head: ["Property", "Value"],
    rows: [
      { group: "Road graph" },
      ["Nodes", n0(stats.counts.graphNodes)],
      ["Centreline segments", n0(stats.counts.graphSegments)],
      ["Connected components", n0(stats.connectivity.components)],
      [
        "Largest component",
        `${n0(stats.connectivity.largestComponent)} nodes (${pct(
          stats.connectivity.largestComponentShare,
          1
        )})`,
      ],
      [
        "Nodes of degree 1 / 2 / 3 / 4",
        Object.keys(stats.degreeHistogram)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => n0(stats.degreeHistogram[k]))
          .join(" / "),
      ],
      [
        "Reachable from start pose",
        `${n0(stats.reachabilityFromStart.reachable)} / ${n0(
          stats.reachabilityFromStart.nodesScored
        )} (${pct(stats.reachabilityFromStart.reachableShare, 1)})`,
      ],
      ["Longest route distance from start", px(stats.reachabilityFromStart.maxRouteDistancePx)],
      { group: "Segment length (px)" },
      [
        "Minimum / median / maximum",
        `${n0(stats.segmentLengthPx.min)} / ${n0(stats.segmentLengthPx.median)} / ${n0(
          stats.segmentLengthPx.max
        )}`,
      ],
      ["Mean ± SD", `${n0(stats.segmentLengthPx.mean)} ± ${n0(stats.segmentLengthPx.sd)}`],
      ["Interquartile range", `${n0(stats.segmentLengthPx.p25)} – ${n0(stats.segmentLengthPx.p75)}`],
      { group: "Derived geometry" },
      ["Road boundary segments", n0(stats.counts.roadBorderSegments)],
      ["Lane guides", n0(stats.counts.laneGuides)],
      ["Building footprints (non-collidable)", n0(stats.counts.buildings)],
      ["Trees (non-collidable)", n0(stats.counts.trees)],
      [
        "Road width / half-width (px)",
        `${stats.world.roadWidthPx} / ${stats.world.roadWidthPx / 2}`,
      ],
      { group: "Extent and annotation" },
      ["Bounding box (px)", `${n0(stats.bbox.widthPx)} × ${n0(stats.bbox.heightPx)}`],
      [
        "Semantic markings",
        `${n0(stats.counts.markings)} (${Object.keys(stats.markingTypes).join(", ")})`,
      ],
      ["One-way segments", n0(stats.counts.oneWaySegments)],
    ],
    note:
      "Generated by `experiments/datasetStats.js`; the full record is `experiments/results/dataset_stats.json`.",
  });

  B.push(
    fig(
      "degree",
      "fig_data.svg",
      "Node degree distribution of the road graph. Degree-2 nodes represent ordinary road curvature; degree-1 nodes are dead ends the agent can enter and never escape; degree 3 and 4 are the junctions where the ambiguity of an undirected route-progress field becomes acute.",
  true
)
  );

  h2("Data quality problems and how they were handled");
  p(
    "Three quality problems in the extract are worth recording, because each has a direct " +
      "consequence for the experiments."
  );
  p(
    "**Disconnected components.** The graph is not connected: it decomposes into " +
      `${stats.connectivity.components} components of sizes ` +
      `${stats.connectivity.componentSizesTop10.join(", ")}. Only ` +
      `${pct(stats.connectivity.largestComponentShare, 1)} of nodes lie in the largest component. ` +
      "Nodes outside it are unreachable from the start pose and receive infinite route distance. " +
      "This is handled explicitly: the scorer treats non-finite distances as unusable, and the " +
      "held-out pose sampler excludes any pose whose route distance is not finite, so no evaluation " +
      "episode begins in an unreachable island."
  );
  p(
    "**Degenerate boundary segments.** The polygon union produces boundary segments as short as " +
      `${stats.roadBorderLengthPx.min.toExponential(1)} px — numerically zero-length edges left over ` +
      "from intersection splitting. They are harmless for collision detection, because the " +
      "intersection routine rejects near-parallel configurations with an epsilon of 0.001, but they " +
      "inflate the boundary count and therefore the cost of every ray cast, which motivated the " +
      "spatial index described in [[sec:system]]."
  );
  p(
    `**Sparse semantic annotation, and attributes discarded on load.** The extract carries exactly ` +
      `${n0(stats.counts.markings)} semantic marking — a single start marking. The codebase ` +
      "implements traffic lights, stop lines, yield markings, zebra crossings, parking bays and " +
      "target nodes, and none of them are exercised by this map. The report therefore makes no claim " +
      "about traffic-rule compliance: the task studied here is boundary-respecting navigation on an " +
      "unsignalised network, and describing it as anything more would overstate the evidence."
  );
  p(
    `Directional information tells a different story. The map file does carry direction data — ` +
      `${n0(stats.counts.oneWaySegments)} of the ${n0(stats.counts.graphSegments)} centreline ` +
      "segments are tagged one-way — but the graph loader discarded that tag on deserialisation, so " +
      "until the repair described in [[sec:results]] the route field treated every street as " +
      "bidirectional. This is the same class of fault as the one that disabled the objective, found " +
      "in the same function, and it is recorded here because it shows the defect was not an isolated " +
      "slip: the loader dropped every attribute the geometry constructor did not name."
  );
  p(
    "A fourth issue — the loss of node identity during deserialisation — is not merely a data " +
      "quality problem but the root cause of the central experimental finding, and is treated in " +
      "full in [[sec:results]]."
  );

  h2("Coordinate system and units");
  p(
    "All geometry is expressed in a planar pixel space rather than in metres or in geographic " +
      "coordinates. The extract was projected once, offline, and the projection is not inverted " +
      "anywhere in the running system, so no result in this report is expressed in real-world " +
      "units. This is a deliberate simplification with two consequences worth stating. It means the " +
      "vehicle's 30 × 50 px footprint and the road's 100 px width are internally consistent but " +
      "carry no metric interpretation; and it means the speed values, which the interface displays " +
      "as kilometres per hour by multiplying by ten, are a presentational convenience with no " +
      "physical grounding. Wherever this report quotes a speed it does so in simulator units."
  );
  p(
    "Working in pixel space also avoids a class of error the project would otherwise have had to " +
      "manage: with a spherical projection, Euclidean edge weights in the Dijkstra field would be " +
      "wrong by a latitude-dependent factor, and the ray-segment intersection test would need to " +
      "operate on a curved surface. Since the research question concerns the optimiser and not " +
      "geodesy, discarding the geographic frame removes complexity that would buy nothing."
  );

  h2("Splits: what counts as held out");
  p(
    "Supervised learning splits rows; a control problem has no rows to split, so the split must be " +
      "over *initial conditions*. Three disjoint sets of start poses are used:"
  );
  li([
    "**Training condition (n = 1).** The single start marking present in the map. All evolutionary " +
      "runs begin here, mirroring exactly what the interactive browser system does.",
    `**Validation poses (n = ${valPoseCount}).** Used to tune the rule-based baselines and to select ` +
      "among ablation variants. Never used for any reported comparison.",
    `**Test poses (n = ${testPoseCount}).** Used once, for the final comparison in [[sec:results]]. ` +
      "Never used for tuning or model selection.",
  ]);
  p(
    "Poses are sampled deterministically: nodes of degree at least two whose route distance from the " +
      `start is finite are shuffled with a fixed seed (${manifest.config.masterSeed} exclusive-` +
      "ORed with 0x5eed) and split into the validation and test sets, with the heading taken along " +
      "one incident segment. Because the seed is fixed, the split is reproducible from the code " +
      "alone. Each pose additionally carries its own Dijkstra field rooted at that pose, so route " +
      "progress measured from a held-out start is progress relative to *that* start rather than to " +
      "the training origin."
  );

  h2("Feature construction");
  p(
    "The observation vector is constructed identically for every controller studied. Each of the " +
      "five beams returns either no hit, or the intersection nearest the vehicle expressed as a " +
      "normalised offset t in [0, 1] along the beam. The feature is 1 − t, so a value of 0 means " +
      "clear to the sensor's full range and a value approaching 1 means an obstacle against the " +
      "bumper. A missing return is encoded as 0. No further scaling, whitening or temporal history " +
      "is applied: the policy is purely reactive and memoryless, a modelling choice whose " +
      "consequences are examined in [[sec:discussion]]."
  );

  /* ================================================================
   * V. SYSTEM
   * ================================================================ */
  h1("System Architecture", "system");

  h2("Overview");
  p(
    "[[fig:arch]] shows the pipeline. The three vertical bands are, from left to right, data " +
      "engineering (geospatial ingestion, geometric world construction, route-progress field), " +
      "simulation (range sensing, policy inference, kinematics), and learning plus measurement " +
      "(fitness, genetic algorithm, evaluation). The separation of the measurement band from the " +
      "learning band is deliberate and is justified in [[sec:protocol]]."
  );

  h2("Perception: simulated range sensing");
  p(
    "The sensor is an array of five rays fanned across a π/2 field of view centred on the vehicle's " +
      "heading, each 220 px long. For each ray the module computes the intersection with every " +
      "nearby boundary segment and with the edges of any traffic polygon, and keeps the nearest. " +
      "The test is the standard parametric line-segment formulation: for ray *AB* and segment *CD*,"
  );
  B.push({
    t: "eq",
    num: 1,
    tex:
      "t = \\frac{(x_D-x_C)(y_A-y_C)-(y_D-y_C)(x_A-x_C)}{(y_D-y_C)(x_B-x_A)-(x_D-x_C)(y_B-y_A)}",
    html:
      "<i>t</i> = [(x<sub>D</sub>−x<sub>C</sub>)(y<sub>A</sub>−y<sub>C</sub>) − (y<sub>D</sub>−y<sub>C</sub>)(x<sub>A</sub>−x<sub>C</sub>)] / [(y<sub>D</sub>−y<sub>C</sub>)(x<sub>B</sub>−x<sub>A</sub>) − (x<sub>D</sub>−x<sub>C</sub>)(y<sub>B</sub>−y<sub>A</sub>)]",
  });
  p(
    "with the analogous expression for the second parameter u, and a hit recorded only when both lie " +
      "in [0, 1]. A denominator smaller than 0.001 in absolute value is rejected as parallel. The " +
      "returned t is exactly the normalised distance used as a network input, so no separate " +
      "distance computation is required."
  );
  p(
    "[[fig:lidar]] shows the sensor operating at a five-way junction, which is the hardest class of " +
      "situation in this map. Two properties of the representation are visible. First, the beams " +
      "terminate on the road boundary and nowhere else — buildings and trees are drawn but are not " +
      "in the collision set, so the agent is blind to them. Second, at a junction most beams return " +
      "no hit at all and are therefore encoded as 0, which is the same value as a boundary at maximum " +
      "range. The agent consequently cannot distinguish \"open space ahead\" from \"nothing within " +
      "220 px\", and it is precisely at junctions that this ambiguity bites."
  );
  B.push(
    shot(
      "lidar",
      "lidar_closeup.png",
      "The range sensor at a five-way junction. The lead vehicle casts five beams across a pi/2 field of view; small markers show where a beam meets a road boundary. The magenta bodies behind it are swarm members already eliminated in this generation. Building and tree geometry is rendered but is not collidable and returns no beam hits."
    )
  );

  h2("Vehicle kinematics");
  p(
    "The vehicle model is a *unicycle* with speed-coupled steering, not a bicycle model. This " +
      "correction matters, because the Milestone 2 draft described it as a kinematic bicycle model; " +
      "there is no wheelbase parameter and no steering-angle state anywhere in the implementation. " +
      "The update, executed once per frame, is: apply throttle and brake to the scalar speed, clip " +
      "it, apply friction, rotate the heading only if the vehicle is moving, and translate along the " +
      "new heading."
  );
  B.push({
    t: "eq",
    num: 2,
    tex:
      "\\theta_{t+1} = \\theta_t + \\delta\\,\\mathrm{sgn}(v_{t+1})\\,\\big(u_{\\mathrm{left}}-u_{\\mathrm{right}}\\big)",
    html:
      "θ<sub>t+1</sub> = θ<sub>t</sub> + δ · sgn(<i>v</i><sub>t+1</sub>) · (u<sub>left</sub> − u<sub>right</sub>)",
  });
  B.push({
    t: "eq",
    num: 3,
    tex:
      "x_{t+1} = x_t - v_{t+1}\\sin\\theta_{t+1}, \\qquad y_{t+1} = y_t - v_{t+1}\\cos\\theta_{t+1}",
    html:
      "x<sub>t+1</sub> = x<sub>t</sub> − <i>v</i><sub>t+1</sub> sin θ<sub>t+1</sub>,&nbsp;&nbsp;&nbsp; y<sub>t+1</sub> = y<sub>t</sub> − <i>v</i><sub>t+1</sub> cos θ<sub>t+1</sub>",
  });
  p(
    "with acceleration 0.2, friction 0.05, steering increment δ = 0.07 rad, forward speed capped at " +
      "6 and reverse at half that. The multiplication of the steering increment by sgn(v) is the " +
      "single most consequential modelling decision in the simulator: a stationary vehicle cannot " +
      "rotate, so any policy must learn that turning requires committing to speed. It also means the " +
      "heading is not independently controllable, which bounds how tightly *any* controller — " +
      "learned or hand-written — can corner."
  );

  h2("Collision model");
  p(
    "The vehicle is represented as a rotated rectangle reconstructed each frame from its centre, " +
      "heading and dimensions. Damage is declared when any edge of that rectangle intersects any " +
      "road boundary segment or any edge of a traffic polygon. Collision is terminal: there is no " +
      "damage accumulation and no recovery, so an episode ends at first contact. This makes " +
      "collision a clean binary event for measurement, at the cost of not modelling glancing " +
      "contacts or recoverable scrapes."
  );

  h2("Policy network");
  p(
    "The controller is a fixed-topology multilayer perceptron with layer widths 5–12–10–4, giving " +
      `${n0(nParams)} trainable parameters. Each layer computes a weighted sum, adds a bias, applies ` +
      "a logistic function and thresholds it:"
  );
  B.push({
    t: "eq",
    num: 4,
    tex:
      "a^{(l)}_j = \\mathbb{1}\\Big[\\sigma\\Big(\\textstyle\\sum_i w^{(l)}_{ij} a^{(l-1)}_i + b^{(l)}_j\\Big) > 0.5\\Big]",
    html:
      "a<sup>(l)</sup><sub>j</sub> = 1[ σ( Σ<sub>i</sub> w<sup>(l)</sup><sub>ij</sub> a<sup>(l−1)</sup><sub>i</sub> + b<sup>(l)</sup><sub>j</sub> ) &gt; 0.5 ]",
  });
  p(
    "Because σ(z) > 0.5 exactly when z > 0, the logistic function is computationally redundant: the " +
      "network is a stack of linear threshold units — a hard-threshold perceptron network. This is " +
      "worth stating plainly rather than describing the architecture as having a sigmoid activation, " +
      "because it explains a result in [[sec:results]]. With binary activations, hidden layers can " +
      "only realise threshold functions of threshold functions, and the effective hypothesis class " +
      "grows far more slowly with depth than the parameter count suggests. It also means gradients " +
      "do not exist anywhere in the network, which is precisely why a gradient-free optimiser is the " +
      "appropriate choice rather than merely an aesthetic one."
  );
  p(
    "The four outputs map to forward, left, right and reverse. Conflicts are resolved before " +
      "actuation: simultaneous left and right cancel to straight, and forward dominates reverse."
  );

  h2("Route-progress field");
  p(
    "Progress along the road network is measured with a single-source shortest-path field. " +
      "Dijkstra's algorithm [[ref:dijkstra]] runs over the centreline graph from the node nearest " +
      "the start pose with Euclidean edge weights, assigning each node a route distance. The score " +
      "at an arbitrary vehicle position is obtained by projecting the position onto the nearest " +
      "centreline segment and linearly interpolating the two endpoint distances by the projection " +
      "parameter. The field is computed once per pose and reused for every episode; the longest " +
      `route distance in this map is ${px(stats.reachabilityFromStart.maxRouteDistancePx)}.`
  );
  p(
    "It is important to be precise about what this quantity is. It is a *radial potential*: distance " +
      "from the origin along the road network, increasing in every direction away from the start. It " +
      "is not a directed route to a goal. A vehicle that drives away from the origin along any " +
      "branch scores well, and two branches leading to entirely different places are " +
      "indistinguishable. This property is exploited by the agents and is analysed in " +
      "[[sec:discussion]]."
  );

  h2("Evaluation harness");
  p(
    "All experiments run headlessly in Node.js. The harness loads the unmodified browser source " +
      "files — geometry, world construction, route scorer, network, sensor, actuator and vehicle — " +
      "into a single `vm` context, supplying minimal stand-ins for the handful of DOM objects that " +
      "constructors touch. The physics, sensing and inference exercised by every experiment are " +
      "therefore the same code that runs in the browser; only rendering and the animation-frame " +
      "driver are replaced. Controller output is hoisted out of the vehicle's update method so that " +
      "rule-based and learned policies share one code path and therefore identical timing, sensing " +
      "and termination semantics."
  );
  p(
    "One optimisation was necessary to make batch evaluation tractable. The interactive engine culls " +
      "boundary segments with a linear scan at an 800 px radius on every frame, which is negligible " +
      "for one frame but dominates a run of tens of thousands of episodes. The harness pre-buckets " +
      "the boundary segments into a uniform grid of 256 px cells and answers per-vehicle queries at " +
      "a 400 px radius. Since 400 px strictly exceeds the 220 px beam length plus the 58 px vehicle " +
      "diagonal, no segment that could be hit by a ray or by the body is ever discarded, so the " +
      "optimisation is behaviour-preserving rather than an approximation."
  );

  h2("Verifying the harness");
  p(
    "A measurement instrument that is itself unverified cannot support the claims made in " +
      "[[sec:results]], so three properties are asserted empirically rather than argued. The script " +
      "`experiments/verifyHarness.js` checks them and writes its verdict to " +
      "`experiments/results/verification.json`."
  );
  li([
    `**Episode determinism.** The same seed replayed ${verify.determinism.repetitions} times ` +
      `produces a bit-identical episode signature — frame count, termination cause, peak route ` +
      `progress, path length, net displacement, RMS jerk and mean lateral deviation, each to nine ` +
      `decimal places. Result: ${verify.determinism.pass ? "pass" : "fail"}.`,
    "**Culling equivalence.** The claim that the spatial index is behaviour-preserving rather than " +
      "an approximation is tested directly: each of " +
      `${verify.cullingEquivalence.trials} episodes is run twice from the same genome and seed, ` +
      `once with the ${verify.cullingEquivalence.culledRadiusPx} px grid query and once with a grid ` +
      "whose single cell spans the entire world, which returns every boundary segment. Result: " +
      `${verify.cullingEquivalence.identical} of ${verify.cullingEquivalence.trials} trajectory ` +
      "signatures identical. The geometric argument — that a " +
      `${verify.cullingEquivalence.culledRadiusPx} px radius strictly exceeds the ` +
      `${verify.cullingEquivalence.beamLengthPx} px beam plus the ` +
      `${verify.cullingEquivalence.vehicleDiagonalPx} px vehicle diagonal — is therefore confirmed ` +
      "by measurement and not merely asserted.",
    `**Training determinism.** Two independent invocations of the evolutionary loop under one seed ` +
      `produce byte-identical fitness histories across all generations. Result: ` +
      `${verify.evolutionDeterminism.pass ? "pass" : "fail"}.`,
  ]);
  p(
    "These checks are cheap, run in seconds, and are the reason the numbers in this report can be " +
      "regenerated exactly rather than approximately. They do not verify that the harness matches " +
      "the browser build's *rendering*, which is irrelevant, nor that the physics is realistic, " +
      "which it is not; they verify that the instrument returns the same reading twice and that the " +
      "one optimisation applied to it changes nothing."
  );

  h2("The interactive application");
  p(
    "The evaluation harness is one of two front-ends onto the same simulation core; the other is the " +
      "browser application that constitutes the delivered system. It is a single-page application " +
      "with no build step and no dependencies: `index.html` loads seventeen plain scripts in " +
      "dependency order and the simulation starts on the load event. Four surfaces are rendered " +
      "each frame."
  );
  li([
    "**The world canvas**, drawn in a camera space that follows the current leader. Road envelopes, " +
      "boundaries, buildings and trees are drawn with a fake-3D projection that offsets each " +
      "vertex away from the view point in proportion to `atan(d/300)`, giving parallax without a " +
      "3D pipeline. Rendering is culled to a 1500 px radius around the view point.",
    "**A neural visualiser** that draws the champion's network live, with connection thickness " +
      "encoding the magnitude of the weight *change* since the start of the generation rather than " +
      "the weight itself, so the display shows what evolution is doing rather than what the network " +
      "currently is. Positive weights are drawn in one hue and negative in another, node fill " +
      "encodes activation, and a dashed ring encodes bias sign.",
    "**A minimap radar** rendering the whole road graph at 1:20 scale with live positions of every " +
      "surviving individual.",
    "**A metrics panel** showing generation index, surviving population, peak fitness, the " +
      "generation-over-generation change, the current architecture string and the leader's speed.",
  ]);
  p(
    "Persistence is handled through `localStorage`: the champion genome is serialised at every " +
      "generation boundary, along with the generation counter and peak fitness, so a session " +
      "resumes where it stopped. The loader validates that a stored genome's layer count matches the " +
      "current architecture and discards it otherwise, which prevents a stale genome from being " +
      "loaded into an incompatible network — a small piece of defensive engineering that the " +
      "ablation study in [[sec:results]] depended on. A manual reset, a save, a full factory reset, " +
      "a light/dark theme toggle and a swarm speed slider are exposed as controls."
  );
  p(
    "This front-end matters to the argument of the report in one specific way. It is a competent, " +
      "polished piece of software — and it displayed no symptom whatsoever of the defect documented " +
      "in [[sec:results]]. [[fig:screenshot]] is an unedited capture of the application running; " +
      "every element on screen is consistent with a system that is learning normally, and before " +
      "the repair every element looked exactly the same. The quality of a demonstration interface " +
      "is not evidence about the correctness of the learning process behind it."
  );

  B.push(
    shot(
      "screenshot",
      "sim_early.png",
      "The delivered application running, captured unedited from the repaired build. The lead vehicle is drawn with its five LiDAR beams; surviving swarm members are translucent boxes. The right-hand column shows the fleet panel (generation index, survivors, peak fitness, generation-over-generation change), the speed control, the radar minimap, the neural analytics panel and the live network visualiser."
    )
  );

  B.push(
    shot(
      "neuro",
      "neural_panel.png",
      "The live network visualiser at the same instant, showing the 5-12-10-4 topology with sensor inputs S1 to S5 at the bottom and the four actuator outputs (forward, left, right, reverse) at the top. Filled nodes are active. Connection thickness encodes how much that weight has changed since the start of the generation rather than its absolute value, so the single heavy magenta edge from sensor S2 is the connection this generation's mutation has moved furthest — here a strongly inhibitory link from the left-of-centre beam."
    )
  );
  p(
    "[[fig:neuro]] shows the network visualiser in detail. It is the component that best " +
      "illustrates the transparency argument made in [[sec:related]]: the five input nodes are " +
      "labelled with their sensor index, the two hidden layers and the four outputs are drawn with " +
      "their live activation state, and every connection is drawn with a thickness proportional to " +
      "how much that weight has changed since the start of the generation. Nothing in the network is " +
      "hidden behind an abstraction."
  );
  p(
    "The instrumentation panels in the same session read generation 10, six of one hundred " +
      "individuals still alive, and a peak fitness of 16,384 px against the map's longest reachable " +
      `route distance of ${px(stats.reachabilityFromStart.maxRouteDistancePx)} — an independent ` +
      "confirmation, from the interactive build rather than the harness, that the repaired objective " +
      "produces agents which traverse most of the reachable network. Every metric on those panels " +
      "nonetheless describes the current best individual or the population size; none describes the " +
      "dispersion of fitness within the generation, which is exactly the quantity that would have " +
      "exposed the defect and is the omission analysed in [[sec:discussion]]."
  );

  h2("Computational complexity");
  p(
    "The cost of the pipeline is worth stating explicitly, because it determined the experimental " +
      "budget. Let n be the number of road-boundary segments, m the number of graph nodes, e the " +
      "number of graph edges, b the beam count, P the population and G the generations."
  );
  li([
    "**World construction** is dominated by the boolean polygon union, which compares every pair of " +
      "envelope polygons and splits intersecting edges: O(k²·s²) for k envelopes of s edges each. " +
      "It runs once, offline, and its output is what is serialised into the map file.",
    "**Dijkstra** over the centreline graph is O((m + e) log m) with a binary heap. The shipped " +
      "implementation uses a sort-on-insert list, which is O(e·m log m) in the worst case; at " +
      `m = ${n0(stats.counts.graphNodes)} this is still milliseconds, so it was left as-is in the ` +
      "interactive build and replaced with a heap only in the harness.",
    "**Per-frame sensing** is O(b·n) in the naive form. The interactive engine reduces the effective " +
      "n by a radius scan, itself O(n) per frame; the harness reduces it to O(b·n_local) with a " +
      "uniform grid, where n_local is typically one to two dozen segments.",
    "**Per-frame inference** is O(Σ w_i·w_{i+1}) over layer widths — " +
      `${n0(nParams)} multiply-accumulates for the 5–12–10–4 network, which is negligible beside ` +
      "sensing.",
    "**A training run** is therefore O(P·G·T·(b·n_local + |θ|)) for an episode horizon T. With " +
      `P = ${manifest.config.population}, G = ${manifest.config.generations} and ` +
      `T ≤ ${n0(manifest.config.maxFrames)}, a single run completes in tens of seconds, which is what ` +
      `made ${e3.runs.length} independent runs plus a ${e4.rows.length}-variant ablation grid ` +
      "affordable on a laptop.",
  ]);
  p(
    "The one place where an asymptotic improvement mattered in practice was sensing. Replacing the " +
      "linear radius scan with the uniform grid is what moved the full protocol from an overnight " +
      `job to ${n1(manifest.elapsedSeconds / 60)} minutes, and it is the reason the study could ` +
      "afford five seeds per arm rather than one."
  );

  /* ================================================================
   * VI. METHOD
   * ================================================================ */
  h1("Learning Method", "method");

  h2("Genome and initialisation");
  p(
    "The genome is the full set of weights and biases, serialised as nested arrays. Initialisation " +
      "draws every weight and bias uniformly from [−0.1, 0.1]. This is an unusually small range; it " +
      "was chosen in the original codebase so that the live network visualisation would render thin " +
      "connection lines in the first generation. The side effect is that pre-activations start close " +
      "to zero, so initial outputs are decided almost entirely by the sign of a small random sum. " +
      "The population is consequently near-degenerate at generation 1, and the mutation operator " +
      "carries essentially the entire burden of producing behavioural diversity — a fact that turns " +
      "out to explain the ablation result in [[sec:results]]."
  );

  h2("Fitness definitions");
  p("Three fitness definitions are compared, all evaluated at the moment the episode terminates:");
  li([
    "**F1 — as-committed route progress.** The score returned by the shipped `RouteDiscovery` class " +
      "over the graph as the shipped loader produced it.",
    "**F2 — Euclidean displacement.** Straight-line distance from the start position; the behaviour " +
      "the codebase falls back to when no route scorer is present.",
    "**F3 — corrected route progress.** The same Dijkstra field, with node identity repaired.",
  ]);
  p(
    "Because the termination rules themselves consult the fitness value — an agent whose score has " +
      "not increased sufficiently is killed for stagnation — changing the fitness definition changes " +
      "the environment as well as the objective. This coupling is faithful to the real system and is " +
      "reported as such rather than being factored out; the consequence for experimental design is " +
      "noted in [[sec:limitations]]."
  );

  h2("Termination as implicit reward shaping");
  p(
    "The simulator terminates an episode under five conditions, four of which are hand-written " +
      "behavioural constraints rather than physical events:"
  );
  li([
    "collision with a road boundary (physical);",
    "fewer than 15 units of fitness gained in any 30-frame window (stagnation);",
    "speed below 0.5 for more than 15 consecutive frames (crawling);",
    "speed below −0.5 for more than 20 consecutive frames (sustained reversing);",
    "four or more sign changes of velocity within a 20-frame window (oscillation).",
  ]);
  p(
    "These rules constitute a substantial, undeclared shaping term. They forbid stopping, forbid " +
      "reversing out of a dead end, and forbid three-point turns — all behaviours a competent driver " +
      "needs. They were introduced to stop the population converging on degenerate stall-in-place " +
      "policies, which is a legitimate motivation, but their effect on the achievable policy class " +
      "is significant and is revisited in [[sec:limitations]]."
  );

  h2("Reproduction operators");
  p(
    "The shipped operator, denoted **clone-elite**, copies the champion genome to the entire next " +
      "population; index 0 is left unmutated and every other individual is mutated, with every fifth " +
      "individual receiving an elevated rate. The proposed alternative, **tournament-crossover**, " +
      `retains the top ${manifest.config.eliteCount} genomes unchanged, then fills the population by ` +
      `drawing two parents by tournament of size ${manifest.config.tournamentSize}, combining them ` +
      "with uniform crossover over every weight and bias, and mutating the child. Both use the " +
      "identical mutation kernel taken from the project source, so the comparison isolates selection " +
      "and recombination rather than confounding them with a new mutation distribution."
  );
  p(
    "That kernel perturbs each parameter independently with probability equal to the mutation rate. " +
      "A perturbed weight is completely re-randomised in [−2, 2] with probability 0.1 and otherwise " +
      "receives an additive uniform perturbation in [−0.5, 0.5]; weights are clipped to [−5, 5] and " +
      "biases to [−2, 2]."
  );

  h2("The training loop in full");
  p(
    "Stated compactly, and with the coupling between fitness and termination made explicit, the " +
      "training procedure is:"
  );
  B.push({
    t: "code",
    wide: true,
    text: `initialise P genomes ~ U(-0.1, 0.1)
for g = 1 .. G:
    for each genome i:
        v <- fresh vehicle at the start pose
        v.brain <- genome[i]
        while v alive and frames < T:
            borders <- grid.query(v.centre, 400)
            v.update(borders)            # move, score, test
                                         # termination, collide, sense
            s <- 1 - lidar offsets       # 5 features in [0,1]
            a <- threshold(MLP(s))       # 4 bits
            resolve conflicts(a); write to actuators
        fitness[i] <- v.survivalScore    # value at termination
    champion <- argmax fitness
    record best / mean / sd / #distinct(fitness)
    next <- reproduce(genomes, fitness)  # operator under test
    genomes <- next
return best genome seen`,
  });
  p(
    "Two details in this loop are easy to overlook and both matter. First, the actuator command " +
      "computed on frame t is applied by the physics on frame t + 1, because sensing happens at the " +
      "end of `update`; every controller in the study therefore operates with one frame of delay, " +
      "and the comparison is unaffected because the delay is identical for all of them. Second, " +
      "`v.update` evaluates the termination rules *before* the collision test, so an agent that " +
      "would have crashed on the same frame it stalls is recorded as a stagnation rather than a " +
      "collision. This ordering is inherited from the interactive engine and is preserved rather " +
      "than corrected, but it means the collision and stagnation shares in [[fig:termination]] " +
      "should be read as a partition under that convention rather than as independent event rates."
  );

  h2("Hyperparameters");
  p(
    "The full configuration is listed in [[tab:hyper]]. Population size was reduced from the " +
      `interactive system's 100 to ${manifest.config.population} in order to fit ${e3.runs.length} ` +
      "independent training runs plus the ablation grid into the available compute budget; the " +
      "reduction applies uniformly to every arm, so the comparison between arms is unaffected, " +
      "though absolute performance is a lower bound on what a longer budget would reach."
  );

  B.push({
    t: "table",
    id: "hyper",
    prose: true,
    caption: "Experimental configuration",
    head: ["Parameter", "Value"],
    rows: [
      { group: "Evolution" },
      ["Population size", n0(manifest.config.population)],
      ["Generations (main runs)", n0(manifest.config.generations)],
      ["Generations (ablations)", n0(manifest.config.ablationGenerations)],
      ["Independent seeds (main)", manifest.config.seeds.join(", ")],
      ["Independent seeds (ablations)", n0(manifest.config.ablationSeeds)],
      ["Elite count (tournament arm)", n0(manifest.config.eliteCount)],
      ["Tournament size", n0(manifest.config.tournamentSize)],
      ["Mutation rate", n2(manifest.config.mutationRate)],
      ["Elevated rate, every 5th individual", n2(manifest.config.boostRate)],
      { group: "Network" },
      ["Layer widths", "5 – 12 – 10 – 4"],
      ["Trainable parameters", n0(nParams)],
      ["Activation", "logistic, thresholded at 0.5"],
      ["Weight and bias initialisation", "U(−0.1, 0.1)"],
      { group: "Vehicle and sensing" },
      ["Beams / field of view / range", "5 / π/2 / 220 px"],
      ["Vehicle size", "30 × 50 px"],
      ["Max speed / acceleration / friction", "6 / 0.2 / 0.05"],
      ["Steering increment", "0.07 rad per frame"],
      { group: "Episodes and evaluation" },
      [
        "Frame budget",
        `${n0(manifest.config.maxFrames)} (${n0(manifest.config.maxFrames / 60)} s at 60 fps)`,
      ],
      ["Validation / test poses", `${valPoseCount} / ${testPoseCount}`],
      ["Bootstrap resamples", n0(manifest.config.bootstrapIterations)],
      ["Master seed", String(manifest.config.masterSeed)],
    ],
  });

  /* ================================================================
   * VII. BASELINES
   * ================================================================ */
  h1("Baselines", "baselines");
  p(
    "Four reference controllers are implemented. All four consume the identical five-element " +
      "observation vector and write the identical four actuator bits, so any performance difference " +
      "is attributable to the policy rather than to a sensing or actuation advantage — with the " +
      "single, deliberate exception of the oracle."
  );

  h2("B0 — Random network");
  p(
    "An untrained multilayer perceptron drawn from the project's own initialiser. This is the floor: " +
      "any method that does not beat it has learned nothing. Because it is stochastic it is " +
      `evaluated across all ${manifest.config.seeds.length} seeds at every pose.`
  );

  h2("B1 — Reactive finite-state heuristic");
  p(
    "The rule-based controller promised in the Milestone 1 definition. It drives forward " +
      "unconditionally; if the centre beam reports an obstacle beyond a block threshold, or the " +
      "summed left and right readings differ by more than an asymmetry threshold, it steers toward " +
      "the freer side; if the centre beam exceeds a brake threshold it lifts the throttle. Three " +
      "parameters, grid-searched on the validation poses."
  );

  h2("B2 — Proportional steering controller");
  p(
    "The geometric \"PID-style\" controller from the Milestone 1 definition, reduced to its " +
      "proportional term because the plant has no integrator worth winding up over a twenty-second " +
      "episode and the actuator is binary. A signed error is formed by weighting each beam by its " +
      "lateral position and summing:"
  );
  B.push({
    t: "eq",
    num: 5,
    tex: "u = \\frac{k_p}{n}\\sum_{i=1}^{n} -\\,\\frac{i - (n-1)/2}{(n-1)/2}\\; s_i",
    html: "u = (k<sub>p</sub> / n) · Σ<sub>i</sub> −[(i − (n−1)/2) / ((n−1)/2)] · s<sub>i</sub>",
  });
  p(
    "and discretised through a dead-band: steer left if u exceeds the dead-band, right if it falls " +
      "below its negative, straight otherwise. The quantisation is a genuine handicap and is " +
      "acknowledged as such — a continuous-steering plant would suit this controller considerably " +
      "better, and its relative weakness in [[tab:final]] should be read in that light."
  );

  h2("B3 — Pure-pursuit reference (oracle)");
  p(
    "A path-tracking controller in the sense of Coulter [[ref:coulter]], given privileged access to " +
      "the road centreline graph and the route-distance field. It selects the point on a nearby " +
      "centreline whose route distance exceeds the vehicle's current progress by a look-ahead " +
      "distance, restricted to the forward half-plane, and steers toward it. The forward restriction " +
      "is necessary precisely because the distance field is radial: without it, the controller " +
      "periodically selects an equidistant point on a branch behind the vehicle and turns around — a " +
      "failure that itself illustrates the objective's ambiguity."
  );
  p(
    "This controller is **not a competitor**. It observes information the learned agents never see. " +
      "It is included to answer a question the learned-versus-heuristic comparison cannot: how much " +
      "of the residual failure rate is attributable to the policy, and how much to the actuator " +
      "resolution and road geometry that constrain every policy equally."
  );

  h2("Baseline tuning protocol");
  p(
    `Each hand-written controller was grid-searched on the ${valPoseCount} validation poses. The ` +
      `searches covered ${n0(e2a.grids["Reactive-FSM"].length)} configurations for the reactive ` +
      `heuristic, ${n0(e2a.grids["P-Controller"].length)} for the proportional controller and ` +
      `${n0(e2a.grids["Pure-Pursuit (oracle)"].length)} look-ahead distances for pure pursuit. The ` +
      "selected settings are listed in [[tab:tuning]]. This step matters: an untuned proportional " +
      "controller scored well under half of its tuned counterpart in preliminary runs, and reporting " +
      "the untuned number would have manufactured an advantage for the learned agent."
  );

  B.push({
    t: "table",
    id: "tuning",
    prose: true,
    caption: "Baseline hyperparameters selected on validation poses",
    head: ["Controller", "Grid", "Selected", "Val. route (px)"],
    rows: [
      [
        "Reactive FSM",
        n0(e2a.grids["Reactive-FSM"].length),
        `block ${e2a.best["Reactive-FSM"].params.blockThreshold}, brake ${e2a.best["Reactive-FSM"].params.brakeThreshold}, asym. ${e2a.best["Reactive-FSM"].params.asymmetry}`,
        n0(e2a.best["Reactive-FSM"].val),
      ],
      [
        "P-controller",
        n0(e2a.grids["P-Controller"].length),
        `kp ${e2a.best["P-Controller"].params.kp}, dead-band ${e2a.best["P-Controller"].params.deadband}, brake ${e2a.best["P-Controller"].params.brakeThreshold}`,
        n0(e2a.best["P-Controller"].val),
      ],
      [
        "Pure pursuit (oracle)",
        n0(e2a.grids["Pure-Pursuit (oracle)"].length),
        `look-ahead ${e2a.best["Pure-Pursuit (oracle)"].params.lookahead} px`,
        n0(e2a.best["Pure-Pursuit (oracle)"].val),
      ],
    ],
    note: "Full grids are recorded in `experiments/results/e2a_baseline_tuning.json`.",
  });

  p(
    "The sensitivity of each baseline to its own parameters is itself informative, and is reported " +
      "in [[tab:sensitivity]] so that a reader can judge how much the selection depended on the " +
      "particular validation poses. The reactive heuristic spans a factor of " +
      `${n1(
        e2a.grids["Reactive-FSM"][0].val /
          Math.max(1, e2a.grids["Reactive-FSM"][e2a.grids["Reactive-FSM"].length - 1].val)
      )} between its best and worst configuration, and the proportional controller a factor of ` +
      `${n1(
        e2a.grids["P-Controller"][0].val /
          Math.max(1, e2a.grids["P-Controller"][e2a.grids["P-Controller"].length - 1].val)
      )}. Neither best configuration sits on the edge of its grid on every axis, which is weak evidence that the searches were wide enough.`
  );

  B.push({
    t: "table",
    id: "sensitivity",
    prose: true,
    caption: "Baseline tuning sensitivity: best and worst configurations",
    head: ["Controller", "Rank", "Configuration", "Val. route (px)"],
    rows: (() => {
      const rows = [];
      for (const name of ["Reactive-FSM", "P-Controller", "Pure-Pursuit (oracle)"]) {
        const g = e2a.grids[name];
        rows.push({ group: SHORT[name] });
        const picks = [
          [0, "best"],
          [1, "2nd"],
          [2, "3rd"],
          [Math.floor(g.length / 2), "median"],
          [g.length - 1, "worst"],
        ];
        for (const [i, label] of picks) {
          if (i >= g.length) continue;
          rows.push([
            "",
            label,
            Object.entries(g[i].params)
              .map(([k, v]) => `${k}=${v}`)
              .join(", "),
            n0(g[i].val),
          ]);
        }
      }
      return rows;
    })(),
    note:
      "Configurations are ranked by mean route progress over the validation poses. Only the best row of each group is used in any reported comparison.",
    wide: true,
  });

  /* ================================================================
   * VIII. PROTOCOL
   * ================================================================ */
  h1("Experimental Protocol", "protocol");

  h2("Metrics");
  p(
    "Nine per-episode metrics are recorded. The primary outcome is **peak route progress**: the " +
      "maximum route-distance value attained during the episode, measured with the corrected scorer " +
      "*regardless of which fitness the agent was trained on*. Keeping the measurement independent " +
      "of the training signal is what makes the arms comparable at all — an arm trained on a broken " +
      "objective must still be scored on a working one."
  );
  li([
    "**Peak route progress (px)** — primary outcome; distance along the road network from the start.",
    "**Frames survived** — episode length at 60 fps.",
    "**Collision rate** — share of episodes ending in boundary contact.",
    "**Termination mix** — collision, stagnation or reversal, or survival to the frame budget.",
    "**Path length (px)** — integrated speed, i.e. distance actually driven.",
    "**Mean distance between failures (MDBF)** — total path length divided by collision count.",
    "**RMS jerk** — root-mean-square second difference of speed; a comfort proxy.",
    "**Steering reversals per 1000 frames** — a smoothness proxy for control chatter.",
    "**Mean lateral deviation and off-corridor share** — distance from the nearest centreline, and " +
      "the fraction of frames spent more than a road half-width away from it.",
  ]);

  h2("Statistical methodology");
  p(
    "The distributions involved are bounded below, heavy-tailed and frequently bimodal — an agent " +
      "either threads a junction or dies at it — so Gaussian assumptions are avoided throughout. The " +
      "unit of analysis for the headline comparison is the **pose mean**: for each arm and each test " +
      "pose, the metric is averaged over seeds, yielding one value per pose. This pairs the arms on " +
      "identical initial conditions and prevents an arm with more seeds from acquiring spurious " +
      "precision."
  );
  li([
    "Central tendency and dispersion are reported as mean, standard deviation, median and quartiles.",
    `Confidence intervals on the mean are percentile bootstrap intervals [[ref:efron]] with ${n0(
      manifest.config.bootstrapIterations
    )} resamples, drawn from a seeded generator so the intervals are themselves reproducible.`,
    "Location differences are tested with the Mann–Whitney U test [[ref:mannwhitney]] using the " +
      "tie-corrected normal approximation.",
    "Effect sizes are reported as Cliff's delta [[ref:cliff]], with the conventional thresholds " +
      "0.147, 0.33 and 0.474 for small, medium and large.",
  ]);
  p(
    "No correction for multiple comparisons is applied, and the tests should be read as descriptive " +
      `rather than confirmatory: with ${testPoseCount} paired poses the power to detect anything but ` +
      "a large effect is limited. Saying so is more useful than presenting borderline p-values as " +
      "though they settled the question."
  );

  h2("Compute budget and determinism");
  p(
    `The full protocol ran in ${n1(manifest.elapsedSeconds / 60)} minutes on ${host.cpu} ` +
      `(${host.cores} logical cores, ${host.ramGB} GB RAM) under Node.js ${host.node}, ` +
      "single-threaded and CPU-only. No GPU is used anywhere in this project, because the models are " +
      `hand-written and gradient-free. Approximately ${n0(totalEpisodes)} episodes were simulated in ` +
      "total. Every stochastic component draws from a seeded mulberry32 generator installed in place " +
      "of `Math.random` inside the simulation context, so a given seed reproduces a run exactly."
  );

  h2("Experiment matrix");
  li([
    "**E1 — Fitness-signal diagnostic.** One generation of random genomes evaluated under each of " +
      "the three fitness definitions, measuring how many distinct fitness values the objective " +
      "actually produces.",
    "**E2 — Fixed-policy baselines.** All four reference controllers on validation and test poses, " +
      "after tuning.",
    `**E3 — Training arms.** Four arms × ${manifest.config.seeds.length} seeds × ` +
      `${manifest.config.generations} generations × ${manifest.config.population} individuals.`,
    `**E4 — Ablations.** ${e4.rows.length} variants over architecture, mutation rate, beam count and ` +
      `beam range, ${manifest.config.ablationSeeds} seeds each, selected on validation poses only.`,
    "**E5 — Held-out evaluation.** Every champion and every tuned baseline on the test poses, used " +
      "exactly once.",
  ]);

  /* ================================================================
   * IX. RESULTS
   * ================================================================ */
  h1("Results", "results");

  h2("E1: the committed objective carries no selection signal");
  p(
    "The route-progress scorer keys its adjacency and distance maps on a node identifier, " +
      "`GeoPoint.id`. The graph loader reconstructs every node with `new GeoPoint(x, y)`, and that " +
      "constructor assigns only the two coordinates. Every identifier is therefore `undefined`, all " +
      `${n0(stats.counts.graphNodes)} nodes collapse onto a single map entry, the relaxation loop ` +
      "never fires, and the interpolation in the scorer evaluates to zero everywhere in the world."
  );
  p(
    "The consequences are measured directly. Across a population of " +
      `${e1row(0).populationSize} randomly initialised networks evaluated from the training pose, ` +
      `the as-committed objective produced **${e1row(0).distinctFitnessValues} distinct fitness ` +
      `value** — every individual scored identically — against ` +
      `${e1row(1).distinctFitnessValues} for Euclidean displacement and ` +
      `${e1row(2).distinctFitnessValues} for the corrected scorer ([[fig:signal]]). Selection over a ` +
      "constant objective is selection at random."
  );
  p(
    "The damage is not confined to selection. Because the stagnation rule requires the fitness value " +
      "to increase by at least 15 units every 30 frames, a constant fitness of zero guarantees the " +
      "rule fires as soon as it has enough history. Mean episode length collapses from " +
      `${n1(e1row(2).framesSurvived.mean)} frames under the corrected objective to ` +
      `${n1(e1row(0).framesSurvived.mean)} frames — roughly ` +
      `${n1(e1row(0).framesSurvived.mean / 60)} seconds — under the committed one ` +
      "([[fig:signalframes]]). Agents were being executed for barely a second before being destroyed " +
      "for failing to make progress on a metric that could not move."
  );

  B.push(
    fig(
      "signal",
      "fig_signal.svg",
      "Selection signal available to the genetic algorithm. The as-committed objective yields a single distinct fitness value across the whole population, so the champion is chosen arbitrarily.",
  true
)
  );
  B.push(
    fig(
      "signalframes",
      "fig_signal_frames.svg",
      "Mean episode length under each objective. The degenerate objective interacts with the stagnation rule to terminate agents almost immediately, compounding the loss of selection pressure with a loss of experience.",
  true
)
  );

  B.push({
    t: "table",
    id: "signal",
    caption: "Fitness-signal diagnostic (E1)",
    head: ["Objective", "Distinct fitness", "Mean fitness", "Mean frames", "Route reached (px)"],
    rows: e1.rows.map((r) => [
      r.variant,
      `${r.distinctFitnessValues} / ${r.populationSize}`,
      n1(r.fitness.mean),
      n1(r.framesSurvived.mean),
      n0(r.routeProgressAchieved.mean),
    ]),
    note:
      "Randomly initialised networks, identical seeds across rows. Route reached is measured with the corrected scorer in every row, so the last column is comparable even though the fitness column is not.",
  });

  p(
    "The defect is a contract mismatch between two modules that are individually reasonable. The " +
      "loader is not wrong to construct a point from coordinates; the scorer is not wrong to key on " +
      "an identifier that the serialised map file genuinely contains. The fault lies in the " +
      "undeclared dependency between them — exactly the category Sculley et al. describe as an " +
      "undeclared consumer [[ref:sculley]]. It produces no exception, no warning and no visible " +
      "change in the simulation."
  );

  B.push({
    t: "callout",
    title: "Repair.",
    text:
      "Two changes were made to the live code. `NodeGraph.load` now preserves the OpenStreetMap node " +
      "identifier and the one-way tag rather than discarding them, and `RouteDiscovery` now keys its " +
      "maps on node index, which is always well defined regardless of what the loader supplies. " +
      `After the repair the distance map contains one entry per node, ` +
      `${n0(stats.reachabilityFromStart.reachable)} of ${n0(stats.counts.graphNodes)} nodes are ` +
      `reachable, and the field spans 0 to ${px(stats.reachabilityFromStart.maxRouteDistancePx)}. ` +
      "The baseline arm in every experiment below uses a pinned verbatim copy of both the pre-repair " +
      "scorer and the pre-repair loader, so the comparison remains valid against the repaired " +
      "working tree.",
  });

  h2("E3: what each objective and operator actually learns");
  p(
    "[[fig:learning]] shows learning curves for the four training arms and [[tab:training]] " +
      "summarises them. The as-committed arm is a flat line: best fitness is " +
      `${n1(S.A.bestFitMean)} ± ${n1(S.A.bestFitSd)} across all ${S.A.seeds} seeds, and the mean ` +
      `number of distinct fitness values per generation is ${n1(S.A.distinct)} — that is, exactly ` +
      "one, in every generation of every seed. The route progress its champions happen to achieve, " +
      `${px(S.A.finalRouteMean)}, is identical at generation ${manifest.config.generations} to what ` +
      `it was at generation 1 (${px(S.A.gen1Route)}). Thirty generations of evolution produced no ` +
      "improvement whatsoever, which is the expected outcome of optimising a constant."
  );
  p(
    "Repairing the objective changes this completely. The corrected route arm reaches " +
      `${n0(S.C.bestFitMean)} ± ${n0(S.C.bestFitSd)} best fitness with ${n1(S.C.distinct)} distinct ` +
      `fitness values per generation, and the Euclidean arm reaches ${n0(S.B.bestFitMean)} ± ` +
      `${n0(S.B.bestFitSd)}. Both are learning. The difference between them is instructive: ` +
      "Euclidean displacement rewards getting geometrically far from the origin, which on a road " +
      "network is best achieved by heading across the map in a straight line, whereas route progress " +
      "rewards distance *along the roads*. The route objective therefore produces higher route " +
      "scores by construction, but it also produces higher variance, because a policy that commits " +
      "to a long branch is rewarded far more than one that circles near the origin."
  );
  p(
    "The two reproduction operators separate on variance rather than on peak. Clone-elite reaches a " +
      `mean best fitness of ${n0(S.C.bestFitMean)} with a standard deviation of ` +
      `${n0(S.C.bestFitSd)} across seeds; tournament with uniform crossover reaches ` +
      `${n0(S.D.bestFitMean)} with a standard deviation of ${n0(S.D.bestFitSd)} — a ` +
      `${n1(varianceRatio)}× reduction in seed-to-seed spread. Its final-generation champions also ` +
      `travel further (${px(S.D.finalRouteMean)} against ${px(S.C.finalRouteMean)}). The ` +
      "interpretation is that cloning the champion into the entire population destroys diversity " +
      "every generation, so the run's outcome is decided by whichever lineage happens to be lucky " +
      "early; maintaining a population and recombining it makes the search less dependent on that " +
      "accident."
  );

  B.push(
    fig(
      "learning",
      "fig_learning.svg",
      "Learning curves: best route progress reached by the champion of each generation, averaged over seeds, with the band spanning the minimum and maximum across seeds. The as-committed arm is flat by construction.",
      true
    )
  );
  B.push(
    fig(
      "selection",
      "fig_selection.svg",
      "Distinct fitness values per generation. This is the quantity that determines whether selection can act at all; the as-committed arm sits at exactly one for the entire run, in every seed.",
  true
)
  );

  B.push({
    t: "table",
    id: "training",
    caption: "Training arms (E3): mean ± SD over seeds",
    head: ["Arm", "Best fitness", "Final route (px)", "Distinct fit./gen", "Wall (s)"],
    rows: [ARM.A, ARM.B, ARM.C, ARM.D].map((a) => {
      const k = a === ARM.A ? S.A : a === ARM.B ? S.B : a === ARM.C ? S.C : S.D;
      return [
        SHORT[a],
        `${n0(k.bestFitMean)} ± ${n0(k.bestFitSd)}`,
        `${n0(k.finalRouteMean)} ± ${n0(k.finalRouteSd)}`,
        n1(k.distinct),
        n0(k.wallS),
      ];
    }),
    note: `${manifest.config.seeds.length} seeds per arm, ${manifest.config.population} individuals, ${manifest.config.generations} generations. Fitness is on each arm's own scale and is comparable only within an arm; route progress is measured with the corrected scorer for all arms and is comparable across rows.`,
  });

  p(
    "[[tab:curve]] gives the same information numerically at five-generation intervals, which makes " +
      "two features visible that the plot smooths over. The first is that most of the improvement in " +
      "the working arms happens early: by generation 10 the corrected arms have reached a large " +
      "fraction of their final value, and the remaining twenty generations add comparatively little. " +
      "The second is that the number of distinct fitness values does not decay toward one in the " +
      "tournament arm the way it does under clone-elite, which is the mechanism behind the variance " +
      "reduction reported above."
  );

  B.push({
    t: "table",
    id: "curve",
    caption: "Learning curves at five-generation intervals (mean over seeds)",
    head: ["Gen", "NE-A", "NE-B", "NE-C", "NE-D", "NE-C dist.", "NE-D dist."],
    rows: (() => {
      const G = runsOf(ARM.A)[0].history.length;
      const at = (arm, g, key) =>
        mean(runsOf(arm).map((r) => r.history[g][key]));
      const rows = [];
      for (let g = 0; g < G; g++) {
        if (g !== 0 && (g + 1) % 5 !== 0) continue;
        rows.push([
          n0(g + 1),
          n0(at(ARM.A, g, "bestRouteProgress")),
          n0(at(ARM.B, g, "bestRouteProgress")),
          n0(at(ARM.C, g, "bestRouteProgress")),
          n0(at(ARM.D, g, "bestRouteProgress")),
          n1(at(ARM.C, g, "distinctFitness")),
          n1(at(ARM.D, g, "distinctFitness")),
        ]);
      }
      return rows;
    })(),
    note:
      "Route progress of the generation champion in pixels, and the number of distinct fitness values in that generation, both averaged over seeds. The as-committed arm's distinct-fitness count is 1 at every generation of every seed and is omitted for space.",
    wide: true,
  });

  h2("Why higher training fitness did not mean better transfer");
  p(
    `The clone-elite arm reached the higher training-condition fitness (${n0(S.C.bestFitMean)} ` +
      `against ${n0(S.D.bestFitMean)}) yet the lower held-out score ` +
      `(${px(F[ARM.C].peakRouteProgress.mean)} against ${px(F[ARM.D].peakRouteProgress.mean)}). ` +
      "That inversion is the clearest evidence of overfitting in the study, and it has a specific " +
      "mechanism rather than a generic one."
  );
  p(
    "Under clone-elite, the entire next population is a mutated copy of one genome. Diversity is " +
      "destroyed and regenerated every generation from a single point, so the search behaves like a " +
      "stochastic hill-climb from whichever lineage first found a long branch out of the training " +
      "pose. A policy that has specialised to the exact sequence of turns leaving that one start " +
      "will score extremely well there — the best single run in the study reached " +
      `${n0(Math.max(...runsOf(ARM.C).map((r) => r.bestFitness)))} — and will have no reason to ` +
      "generalise. Tournament selection with crossover keeps several lineages alive and recombines " +
      "them, which both caps how far any one of them can specialise and preserves behavioural " +
      "variation that happens to be useful elsewhere."
  );
  p(
    "The practical implication for anyone extending this work is that training-condition fitness is " +
      "not a model-selection criterion here. Every ablation in [[sec:results]] is therefore selected " +
      "on validation poses rather than on training fitness, and [[tab:ablation]] reports both so " +
      "that the divergence between them can be seen directly."
  );

  h2("E5: held-out comparison");
  p(
    `[[tab:final]] and [[fig:final]] give the headline result on the ${testPoseCount} test poses. ` +
      `The strongest learned arm, ${SHORT[ARM.D]}, reaches ` +
      `${px(F[ARM.D].peakRouteProgress.mean)} of route progress (bootstrap 95% CI ` +
      `${n0(F[ARM.D].meanCI.lo)}–${n0(F[ARM.D].meanCI.hi)} px), against ` +
      `${px(F[ARM.FSM].peakRouteProgress.mean)} for the tuned reactive heuristic, ` +
      `${px(F[ARM.P].peakRouteProgress.mean)} for the tuned proportional controller and ` +
      `${px(F[ARM.PP].peakRouteProgress.mean)} for the map-privileged pure-pursuit reference.`
  );

  const dVsFsm = cmp(ARM.FSM);
  const dVsA = cmp(ARM.A);
  p(
    "Against the reactive heuristic the comparison " +
      `${
        dVsFsm.meanA > dVsFsm.meanB
          ? "favours the learned agent"
          : "favours the hand-written heuristic"
      }: Mann–Whitney U = ${n0(dVsFsm.mannWhitney && dVsFsm.mannWhitney.U)}, z = ` +
      `${n2(dVsFsm.mannWhitney && dVsFsm.mannWhitney.z)}, p = ` +
      `${n3(dVsFsm.mannWhitney && dVsFsm.mannWhitney.p)}, Cliff's delta = ` +
      `${n2(dVsFsm.cliffsDelta && dVsFsm.cliffsDelta.delta)} (` +
      `${dVsFsm.cliffsDelta ? dVsFsm.cliffsDelta.magnitude : "n/a"}). Against the as-committed arm ` +
      `the separation is p = ${n3(dVsA.mannWhitney && dVsA.mannWhitney.p)} with Cliff's delta = ` +
      `${n2(dVsA.cliffsDelta && dVsA.cliffsDelta.delta)} (` +
      `${dVsA.cliffsDelta ? dVsA.cliffsDelta.magnitude : "n/a"}), confirming that repairing the ` +
      "objective produces a difference that survives a non-parametric test on held-out conditions " +
      "and is not an artefact of the training curve."
  );

  B.push(
    fig(
      "final",
      "fig_final.svg",
      "Route progress on held-out start poses, ranked. Whiskers are percentile bootstrap 95% confidence intervals on the mean of per-pose means. The oracle is drawn in grey because it observes the map and is a ceiling rather than a competitor.",
      true
    )
  );

  B.push({
    t: "table",
    id: "final",
    caption: "Held-out evaluation (E5), ranked by route progress",
    head: ["Controller", "Route (px)", "95% CI", "Collision", "Frames", "MDBF (px)"],
    rows: rankFinal.map((a) => [
      SHORT[a] || a,
      n0(F[a].peakRouteProgress.mean),
      `${n0(F[a].meanCI.lo)}–${n0(F[a].meanCI.hi)}`,
      pct(F[a].collided.mean),
      n0(F[a].frames.mean),
      F[a].mdbf === null ? "no collisions" : n0(F[a].mdbf),
    ]),
    note: `${testPoseCount} held-out poses; learned arms additionally averaged over ${manifest.config.seeds.length} seeds. MDBF is total distance driven per collision. The oracle observes the road graph and is a reference, not a competing method.`,
    wide: true,
  });

  p(
    "[[tab:tests]] reports every pairwise comparison against the strongest learned arm. The pattern " +
      "is that the large, unambiguous separations are against the degenerate arm and against the " +
      "weakest hand-written controller, while the comparisons among the credible controllers are " +
      `not resolved at ${testPoseCount} paired poses. That is an honest reading of the evidence: ` +
      "this study can establish that repairing the objective mattered, and cannot establish a " +
      "reliable ordering among the controllers that work."
  );

  B.push({
    t: "table",
    id: "tests",
    caption: "Pairwise comparisons against the strongest learned arm",
    head: ["Comparison", "Mean A", "Mean B", "U", "z", "p", "Cliff's d", "Magnitude"],
    rows: e5.comparisons.map((c) => [
      `NE-D vs ${SHORT[c.b] || c.b}`,
      n0(c.meanA),
      n0(c.meanB),
      n0(c.mannWhitney.U),
      n2(c.mannWhitney.z),
      n3(c.mannWhitney.p),
      n2(c.cliffsDelta.delta),
      c.cliffsDelta.magnitude,
    ]),
    note:
      "Mann–Whitney U on per-pose means of peak route progress, tie-corrected normal approximation, two-sided. A positive Cliff's delta favours NE-D. No multiple-comparison correction is applied; see the caveat in [[sec:protocol]].",
    wide: true,
  });

  h2("Per-pose behaviour and the generalisation gap");
  p(
    "Averages conceal the shape of the distribution, which in this task is strongly bimodal. " +
      "[[tab:perpose]] gives the per-pose means for the four most informative controllers on every " +
      "test pose. The pattern is consistent: on a handful of poses several controllers travel " +
      "thousands of pixels, and on the remainder every controller fails within a few hundred. Those " +
      "poses are not random — they are the ones whose first junction lies within the vehicle's " +
      "stopping distance of the start."
  );

  B.push({
    t: "table",
    id: "perpose",
    caption: "Per-pose route progress (px) on the held-out test set",
    head: ["Pose", "NE-D", "NE-C", "Reactive FSM", "Pure pursuit"],
    rows: e5.config.testPoses.map((tp, i) => [
      tp.id,
      n0(e5.poseMeans[ARM.D][i]),
      n0(e5.poseMeans[ARM.C][i]),
      n0(e5.poseMeans[ARM.FSM][i]),
      n0(e5.poseMeans[ARM.PP][i]),
    ]),
    note:
      "Each cell is the mean over seeds for that arm at that pose. The learned arms are averaged over five seeds; the hand-written controllers are deterministic given a pose.",
    wide: true,
  });

  p(
    "The baselines provide an independent check on whether the pose split is fair. Because the " +
      "hand-written controllers were tuned on the validation poses and then evaluated on the test " +
      "poses, the difference between their validation and test scores measures how much the tuning " +
      "over-fitted the validation set. [[tab:gengap]] reports it. The reactive heuristic transfers " +
      `at ${n0(e2.summary[ARM.FSM].test.peakRouteProgress.mean)} px against ` +
      `${n0(e2.summary[ARM.FSM].val.peakRouteProgress.mean)} px on validation, and the pure-pursuit ` +
      `reference at ${n0(e2.summary[ARM.PP].test.peakRouteProgress.mean)} px against ` +
      `${n0(e2.summary[ARM.PP].val.peakRouteProgress.mean)} px. Neither shows the collapse that ` +
      "would indicate a badly split or unrepresentative test set."
  );

  B.push({
    t: "table",
    id: "gengap",
    caption: "Validation-to-test transfer of the fixed policies",
    head: ["Controller", "Val. route (px)", "Test route (px)", "Val. coll.", "Test coll."],
    rows: [ARM.RND, ARM.FSM, ARM.P, ARM.PP].map((a) => [
      SHORT[a],
      n0(e2.summary[a].val.peakRouteProgress.mean),
      n0(e2.summary[a].test.peakRouteProgress.mean),
      pct(e2.summary[a].val.collided.mean),
      pct(e2.summary[a].test.collided.mean),
    ]),
    note:
      "The random network is included as the performance floor; every other controller must beat it to have demonstrated anything.",
  });

  h2("Failure modes");
  p(
    "[[fig:termination]] decomposes how episodes end. The distinction between collision and " +
      "stagnation is diagnostically important: a collision means the policy drove into a wall, " +
      "whereas a stagnation termination means the policy stopped making progress and was killed by " +
      "the behavioural rules — typically by getting stuck against a boundary, oscillating, or " +
      "entering a dead end it is forbidden to reverse out of."
  );
  p(
    "The single most consequential number in the whole study is the collision rate of the oracle: " +
      `${pct(F[ARM.PP].collided.mean)} of pure-pursuit episodes end in contact with a boundary, ` +
      "despite the controller knowing exactly where the road goes. That is not a defect in the " +
      "controller; it is a property of the plant. With a steering increment fixed at 0.07 rad per " +
      "frame and a speed that must stay above 0.5 to avoid the crawling termination, the minimum " +
      "achievable turning radius is bounded below, and several junctions in this " +
      `${stats.world.roadWidthPx} px-wide network simply cannot be negotiated at speed. The residual ` +
      "failure rate common to all controllers is therefore attributable to the vehicle model rather " +
      "than to the policy, and no amount of additional training will remove it."
  );

  B.push(
    fig(
      "termination",
      "fig_termination.svg",
      "Termination cause by controller. Survival to the frame budget is the only outcome representing success; stagnation and reversal terminations reflect the behavioural rules described in [[sec:method]].",
      true
    )
  );
  B.push(
    fig(
      "traj",
      "fig_traj.svg",
      "Single-episode trajectories from the held-out pose at which the two controllers disagree most. From an identical start, the tuned reactive heuristic circles a block and is terminated by the stagnation rule, while the evolved champion continues along the corridor and survives to the frame budget. Both traces are one seed, so the distances shown are individual episodes rather than the seed-averaged pose means reported in [[tab:perpose]].",
      true
    )
  );

  h2("Comfort and control quality");
  p(
    "Route progress alone does not distinguish a controller that drives smoothly from one that " +
      "reaches the same place by sawing at the wheel. [[tab:comfort]] reports RMS jerk, steering " +
      "reversal rate, mean lateral deviation from the centreline, and the share of frames spent " +
      "outside the road corridor. These are the smoothness metrics the Milestone 1 definition " +
      "committed to reporting."
  );

  B.push({
    t: "table",
    id: "comfort",
    caption: "Control quality on held-out poses",
    head: ["Controller", "RMS jerk", "Steer rev./1k", "Lateral dev. (px)", "Off-corridor"],
    rows: rankFinal.map((a) => [
      SHORT[a] || a,
      n3(F[a].rmsJerk.mean),
      n0(F[a].steeringReversalsPer1k.mean),
      n0(F[a].meanLateral.mean),
      pct(F[a].offRouteShare.mean),
    ]),
    note:
      "RMS jerk is the root-mean-square second difference of speed. Off-corridor is the share of frames spent more than one road half-width from the nearest centreline.",
    wide: true,
  });

  p(
    "Two entries deserve comment. The off-corridor share is zero for every controller, which looks " +
      "like a broken metric and is in fact a structural property of this environment: the road is " +
      `${stats.world.roadWidthPx} px wide and its boundary is the collision surface, so a vehicle ` +
      "that leaves the corridor has already ended its episode. The metric can only ever be non-zero " +
      "in a world where leaving the road is survivable, and it is reported here for completeness " +
      "rather than because it discriminates."
  );
  p(
    "The steering-reversal column is more informative. The proportional controller records zero " +
      "reversals, because its tuned dead-band of " +
      `${e2a.best["P-Controller"].params.deadband} suppresses almost all steering commands — it ` +
      "drives essentially straight until it hits something, which is consistent with its " +
      `${pct(F[ARM.P].collided.mean)} collision rate. At the other extreme the pure-pursuit ` +
      `reference records ${n0(F[ARM.PP].steeringReversalsPer1k.mean)} reversals per thousand frames: ` +
      "it is continuously correcting toward a look-ahead point it can only approach through a binary " +
      "actuator, which is precisely the quantisation penalty described in [[sec:baselines]]. The " +
      `evolved champion sits between them at ${n0(F[ARM.D].steeringReversalsPer1k.mean)}, and the ` +
      `tuned heuristic is the smoothest of the competitive controllers at ` +
      `${n0(F[ARM.FSM].steeringReversalsPer1k.mean)}.`
  );

  h2("E4: ablations");
  p(
    `[[tab:ablation]] and [[fig:ablarch]] to [[fig:ablsense]] report ${e4.rows.length} variants, ` +
      `each trained for ${e4.config.generations} generations across ${e4.config.seeds.length} seeds ` +
      "and scored on the validation poses. Three findings stand out."
  );

  const archBest = bestOf("architecture");
  const archCur = ablBy("architecture").find((r) => r.name.includes("current"));
  p(
    `**Depth hurts.** The best architecture is *${archBest.name}* at ` +
      `${px(archBest.valMeanRouteProgress.mean)}, against ${px(archCur.valMeanRouteProgress.mean)} ` +
      `for the current 5–12–10–4 network — despite the latter carrying ${n0(archCur.parameters)} ` +
      `parameters to the former's ${n0(archBest.parameters)}. The Milestone 2 checkpoint listed ` +
      "\"expanding the hidden layer depth for improved generalisation\" as a next step; the " +
      "measurement says the opposite. The explanation is the thresholded activation: each unit emits " +
      "a single bit, so a hidden layer of width w passes at most w bits forward regardless of how " +
      "many weights feed it, and stacking such layers mostly adds search dimensions without adding " +
      "expressible behaviour. A five-input, four-output threshold network is close to the point " +
      "where additional depth is pure cost."
  );

  const mutVals = ablBy("mutation").map((r) => r.valMeanRouteProgress.mean);
  const mutBest = bestOf("mutation");
  p(
    `**Mutation rate is the dominant evolutionary hyperparameter.** The best setting is ` +
      `*${mutBest.name}* at ${px(mutBest.valMeanRouteProgress.mean)}; across the swept range the ` +
      `validation score varies by a factor of ${n1(Math.max(...mutVals) / Math.max(1, Math.min(...mutVals)))}. ` +
      "Given that the initialisation range is only [−0.1, 0.1], the mutation operator is effectively " +
      "responsible for the entire exploration budget, so this sensitivity is unsurprising in " +
      "hindsight — but it was not anticipated, and the shipped value is not the best one tested."
  );

  const senseBest = bestOf("sensing");
  const senseVals = ablBy("sensing").map((r) => r.valMeanRouteProgress.mean);
  p(
    `**Sensing changes less than expected.** The best sensing variant is *${senseBest.name}* at ` +
      `${px(senseBest.valMeanRouteProgress.mean)}, and the spread across sensing variants is a ` +
      `factor of ${n1(Math.max(...senseVals) / Math.max(1, Math.min(...senseVals)))}. Beam count and ` +
      "beam range both move the result, but not as much as the mutation rate does, which suggests " +
      "the bottleneck in this system is the optimiser and the actuator rather than the perception."
  );

  B.push({
    t: "table",
    id: "ablation",
    caption: "Ablation study (E4), selected on validation poses",
    head: ["Variant", "Params", "Train fitness", "Val. route (px)"],
    rows: (() => {
      const rows = [];
      for (const g of ["architecture", "mutation", "sensing"]) {
        rows.push({ group: g[0].toUpperCase() + g.slice(1) });
        for (const r of ablBy(g)) {
          rows.push([
            r.name,
            n0(r.parameters),
            `${n0(r.trainBestFitness.mean)} ± ${n0(r.trainBestFitness.sd)}`,
            `${n0(r.valMeanRouteProgress.mean)} ± ${n0(r.valMeanRouteProgress.sd)}`,
          ]);
        }
      }
      return rows;
    })(),
    note: `${e4.config.seeds.length} seeds per variant, ${e4.config.generations} generations, tournament-crossover operator with the corrected objective throughout. Test poses were not used at any point in this table.`,
    wide: true,
  });

  B.push(
    fig(
      "ablarch",
      "fig_ablation_arch.svg",
      "Architecture ablation. Additional depth reduces validation performance, contradicting the direction proposed at the technical checkpoint.",
  true
)
  );
  B.push(
    fig(
      "ablmut",
      "fig_ablation_mut.svg",
      "Mutation-rate ablation. With a near-degenerate initialisation, the mutation operator supplies essentially all exploration, and the result is correspondingly sensitive to its rate.",
  true
)
  );
  B.push(
    fig(
      "ablsense",
      "fig_ablation_sense.svg",
      "Sensor-geometry ablation over beam count and beam range, varied independently.",
  true
)
  );

  /* ================================================================
   * X. DISCUSSION
   * ================================================================ */
  h1("Discussion and Interpretation", "discussion");

  h2("Why the defect survived a demonstration-driven workflow");
  p(
    "The failure was live through the technical checkpoint submission. It survived because every " +
      "observable the development workflow produced was consistent with success: the population " +
      "spawned, cars drove, collisions rendered, generations advanced, the generation counter " +
      "incremented, the peak-fitness display showed a number, and the network visualiser animated. " +
      "The one observable that would have exposed it — the *dispersion* of fitness within a " +
      "generation — was never displayed, because a dashboard designed to show how well the best " +
      "agent is doing has no reason to show how different the agents are from one another."
  );
  p(
    "The general lesson is that for population-based optimisation the health metric is not the best " +
      "score but the spread. A single scalar counter of distinct fitness values per generation would " +
      "have flagged this in seconds. It is now the first quantity the harness reports and the one " +
      "plotted in [[fig:selection]]."
  );

  h2("A transferable check for degenerate objectives");
  p(
    "The specific bug in this project is a JavaScript idiosyncrasy and generalises to nothing. The " +
      "*class* of failure generalises to every population-based method, and the diagnostic that " +
      "found it costs almost nothing to run. Stated as a checklist that any such system can adopt:"
  );
  li(
    [
      "**Count the distinct objective values in a generation.** If that count is one, selection is " +
        "random regardless of what the best-fitness plot shows. If it collapses toward one over " +
        "training, the population has converged and further generations are wasted compute.",
      "**Plot dispersion, not only the maximum.** A best-fitness curve is monotone by construction " +
        "under elitism and therefore cannot fall, which makes it the single least diagnostic " +
        "quantity available.",
      "**Evaluate the objective at known-different states before training.** Two poses far apart on " +
        "the map should score differently. One assertion at start-up would have caught this defect " +
        "before a single generation ran.",
      "**Check that the termination rules and the objective are not circularly coupled.** Here the " +
        "stagnation rule read the objective, so a broken objective did not merely remove selection " +
        "pressure — it also truncated every episode to about a second, removing the experience that " +
        "might have exposed the problem behaviourally.",
      "**Separate the training signal from the reported metric.** If the only number you record is " +
        "the one you optimise, a degenerate objective is unobservable by construction.",
    ],
    true
  );
  p(
    "Of these, the third is the cheapest and would have been the most decisive. The pattern is " +
      "familiar from the wider machine-learning-systems literature as an undeclared dependency " +
      "between components that are each locally correct [[ref:sculley]]; what this project adds is a " +
      "quantified account of what such a dependency costs when it lands on the objective function " +
      "rather than on a feature."
  );

  h2("A radial potential is not a route");
  p(
    "The corrected objective works, but it is not the objective one would design from scratch. " +
      "Dijkstra distance from the start is a radial potential that increases in every direction, so " +
      "at a junction all outgoing branches look equally good and the agent has no reason to prefer " +
      "the one leading anywhere in particular. The consequence is visible in the oracle's behaviour: " +
      "without an explicit forward-half-plane restriction, the pure-pursuit controller periodically " +
      "selects a look-ahead point on a branch behind the vehicle and turns around, because that " +
      "point genuinely does have the requested route distance."
  );
  p(
    "A goal-directed formulation — Dijkstra *to* a designated target node, so that progress means " +
      "reduction in remaining distance — would remove the ambiguity and give the task a well-defined " +
      "notion of success. The map format supports a `target` marking type and the code implements " +
      "it; this particular extract contains no target instances, so the formulation was not " +
      "available without editing the world. That is a scoping decision rather than an oversight, but " +
      "it is the single change most likely to improve the system."
  );

  h2("The hand-written heuristic wins, and that is the finding");
  p(
    `On held-out poses the tuned three-parameter reactive heuristic reaches ` +
      `${px(F[ARM.FSM].peakRouteProgress.mean)} against ${px(F[ARM.D].peakRouteProgress.mean)} for ` +
      `the best evolved ${n0(nParams)}-parameter network — a factor of ` +
      `${n1(F[ARM.FSM].peakRouteProgress.mean / Math.max(1, F[ARM.D].peakRouteProgress.mean))}. ` +
      "Reporting that plainly is more useful than burying it. It is not an embarrassment; it is " +
      "information about the task. The observation space is five numbers, the action space is four " +
      "bits, and the correct reactive behaviour on a road corridor — go forward, turn away from the " +
      "near side — is close to linearly separable in that space. There is very little for a " +
      "nonlinear function approximator to add, and the thresholded activation gives it a hypothesis " +
      "class barely richer than the heuristic's."
  );
  p(
    "Three further factors work against the learned agent specifically, and each is a property of " +
      "the protocol rather than of neuroevolution. First, the heuristic was tuned *on validation " +
      "poses* — that is, on the same distribution it is tested on — whereas the network was trained " +
      "from a single start pose and transferred. Second, the heuristic has three parameters and the " +
      `network has ${n0(nParams)}, so the sample efficiency required to reach a comparable policy ` +
      "differs by orders of magnitude at a budget of " +
      `${manifest.config.generations} generations. Third, a reactive rule cannot overfit to one ` +
      "start pose, and the network demonstrably does: its training-condition route progress " +
      `(${px(S.D.finalRouteMean)}) far exceeds its held-out figure ` +
      `(${px(F[ARM.D].peakRouteProgress.mean)}).`
  );
  p(
    "The honest conclusion is that neuroevolution is not the right tool for *this* problem as " +
      "currently posed. It becomes the right tool when the observation space is richer than a " +
      "hand-written rule can exploit, when the correct behaviour depends on history rather than the " +
      "current frame, or when the objective is genuinely non-decomposable. Recognising that " +
      "distinction is worth more than a result that hides it behind a favourable comparison."
  );

  h2("Crossover improves both variance and transfer");
  p(
    "The tournament-crossover operator did not raise the training-condition ceiling — the single " +
      "best run in the whole study belongs to the clone-elite arm — but it dominated on every other " +
      `axis. It reduced seed-to-seed standard deviation by ${n1(varianceRatio)}×, improved mean ` +
      "final-generation route progress, and improved held-out route progress from " +
      `${px(F[ARM.C].peakRouteProgress.mean)} to ${px(F[ARM.D].peakRouteProgress.mean)} — a factor ` +
      `of ${n1(F[ARM.D].peakRouteProgress.mean / Math.max(1, F[ARM.C].peakRouteProgress.mean))}. ` +
      "That combination is the signature of reduced overfitting to a single lineage: cloning the " +
      "champion into the entire population every generation concentrates the search around whatever " +
      "solved the training pose, while maintaining and recombining a population preserves variation " +
      "that happens to transfer. For a system that will be run once by an examiner rather than a " +
      "hundred times by a researcher, the variance reduction is valuable in its own right — it is " +
      "the difference between a demonstration that usually works and one that works when it is " +
      "being watched."
  );

  h2("Was building it from scratch worth it?");
  p(
    "The from-scratch constraint was the project's founding decision and it deserves an explicit " +
      "accounting rather than a rhetorical defence. On the cost side: there is no automatic " +
      "differentiation, so gradient methods were never available for comparison; there is no " +
      "optimiser library, so the genetic algorithm had to be written and then debugged; the " +
      "hand-written network turned out to be a linear-threshold network rather than the smooth " +
      "multilayer network the earlier draft believed it was, which is a mistake a framework would " +
      "have made impossible; and a substantial fraction of the effort went into geometry — envelope " +
      "generation, polygon union, ray-segment intersection — that contributes nothing to the " +
      "research question."
  );
  p(
    "On the benefit side there is one item, and it is decisive for this project specifically. The " +
      "central finding required reading the objective function's implementation, replacing the " +
      "graph loader's behaviour with a pinned historical copy, and instrumenting the dispersion of " +
      "fitness inside the selection step. In a closed simulator with a supplied reward function, " +
      "none of those three operations is available, and the most likely outcome would have been a " +
      "report concluding that neuroevolution converges slowly on this task. That conclusion would " +
      "have been false, unfalsifiable from the outside, and entirely plausible."
  );
  p(
    "The balanced verdict is that the from-scratch constraint was correct for a project whose " +
      "subject is the optimisation process, and would be the wrong constraint for a project whose " +
      "subject is driving performance. The distinction is worth drawing carefully because " +
      "\"implemented from first principles\" is often presented as a virtue in itself; it is not, " +
      "it is a trade, and here it happened to buy precisely the capability the project needed."
  );

  h2("The ceiling is set by the plant, not the policy");
  p(
    `That the map-privileged reference collides in ${pct(F[ARM.PP].collided.mean)} of held-out ` +
      "episodes reframes every other number in this report. The gap between the learned agent and " +
      "perfection is not all attributable to learning. A substantial part of it is the discretised " +
      "steering, the speed-coupled heading, the prohibition on slowing below 0.5, and road geometry " +
      "that includes corners a vehicle of this size and turning rate cannot take. Reporting a " +
      "learned controller's collision rate without that reference point would have invited the " +
      "reader to attribute all of it to the policy — which is exactly the kind of unfalsifiable " +
      "claim the earlier draft made and this report retracts."
  );

  /* ================================================================
   * XI. LIMITATIONS
   * ================================================================ */
  h1("Limitations, Trade-offs and Professional Judgment", "limitations");

  h2("Threats to validity");
  li([
    "**Single map.** Every result comes from one OpenStreetMap extract. Held-out *poses* test " +
      "generalisation across initial conditions, not across topologies. Conclusions about depth, " +
      "mutation rate and sensing are conditional on this network's geometry.",
    `**Modest seed count.** ${manifest.config.seeds.length} seeds for the main arms and ` +
      `${manifest.config.ablationSeeds} for the ablations. Evolutionary runs are high-variance, so ` +
      "the ablation rankings are indicative rather than settled; the mutation-rate and depth effects " +
      "are large enough to survive this caveat, but adjacent variants within a group are not " +
      "reliably separated.",
    "**No multiple-comparison correction.** Several pairwise tests are reported. Individual p-values " +
      "near 0.05 should not be treated as confirmatory.",
    `**Reduced population and generations.** ${manifest.config.population} individuals for ` +
      `${manifest.config.generations} generations, against the interactive system's 100. Absolute ` +
      "performance is therefore a lower bound on what the system reaches with a longer budget.",
    "**Buildings and trees are not collidable.** They are rendered and occlude nothing; the only " +
      "obstacles are the road boundaries. The environment is less cluttered than it looks.",
    "**No dynamic traffic.** The traffic array is empty in every experiment. The Milestone 1 " +
      "definition anticipated dummy vehicles; they were not implemented in time, and no claim about " +
      "multi-agent interaction is made anywhere in this report.",
    "**Termination rules confound the environment with the objective.** Because the stagnation rule " +
      "reads the fitness value, changing the fitness changes the environment. The arms are therefore " +
      "not a clean factorial design. This is faithful to the real system rather than a controlled " +
      "abstraction of it, and the choice is deliberate, but it limits what the E3 comparison isolates.",
    "**The oracle is not a true upper bound.** Pure pursuit with a tuned look-ahead is one " +
      "map-privileged controller, not the best possible one. Its collision rate bounds what *it* " +
      "achieves, and is evidence about the plant, but a better privileged controller would raise the " +
      "reference.",
  ]);

  h2("Statistical power");
  p(
    `The headline comparison is paired across ${testPoseCount} test poses. For a rank-based test at ` +
      "the conventional 5% level and 80% power, that sample size is adequate only for effects in " +
      "the large range — roughly Cliff's delta above 0.5, or a stochastic dominance probability " +
      "around 0.75. [[tab:tests]] should be read with that in mind: comparisons reaching that " +
      "magnitude are supported by the design, and comparisons below it are not distinguishable from " +
      "noise at this sample size regardless of what the p-value happens to read."
  );
  p(
    "The remedy is not more seeds, since seeds are averaged within a pose and do not increase the " +
      "number of paired units; it is more poses, or held-out maps. Both are compute-cheap relative " +
      "to training and would be the first thing to change in a follow-up. The decision to spend the " +
      `available budget on ${manifest.config.seeds.length} seeds per arm rather than on more poses ` +
      "was made to characterise seed variance — which turned out to be the finding that separates " +
      "the two reproduction operators — and it is a defensible allocation, but it is an allocation " +
      "and it constrains what the comparisons can establish."
  );

  h2("Engineering trade-offs taken deliberately");
  li([
    "**From-scratch implementation over a framework.** Cost: no automatic differentiation, no " +
      "optimiser library, slower iteration, and a hand-written network that turned out to be a " +
      "threshold network rather than the smooth one the draft described. Benefit: total visibility, " +
      "which is what made the central finding discoverable at all.",
    "**Committed map extract over a live Overpass query.** Cost: 6 MB in the repository and a world " +
      "that cannot be varied without regeneration. Benefit: byte-identical reproducibility.",
    "**Spatial index in the harness only.** Cost: the harness and the browser build cull boundaries " +
      "differently. Benefit: a behaviour-preserving speedup exactly where it was needed, with no " +
      "risk of altering the interactive system. The equivalence argument — a 400 px query radius " +
      "against a 220 px beam and a 58 px vehicle diagonal — is given in [[sec:system]].",
    "**Fixed topology over NEAT.** Cost: architecture must be chosen by ablation rather than " +
      "discovered. Benefit: a genome that is a flat array, which makes uniform crossover trivial and " +
      "the depth ablation possible at all.",
    "**Pose-level rather than episode-level statistics.** Cost: fewer effective samples and wider " +
      "intervals. Benefit: arms are paired on identical initial conditions, and an arm with more " +
      "seeds cannot buy spurious precision.",
    "**Repairing the defect rather than reporting it alone.** Cost: the working tree no longer " +
      "matches the checkpoint submission, so the baseline arm needs a pinned copy of the old code. " +
      "Benefit: the delivered system actually learns, and the comparison is still exact.",
  ]);

  h2("What I would do differently");
  li(
    [
      "Instrument the *dispersion* of the objective from the first day rather than its best value. " +
        "One counter would have saved the checkpoint submission.",
      "Define the task as goal-directed navigation to a target node, so that progress means " +
        "reduction in remaining distance and success is well defined.",
      "Replace the thresholded activation with a continuous one and make steering continuous. The " +
        "binary actuator handicaps every controller in this study, including the oracle.",
      "Separate the behavioural termination rules from the fitness signal, so that objective and " +
        "environment can be varied independently.",
      "Budget for more seeds before more variants; the ablation grid is wider than the seed count " +
        "can properly support.",
    ],
    true
  );

  h2("Delivery against the Milestone 1 commitments");
  p(
    "Professional judgment includes reporting what was promised and not delivered, not only what " +
      "was achieved. [[tab:delivery]] audits this report against the Milestone 1 project definition. " +
      "Of the commitments made at the scoping stage, most were delivered, two were delivered in a " +
      "modified form, and two were not delivered at all."
  );
  B.push({
    t: "table",
    id: "delivery",
    prose: true,
    caption: "Audit against the Milestone 1 project definition",
    head: ["Commitment", "Status"],
    rows: [
      [
        "Transparent custom 2D simulator with OSM map generation",
        "Delivered. Procedural generation was not implemented; only the OSM path is used.",
      ],
      [
        "Neural network agent trained by a genetic algorithm",
        "Delivered, and shown to have been non-functional at the checkpoint before repair.",
      ],
      [
        "Quantitative comparison against a rule-based heuristic baseline",
        "Delivered, with three baselines rather than one and with tuning on a held-out split.",
      ],
      [
        "Metrics: collision rate, mean distance between failures, jerk",
        "Delivered; all three appear in [[tab:final]] and [[tab:comfort]].",
      ],
      [
        "Roulette selection, uniform crossover, Gaussian mutation",
        "Modified. The shipped operator was clone-and-mutate with no crossover; tournament selection with uniform crossover was added and compared against it. Mutation is uniform-additive rather than Gaussian.",
      ],
      [
        "Serialised champion genome as a deliverable artefact",
        "Delivered via `localStorage` and inside `e3_training.json`.",
      ],
      [
        "Real-time visualisation of activations and sensor rays",
        "Delivered.",
      ],
      [
        "Curriculum learning as a convergence-failure mitigation",
        "Not delivered. Convergence failure was addressed by fixing the objective instead, which turned out to be the actual cause.",
      ],
      [
        "Quadtree or spatial hashing for computational load",
        "Delivered in the evaluation harness as a uniform grid; the interactive build still uses radius culling.",
      ],
      [
        "Dynamic traffic with stochastic paths",
        "Not delivered. No claim about multi-agent interaction is made anywhere in this report.",
      ],
      [
        "Graph preprocessing to repair disconnected OSM edges",
        "Not delivered as a repair; disconnection is instead measured, reported, and excluded from the evaluation set.",
      ],
    ],
    wide: true,
  });

  h2("Responsible use");
  p(
    "This is a simulation study of an optimisation method, not an autonomous driving system. The " +
      "vehicle model omits tyre slip, mass, actuator latency and sensor noise; the sensor is a " +
      "geometric idealisation with no false returns; and there is no perception stack. Nothing in " +
      "these results transfers to a physical vehicle, and the gap for a model at this level of " +
      "abstraction is not a matter of domain randomisation [[ref:tobin]] but of category. The " +
      "OpenStreetMap data is openly licensed and contains no personal data. The one broader claim " +
      "the report does make — that population-based optimisation can fail silently while presenting " +
      "every appearance of working — generalises well beyond this project, and is why the diagnostic " +
      "in [[sec:results]] is presented as a first-class result rather than an anecdote."
  );

  /* ================================================================
   * XII. CONCLUSION
   * ================================================================ */
  h1("Conclusion and Future Work", "conclusion");
  p(
    "This report presented an end-to-end neuroevolutionary driving system built without machine " +
      "learning frameworks, evaluated it against tuned rule-based baselines and a map-privileged " +
      "reference on held-out start poses drawn from a real road topology, and used that evaluation " +
      "to diagnose and repair a silent failure which had made the submitted system incapable of " +
      "learning."
  );
  p(
    "The quantitative findings are: the as-committed objective produced " +
      `${e1row(0).distinctFitnessValues} distinct fitness value in a population of ` +
      `${e1row(0).populationSize} and no improvement over ${manifest.config.generations} ` +
      "generations; repairing it restored selection pressure and produced measurable learning; " +
      `tournament selection with uniform crossover reduced seed variance by ${n1(varianceRatio)}× ` +
      "relative to the shipped clone-and-mutate operator; additional network depth measurably hurt " +
      "performance, contradicting the direction proposed at the technical checkpoint; a tuned " +
      `three-parameter reactive heuristic outperformed the evolved network on held-out poses by a ` +
      `factor of ${n1(F[ARM.FSM].peakRouteProgress.mean / Math.max(1, F[ARM.D].peakRouteProgress.mean))}; ` +
      `and a controller that can see the map still collides in ${pct(F[ARM.PP].collided.mean)} of ` +
      "episodes, bounding what any policy on this vehicle model can achieve. The last two findings " +
      "together say something the project set out to be able to say: on this task, at this budget, " +
      "with this actuator, a hand-written rule is the better engineering choice, and the evidence " +
      "for that is quantitative rather than rhetorical."
  );
  p(
    "Future work follows directly from the limitations, and is ordered here by expected value rather " +
      "than by ease."
  );
  li(
    [
      "**Reformulate the objective as goal-directed navigation.** Run Dijkstra *to* a designated " +
        "target node so that progress means reduction in remaining distance. This removes the " +
        "branch ambiguity analysed in [[sec:discussion]], gives the task a well-defined notion of " +
        "success, and would allow a success rate to be reported alongside route progress. The map " +
        "format and the code already support target markings; only the extract lacks them.",
      "**Make the actuator continuous.** Replace the four binary outputs with a steering angle and " +
        "a throttle, and the thresholded activation with a smooth one. This raises the plant's " +
        `ceiling — currently evidenced by the oracle's ${pct(F[ARM.PP].collided.mean)} collision ` +
        "rate — and simultaneously makes the network's parameter count worth having, since a " +
        "linear-threshold stack cannot exploit it.",
      "**Evaluate across several map extracts.** Every conclusion about depth, mutation rate and " +
        "sensing is currently conditional on one topology. Held-out *maps* rather than held-out " +
        "poses would separate topology-specific findings from general ones, and is the single " +
        "change that would most improve external validity.",
      "**Decouple termination from fitness.** Making the behavioural rules independent of the " +
        "objective would turn the E3 comparison into a clean factorial design and remove the " +
        "confound acknowledged in [[sec:limitations]].",
      "**Add dynamic traffic.** This is the point at which a purely reactive heuristic would be " +
        "expected to lose its advantage, because the correct response to a moving obstacle depends " +
        "on its velocity and therefore on history — precisely the regime where a learned policy has " +
        "something to offer that three tuned thresholds do not.",
      "**Increase seeds before increasing variants.** The ablation grid is wider than " +
        `${e4.config.seeds.length} seeds can support, as [[tab:seeds]] shows directly.`,
    ],
    true
  );
  p(
    "Taken together these describe a version of the project in which neuroevolution would be " +
      "expected to earn its place rather than merely be demonstrated. The present study establishes " +
      "the measurement infrastructure that would be needed to tell the difference."
  );

  /* ================================================================
   * APPENDIX A
   * ================================================================ */
  B.push({ t: "h1", text: "Reproducibility Checklist", id: "appA", appendix: true });
  p(
    "This appendix is the checklist required by the capstone guide. Each item states what was done " +
      "and where the evidence lives."
  );

  B.push({ t: "h2", text: "Code and environment" });
  B.push({
    t: "checklist",
    items: [
      {
        done: true,
        label: "Dependencies listed.",
        text:
          "There are none, and that absence is itself the dependency statement. The browser " +
          "application uses no libraries; the evaluation harness uses only the Node.js standard " +
          "library (`fs`, `path`, `vm`, `os`, `child_process`). No `requirements.txt` or " +
          `\`environment.yml\` is applicable. Node.js ${host.node} or newer is sufficient.`,
      },
      {
        done: true,
        label: "Hardware specified.",
        text:
          `${host.cpu}, ${host.cores} logical cores, ${host.ramGB} GB RAM, ${host.platform}. ` +
          "Execution is single-threaded and CPU-only; no GPU is used anywhere in this project, " +
          "because the models are hand-written and gradient-free. The full protocol completes in " +
          `${n1(manifest.elapsedSeconds / 60)} minutes.`,
      },
      {
        done: true,
        label: "Random seeds.",
        text:
          `The master seed is ${manifest.config.masterSeed}; the per-run seeds are ` +
          `${manifest.config.seeds.join(", ")}. A mulberry32 generator ` +
          "(`experiments/harness/rng.js`) is installed in place of `Math.random` inside the " +
          "simulation context, so weight initialisation, mutation, selection, pose sampling and " +
          "bootstrap resampling are all deterministic given the seed. Pose sampling uses the master " +
          "seed exclusive-ORed with 0x5eed; bootstrap resampling uses it exclusive-ORed with 0xb007.",
      },
      {
        done: true,
        label: "Code available.",
        text:
          `\`${git.remote}\`, branch \`${git.branch}\`, commit \`${git.commit}\`. That commit is ` +
          "the *repaired* state: it contains the two source changes listed verbatim in " +
          "[[sec:appG]] (`utils/nodeGraph.js` and `utils/pathfinder.js`) together with the " +
          "`experiments/` and `temp_report/` trees that produce every result and figure here. The " +
          "*pre-repair* state analysed as the baseline arm throughout [[sec:results]] is its parent, " +
          "commit `43084e8` (\"Strict navScore use; eliminate reversing\"), which was the submission " +
          "at the technical checkpoint. The baseline arm does not depend on checking that commit " +
          "out: it pins its own verbatim copy of the pre-repair scorer and loader in " +
          "`experiments/harness/legacyRouteDiscovery.js`, so both arms are reproducible from the " +
          "repaired working tree alone.",
      },
    ],
  });

  B.push({ t: "h2", text: "Data" });
  B.push({
    t: "checklist",
    items: [
      {
        done: true,
        label: "Data availability.",
        text:
          "The road network derives from OpenStreetMap, which is public and openly licensed. The " +
          "exact extract used is committed to the repository as `simulation/simulationData.js` " +
          `(${n0(stats.sourceBytes)} bytes), so no network access is required to reproduce any ` +
          "result. All sensor data is generated synthetically at run time by the simulator.",
      },
      {
        done: true,
        label: "Splits defined.",
        text:
          "Training uses the single start marking present in the map (n = 1). Validation uses " +
          `${valPoseCount} sampled poses, used only for baseline tuning and ablation selection. ` +
          `Testing uses ${testPoseCount} disjoint poses, used once for the reported comparison. ` +
          "Poses are graph nodes of degree at least two with finite route distance, shuffled with " +
          "the fixed seed above, so the split is reproducible from the code alone.",
      },
      {
        done: true,
        label: "Preprocessing described.",
        text:
          "Ingestion, envelope generation, boolean polygon union and boundary extraction are " +
          "described in [[sec:data]]; the resulting counts are in [[tab:data]]. Feature " +
          "normalisation is a single step: each beam returns t in [0, 1] and the network receives " +
          "1 − t, with a missing return encoded as 0. Data-quality handling for disconnected " +
          "components, degenerate boundary segments and missing semantic annotation is documented " +
          "in [[sec:data]].",
      },
    ],
  });

  B.push({ t: "h2", text: "Model and training" });
  B.push({
    t: "checklist",
    items: [
      {
        done: true,
        label: "Hyperparameters.",
        text:
          "Listed in full in [[tab:hyper]]. There is no learning rate or batch size because the " +
          "optimiser is a genetic algorithm; the analogous quantities are population size " +
          `(${manifest.config.population}), generation count (${manifest.config.generations}), ` +
          `mutation rate (${n2(manifest.config.mutationRate)}), elite count ` +
          `(${manifest.config.eliteCount}) and tournament size (${manifest.config.tournamentSize}). ` +
          "Baseline hyperparameters and their search grids are in [[tab:tuning]].",
      },
      {
        done: true,
        label: "Architecture.",
        text:
          "Fully specified: a feed-forward network of widths 5–12–10–4 with logistic activations " +
          `thresholded at 0.5, ${n0(nParams)} parameters, implemented in ` +
          "`simulation/brainModel.js`. Forward propagation is Equation (4); the ablation over " +
          "widths is in [[tab:ablation]].",
      },
      {
        done: true,
        label: "Determinism verified, not assumed.",
        text:
          "`experiments/verifyHarness.js` asserts three properties empirically: an episode replayed " +
          `under one seed is bit-identical across ${verify.determinism.repetitions} repetitions; a ` +
          "training run under one seed reproduces its entire fitness history byte-for-byte; and the " +
          "spatial index used to accelerate evaluation is behaviour-preserving, confirmed by " +
          `${verify.cullingEquivalence.identical} of ${verify.cullingEquivalence.trials} paired ` +
          "trajectories matching exactly against an unculled control. All three currently pass.",
      },
      {
        done: true,
        label: "Results traceable.",
        text:
          "Every numeric value in this report is read programmatically from the JSON in " +
          "`experiments/results/` by `temp_report/build.js`; none is transcribed by hand. Regenerating " +
          "the results and rebuilding the report updates the text automatically.",
      },
    ],
  });

  /* ================================================================
   * APPENDIX B
   * ================================================================ */
  B.push({ t: "h1", text: "How to Reproduce", id: "appB", appendix: true });
  p(
    "From a clean checkout, with Node.js installed and no other dependencies, the complete pipeline " +
      "is four commands:"
  );
  B.push({
    t: "code",
    text: `# 1. Descriptive statistics of the ingested world
node experiments/datasetStats.js

# 2. Verify the harness is deterministic and the
#    spatial index is behaviour-preserving
node experiments/verifyHarness.js

# 3. Full experimental protocol (E1-E5)
node experiments/runExperiments.js

# 4. Render every figure from the results
node experiments/makeFigures.js

# 5. Rebuild this report (HTML, PDF and LaTeX source)
node temp_report/build.js`,
  });
  p(
    "`--smoke` runs a reduced configuration in under a minute for a quick end-to-end check, and " +
      "`--only=E1,E3` restricts execution to named experiments. The interactive simulator itself " +
      "needs no build step: serve the repository root over HTTP and open `index.html`."
  );

  B.push({
    t: "table",
    id: "manifest",
    prose: true,
    caption: "Artefact manifest",
    head: ["Path", "Role"],
    rows: [
      [
        "`simulation/`, `utils/`, `core/`, `ui/`",
        "The interactive simulator; loaded unmodified by the harness",
      ],
      [
        "`simulation/simulationData.js`",
        `Committed OpenStreetMap extract (${n1(stats.sourceBytes / 1024 / 1024)} MB)`,
      ],
      ["`experiments/harness/loadSim.js`", "Loads the browser sources into a headless Node context"],
      ["`experiments/harness/rng.js`", "Seeded mulberry32 generator"],
      [
        "`experiments/harness/env.js`",
        "Spatial index, corrected route scorer, baseline controllers",
      ],
      ["`experiments/harness/episode.js`", "Episode driver and per-episode metrics"],
      ["`experiments/harness/ga.js`", "Both reproduction operators"],
      ["`experiments/harness/stats.js`", "Bootstrap, Mann–Whitney U, Cliff's delta"],
      [
        "`experiments/harness/legacyRouteDiscovery.js`",
        "Pinned pre-repair scorer and loader for the baseline arm",
      ],
      ["`experiments/runExperiments.js`", "The E1–E5 protocol"],
      ["`experiments/verifyHarness.js`", "Determinism and culling-equivalence checks"],
      ["`experiments/datasetStats.js`", "Exploratory analysis of the ingested world"],
      ["`experiments/makeFigures.js`", "Renders every figure in this report from the results"],
      ["`experiments/results/*.json`", "All raw results"],
      ["`temp_report/content.js`", "This report's text and its data bindings"],
    ],
  });

  /* ================================================================
   * APPENDIX C
   * ================================================================ */
  B.push({ t: "h1", text: "Corrections to the Milestone 2 Draft", id: "appC", appendix: true });
  p(
    "Academic honesty requires recording where the earlier submission was wrong. The following " +
      "statements in the technical checkpoint and the draft report do not match the implementation " +
      "and are corrected here."
  );
  B.push({
    t: "table",
    id: "corrections",
    prose: true,
    caption: "Corrections to earlier submissions",
    head: ["Earlier statement", "Correction"],
    rows: [
      ["\"Hidden Layer: 6 neurons\"; topology 5–6–4", "The committed network is 5–12–10–4, with two hidden layers."],
      ["Outputs mapped to Forward, Reverse, Left, Right", "The output order is Forward, Left, Right, Reverse."],
      [
        "\"A kinematic bicycle model was implemented\"",
        "The model is a unicycle with speed-coupled steering; there is no wheelbase or steering-angle state.",
      ],
      [
        "Activation described as a sigmoid",
        "The logistic function is applied and then thresholded at 0.5, making every unit a linear threshold unit.",
      ],
      [
        "Fitness F = α·d_forward − β·(collision penalty)",
        "No such penalty exists in the code. Fitness is route progress, or Euclidean displacement in fallback, and collision acts through episode termination rather than a penalty term.",
      ],
      [
        "Mutation described as Lerp(W_best, Random(−1,1), μ)",
        "The implemented operator perturbs each parameter with probability μ, re-randomising in [−2, 2] with probability 0.1 and otherwise adding U(−0.5, 0.5), with clipping.",
      ],
      [
        "\"Mutation rate of 10%\"",
        `The committed code uses ${n2(manifest.config.mutationRate)}, raised to ${n2(manifest.config.boostRate)} for every fifth individual.`,
      ],
      [
        "\"Agents consistently demonstrated the ability to execute high-speed manoeuvres\" after 50 generations",
        "Unsupported. Under the objective committed at that time no learning was possible; the observation was of a population that had not improved since generation 1.",
      ],
      [
        "\"The elite genome is mutated using a linear interpolation function\"",
        "Elitism is implemented by leaving index 0 unmutated; there is no interpolation toward a random genome.",
      ],
    ],
    wide: true,
  });

  /* ================================================================
   * APPENDIX — notation
   * ================================================================ */
  B.push({ t: "h1", text: "Notation", id: "appNotation", appendix: true });
  B.push({
    t: "table",
    id: "notation",
    prose: true,
    caption: "Symbols used in this report",
    head: ["Symbol", "Meaning", "Value or units"],
    rows: [
      { group: "Environment" },
      ["m", "Road-graph nodes", n0(stats.counts.graphNodes)],
      ["e", "Road-graph centreline segments", n0(stats.counts.graphSegments)],
      ["n", "Road-boundary segments used for sensing and collision", n0(stats.counts.roadBorderSegments)],
      ["R(c)", "Corrected route-progress field evaluated at position c", "px"],
      { group: "Vehicle" },
      ["v_t", "Signed scalar speed at frame t", "simulator units, |v| ≤ 6"],
      ["θ_t", "Heading at frame t; θ = 0 points along −y", "rad"],
      ["δ", "Steering increment applied per frame while moving", "0.07 rad"],
      ["a", "Throttle acceleration", "0.2"],
      ["c_f", "Friction decrement applied per frame", "0.05"],
      ["T", "Episode frame budget", n0(manifest.config.maxFrames)],
      { group: "Sensing and policy" },
      ["b", "Beam count", "5"],
      ["s_i", "Feature from beam i, equal to 1 − t_i", "[0, 1]"],
      ["θ (weights)", "Genome: all network weights and biases", `${n0(nParams)} values`],
      ["σ", "Logistic function, thresholded at 0.5", "—"],
      { group: "Evolution and statistics" },
      ["P", "Population size", n0(manifest.config.population)],
      ["G", "Generations", n0(manifest.config.generations)],
      ["μ", "Mutation rate", n2(manifest.config.mutationRate)],
      ["k", "Elite count in the tournament arm", n0(manifest.config.eliteCount)],
      ["U, z, p", "Mann–Whitney statistic, normal deviate, two-sided p-value", "—"],
      ["d", "Cliff's delta; |d| ≥ 0.474 is large", "[−1, 1]"],
    ],
    wide: true,
  });

  /* ================================================================
   * APPENDIX — per-seed ablation detail
   * ================================================================ */
  B.push({ t: "h1", text: "Per-Seed Ablation Detail", id: "appSeeds", appendix: true });
  p(
    "[[tab:ablation]] reports ablation results as a mean and standard deviation over " +
      `${e4.config.seeds.length} seeds. With so few seeds, a mean can be dominated by one run, so ` +
      "the individual values are given here. Where the three seeds of a variant disagree by more " +
      "than the gap between adjacent variants, the ranking between those variants should not be " +
      "trusted — which is the case for several of the sensing rows and for the two middle " +
      "architecture rows."
  );
  B.push({
    t: "table",
    id: "seeds",
    caption: "Validation route progress (px) per seed for every ablation variant",
    head: ["Variant", ...e4.config.seeds.map((s) => `seed ${s}`), "SD"],
    rows: (() => {
      const rows = [];
      for (const g of ["architecture", "mutation", "sensing"]) {
        rows.push({ group: g[0].toUpperCase() + g.slice(1) });
        for (const r of ablBy(g)) {
          rows.push([
            r.name,
            ...r.perSeed.map((s) => n0(s.valMeanRouteProgress)),
            n0(r.valMeanRouteProgress.sd),
          ]);
        }
      }
      return rows;
    })(),
    note:
      "Each cell is the champion of that seed's run, evaluated on the validation poses. Test poses were not used.",
    wide: true,
  });

  /* ================================================================
   * APPENDIX — metric definitions
   * ================================================================ */
  B.push({ t: "h1", text: "Metric Definitions", id: "appMetrics", appendix: true });
  p(
    "Every metric is computed per episode and then aggregated. Let v_t be the signed scalar speed " +
      "at frame t, T the number of frames the episode lasted, c_t the vehicle centre, and R(·) the " +
      "corrected route-progress field rooted at that episode's start pose."
  );
  li([
    "**Peak route progress** = max over t of R(c_t). Taking the maximum rather than the final value " +
      "prevents an agent that reaches a far point and then reverses from being scored on where it " +
      "ended up.",
    "**Path length** = Σ|v_t|, the distance actually driven. It differs from route progress " +
      "whenever the agent doubles back or circles, so the ratio of the two is an implicit measure " +
      "of directedness.",
    "**Net displacement** = ‖c_T − c_0‖, straight-line distance from the start.",
    "**RMS jerk** = sqrt( (1/(T−2)) Σ (a_t − a_{t−1})² ) where a_t = v_t − v_{t−1}. Because " +
      "acceleration is quantised by the binary throttle, this is dominated by how often the " +
      "controller toggles the throttle rather than by any continuous dynamics.",
    "**Steering reversals per 1000 frames** = 1000/T times the number of frames at which the " +
      "commanded steering direction changed sign, ignoring straight-ahead frames. It measures " +
      "control chatter directly.",
    "**Mean lateral deviation** = (1/T) Σ d(c_t, nearest centreline), and **off-corridor share** = " +
      `(1/T) |{ t : d(c_t, nearest centreline) > ${stats.world.roadWidthPx / 2} }|.`,
    "**Collision rate** = share of episodes whose termination cause was boundary contact, and " +
      "**MDBF** = (Σ over episodes of path length) / (number of collision terminations), which is " +
      "undefined when no collision occurred and is reported as such.",
  ]);
  p(
    "Aggregation across poses uses the pose mean as the unit, as described in [[sec:protocol]]. " +
      "Aggregation across seeds is a plain arithmetic mean within a pose, performed before the " +
      "pose-level statistics so that seeds cannot inflate the effective sample size."
  );

  /* ================================================================
   * APPENDIX E — key source listings
   * ================================================================ */
  B.push({ t: "h1", text: "Key Source Listings", id: "appG", appendix: true });
  p(
    "The three routines below are the ones a reader most needs in order to verify the claims in " +
      "[[sec:results]]. They are reproduced verbatim from the repository at the commit recorded in " +
      "Appendix A, with comments removed for space."
  );

  B.push({ t: "h2", text: "The defect, as committed" });
  p(
    "The two halves of the contract mismatch. The loader discards every attribute except the " +
      "coordinates; the scorer keys on one of the discarded attributes."
  );
  B.push({
    t: "code",
    wide: true,
    text: `// utils/nodeGraph.js  (as committed at the checkpoint)
static load(info) {
   const points = info.points.map((i) => new GeoPoint(i.x, i.y));
   ...
}

// utils/geometry.js
class GeoPoint {
   constructor(x, y) { this.x = x; this.y = y; }   // no id
}

// utils/pathfinder.js  (as committed at the checkpoint)
buildAdjacency() {
    this.graph.points.forEach(p => this.adjacency.set(p.id, []));
    this.graph.segments.forEach(s => {
        this.adjacency.get(s.p1.id).push({ to: s.p2.id, ... });
        ...
    });
}`,
  });
  p(
    "Every `p.id` is `undefined`, so `adjacency` and `distances` each end up with exactly one entry " +
      "keyed `undefined`, the relaxation loop finds no edge whose tentative distance improves on " +
      "zero, and `getScoreAtLocation` interpolates between two zeros for every query in the world."
  );

  B.push({ t: "h2", text: "The repair" });
  B.push({
    t: "code",
    wide: true,
    text: `// utils/nodeGraph.js  (repaired)
static load(info) {
   const points = info.points.map((i) => {
      const p = new GeoPoint(i.x, i.y);
      if (i.id !== undefined) p.id = i.id;
      return p;
   });
   const segments = info.segments.map((i) => new LineSegment(
      points.find((p) => p.equals(i.p1)),
      points.find((p) => p.equals(i.p2)),
      i.oneWay
   ));
   return new NodeGraph(points, segments);
}

// utils/pathfinder.js  (repaired)
constructor(graph) {
    this.graph = graph;
    this.index = new Map(graph.points.map((p, i) => [p, i]));
    this.distances = new Map();   // keyed by node INDEX
    this.adjacency = new Map();
    this.buildAdjacency();
}`,
  });
  p(
    "The loader is repaired so that the map file's node identifiers and one-way tags survive " +
      `deserialisation — which also restored ${n0(stats.counts.oneWaySegments)} one-way tags that ` +
      "had previously been silently dropped, making the route field directed where the source data " +
      "says it should be. The scorer is repaired so that it no longer depends on the loader having " +
      "done so. Either change alone fixes the immediate symptom; both together remove the class of " +
      "fault."
  );

  B.push({ t: "h2", text: "Forward propagation" });
  B.push({
    t: "code",
    wide: true,
    text: `// simulation/brainModel.js
static processSignals(givenInputs, level) {
    for (let i = 0; i < level.inputs.length; i++)
        level.inputs[i] = givenInputs[i];

    for (let i = 0; i < level.outputs.length; i++) {
        let sum = 0;
        for (let j = 0; j < level.inputs.length; j++)
            sum += level.inputs[j] * level.weights[j][i];

        const sigmoid = 1 / (1 + Math.exp(-(sum + level.biases[i])));
        level.outputs[i] = sigmoid > 0.5 ? 1 : 0;
    }
    return level.outputs;
}`,
  });
  p(
    "The final line is the one discussed in [[sec:system]]: applying a logistic function and then " +
      "thresholding it at 0.5 is equivalent to thresholding the pre-activation at zero, so every " +
      "unit is a linear threshold unit and the network's expressive power is that of a stack of " +
      "perceptrons, not of a smooth multilayer network."
  );

  /* ================================================================
   * REFERENCES
   * ================================================================ */
  const references = [
    {
      key: "holland",
      text:
        "J. H. Holland, Adaptation in Natural and Artificial Systems. Ann Arbor, MI: University of Michigan Press, 1975.",
      tex:
        "J.~H. Holland, \\emph{Adaptation in Natural and Artificial Systems}. Ann Arbor, MI: University of Michigan Press, 1975.",
    },
    {
      key: "neat",
      text:
        "K. O. Stanley and R. Miikkulainen, \"Evolving neural networks through augmenting topologies,\" Evolutionary Computation, vol. 10, no. 2, pp. 99-127, 2002.",
      tex:
        "K.~O. Stanley and R.~Miikkulainen, ``Evolving neural networks through augmenting topologies,'' \\emph{Evolutionary Computation}, vol.~10, no.~2, pp. 99--127, 2002.",
    },
    {
      key: "novelty",
      text:
        "J. Lehman and K. O. Stanley, \"Abandoning objectives: evolution through the search for novelty alone,\" Evolutionary Computation, vol. 19, no. 2, pp. 189-223, 2011.",
      tex:
        "J.~Lehman and K.~O. Stanley, ``Abandoning objectives: evolution through the search for novelty alone,'' \\emph{Evolutionary Computation}, vol.~19, no.~2, pp. 189--223, 2011.",
    },
    {
      key: "es",
      text:
        "T. Salimans, J. Ho, X. Chen, S. Sidor, and I. Sutskever, \"Evolution strategies as a scalable alternative to reinforcement learning,\" arXiv:1703.03864, 2017.",
      tex:
        "T.~Salimans, J.~Ho, X.~Chen, S.~Sidor, and I.~Sutskever, ``Evolution strategies as a scalable alternative to reinforcement learning,'' arXiv:1703.03864, 2017.",
    },
    {
      key: "koutnik",
      text:
        "J. Koutnik, G. Cuccu, J. Schmidhuber, and F. Gomez, \"Evolving large-scale neural networks for vision-based reinforcement learning,\" in Proc. GECCO, 2013, pp. 1061-1068.",
      tex:
        "J.~Koutn\\'ik, G.~Cuccu, J.~Schmidhuber, and F.~Gomez, ``Evolving large-scale neural networks for vision-based reinforcement learning,'' in \\emph{Proc. GECCO}, 2013, pp. 1061--1068.",
    },
    {
      key: "carla",
      text:
        "A. Dosovitskiy, G. Ros, F. Codevilla, A. Lopez, and V. Koltun, \"CARLA: An open urban driving simulator,\" in Proc. 1st Conf. on Robot Learning (CoRL), PMLR vol. 78, 2017, pp. 1-16.",
      tex:
        "A.~Dosovitskiy, G.~Ros, F.~Codevilla, A.~L\\'opez, and V.~Koltun, ``CARLA: An open urban driving simulator,'' in \\emph{Proc. 1st Conf. on Robot Learning (CoRL)}, PMLR vol.~78, 2017, pp. 1--16.",
    },
    {
      key: "coulter",
      text:
        "R. C. Coulter, \"Implementation of the pure pursuit path tracking algorithm,\" Robotics Institute, Carnegie Mellon University, Tech. Rep. CMU-RI-TR-92-01, 1992.",
      tex:
        "R.~C. Coulter, ``Implementation of the pure pursuit path tracking algorithm,'' Robotics Institute, Carnegie Mellon University, Tech. Rep. CMU-RI-TR-92-01, 1992.",
    },
    {
      key: "dijkstra",
      text:
        "E. W. Dijkstra, \"A note on two problems in connexion with graphs,\" Numerische Mathematik, vol. 1, pp. 269-271, 1959.",
      tex:
        "E.~W. Dijkstra, ``A note on two problems in connexion with graphs,'' \\emph{Numerische Mathematik}, vol.~1, pp. 269--271, 1959.",
    },
    {
      key: "sculley",
      text:
        "D. Sculley et al., \"Hidden technical debt in machine learning systems,\" in Advances in Neural Information Processing Systems 28, 2015, pp. 2503-2511.",
      tex:
        "D.~Sculley \\emph{et al.}, ``Hidden technical debt in machine learning systems,'' in \\emph{Advances in Neural Information Processing Systems 28}, 2015, pp. 2503--2511.",
    },
    {
      key: "amodei",
      text:
        "D. Amodei, C. Olah, J. Steinhardt, P. Christiano, J. Schulman, and D. Mane, \"Concrete problems in AI safety,\" arXiv:1606.06565, 2016.",
      tex:
        "D.~Amodei, C.~Olah, J.~Steinhardt, P.~Christiano, J.~Schulman, and D.~Man\\'e, ``Concrete problems in AI safety,'' arXiv:1606.06565, 2016.",
    },
    {
      key: "tobin",
      text:
        "J. Tobin, R. Fong, A. Ray, J. Schneider, W. Zaremba, and P. Abbeel, \"Domain randomization for transferring deep neural networks from simulation to the real world,\" in Proc. IEEE/RSJ IROS, 2017, pp. 23-30.",
      tex:
        "J.~Tobin, R.~Fong, A.~Ray, J.~Schneider, W.~Zaremba, and P.~Abbeel, ``Domain randomization for transferring deep neural networks from simulation to the real world,'' in \\emph{Proc. IEEE/RSJ IROS}, 2017, pp. 23--30.",
    },
    {
      key: "bojarski",
      text: "M. Bojarski et al., \"End to end learning for self-driving cars,\" arXiv:1604.07316, 2016.",
      tex: "M.~Bojarski \\emph{et al.}, ``End to end learning for self-driving cars,'' arXiv:1604.07316, 2016.",
    },
    {
      key: "mannwhitney",
      text:
        "H. B. Mann and D. R. Whitney, \"On a test of whether one of two random variables is stochastically larger than the other,\" Annals of Mathematical Statistics, vol. 18, no. 1, pp. 50-60, 1947.",
      tex:
        "H.~B. Mann and D.~R. Whitney, ``On a test of whether one of two random variables is stochastically larger than the other,'' \\emph{Annals of Mathematical Statistics}, vol.~18, no.~1, pp. 50--60, 1947.",
    },
    {
      key: "cliff",
      text:
        "N. Cliff, \"Dominance statistics: ordinal analyses to answer ordinal questions,\" Psychological Bulletin, vol. 114, no. 3, pp. 494-509, 1993.",
      tex:
        "N.~Cliff, ``Dominance statistics: ordinal analyses to answer ordinal questions,'' \\emph{Psychological Bulletin}, vol.~114, no.~3, pp. 494--509, 1993.",
    },
    {
      key: "efron",
      text: "B. Efron and R. J. Tibshirani, An Introduction to the Bootstrap. New York: Chapman & Hall, 1993.",
      tex: "B.~Efron and R.~J. Tibshirani, \\emph{An Introduction to the Bootstrap}. New York: Chapman \\& Hall, 1993.",
    },
    {
      key: "osm",
      text:
        "OpenStreetMap contributors, \"Planet dump retrieved from planet.openstreetmap.org.\" [Online]. Available: https://www.openstreetmap.org",
      tex:
        "OpenStreetMap contributors, ``Planet dump retrieved from planet.openstreetmap.org.'' [Online]. Available: \\url{https://www.openstreetmap.org}",
    },
  ];

  return {
    title:
      "End-to-End Implementation of a Neuro-Evolutionary Autonomous Navigational System: A Capstone Project in Applied AI",
    author: "Deeghayu Suwahas Adhikari, 258722D, MDS&AI, UoM",
    affiliation:
      "Master of Data Science and Artificial Intelligence, Department of Computer Science and Engineering, Faculty of Engineering, University of Moratuwa",
    email: "Milestone 3 — Final Report",
    runningHead: "Capstone Project Final Report: IN25-S3-CS5998, August 2026",
    runningRight: `Commit ${git.commit}`,
    keywords:
      "Neuroevolution, genetic algorithms, autonomous vehicles, objective specification, silent failure, simulation, reproducibility, comparative evaluation",
    abstract:
      "This report presents the design, implementation and quantitative evaluation of an autonomous " +
      "driving controller optimised by neuroevolution and built entirely from first principles: a " +
      "hand-written multilayer perceptron, a hand-written genetic algorithm, a custom kinematic " +
      "simulator and a synthetic range sensor, with no machine-learning framework. The environment " +
      `is a real road topology imported from OpenStreetMap comprising ${n0(stats.counts.graphNodes)} ` +
      `nodes and ${n0(stats.counts.roadBorderSegments)} collision boundaries. A headless, seeded ` +
      "evaluation harness that reuses the unmodified simulation sources reveals that the objective " +
      "function committed at the technical checkpoint was degenerate: the route-progress score " +
      `returned zero at every location, yielding ${e1row(0).distinctFitnessValues} distinct fitness ` +
      `value across a population of ${e1row(0).populationSize} and no improvement over ` +
      `${manifest.config.generations} generations, while the running system continued to present ` +
      "every appearance of learning. After repairing the underlying loader-consumer contract " +
      "mismatch, selection pressure is restored and measurable learning follows. The evolved " +
      "controller is then compared against three tuned hand-written baselines and a map-privileged " +
      `pure-pursuit reference on ${testPoseCount} held-out start poses using paired non-parametric ` +
      "tests and bootstrap confidence intervals. Replacing the shipped clone-and-mutate operator " +
      `with tournament selection and uniform crossover reduces seed-to-seed variance by ` +
      `${n1(varianceRatio)} times and improves held-out route progress by a factor of ` +
      `${n1(F[ARM.D].peakRouteProgress.mean / Math.max(1, F[ARM.C].peakRouteProgress.mean))}. An ` +
      "ablation over depth, mutation rate and sensing shows that additional network depth measurably " +
      "degrades performance, contradicting the direction proposed at the checkpoint. The tuned " +
      "reactive heuristic nonetheless outperforms the best evolved controller on held-out poses by a " +
      `factor of ${n1(F[ARM.FSM].peakRouteProgress.mean / Math.max(1, F[ARM.D].peakRouteProgress.mean))}, ` +
      "and the map-privileged reference still collides in " +
      `${pct(F[ARM.PP].collided.mean)} of episodes — establishing both that a hand-written rule is ` +
      "the better engineering choice at this scale, and that a substantial share of the residual " +
      "failure rate belongs to the vehicle model rather than to any policy.",
    blocks: B,
    references,
  };
}

module.exports = { buildContent };
