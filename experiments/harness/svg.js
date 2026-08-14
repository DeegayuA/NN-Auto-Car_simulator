/**
 * svg.js — Minimal chart toolkit emitting standalone SVG.
 *
 * Palette, mark specs and accessibility rules follow the project's data
 * visualisation standard:
 *   - categorical hues assigned in fixed slot order, never cycled;
 *   - one measure per axis, never a second y-scale;
 *   - 2 px lines, >= 8 px markers, 4 px rounded data-ends on bars anchored to
 *     the baseline, a 2 px surface gap between adjacent fills;
 *   - a legend whenever two or more series are present, plus direct labels;
 *   - recessive grid and axis ink so the data carries the contrast.
 */

const C = {
  surface: "#ffffff",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948"],
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  serious: "#ec835a",
};

const FONT = `-apple-system, "Segoe UI", system-ui, sans-serif`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svgOpen(w, h, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(
    title
  )}" font-family='${FONT}'><rect width="${w}" height="${h}" fill="${C.surface}"/>`;
}
const svgClose = () => `</svg>`;

function text(x, y, s, opts = {}) {
  const {
    size = 11,
    fill = C.ink2,
    anchor = "start",
    weight = 400,
    baseline = "auto",
    rotate = null,
  } = opts;
  const tr = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" dominant-baseline="${baseline}"${tr}>${esc(
    s
  )}</text>`;
}

/** Nice axis ticks covering [0, max]. */
function ticks(max, count = 5) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= max + step * 0.5; v += step) out.push(v);
  return out;
}

const fmt = (v) => {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(0) + "k";
  if (a >= 1000) return (v / 1000).toFixed(1) + "k";
  if (a >= 10) return v.toFixed(0);
  return String(Number(v.toFixed(2)));
};

/**
 * Horizontal ranked bar chart — one measure across categories, so a single
 * hue plus direct value labels rather than a colour per bar.
 */
function barChartH(opts) {
  const {
    title,
    subtitle = "",
    data,
    width = 720,
    barH = 26,
    gap = 10,
    xLabel = "",
    labelW = 210,
    valueFormat = fmt,
  } = opts;

  const top = subtitle ? 62 : 46;
  const bottom = 44;
  const h = top + data.length * (barH + gap) + bottom;
  const plotL = labelW;
  const plotR = width - 74;
  const plotW = plotR - plotL;

  const maxV = Math.max(...data.map((d) => (d.err ? d.err[1] : d.value)), 0);
  const tk = ticks(maxV);
  // The tick generator can stop below maxV; the scale must still cover the
  // longest whisker or marks render outside the plot box.
  const upper = Math.max(tk[tk.length - 1], maxV) || 1;
  const scale = (v) => plotL + (v / upper) * plotW;

  let s = svgOpen(width, h, title);
  s += text(16, 22, title, { size: 13.5, fill: C.ink, weight: 700 });
  if (subtitle) s += text(16, 40, subtitle, { size: 10.5, fill: C.muted });

  for (const t of tk) {
    const x = scale(t);
    s += `<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${
      h - bottom + 4
    }" stroke="${C.grid}" stroke-width="1"/>`;
    s += text(x, h - bottom + 20, valueFormat(t), { size: 9.5, fill: C.muted, anchor: "middle" });
  }

  data.forEach((d, i) => {
    const y = top + i * (barH + gap);
    const w = Math.max(6, scale(d.value) - plotL);
    const color = d.color || C.series[0];
    s += `<path d="M${plotL} ${y} H${plotL + w - 4} a4 4 0 0 1 4 4 V${
      y + barH - 4
    } a4 4 0 0 1 -4 4 H${plotL} Z" fill="${color}"/>`;
    if (d.err && Number.isFinite(d.err[0])) {
      const x1 = scale(d.err[0]);
      const x2 = scale(d.err[1]);
      const cy = y + barH / 2;
      s += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${C.ink}" stroke-width="1.5" opacity="0.75"/>`;
      s += `<line x1="${x1}" y1="${cy - 4}" x2="${x1}" y2="${
        cy + 4
      }" stroke="${C.ink}" stroke-width="1.5" opacity="0.75"/>`;
      s += `<line x1="${x2}" y1="${cy - 4}" x2="${x2}" y2="${
        cy + 4
      }" stroke="${C.ink}" stroke-width="1.5" opacity="0.75"/>`;
    }
    s += text(plotL - 10, y + barH / 2, d.label, {
      size: 10.5,
      anchor: "end",
      baseline: "middle",
      fill: C.ink,
    });
    // Place the value clear of the whisker so the two never overlap.
    const labelX = Math.min(
      d.err && Number.isFinite(d.err[1])
        ? Math.max(plotL + w, scale(d.err[1])) + 8
        : plotL + w + 8,
      width - 66
    );
    s += text(labelX, y + barH / 2, valueFormat(d.value), {
      size: 10.5,
      baseline: "middle",
      fill: C.ink2,
      weight: 600,
    });
  });

  s += `<line x1="${plotL}" y1="${top - 8}" x2="${plotL}" y2="${
    h - bottom + 4
  }" stroke="${C.axis}" stroke-width="1"/>`;
  if (xLabel) s += text(width / 2, h - 8, xLabel, { size: 10, fill: C.muted, anchor: "middle" });
  return s + svgClose();
}

