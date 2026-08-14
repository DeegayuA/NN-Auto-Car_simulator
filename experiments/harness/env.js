/**
 * env.js — Evaluation environment: spatial index, route scorers, controllers.
 *
 * All vehicle physics, LiDAR ray-casting and MLP inference come from the
 * unmodified project sources (see loadSim.js).  This module only supplies the
 * culling index that makes batch evaluation tractable, the corrected route
 * scorer, and the baseline controllers the learned agent is compared against.
 */

/* ------------------------------------------------------------------ *
 * Uniform spatial grid over the road-border segments.
 *
 * appEngine.js culls borders with an O(N) scan every frame at an 800 px
 * radius.  For batch evaluation (10^2 agents x 10^3 frames x 10^2 generations)
 * that scan dominates runtime, so the harness pre-buckets the segments once
 * and answers per-vehicle queries in O(cells).  A query radius strictly larger
 * than beamLength + vehicle diagonal is behaviourally identical to passing the
 * full border list: no discarded segment can be hit by a ray or by the body.
 * ------------------------------------------------------------------ */
class SpatialGrid {
  constructor(segments, cellSize = 256) {
    this.cellSize = cellSize;
    this.cells = new Map();
    // Stamp-based de-duplication: a segment carries the id of the query that
    // last emitted it, which avoids allocating a Set on every frame.
    this.stamp = 0;
    this.stampKey = `__sg${SpatialGrid.instances++}`;
    for (const seg of segments) this.#insert(seg);
  }

  #key(cx, cy) {
    return cx * 100000 + cy;
  }

  #insert(seg) {
    const minX = Math.min(seg.p1.x, seg.p2.x);
    const maxX = Math.max(seg.p1.x, seg.p2.x);
    const minY = Math.min(seg.p1.y, seg.p2.y);
    const maxY = Math.max(seg.p1.y, seg.p2.y);
    const c0x = Math.floor(minX / this.cellSize);
    const c1x = Math.floor(maxX / this.cellSize);
    const c0y = Math.floor(minY / this.cellSize);
    const c1y = Math.floor(maxY / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const k = this.#key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) this.cells.set(k, (bucket = []));
        bucket.push(seg);
      }
    }
  }

  /** All segments whose bounding box touches the query disc. */
  query(point, radius) {
    const c0x = Math.floor((point.x - radius) / this.cellSize);
    const c1x = Math.floor((point.x + radius) / this.cellSize);
    const c0y = Math.floor((point.y - radius) / this.cellSize);
    const c1y = Math.floor((point.y + radius) / this.cellSize);
    const s = ++this.stamp;
    const key = this.stampKey;
    const out = [];
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const bucket = this.cells.get(this.#key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const seg = bucket[i];
          if (seg[key] === s) continue;
          seg[key] = s;
          out.push(seg);
        }
      }
    }
    return out;
  }
}
SpatialGrid.instances = 0;

/* ------------------------------------------------------------------ *
 * Route scorer — corrected node identity.
 *
 * The shipped RouteDiscovery keys its adjacency and distance maps on
 * `GeoPoint.id`, but NodeGraph.load reconstructs points via `new GeoPoint(x,y)`
 * which carries no id.  Every key therefore collapses to `undefined`.  This
 * variant keys on the point's array index, which is always well defined, and
 * is otherwise algorithmically identical (Dijkstra, with a binary heap in place
 * of the original sort-on-insert list).
 * ------------------------------------------------------------------ */
class RouteScorer {
  constructor(sim, graph) {
    this.sim = sim;
    this.graph = graph;
    this.index = new Map(graph.points.map((p, i) => [p, i]));
    this.adjacency = graph.points.map(() => []);
    for (const s of graph.segments) {
      const a = this.index.get(s.p1);
      const b = this.index.get(s.p2);
      if (a === undefined || b === undefined) continue;
      const w = sim.calcDist(s.p1, s.p2);
      this.adjacency[a].push({ to: b, weight: w });
      if (!s.oneWay || s.oneWay === "no") this.adjacency[b].push({ to: a, weight: w });
    }
    this.distances = new Float64Array(graph.points.length).fill(Infinity);
    this.segGrid = null;
  }

