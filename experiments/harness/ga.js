/**
 * ga.js — Neuroevolution loop.
 *
 * Two reproduction operators are provided:
 *
 *   "clone-elite"          the operator shipped in core/appEngine.js: the best
 *                          genome is copied to the whole next population, index
 *                          0 is left untouched (elitism), every 5th individual
 *                          is mutated at rate 0.50 and the rest at 0.15.
 *
 *   "tournament-crossover" the proposed improvement: k-elitism, tournament
 *                          selection, uniform crossover between two parents,
 *                          then the project's own mutation kernel.
 *
 * The mutation operator itself is always BrainArchitecture.mutateBrain from
 * simulation/brainModel.js, so the comparison isolates selection and
 * recombination rather than confounding them with a new mutation kernel.
 */
const { runEpisode, makeVehicle } = require("./episode");

const cloneGenome = (g) => JSON.parse(JSON.stringify(g));

const OPERATORS = ["clone-elite", "tournament-crossover"];

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function tournamentPick(rand, scored, size) {
  let best = null;
  for (let i = 0; i < size; i++) {
    const c = scored[Math.floor(rand() * scored.length)];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best;
}

/** Uniform crossover over every weight and bias. */
function uniformCrossover(rand, a, b) {
  const child = cloneGenome(a);
  for (let l = 0; l < child.levels.length; l++) {
    const lv = child.levels[l];
    const bl = b.levels[l];
    for (let i = 0; i < lv.biases.length; i++) {
      if (rand() < 0.5) lv.biases[i] = bl.biases[i];
    }
    for (let i = 0; i < lv.weights.length; i++) {
      for (let j = 0; j < lv.weights[i].length; j++) {
        if (rand() < 0.5) lv.weights[i][j] = bl.weights[i][j];
      }
    }
  }
  return child;
}

/**
 * Run one evolutionary training run.
 *
 * @param {object}   sim    bridged simulation globals
 * @param {object}   world  { map, grid, evalScorer }
 * @param {object}   cfg    configuration (see runExperiments.js)
 * @param {Function} rand   seeded PRNG used for selection/crossover
 */
function evolve(sim, world, cfg, rand) {
  const {
    population = 100,
    generations = 40,
    operator = "clone-elite",
    eliteCount = 2,
    tournamentSize = 3,
    mutationRate = 0.15,
    boostEvery = 5,
    boostRate = 0.5,
    layers = [12, 10, 4],
    maxFrames = 1200,
    maxSpeed = 6,
    beamCount = 5,
    beamLength = 220,
    startMark,
  } = cfg;

  const vehicleOpts = { maxSpeed, beamCount, beamLength };

  // Seed population: fresh random genomes from the project's own initialiser.
  let genomes = [];
  for (let i = 0; i < population; i++) {
    const v = makeVehicle(sim, startMark, vehicleOpts);
    v.brain = new sim.BrainArchitecture([beamCount, ...layers]);
    genomes.push(cloneGenome(v.brain));
  }

  const history = [];
  let bestGenome = cloneGenome(genomes[0]);
  let bestFitness = -Infinity;
  let episodes = 0;

  for (let gen = 0; gen < generations; gen++) {
    const scored = [];
    for (let i = 0; i < population; i++) {
      const v = makeVehicle(sim, startMark, vehicleOpts);
      v.brain = cloneGenome(genomes[i]);
      const controller = () => {
        const s = v.lidar.returns.map((r) => (r == null ? 0 : 1 - r.offset));
        const o = sim.BrainArchitecture.processSignals(s, v.brain);
        let fwd = o[0];
        let left = o[1];
        let right = o[2];
        let rev = o[3];
        if (left && right) {
          left = 0;
          right = 0;
        }
        if (fwd && rev) rev = 0;
        v.steering.forward = !!fwd;
        v.steering.left = !!left;
        v.steering.right = !!right;
        v.steering.reverse = !!rev;
      };
      const m = runEpisode(sim, world, v, controller, { maxFrames, maxSpeed });
      episodes++;
      scored.push({ genome: genomes[i], fitness: m.trainingFitness, metrics: m });
    }

    scored.sort((a, b) => b.fitness - a.fitness);
    const fitnesses = scored.map((s) => s.fitness);
    const champion = scored[0];
    if (champion.fitness > bestFitness) {
      bestFitness = champion.fitness;
      bestGenome = cloneGenome(champion.genome);
    }

    const mu = mean(fitnesses);
    history.push({
      generation: gen + 1,
      bestFitness: champion.fitness,
      meanFitness: mu,
      medianFitness: fitnesses[Math.floor(fitnesses.length / 2)],
      sdFitness: Math.sqrt(mean(fitnesses.map((f) => (f - mu) ** 2))),
      // Number of distinct fitness values: a direct measure of how much
      // selection signal the objective actually provides.
      distinctFitness: new Set(fitnesses.map((f) => f.toFixed(3))).size,
      bestFrames: champion.metrics.frames,
      bestRouteProgress: champion.metrics.peakRouteProgress,
      meanFrames: mean(scored.map((s) => s.metrics.frames)),
      meanRouteProgress: mean(scored.map((s) => s.metrics.peakRouteProgress)),
      collisionShare:
        scored.filter((s) => s.metrics.cause === "collision").length / scored.length,
      stagnationShare:
        scored.filter((s) => s.metrics.cause === "stagnation").length / scored.length,
    });

    if (gen === generations - 1) break;

    // ---- reproduction ----------------------------------------------------
    const next = [];
    if (operator === "clone-elite") {
      // Faithful reproduction of core/appEngine.js resetGeneration().
      for (let i = 0; i < population; i++) {
        const child = cloneGenome(champion.genome);
        if (i !== 0) {
          const rate = boostEvery > 0 && i % boostEvery === 0 ? boostRate : mutationRate;
          sim.BrainArchitecture.mutateBrain(child, rate);
        }
        next.push(child);
      }
    } else {
      for (let i = 0; i < eliteCount && i < population; i++) {
        next.push(cloneGenome(scored[i].genome));
      }
      while (next.length < population) {
        const pa = tournamentPick(rand, scored, tournamentSize);
        const pb = tournamentPick(rand, scored, tournamentSize);
        const child = uniformCrossover(rand, pa.genome, pb.genome);
        sim.BrainArchitecture.mutateBrain(child, mutationRate);
        next.push(child);
      }
    }
    genomes = next;
  }

  return { history, bestGenome, bestFitness, episodes, beamCount, beamLength, layers };
}

module.exports = { evolve, cloneGenome, uniformCrossover, OPERATORS };
