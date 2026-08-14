/**
 * stats.js — Small, dependency-free statistics layer.
 *
 * The comparisons in this project involve heavy-tailed, bounded and often
 * bimodal distributions (an agent either threads an intersection or dies at
 * it), so the reporting leans on rank-based and resampling methods rather than
 * on Gaussian assumptions:
 *
 *   - descriptive statistics with quartiles,
 *   - percentile bootstrap confidence intervals for the mean,
 *   - Mann-Whitney U (normal approximation with tie correction) for location,
 *   - Cliff's delta for a non-parametric effect size.
 */

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(values) {
  const s = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return { n: 0 };
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return {
    n,
    mean,
    sd,
    se: sd / Math.sqrt(n),
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[n - 1],
  };
}

/** Percentile bootstrap CI for the mean. Deterministic given `rand`. */
function bootstrapCI(values, rand, iterations = 2000, alpha = 0.05) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return { lo: NaN, hi: NaN };
  const means = new Array(iterations);
  for (let b = 0; b < iterations; b++) {
    let acc = 0;
    for (let i = 0; i < v.length; i++) acc += v[Math.floor(rand() * v.length)];
    means[b] = acc / v.length;
  }
  means.sort((a, b) => a - b);
  return { lo: quantile(means, alpha / 2), hi: quantile(means, 1 - alpha / 2) };
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17 rational approximation). */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * Mann-Whitney U with tie-corrected normal approximation.
 * Returns U, z and the two-sided p-value.
 */
function mannWhitneyU(a, b) {
  const x = a.filter(Number.isFinite);
  const y = b.filter(Number.isFinite);
  const n1 = x.length;
  const n2 = y.length;
  if (!n1 || !n2) return { U: NaN, z: NaN, p: NaN, n1, n2 };

  const all = [...x.map((v) => ({ v, g: 0 })), ...y.map((v) => ({ v, g: 1 }))].sort(
    (p, q) => p.v - q.v
  );

  // Mid-ranks, with tie-group sizes recorded for the variance correction.
  const tieGroups = [];
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) all[k].rank = rank;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }

  const r1 = all.filter((e) => e.g === 0).reduce((s, e) => s + e.rank, 0);
  const U1 = r1 - (n1 * (n1 + 1)) / 2;
  const U = Math.min(U1, n1 * n2 - U1);

  const N = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const tieTerm = tieGroups.reduce((s, t) => s + (t ** 3 - t), 0);
  const varU = ((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1)));
  if (varU <= 0) return { U, U1, z: 0, p: 1, n1, n2 };

  const z = (U1 - meanU) / Math.sqrt(varU);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { U, U1, z, p: Math.min(1, p), n1, n2 };
}

/** Cliff's delta: P(x>y) - P(x<y). |d| thresholds 0.147 / 0.33 / 0.474. */
function cliffsDelta(a, b) {
  const x = a.filter(Number.isFinite);
  const y = b.filter(Number.isFinite);
  if (!x.length || !y.length) return { delta: NaN, magnitude: "n/a" };
  let gt = 0;
  let lt = 0;
  for (const xi of x) {
    for (const yi of y) {
      if (xi > yi) gt++;
      else if (xi < yi) lt++;
    }
  }
  const delta = (gt - lt) / (x.length * y.length);
  const ad = Math.abs(delta);
  let magnitude = "negligible";
  if (ad >= 0.474) magnitude = "large";
  else if (ad >= 0.33) magnitude = "medium";
  else if (ad >= 0.147) magnitude = "small";
  return { delta, magnitude };
}

module.exports = { describe, quantile, bootstrapCI, mannWhitneyU, cliffsDelta, normalCdf };