  calculateDistances(startPoint) {
    const start = this.#nearestNode(startPoint);
    const dist = this.distances;
    dist.fill(Infinity);
    dist[start] = 0;

    const heap = [{ n: start, d: 0 }];
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].d < heap[m].d) m = l;
          if (r < heap.length && heap[r].d < heap[m].d) m = r;
          if (m === i) break;
          const t = heap[i];
          heap[i] = heap[m];
          heap[m] = t;
          i = m;
        }
      }
      return top;
    };
    const push = (n, d) => {
      heap.push({ n, d });
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].d <= heap[i].d) break;
        const t = heap[i];
        heap[i] = heap[p];
        heap[p] = t;
        i = p;
      }
    };

    while (heap.length) {
      const { n: u, d } = pop();
      if (d > dist[u]) continue;
      for (const e of this.adjacency[u]) {
        const nd = d + e.weight;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          push(e.to, nd);
        }
      }
    }

    // Index the centreline segments so scoreAt is not O(|E|) per frame.
    this.segGrid = new SpatialGrid(this.graph.segments, 512);
    return this;
  }

  #nearestNode(point) {
    let best = 0;
    let bestD = Infinity;
    this.graph.points.forEach((p, i) => {
      const d = this.sim.calcDist(point, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /**
   * Route progress at an arbitrary pose: project onto the nearest centreline
   * segment and interpolate the two endpoint distances.  Also returns the
   * lateral offset, used by the metrics layer as lane deviation.
   */
  scoreAt(point) {
    // 320 px comfortably exceeds the widest gap between a drivable pose and
    // the nearest centreline (road half-width is 50 px), so the narrowed query
    // does not change the result; it only avoids scanning all 472 segments.
    let pool = this.segGrid ? this.segGrid.query(point, 320) : this.graph.segments;
    if (!pool.length) pool = this.graph.segments;
    let bestScore = 0;
    let bestLateral = Infinity;
    for (const s of pool) {
      const proj = this.sim.getProjection(point, s.p1, s.p2);
      const d = this.sim.calcDist(point, proj.point);
      if (d < bestLateral) {
        bestLateral = d;
        const d1 = this.distances[this.index.get(s.p1)];
        const d2 = this.distances[this.index.get(s.p2)];
        if (Number.isFinite(d1) && Number.isFinite(d2)) {
          bestScore = d1 + (d2 - d1) * proj.offset;
        }
      }
    }
    if (!Number.isFinite(bestScore)) bestScore = 0;
    return { score: bestScore, lateral: bestLateral };
  }

  getScoreAtLocation(point) {
    return this.scoreAt(point).score;
  }
}

/* ------------------------------------------------------------------ *
 * Controllers.  Every controller consumes the same normalised LiDAR vector
 * (1 - offset, so 1 = obstacle at the sensor, 0 = clear) and writes the same
 * four boolean actuator flags the physics engine reads.
 * ------------------------------------------------------------------ */

/** Shared actuator write, with the conflict resolution appEngine.js applies. */
function applyOutputs(vehicle, fwd, left, right, rev) {
  if (left && right) {
    left = 0;
    right = 0;
  }
  if (fwd && rev) rev = 0;
  vehicle.steering.forward = !!fwd;
  vehicle.steering.left = !!left;
  vehicle.steering.right = !!right;
  vehicle.steering.reverse = !!rev;
}

function readSensors(vehicle) {
  return vehicle.lidar.returns.map((r) => (r == null ? 0 : 1 - r.offset));
}

/** MLP policy — identical inference path to the browser build. */
function makeNNController(sim, vehicle) {
  return () => {
    const o = sim.BrainArchitecture.processSignals(readSensors(vehicle), vehicle.brain);
    applyOutputs(vehicle, o[0], o[1], o[2], o[3]);
  };
}

/**
 * Rule-based reactive baseline — the finite-state heuristic promised in the
 * Milestone 1 project definition.  Drive forward; if the centre ray is blocked
 * or the sides are asymmetric, turn towards the freer side; lift the throttle
 * when an obstacle is very close.
 */
function makeReactiveController(vehicle, opts = {}) {
  const { blockThreshold = 0.55, brakeThreshold = 0.82, asymmetry = 0.25 } = opts;
  return () => {
    const s = readSensors(vehicle);
    const n = s.length;
    const centre = s[Math.floor((n - 1) / 2)];
    const leftSide = s.slice(0, Math.floor(n / 2)).reduce((a, b) => a + b, 0);
    const rightSide = s.slice(Math.ceil(n / 2)).reduce((a, b) => a + b, 0);

    let fwd = 1;
    let left = 0;
    let right = 0;
    if (centre > brakeThreshold) fwd = 0;
    if (centre > blockThreshold || Math.abs(leftSide - rightSide) > asymmetry) {
      if (leftSide > rightSide) right = 1;
      else left = 1;
    }
    applyOutputs(vehicle, fwd, left, right, 0);
  };
}

/**
 * Proportional steering controller on LiDAR asymmetry — the geometric
 * "PID-style" baseline.  The actuator interface is binary, so the continuous
 * command u is discretised through a dead-band; that quantisation is reported
 * as a limitation rather than hidden.
 */
function makePController(vehicle, opts = {}) {
  const { kp = 2.2, deadband = 0.08, brakeThreshold = 0.85 } = opts;
  return () => {
    const s = readSensors(vehicle);
    const n = s.length;
    let err = 0;
    for (let i = 0; i < n; i++) {
      const w = (i - (n - 1) / 2) / ((n - 1) / 2); // -1 (left) .. +1 (right)
      err -= w * s[i];
    }
    const u = (kp * err) / n;
    const centre = s[Math.floor((n - 1) / 2)];
    applyOutputs(
      vehicle,
      centre > brakeThreshold ? 0 : 1,
      u > deadband ? 1 : 0,
      u < -deadband ? 1 : 0,
      0
    );
  };
}

/**
 * Pure-pursuit reference controller.  Uses privileged access to the road
 * centreline graph, which the learned agents never observe, and therefore acts
 * as a performance ceiling rather than a competing method.
 */
function makePursuitController(vehicle, scorer, lookahead = 220) {
  return () => {
    const here = scorer.scoreAt(vehicle.center);
    const target = here.score + lookahead;
    const pool = scorer.segGrid.query(vehicle.center, 900);

    // Heading unit vector under the engine's convention (angle 0 = -y).
    const hx = -Math.sin(vehicle.angle);
    const hy = -Math.cos(vehicle.angle);

    // The Dijkstra field is radial, not a directed route: points at
    // `target` distance exist on every branch, including behind the car.
    // Restricting candidates to the forward half-plane disambiguates them.
    let best = null;
    let bestErr = Infinity;
    for (const s of pool) {
      const d1 = scorer.distances[scorer.index.get(s.p1)];
      const d2 = scorer.distances[scorer.index.get(s.p2)];
      if (!Number.isFinite(d1) || !Number.isFinite(d2)) continue;
      for (let t = 0; t <= 1.0001; t += 0.2) {
        const px = s.p1.x + (s.p2.x - s.p1.x) * t;
        const py = s.p1.y + (s.p2.y - s.p1.y) * t;
        const vx = px - vehicle.center.x;
        const vy = py - vehicle.center.y;
        if (vx * hx + vy * hy <= 0) continue; // behind the vehicle
        const d = d1 + (d2 - d1) * t;
        const err = Math.abs(d - target);
        if (err < bestErr) {
          bestErr = err;
          best = { x: px, y: py };
        }
      }
    }
    if (!best) {
      applyOutputs(vehicle, 1, 0, 0, 0);
      return;
    }
    // Heading convention of the physics engine: angle 0 points along -y.
    const desired = Math.atan2(-(best.x - vehicle.center.x), -(best.y - vehicle.center.y));
    let e = desired - vehicle.angle;
    while (e > Math.PI) e -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    applyOutputs(vehicle, 1, e > 0.03 ? 1 : 0, e < -0.03 ? 1 : 0, 0);
  };
}

module.exports = {
  SpatialGrid,
  RouteScorer,
  makeNNController,
  makeReactiveController,
  makePController,
  makePursuitController,
  applyOutputs,
  readSensors,
};
