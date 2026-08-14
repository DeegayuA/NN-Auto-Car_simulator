/**
 * renderReport.js — Render the block-model document as a plain single-column
 * technical report, as an alternative to the IEEE two-column paper layout.
 *
 * Same document, same numbers: this consumes the identical object produced by
 * content.js. Only presentation differs — a cover page, Arabic section
 * numbering, a full-width measure, and figures and tables that span the page.
 */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Inline markup, identical grammar to the paper renderer. */
function inline(s, ctx) {
  let t = esc(s);
  t = t.replace(/\[\[ref:([^\]]+)\]\]/g, (_, k) => {
    const nums = k.split(",").map((x) => ctx.refIndex[x.trim()] || "?");
    return `[${nums.join("], [")}]`;
  });
  t = t.replace(/\[\[fig:([^\]]+)\]\]/g, (_, k) => `Figure&nbsp;${ctx.figIndex[k] || "?"}`);
  t = t.replace(/\[\[tab:([^\]]+)\]\]/g, (_, k) => `Table&nbsp;${ctx.tabIndex[k] || "?"}`);
  t = t.replace(/\[\[sec:([^\]]+)\]\]/g, (_, k) => `Section&nbsp;${ctx.secIndex[k] || "?"}`);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, (_, a, c) => `${a}<em>${c}</em>`);
  return t;
}

/**
 * Number sections in Arabic (1, 1.1) and appendices in letters, with figures
 * and tables each in one continuous sequence.
 */
function buildIndex(doc) {
  const ctx = { secIndex: {}, figIndex: {}, tabIndex: {}, refIndex: {} };
  let sec = 0;
  let app = 0;
  let sub = 0;
  let fig = 0;
  let tab = 0;
  let inAppendix = false;

  for (const b of doc.blocks) {
    if (b.t === "h1") {
      if (b.appendix) {
        inAppendix = true;
        app++;
        b.number = ALPHA[app - 1];
        b.prefix = "Appendix ";
      } else {
        sec++;
        b.number = String(sec);
        b.prefix = "";
      }
      sub = 0;
      if (b.id) ctx.secIndex[b.id] = (b.prefix || "") + b.number;
    } else if (b.t === "h2") {
      sub++;
      const parent = inAppendix ? ALPHA[app - 1] : String(sec);
      b.number = `${parent}.${sub}`;
      if (b.id) ctx.secIndex[b.id] = b.number;
    } else if (b.t === "fig") {
      fig++;
      b.number = fig;
      if (b.id) ctx.figIndex[b.id] = fig;
    } else if (b.t === "table") {
      tab++;
      b.number = tab;
      if (b.id) ctx.tabIndex[b.id] = tab;
    }
  }
  doc.references.forEach((r, i) => {
    ctx.refIndex[r.key] = i + 1;
  });
  ctx.__headings = doc.blocks.filter((b) => b.t === "h1" || b.t === "h2");
  return ctx;
}

