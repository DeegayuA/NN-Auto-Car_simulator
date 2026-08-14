/**
 * rng.js — Seedable PRNG (mulberry32).
 *
 * Every experiment installs one of these as Math.random inside the simulation
 * context, which makes weight initialisation, mutation and any stochastic
 * environment behaviour bit-for-bit reproducible from the seed alone.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { mulberry32 };