/** Multi-series line chart with direct end labels. */
function lineChart(opts) {
  const {
    title,
    subtitle = "",
    series,
    width = 720,
    height = 330,
    xLabel = "",
    yLabel = "",
    yMax = null,
  } = opts;

  const top = subtitle ? 62 : 46;
  const bottom = 48;
  const left = 64;
  const right = width - 150;
  const plotH = height - top - bottom;

  const allX = series.flatMap((s) => s.points.map((p) => p[0]));
  // Band extents must be inside the scale, otherwise the uncertainty ribbon is
  // clipped at the top of the plot and reads as a solid block.
  const allY = series.flatMap((s) => [
    ...s.points.map((p) => p[1]),
    ...(s.band || []).map((b) => b[2]),
  ]);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yTop = yMax || Math.max(...allY, 0);
  const tk = ticks(yTop);
  const yEnd = Math.max(tk[tk.length - 1], yTop) || 1;

  const sx = (x) => left + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * (right - left);
  const sy = (y) => top + plotH - (y / Math.max(1e-9, yEnd)) * plotH;

  let s = svgOpen(width, height, title);
  s += text(16, 22, title, { size: 13.5, fill: C.ink, weight: 700 });
  if (subtitle) s += text(16, 40, subtitle, { size: 10.5, fill: C.muted });

  for (const t of tk) {
    const y = sy(t);
    s += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
    s += text(left - 8, y, fmt(t), { size: 9.5, fill: C.muted, anchor: "end", baseline: "middle" });
  }
  for (const t of ticks(xMax, 6).filter((v) => v >= xMin)) {
    s += text(sx(t), height - bottom + 18, fmt(t), { size: 9.5, fill: C.muted, anchor: "middle" });
  }
  s += `<line x1="${left}" y1="${top + plotH}" x2="${right}" y2="${
    top + plotH
  }" stroke="${C.axis}" stroke-width="1"/>`;

  series.forEach((ser, i) => {
    if (!ser.band) return;
    const color = C.series[i];
    const up = ser.band.map((b) => `${sx(b[0])},${sy(b[2])}`).join(" ");
    const dn = [...ser.band].reverse().map((b) => `${sx(b[0])},${sy(b[1])}`).join(" ");
    s += `<polygon points="${up} ${dn}" fill="${color}" opacity="0.13"/>`;
  });

  series.forEach((ser, i) => {
    const color = C.series[i];
    const d = ser.points.map((p, j) => `${j ? "L" : "M"}${sx(p[0])} ${sy(p[1])}`).join(" ");
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = ser.points[ser.points.length - 1];
    s += `<circle cx="${sx(last[0])}" cy="${sy(last[1])}" r="4" fill="${color}" stroke="${
      C.surface
    }" stroke-width="2"/>`;
    const dy = ser.labelDy || 0;
    s += text(sx(last[0]) + 9, sy(last[1]) + dy, ser.name, {
      size: 9.5,
      fill: C.ink2,
      baseline: "middle",
      weight: 600,
    });
  });

  if (yLabel)
    s += text(16, top + plotH / 2, yLabel, {
      size: 10,
      fill: C.muted,
      anchor: "middle",
      rotate: -90,
    });
  if (xLabel)
    s += text((left + right) / 2, height - 10, xLabel, {
      size: 10,
      fill: C.muted,
      anchor: "middle",
    });
  return s + svgClose();
}