const CSS = `
@page { size: A4; margin: 14mm 14mm 15mm 14mm; }
@page :first { margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 9pt;
  line-height: 1.24;
  color: #111;
  margin: 0;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* ---------- cover ---------- */
.cover {
  height: 297mm;
  padding: 46mm 26mm 24mm 26mm;
  page-break-after: always;
  break-after: page;
  display: flex;
  flex-direction: column;
  text-align: left;
}
.cover .kicker {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 10pt; letter-spacing: 0.16em; text-transform: uppercase;
  color: #52514e; margin-bottom: 8mm;
}
.cover .rule { height: 2.4pt; background: #2a78d6; width: 34mm; margin-bottom: 10mm; }
.cover h1 {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 27pt; line-height: 1.2; font-weight: 700; margin: 0 0 9mm 0;
  letter-spacing: -0.01em; text-align: left;
}
.cover .sub {
  font-size: 12.5pt; line-height: 1.5; color: #333; margin-bottom: 3mm; max-width: 130mm;
}
.cover .meta {
  margin-top: auto;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 10.5pt; line-height: 1.75; color: #333;
  border-top: 0.6pt solid #c3c2b7; padding-top: 6mm;
}
.cover .meta b { color: #111; }

/* ---------- abstract ---------- */
.abswrap { margin-bottom: 8pt; }
.abswrap h2 {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 12pt; font-weight: 700; margin: 0 0 5pt 0;
}
.abstract { font-size: 9.2pt; line-height: 1.36; }
.keywords { font-size: 10pt; margin-top: 8pt; color: #333; }

/* ---------- headings ---------- */
h1.sec {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13pt; font-weight: 700; line-height: 1.2;
  margin: 9pt 0 3pt 0; break-after: avoid; text-align: left;
  letter-spacing: -0.005em;
}
h1.sec .n { color: #2a78d6; }
h2.sub {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 10pt; font-weight: 700; margin: 6.5pt 0 2pt 0;
  break-after: avoid; text-align: left;
}
h2.sub .n { color: #898781; font-weight: 600; }
p { margin: 0 0 3.5pt 0; orphans: 3; widows: 3; }

/* ---------- contents ---------- */
.toc { margin: 4pt 0 10pt 0; }
.toc .toch {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14pt; font-weight: 700; margin-bottom: 6pt;
}
.toc ul {
  list-style: none; margin: 0; padding: 0; font-size: 8.6pt; line-height: 1.36;
  column-count: 2; column-gap: 9mm;
}
.toc li { margin: 0; text-align: left; break-inside: avoid; display: flex; gap: 2mm; }
.toc li .n { flex: 0 0 auto; }
.toc li.t1 { font-weight: 700; margin-top: 3.5pt; }
.toc li.t1 .n { color: #2a78d6; min-width: 15mm; }
.toc li.t2 { margin-left: 6mm; color: #444; }
.toc li.t2 .n { color: #898781; min-width: 9mm; }

/* ---------- figures & tables ---------- */
figure { margin: 6pt 0 7pt 0; break-inside: avoid; text-align: center; }
figure svg, figure img {
  display: block; margin: 0 auto; width: auto; height: auto;
  max-width: 100%; max-height: 80mm;
}
/* Photographic figures float into the right margin so text wraps around them.
   Data charts stay full measure: at float width their axis labels would fall
   below ~5pt and stop being readable. */
figure.narrow {
  float: right; clear: right; width: 46%; margin: 2pt 0 7pt 7mm; text-align: left;
}
figure.narrow svg, figure.narrow img { max-width: 100%; max-height: 82mm; }
figure.narrow figcaption { font-size: 7.6pt; }
h1.sec, h2.sub, .tabwrap, pre.code, .callout { clear: both; }
figure:not(.narrow) { clear: both; }
figcaption { font-size: 7.9pt; line-height: 1.28; text-align: left; margin-top: 3pt; color: #333; }
figcaption b { color: #111; }
.tabwrap { margin: 6pt 0 7pt 0; }
table.data thead { display: table-header-group; }
table.data tr { break-inside: avoid; }
.tabcap { break-after: avoid; }
.tabcap {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 9pt; margin-bottom: 3.5pt; text-align: left; color: #111;
}
table.data {
  width: 100%; border-collapse: collapse; font-size: 7.5pt;
  font-variant-numeric: tabular-nums;
}
table.data th, table.data td { padding: 1.6pt 4pt; text-align: right; vertical-align: top; }
table.data th:first-child, table.data td:first-child { text-align: left; }
table.data thead th {
  border-top: 1pt solid #111; border-bottom: 0.6pt solid #111;
  font-weight: 700; font-family: system-ui, -apple-system, sans-serif; font-size: 8pt;
}
table.data tbody tr:last-child td { border-bottom: 1pt solid #111; }
table.data tbody tr:nth-child(even) td { background: #fafaf8; }
table.data tr.grp td {
  font-style: italic; text-align: left; padding-top: 8pt; background: #fff !important;
  font-weight: 600;
}
table.data.prose td, table.data.prose th { text-align: left; }
.tabnote { font-size: 7.8pt; margin-top: 3.5pt; color: #52514e; line-height: 1.32; }

/* ---------- misc blocks ---------- */
ul, ol { margin: 2.5pt 0 5pt 0; padding-left: 15pt; }
li { margin-bottom: 1.5pt; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 9.6pt; }
.eq { display: block; text-align: center; margin: 6pt 0; break-inside: avoid; }
.eq .num { float: right; }
.callout {
  border-left: 3pt solid #2a78d6; background: #f4f8fd; padding: 6pt 9pt;
  margin: 7pt 0; font-size: 9pt; break-inside: avoid;
}
.callout .ct { font-weight: 700; display: block; margin-bottom: 3pt; }
pre.code {
  font-family: "SFMono-Regular", Consolas, monospace; font-size: 7.6pt; line-height: 1.3;
  background: #f7f7f5; border: 0.5pt solid #e1e0d9; border-radius: 3pt;
  padding: 6pt 8pt; white-space: pre-wrap; break-inside: avoid; margin: 6pt 0;
}
table.check { font-size: 8.4pt; border-collapse: collapse; width: 100%; }
table.check td { vertical-align: top; padding: 2.2pt 5pt 2.2pt 0; text-align: left; }
table.check .box { font-family: monospace; font-weight: 700; white-space: nowrap; color: #0ca30c; }
.refs { font-size: 8.2pt; }
.refs ol { padding-left: 18pt; margin: 0; }
.refs li { margin-bottom: 2.5pt; text-align: left; }
`;

