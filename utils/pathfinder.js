/**
 * Intelligent Route Discovery System
 * Uses Dijkstra's Algorithm to map distances along the road network.
 */
class RouteDiscovery {
    constructor(graph) {
        this.graph = graph;
        // Keyed by node INDEX, not by GeoPoint.id.  Map files carry an OSM id
        // per node, but the graph loader rebuilds points through
        // `new GeoPoint(x, y)`, so `p.id` may be undefined; keying on it
        // collapses every node onto a single map entry and yields a constant
        // fitness of 0 everywhere.  The index is always well defined.
        this.index = new Map(graph.points.map((p, i) => [p, i]));
        this.distances = new Map(); // nodeIndex -> distance from start
        this.adjacency = new Map();
        this.buildAdjacency();
    }

    buildAdjacency() {
        this.graph.points.forEach((p, i) => this.adjacency.set(i, []));
        this.graph.segments.forEach(s => {
            const a = this.index.get(s.p1);
            const b = this.index.get(s.p2);
            if (a === undefined || b === undefined) return;
            const weight = calcDist(s.p1, s.p2);
            this.adjacency.get(a).push({ to: b, weight });
            if (!s.oneWay || s.oneWay === "no") {
                this.adjacency.get(b).push({ to: a, weight });
            }
        });
    }

    calculateDistances(startPoint) {
        const startNode = this.findNearestNode(startPoint);
        if (!startNode) return;

        const pq = new PriorityQueue();
        this.graph.points.forEach((p, i) => this.distances.set(i, Infinity));

        const startIndex = this.index.get(startNode);
        this.distances.set(startIndex, 0);
        pq.push(startIndex, 0);

        while (!pq.isEmpty()) {
            const { item: uId, priority: d } = pq.pop();

            if (d > this.distances.get(uId)) continue;

            const neighbors = this.adjacency.get(uId) || [];
            for (const edge of neighbors) {
                const vId = edge.to;
                const weight = edge.weight;
                const newDist = d + weight;

                if (newDist < this.distances.get(vId)) {
                    this.distances.set(vId, newDist);
                    pq.push(vId, newDist);
                }
            }
        }
        
        console.log(`ROUTE DISCOVERY: Calculated distances for ${this.distances.size} nodes.`);
        const finiteDistances = Array.from(this.distances.values()).filter(d => d !== Infinity);
        console.log(`ROUTE DISCOVERY: Found path to ${finiteDistances.length} reachable nodes.`);
    }

    findNearestNode(point) {
        let minDist = Infinity;
        let nearest = null;
        this.graph.points.forEach(p => {
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

        this.graph.segments.forEach(s => {
            const projection = getProjection(point, s.p1, s.p2);
            const d = calcDist(point, projection.point);
            
            if (d < minSegDist) {
                minSegDist = d;
                
                const d1 = this.distances.get(this.index.get(s.p1));
                const d2 = this.distances.get(this.index.get(s.p2));
                
                if (d1 !== Infinity && d2 !== Infinity) {
                    // Linear interpolation between the two node distances based on projection
                    bestScore = d1 + (d2 - d1) * projection.offset;
                }
            }
        });

        // Ensure we never return NaN or Infinity
        if (isNaN(bestScore) || !isFinite(bestScore)) return 0;
        
        return bestScore;
    }
}

function getProjection(p, a, b) {
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: p.x - a.x, y: p.y - a.y };
    const lenSq = v1.x * v1.x + v1.y * v1.y;
    let t = (v2.x * v1.x + v2.y * v1.y) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return {
        point: { x: a.x + t * v1.x, y: a.y + t * v1.y },
        offset: t
    };
}

/**
 * Helper Priority Queue for Dijkstra
 */
class PriorityQueue {
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

function distToSegment(p, v, w) {
    const l2 = calcDistSq(v, w);
    if (l2 == 0) return calcDist(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return calcDist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

function calcDistSq(p1, p2) {
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}