/** Stacked composition bars (termination causes). */
function stackedBars(opts) {
  const {
    title,
    subtitle = "",
    categories,
    partNames,
    partColors,
    width = 720,
    barH = 24,
    gap = 12,
    labelW = 210,
  } = opts;

  const top = subtitle ? 82 : 66;
  const bottom = 30;
  const h = top + categories.length * (barH + gap) + bottom;
  const plotL = labelW;
  const plotR = width - 60;
  const plotW = plotR - plotL;

  let s = svgOpen(width, h, title);
  s += text(16, 22, title, { size: 13.5, fill: C.ink, weight: 700 });
  if (subtitle) s += text(16, 40, subtitle, { size: 10.5, fill: C.muted });

  let lx = plotL;
  partNames.forEach((n, i) => {
    s += `<rect x="${lx}" y="${top - 28}" width="10" height="10" rx="2" fill="${partColors[i]}"/>`;
    s += text(lx + 15, top - 23, n, { size: 9.5, fill: C.ink2, baseline: "middle" });
    lx += 26 + n.length * 6.0;
  });

  categories.forEach((cat, i) => {
    const y = top + i * (barH + gap);
    const total = cat.parts.reduce((a, p) => a + p.value, 0) || 1;
    let x = plotL;
    cat.parts.forEach((p, j) => {
      const w = (p.value / total) * plotW;
      if (w > 0.5) {
        s += `<rect x="${x}" y="${y}" width="${Math.max(0, w - 2)}" height="${barH}" fill="${
          partColors[j]
        }" rx="2"/>`;
        if (w > 36) {
          s += text(x + w / 2 - 1, y + barH / 2, Math.round((p.value / total) * 100) + "%", {
            size: 9.5,
            fill: "#ffffff",
            anchor: "middle",
            baseline: "middle",
            weight: 700,
          });
        }
      }
      x += w;
    });
    s += text(plotL - 10, y + barH / 2, cat.label, {
      size: 10.5,
      anchor: "end",
      baseline: "middle",
      fill: C.ink,
    });
  });

  return s + svgClose();
}

/** Bars with error whiskers, for ablation panels. */
function groupedBars(opts) {
  const {
    title,
    subtitle = "",
    groups,
    width = 720,
    height = 260,
    yLabel = "",
    color = C.series[0],
  } = opts;

  const top = subtitle ? 62 : 46;
  const bottom = 66;
  const left = 64;
  const right = width - 18;
  const plotH = height - top - bottom;
  const maxV = Math.max(...groups.map((g) => g.value + (g.err || 0)), 0);
  const tk = ticks(maxV);
  const yEnd = Math.max(tk[tk.length - 1], maxV) || 1;
  const sy = (v) => top + plotH - (v / yEnd) * plotH;

  const slot = (right - left) / groups.length;
  const bw = Math.min(56, slot - 16);

  let s = svgOpen(width, height, title);
  s += text(16, 22, title, { size: 13.5, fill: C.ink, weight: 700 });
  if (subtitle) s += text(16, 40, subtitle, { size: 10.5, fill: C.muted });

  for (const t of tk) {
    const y = sy(t);
    s += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
    s += text(left - 8, y, fmt(t), { size: 9.5, fill: C.muted, anchor: "end", baseline: "middle" });
  }

  groups.forEach((g, i) => {
    const cx = left + slot * i + slot / 2;
    const y = sy(g.value);
    s += `<path d="M${cx - bw / 2} ${top + plotH} V${y + 4} a4 4 0 0 1 4 -4 H${
      cx + bw / 2 - 4
    } a4 4 0 0 1 4 4 V${top + plotH} Z" fill="${g.color || color}"/>`;
    if (g.err) {
      s += `<line x1="${cx}" y1="${sy(Math.max(0, g.value - g.err))}" x2="${cx}" y2="${sy(
        g.value + g.err
      )}" stroke="${C.ink}" stroke-width="1.5" opacity="0.7"/>`;
      s += `<line x1="${cx - 5}" y1="${sy(g.value + g.err)}" x2="${cx + 5}" y2="${sy(
        g.value + g.err
      )}" stroke="${C.ink}" stroke-width="1.5" opacity="0.7"/>`;
    }
    // Sit the value above the whisker cap, never across it.
    const labelY = (g.err ? sy(g.value + g.err) : y) - 8;
    s += text(cx, labelY, fmt(g.value), { size: 9.5, fill: C.ink2, anchor: "middle", weight: 600 });

    const words = String(g.label).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 13) {
        lines.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    lines.push(line.trim());
    lines.forEach((ln, k) => {
      s += text(cx, top + plotH + 16 + k * 11, ln, { size: 9, fill: C.muted, anchor: "middle" });
    });
  });

  s += `<line x1="${left}" y1="${top + plotH}" x2="${right}" y2="${
    top + plotH
  }" stroke="${C.axis}" stroke-width="1"/>`;
  if (yLabel)
    s += text(16, top + plotH / 2, yLabel, {
      size: 10,
      fill: C.muted,
      anchor: "middle",
      rotate: -90,
    });
  return s + svgClose();
}

module.exports = {
  C,
  FONT,
  svgOpen,
  svgClose,
  text,
  ticks,
  fmt,
  esc,
  barChartH,
  lineChart,
  stackedBars,
  groupedBars,
};
