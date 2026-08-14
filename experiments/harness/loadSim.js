/**
 * loadSim.js — Headless loader for the browser simulation sources.
 *
 * The browser build is a set of classic <script> files that share one global
 * scope.  This module recreates that scope inside a Node `vm` context, stubs
 * the handful of DOM APIs the physics/perception classes touch, and returns
 * the populated context.
 *
 * IMPORTANT (transparency): the physics engine, LiDAR ray-caster, MLP,
 * mutation operator and Dijkstra route scorer used by every experiment are the
 * *unmodified* project sources listed in SOURCES below.  Only rendering and the
 * requestAnimationFrame driver are replaced.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");

// Load order mirrors index.html (minus UI/rendering-only modules).
const SOURCES = [
  "utils/mathOps.js",
  "utils/geometry.js",
  "utils/nodeGraph.js",
  "utils/pathfinder.js",
  "simulation/simulationWorld.js",
  "simulation/roadMarkings.js",
  "simulation/worldEntities.js",
  "simulation/simulationData.js",
  "simulation/brainModel.js",
  "simulation/lidarArray.js",
  "simulation/steeringModule.js",
  "simulation/autonomousVehicle.js",
];

/** Minimal stand-ins for the DOM objects touched by constructors. */
function makeDomStubs() {
  const noop = () => {};
  const ctx2d = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "canvas") return { width: 0, height: 0 };
        return noop;
      },
    }
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx2d,
    addEventListener: noop,
  };
  return {
    document: {
      createElement: () => ({ ...canvas, getContext: () => ctx2d }),
      getElementById: () => null,
      body: { classList: { toggle: noop, contains: () => false } },
      addEventListener: noop,
    },
    Image: class {
      constructor() {
        this.width = 0;
        this.height = 0;
        this.src = "";
      }
      set onload(fn) {
        /* never fires headlessly; sprite masking is render-only */
      }
    },
    localStorage: {
      _s: new Map(),
      getItem(k) {
        return this._s.has(k) ? this._s.get(k) : null;
      },
      setItem(k, v) {
        this._s.set(k, String(v));
      },
      removeItem(k) {
        this._s.delete(k);
      },
    },
    window: { addEventListener: noop },
    isDarkTheme: true,
    getThemeColor: () => "#00ffd5",
    requestAnimationFrame: noop,
  };
}

/**
 * Build a fresh simulation context.
 * @param {() => number} rng  seeded generator installed as Math.random
 * @param {boolean} quiet     suppress the loader's console output
 */
function createSimContext(rng, quiet = true) {
  const sandbox = makeDomStubs();
  sandbox.globalThis = sandbox;
  sandbox.console = quiet
    ? { log: () => {}, warn: () => {}, error: console.error }
    : console;
  sandbox.__RNG__ = rng;

  const context = vm.createContext(sandbox);

  // Deterministic RNG for every downstream consumer (weight init, mutation).
  vm.runInContext("Math.random = () => __RNG__();", context);

  for (const rel of SOURCES) {
    const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    vm.runInContext(code, context, { filename: rel });
  }

  // `class` and `const` declarations live in the context's lexical scope and
  // are therefore invisible as properties of the sandbox object.  A `var`
  // assignment is hoisted onto the global object, so this bridge makes the
  // simulation's types reachable from the Node side.
  vm.runInContext(
    `var __sim__ = {
       simulationMap, SimulationWorld, NodeGraph, RouteDiscovery, PriorityQueue,
       BrainArchitecture, SynapseLevel, AutonomousVehicle, LidarArray,
       SteeringModule, WayPoint, GeoPoint, LineSegment, GeoPolygon, GeoEnvelope,
       calcDist, calcDistSq, getAngle, getProjection, calculateIntersection,
       linearInterpolation, subPoints, addPoints, scalePoint, normalizeVector,
       doPolygonsIntersect, doPolygonSegmentIntersect
     };`,
    context
  );

  return Object.assign({}, context.__sim__, {
    /** Raw vm context (escape hatch for diagnostics). */
    __context: context,
    /**
     * Re-seed the simulation without re-parsing the 6 MB map.  Math.random
     * inside the context dereferences __RNG__ on every call, so swapping it
     * redirects every downstream consumer (weight init, mutation) at once.
     */
    setRng(rand) {
      context.__RNG__ = rand;
    },
    /**
     * Publish a value as a global inside the simulation scope.  Needed because
     * AutonomousVehicle.update() resolves the free variable `routeDiscovery`
     * from the global scope, exactly as main.js does in the browser.
     */
    setGlobal(name, value) {
      context.__tmp__ = value;
      vm.runInContext(`var ${name} = __tmp__;`, context);
      delete context.__tmp__;
    },
  });
}

module.exports = { createSimContext, SOURCES, ROOT };
