/**
 * legacyRouteDiscovery.js — Pinned copy of the as-committed route scorer.
 *
 * The baseline arm of the study must keep referring to the implementation that
 * shipped at commit 43084e8 ("Strict navScore use; eliminate reversing"), even
 * after the defect it contains has been repaired in utils/pathfinder.js.
 * Reproducing it here — verbatim apart from the removal of two console.log
 * calls and the injection of `calcDist`/`getProjection` — keeps the comparison
 * stable and lets anyone re-run the study against the current working tree.
 *
 * The defect: adjacency and distance maps are keyed on `GeoPoint.id`, but
 * NodeGraph.load reconstructs points with `new GeoPoint(x, y)`, which carries
 * no id.  Every key collapses to `undefined`, the relaxation loop never fires,
 * and getScoreAtLocation returns 0 for every pose in the world.
 */

/** Sort-on-insert priority queue, exactly as shipped. */
class LegacyPriorityQueue {
  constructor() {
    this.values = [];
  }
  push(item, priority) {
    this.values.push({ item, priority });
    this.values.sort((a, b) => a.priority - b.priority);
  }
  pop() {
    return this.values.shift();
  }
  isEmpty() {
    return this.values.length === 0;
  }
}

function makeLegacyRouteDiscovery(sim) {
  const calcDist = sim.calcDist;
  const getProjection = sim.getProjection;

  return class LegacyRouteDiscovery {
    constructor(graph) {
      this.graph = graph;
      this.distances = new Map(); // nodeId -> distance from start
      this.adjacency = new Map();
      this.buildAdjacency();
    }

    buildAdjacency() {
      this.graph.points.forEach((p) => this.adjacency.set(p.id, []));
      this.graph.segments.forEach((s) => {
        this.adjacency.get(s.p1.id).push({ to: s.p2.id, weight: calcDist(s.p1, s.p2) });
        if (!s.oneWay || s.oneWay === "no") {
          this.adjacency.get(s.p2.id).push({ to: s.p1.id, weight: calcDist(s.p1, s.p2) });
        }
      });
    }

    calculateDistances(startPoint) {
      const startNode = this.findNearestNode(startPoint);
      if (!startNode) return this;

      const pq = new LegacyPriorityQueue();
      this.graph.points.forEach((p) => this.distances.set(p.id, Infinity));

      this.distances.set(startNode.id, 0);
      pq.push(startNode.id, 0);

      while (!pq.isEmpty()) {
        const popped = pq.pop();
        const uId = popped.item;
        const d = popped.priority;
        if (d > this.distances.get(uId)) continue;

        const neighbors = this.adjacency.get(uId) || [];
        for (const edge of neighbors) {
          const vId = edge.to;
          const newDist = d + edge.weight;
          if (newDist < this.distances.get(vId)) {
            this.distances.set(vId, newDist);
            pq.push(vId, newDist);
          }
        }
      }
      return this;
    }

    findNearestNode(point) {
      let minDist = Infinity;
      let nearest = null;
      this.graph.points.forEach((p) => {
        const d = calcDist(point, p);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      });
      return nearest;
    }

    getScoreAtLocation(point) {
      let bestScore = 0;
      let minSegDist = Infinity;

      this.graph.segments.forEach((s) => {
        const projection = getProjection(point, s.p1, s.p2);
        const d = calcDist(point, projection.point);

        if (d < minSegDist) {
          minSegDist = d;
          const d1 = this.distances.get(s.p1.id);
          const d2 = this.distances.get(s.p2.id);
          if (d1 !== Infinity && d2 !== Infinity) {
            bestScore = d1 + (d2 - d1) * projection.offset;
          }
        }
      });

      if (isNaN(bestScore) || !isFinite(bestScore)) return 0;
      return bestScore;
    }

    /** Interface parity with the corrected scorer. */
    scoreAt(point) {
      return { score: this.getScoreAtLocation(point), lateral: 0 };
    }
  };
}

/**
 * Reproduce the graph exactly as the as-committed NodeGraph.load produced it.
 *
 * At 43084e8 the loader rebuilt every node with `new GeoPoint(i.x, i.y)`, which
 * carries no `id`.  Since utils/nodeGraph.js now preserves the OSM id, the
 * baseline arm would otherwise be silently repaired by that fix.  Stripping the
 * ids here keeps the two halves of the defect — loader and consumer — pinned
 * together, which is what the as-committed system actually did.
 */
function makeLegacyGraph(sim, graph) {
  const points = graph.points.map((p) => new sim.GeoPoint(p.x, p.y));
  const lookup = new Map(graph.points.map((p, i) => [p, points[i]]));
  const segments = graph.segments.map(
    (s) => new sim.LineSegment(lookup.get(s.p1), lookup.get(s.p2))
  );
  return { points, segments };
}

module.exports = { makeLegacyRouteDiscovery, makeLegacyGraph };
