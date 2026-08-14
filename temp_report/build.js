/**
 * build.js — Assemble the final report.
 *
 * Loads every result file produced by the experiment protocol, hands them to
 * temp_report/content.js (which is where the prose lives), and emits:
 *
 *   temp_report/final_report.html   print-ready two-column HTML
 *   reports/final_report_new_ieee.pdf    IEEE two-column, via headless Chrome
 *   temp_report/final_report.tex    IEEEtran source for recompilation
 *   reports/final_report_new_normal.pdf  plain single-column report
 *   temp_report/figures/*.pdf       vector figures for the LaTeX route
 *
 * Every numeric value in the report is derived here or inside content.js from
 * the JSON in experiments/results/ — none is typed by hand.
 *
 * Usage:  node temp_report/build.js [--no-pdf]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { renderHtml } = require("./renderHtml");
const { renderTex } = require("./renderTex");
const { renderReport } = require("./renderReport");
const { buildContent } = require("./content");

const ROOT = path.resolve(__dirname, "..");
const RESULTS = path.join(ROOT, "experiments", "results");
const FIGS = path.join(ROOT, "experiments", "figures");
const OUT = __dirname; // working files: HTML, LaTeX source, figure PDFs
const DELIVER = path.join(ROOT, "reports"); // the two submitted PDFs

// Internal build name -> delivered filename.
const DELIVERED = {
  final_report: "final_report_new_ieee.pdf",
  final_report_2: "final_report_new_normal.pdf",
};

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NO_PDF = process.argv.includes("--no-pdf");
// --fast: rebuild only the single-column report PDF, skipping the paper
// layout, the LaTeX source and the per-figure PDF conversions.
const FAST = process.argv.includes("--fast");

const readJson = (n) => JSON.parse(fs.readFileSync(path.join(RESULTS, n), "utf8"));
const readSvg = (n) => fs.readFileSync(path.join(FIGS, n), "utf8");

function gitInfo() {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return "unavailable";
    }
  };
  return {
    commit: run(["rev-parse", "--short", "HEAD"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    remote: run(["config", "--get", "remote.origin.url"]),
  };
}

function hostInfo() {
  return {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: (os.cpus()[0] || {}).model || "unknown",
    cores: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
  };
}

/** Render one SVG to a tightly-cropped PDF so pdflatex can include it. */
function svgToPdf(file) {
  const svg = readSvg(file);
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) return false;
  const wMm = (parseFloat(m[1]) / 96) * 25.4;
  const hMm = (parseFloat(m[2]) / 96) * 25.4;
  const tmpHtml = path.join(OUT, "figures", file.replace(/\.svg$/, ".html"));
  fs.writeFileSync(
    tmpHtml,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
     @page{size:${wMm.toFixed(2)}mm ${hMm.toFixed(2)}mm;margin:0}
     html,body{margin:0;padding:0}svg{display:block}
     </style></head><body>${svg}</body></html>`
  );
  const outPdf = path.join(OUT, "figures", file.replace(/\.svg$/, ".pdf"));
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outPdf}`,
      "file://" + tmpHtml,
    ],
    { stdio: "ignore" }
  );
  fs.unlinkSync(tmpHtml);
  return true;
}

function main() {
  const data = {
    stats: readJson("dataset_stats.json"),
    e1: readJson("e1_fitness_signal.json"),
    e2: readJson("e2_baselines.json"),
    e2a: readJson("e2a_baseline_tuning.json"),
    e3: readJson("e3_training.json"),
    e4: readJson("e4_ablations.json"),
    e5: readJson("e5_final.json"),
    manifest: readJson("run_manifest.json"),
    verify: readJson("verification.json"),
    git: gitInfo(),
    host: hostInfo(),
    svg: {},
  };

  for (const f of fs.readdirSync(FIGS).filter((x) => x.endsWith(".svg"))) {
    data.svg[f] = readSvg(f);
  }

  // Real screenshots of the running application, inlined as data URIs so the
  // HTML stays self-contained, and copied to report/figures/ for pdflatex.
  data.png = {};
  const SHOTS = path.join(ROOT, "experiments", "screenshots");
  if (fs.existsSync(SHOTS)) {
    fs.mkdirSync(path.join(OUT, "figures"), { recursive: true });
    for (const f of fs.readdirSync(SHOTS).filter((x) => x.endsWith(".png"))) {
      const buf = fs.readFileSync(path.join(SHOTS, f));
      data.png[f] = `data:image/png;base64,${buf.toString("base64")}`;
      fs.copyFileSync(path.join(SHOTS, f), path.join(OUT, "figures", f));
    }
  }

  const doc = buildContent(data);

  if (!FAST) {
    const html = renderHtml(doc);
    fs.writeFileSync(path.join(OUT, "final_report.html"), html);
    console.log("wrote temp_report/final_report.html  " + (html.length / 1024).toFixed(0) + " KB");

    const tex = renderTex(doc);
    fs.writeFileSync(path.join(OUT, "final_report.tex"), tex);
    console.log("wrote temp_report/final_report.tex   " + (tex.length / 1024).toFixed(0) + " KB");
  }

  // Second format: same document, plain single-column report layout. Content
  // is rebuilt from the same data because the renderers stamp section numbers
  // onto the block objects.
  const reportHtml = renderReport(buildContent(data));
  fs.writeFileSync(path.join(OUT, "final_report_2.html"), reportHtml);
  console.log("wrote temp_report/final_report_2.html " + (reportHtml.length / 1024).toFixed(0) + " KB");

  if (NO_PDF) return;

  if (!FAST) {
    fs.mkdirSync(path.join(OUT, "figures"), { recursive: true });
    let n = 0;
    for (const f of Object.keys(data.svg)) if (svgToPdf(f)) n++;
    console.log(`wrote temp_report/figures/*.pdf ${n} figures`);
  }

  fs.mkdirSync(DELIVER, { recursive: true });
  for (const name of FAST ? ["final_report_2"] : ["final_report", "final_report_2"]) {
    const pdf = path.join(DELIVER, DELIVERED[name]);
    execFileSync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdf}`,
        "file://" + path.join(OUT, `${name}.html`),
      ],
      { stdio: "ignore" }
    );
    console.log(
      `wrote reports/${DELIVERED[name]}   ${(fs.statSync(pdf).size / 1024).toFixed(0)} KB`
    );
  }
}

main();
