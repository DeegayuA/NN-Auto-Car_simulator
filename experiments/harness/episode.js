/**
 * episode.js — Single-agent episode driver and per-episode metrics.
 *
 * The loop reproduces the browser frame order exactly:
 *   vehicle.update(borders, traffic)   // physics -> fitness -> termination
 *                                      // -> collision -> LiDAR scan
 *   controller()                       // actuator flags for the next frame
 *
 * In the browser the second step happens inside update() for AI cars; here it
 * is hoisted out so that rule-based and learned controllers share one code
 * path and therefore identical timing, sensing and termination semantics.
 */

const DEFAULTS = {
  width: 30,
  height: 50,
  maxSpeed: 6,
  maxFrames: 3000, // 50 s at 60 fps
  cullRadius: 400, // > beamLength (220) + vehicle diagonal (~58)
  offRouteThreshold: 50, // road half-width
};

function makeVehicle(sim, startMark, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const angle = -sim.getAngle(startMark.directionVector) + Math.PI / 2;
  // controlType "KEYS" builds the LiDAR array and brain but leaves actuation
  // to the harness controller (hasAI stays false).
  const v = new sim.AutonomousVehicle(
    startMark.center.x,
    startMark.center.y,
    o.width,
    o.height,
    "KEYS",
    angle,
    o.maxSpeed
  );
  // Sensor-geometry ablations. The constructor has already sized a brain for
  // the default 5 beams, so any caller that changes beamCount must rebuild the
  // network — evolve() and the ablation runner both do.
  if (opts.beamCount) v.lidar.beamCount = opts.beamCount;
  if (opts.beamLength) v.lidar.beamLength = opts.beamLength;
  if (opts.beamCount && opts.beamCount !== 5) {
    v.brain = new sim.BrainArchitecture([opts.beamCount, 12, 10, 4]);
  }
  return v;
}

/**
 * Run one episode.
 *
 * @param {object}   sim         bridged simulation globals
 * @param {object}   world       { map, grid, evalScorer }
 * @param {object}   vehicle     pre-built AutonomousVehicle
 * @param {Function} controller  called once per frame after sensing
 * @param {object}   opts        overrides for DEFAULTS
 * @returns {object} metrics
 */
function runEpisode(sim, world, vehicle, controller, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { map, grid, evalScorer } = world;

  let frames = 0;
  let pathLength = 0;
  let prevSpeed = 0;
  let prevAccel = 0;
  let jerkSq = 0;
  let jerkN = 0;
  let speedSum = 0;
  let speedSqSum = 0;
  let lateralSum = 0;
  let offRoute = 0;
  let reversals = 0;
  let prevSteer = 0;
  let peakEvalScore = 0;
  const trace = opts.trace ? [] : null;

  const startX = vehicle.center.x;
  const startY = vehicle.center.y;

  while (!vehicle.damaged && frames < o.maxFrames) {
    const local = grid.query(vehicle.center, o.cullRadius);
    vehicle.update(local, map.trafficForCollision || []);
    frames++;

    // --- kinematic smoothness -------------------------------------------
    const speed = vehicle.speed;
    const accel = speed - prevSpeed;
    if (frames > 2) {
      const jerk = accel - prevAccel;
      jerkSq += jerk * jerk;
      jerkN++;
    }
    prevAccel = accel;
    prevSpeed = speed;

    pathLength += Math.abs(speed);
    speedSum += speed;
    speedSqSum += speed * speed;

    // --- tracking quality (measured with the corrected scorer for every arm,
    //     so the metric stays independent of the training signal) ----------
    const ev = evalScorer.scoreAt(vehicle.center);
    if (ev.score > peakEvalScore) peakEvalScore = ev.score;
    lateralSum += ev.lateral;
    if (ev.lateral > o.offRouteThreshold) offRoute++;

    if (trace && frames % 5 === 0) {
      trace.push([Math.round(vehicle.center.x), Math.round(vehicle.center.y)]);
    }

    // --- actuator command for the next frame -----------------------------
    let steer = 0;
    if (vehicle.steering.left) steer = -1;
    else if (vehicle.steering.right) steer = 1;
    if (steer !== 0 && prevSteer !== 0 && steer !== prevSteer) reversals++;
    if (steer !== 0) prevSteer = steer;

    if (!vehicle.damaged) controller();
  }

  let cause = "timeout";
  if (vehicle.damaged) cause = vehicle.isStagnant ? "stagnation" : "collision";

  const meanSpeed = frames ? speedSum / frames : 0;
  const varSpeed = frames ? Math.max(0, speedSqSum / frames - meanSpeed * meanSpeed) : 0;

  return {
    frames,
    cause,
    collided: cause === "collision" ? 1 : 0,
    routeProgress: evalScorer.scoreAt(vehicle.center).score,
    peakRouteProgress: peakEvalScore,
    pathLength,
    netDisplacement: Math.hypot(vehicle.center.x - startX, vehicle.center.y - startY),
    meanSpeed,
    sdSpeed: Math.sqrt(varSpeed),
    rmsJerk: jerkN ? Math.sqrt(jerkSq / jerkN) : 0,
    steeringReversalsPer1k: frames ? (reversals * 1000) / frames : 0,
    meanLateral: frames ? lateralSum / frames : 0,
    offRouteShare: frames ? offRoute / frames : 0,
    trainingFitness: vehicle.survivalScore,
    trace,
  };
}

module.exports = { runEpisode, makeVehicle, DEFAULTS };