function renderBlocks(blocks, ctx) {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case "h1":
        out.push(
          `<h1 class="sec"><span class="n">${b.prefix || ""}${b.number}</span>&nbsp;&nbsp;${inline(
            b.text,
            ctx
          )}</h1>`
        );
        break;
      case "h2":
        out.push(
          `<h2 class="sub"><span class="n">${b.number}</span>&nbsp;&nbsp;${inline(b.text, ctx)}</h2>`
        );
        break;
      case "h3":
        out.push(`<p><em>${inline(b.text, ctx)}:</em> ${inline(b.body || "", ctx)}</p>`);
        break;
      case "p":
        out.push(`<p>${inline(b.text, ctx)}</p>`);
        break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        out.push(`<${tag}>${b.items.map((i) => `<li>${inline(i, ctx)}</li>`).join("")}</${tag}>`);
        break;
      }
      case "fig":
        // `wide` is meaningless in one column; reuse it to mark which figures
        // run the full measure and which are inset.
        out.push(
          `<figure class="${b.wide ? "" : "narrow"}">${b.svg}<figcaption><b>Figure ${
            b.number
          }.</b> ${inline(b.caption, ctx)}</figcaption></figure>`
        );
        break;
      case "table": {
        const head = `<thead><tr>${b.head
          .map((h) => `<th>${inline(h, ctx)}</th>`)
          .join("")}</tr></thead>`;
        const body = `<tbody>${b.rows
          .map((r) =>
            Array.isArray(r)
              ? `<tr>${r.map((c) => `<td>${inline(String(c), ctx)}</td>`).join("")}</tr>`
              : `<tr class="grp"><td colspan="${b.head.length}">${inline(r.group, ctx)}</td></tr>`
          )
          .join("")}</tbody>`;
        out.push(
          `<div class="tabwrap"><div class="tabcap"><b>Table ${b.number}.</b> ${inline(
            b.caption,
            ctx
          )}</div><table class="data${b.prose ? " prose" : ""}">${head}${body}</table>${
            b.note ? `<div class="tabnote">${inline(b.note, ctx)}</div>` : ""
          }</div>`
        );
        break;
      }
      case "eq":
        out.push(
          `<span class="eq">${b.html}${b.num ? `<span class="num">(${b.num})</span>` : ""}</span>`
        );
        break;
      case "callout":
        out.push(
          `<div class="callout"><span class="ct">${inline(b.title, ctx)}</span>${inline(
            b.text,
            ctx
          )}</div>`
        );
        break;
      case "code":
        out.push(`<pre class="code">${esc(b.text)}</pre>`);
        break;
      case "checklist":
        out.push(
          `<table class="check">${b.items
            .map(
              (i) =>
                `<tr><td class="box">[${i.done ? "x" : " "}]</td><td><strong>${inline(
                  i.label,
                  ctx
                )}</strong> ${inline(i.text, ctx)}</td></tr>`
            )
            .join("")}</table>`
        );
        break;
      case "toc": {
        const items = ctx.__headings.map((x) =>
          x.t === "h1"
            ? `<li class="t1"><span class="n">${x.prefix || ""}${x.number}</span>${inline(
                x.text,
                ctx
              )}</li>`
            : `<li class="t2"><span class="n">${x.number}</span>${inline(x.text, ctx)}</li>`
        );
        out.push(
          `<div class="toc"><div class="toch">Contents</div><ul>${items.join("")}</ul></div>`
        );
        break;
      }
      case "raw":
        out.push(b.html);
        break;
      default:
        break;
    }
  }
  return out.join("\n");
}

function renderReport(doc) {
  const ctx = buildIndex(doc);
  const body = renderBlocks(doc.blocks, ctx);
  const refs = doc.references.map((r) => `<li>${inline(r.text, ctx)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(doc.title)}</title>
<style>${CSS}</style>
</head><body>

<div class="cover">
  <div class="kicker">${esc(doc.runningHead)}</div>
  <div class="rule"></div>
  <h1>${esc(doc.title)}</h1>
  <div class="sub">${esc(doc.email)}</div>
  <div class="meta">
    <div><b>${esc(doc.author)}</b></div>
    <div>${esc(doc.affiliation)}</div>
    <div>Repository commit <b>${esc(doc.runningRight.replace(/^Commit\s*/i, ""))}</b></div>
  </div>
</div>

<div class="abswrap">
  <h2>Abstract</h2>
  <div class="abstract">${inline(doc.abstract, ctx)}</div>
  <div class="keywords"><strong>Keywords:</strong> ${esc(doc.keywords)}</div>
</div>

${body}

<h1 class="sec">References</h1>
<div class="refs"><ol>${refs}</ol></div>

</body></html>`;
}

module.exports = { renderReport };
