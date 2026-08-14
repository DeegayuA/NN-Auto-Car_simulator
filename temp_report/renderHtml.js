/**
 * renderHtml.js — Render the block-model document to print-ready HTML.
 *
 * The stylesheet emulates the IEEE conference template the Milestone 2 draft
 * used: A4, two columns, ~10 pt serif body, Roman-numeral section headings,
 * 8 pt captions and references.  Chrome's headless print pipeline turns this
 * into the submitted PDF.
 */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROMAN = [
  "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Inline markup: **bold**, *italic*, `code`, [[ref:key]], [[fig:id]],
 * [[tab:id]], [[sec:id]].  Escaping happens first, so document text may
 * contain angle brackets safely.
 */
function inline(s, ctx) {
  let t = esc(s);
  t = t.replace(/\[\[ref:([^\]]+)\]\]/g, (_, k) => {
    const nums = k.split(",").map((x) => ctx.refIndex[x.trim()] || "?");
    return `[${nums.join("], [")}]`;
  });
  t = t.replace(/\[\[fig:([^\]]+)\]\]/g, (_, k) => `Fig.&nbsp;${ctx.figIndex[k] || "?"}`);
  t = t.replace(/\[\[tab:([^\]]+)\]\]/g, (_, k) => `Table&nbsp;${ctx.tabIndex[k] || "?"}`);
  t = t.replace(/\[\[sec:([^\]]+)\]\]/g, (_, k) => `Section&nbsp;${ctx.secIndex[k] || "?"}`);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, (_, a, c) => `${a}<em>${c}</em>`);
  return t;
}

/** Assign section, figure, table and reference numbers in one pass. */
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
      } else {
        sec++;
        b.number = ROMAN[sec];
      }
      sub = 0;
      if (b.id) ctx.secIndex[b.id] = b.number;
    } else if (b.t === "h2") {
      sub++;
      b.number = ALPHA[sub - 1];
      const parent = inAppendix ? ALPHA[app - 1] : ROMAN[sec];
      if (b.id) ctx.secIndex[b.id] = `${parent}-${b.number}`;
    } else if (b.t === "fig") {
      fig++;
      b.number = fig;
      if (b.id) ctx.figIndex[b.id] = fig;
    } else if (b.t === "table") {
      tab++;
      b.number = tab;
      if (b.id) ctx.tabIndex[b.id] = ROMAN[tab] || tab;
    }
  }
  doc.references.forEach((r, i) => {
    ctx.refIndex[r.key] = i + 1;
  });
  ctx.__headings = doc.blocks.filter((b) => b.t === "h1" || b.t === "h2");
  return ctx;
}

const CSS = `
@page { size: A4; margin: 17mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Times New Roman", Times, serif;
  font-size: 9.6pt;
  line-height: 1.17;
  color: #000;
  margin: 0;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.titleblock { text-align: center; margin: 0 0 10pt 0; }
.paper-title { font-size: 20pt; line-height: 1.12; font-weight: 400; margin: 0 0 11pt 0; }
.authors { font-size: 11pt; margin: 0 0 2pt 0; }
.affil { font-size: 9pt; font-style: italic; margin: 0 0 1pt 0; }
.runninghead {
  font-size: 7.4pt; letter-spacing: 0.04em; text-transform: uppercase;
  border-bottom: 0.4pt solid #000; padding-bottom: 2pt; margin-bottom: 9pt;
  display: flex; justify-content: space-between;
}
.cols { column-count: 2; column-gap: 6mm; }
h1.sec {
  font-size: 9.6pt; font-variant: small-caps; font-weight: 400; text-align: center;
  margin: 11pt 0 4pt 0; break-after: avoid;
}
h2.sub { font-size: 9.6pt; font-style: italic; font-weight: 400; margin: 8pt 0 3pt 0; break-after: avoid; }
p { margin: 0; text-indent: 1.5em; orphans: 2; widows: 2; }
p.first, p.noindent { text-indent: 0; }
.abstract { font-size: 9pt; font-weight: 700; }
.abstract .lead { font-style: italic; }
.keywords { font-size: 9pt; font-weight: 700; margin-top: 6pt; }
.keywords .lead { font-style: italic; }
figure { margin: 8pt 0; break-inside: avoid; }
figure svg { width: 100%; height: auto; display: block; }
figcaption { font-size: 8pt; text-align: left; margin-top: 4pt; line-height: 1.2; text-indent: 0; }
figure.wide, .tabwrap.wide, pre.code.wide { column-span: all; }
table.data.prose td, table.data.prose th { text-align: left; }
table.data.prose td:not(:first-child) { padding-left: 10pt; }
figure.wide { margin: 10pt 0; }
table.data {
  width: 100%; border-collapse: collapse; font-size: 7.7pt; margin: 2pt 0 4pt 0;
  font-variant-numeric: tabular-nums;
}
table.data th, table.data td { padding: 2.1pt 3pt; text-align: right; }
table.data th:first-child, table.data td:first-child { text-align: left; }
table.data thead th { border-top: 0.8pt solid #000; border-bottom: 0.5pt solid #000; font-weight: 400; }
table.data tbody tr:last-child td { border-bottom: 0.8pt solid #000; }
table.data tr.grp td { font-style: italic; text-align: left; padding-top: 5pt; }
.tabwrap { break-inside: avoid; margin: 8pt 0; }
.tabcap {
  font-size: 8pt; text-align: center; text-transform: uppercase;
  letter-spacing: 0.02em; margin-bottom: 3pt; text-indent: 0;
}
.tabcap .n { display: block; }
.tabnote { font-size: 7.3pt; margin-top: 3pt; text-indent: 0; line-height: 1.2; }
ul, ol { margin: 3pt 0; padding-left: 14pt; }
li { margin-bottom: 1.5pt; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 8.3pt; }
.eq { display: block; text-align: center; margin: 5pt 0; text-indent: 0; break-inside: avoid; }
.eq .num { float: right; font-style: normal; }
.callout {
  border-left: 2pt solid #2a78d6; background: #f5f8fd; padding: 5pt 7pt;
  margin: 6pt 0; font-size: 8.8pt; text-indent: 0; break-inside: avoid;
}
.callout .ct { font-weight: 700; display: block; margin-bottom: 2pt; }
.toc {
  border-top: 0.8pt solid #000; border-bottom: 0.8pt solid #000;
  padding: 5pt 0 6pt 0; margin: 9pt 0 4pt 0;
}
.toc li { break-inside: avoid; }
.toc .toch { break-after: avoid; }
.toc .toch {
  font-variant: small-caps; font-size: 9.4pt; text-align: center;
  margin-bottom: 4pt; letter-spacing: 0.02em;
}
.toc ul { list-style: none; margin: 0; padding: 0; font-size: 8.2pt; line-height: 1.34; }
.toc li { margin: 0; text-align: left; }
.toc li.t1 { font-weight: 700; margin-top: 2.5pt; }
.toc li.t2 { padding-left: 12pt; color: #52514e; }
.refs { font-size: 8pt; }
.refs ol { padding-left: 15pt; margin: 0; }
.refs li { margin-bottom: 2pt; text-align: left; }
table.check { font-size: 8.6pt; border-collapse: collapse; }
table.check td { vertical-align: top; padding: 2pt 4pt 2pt 0; text-align: left; }
table.check .box { font-family: monospace; font-weight: 700; white-space: nowrap; }
pre.code {
  font-family: "SFMono-Regular", Consolas, monospace; font-size: 7.5pt; line-height: 1.25;
  background: #f7f7f5; border: 0.4pt solid #e1e0d9; padding: 4pt 5pt;
  white-space: pre-wrap; text-indent: 0; break-inside: avoid; margin: 4pt 0;
}
`;

function renderBlocks(blocks, ctx) {
  const out = [];
  let firstAfterHeading = false;

  for (const b of blocks) {
    switch (b.t) {
      case "h1":
        out.push(
          `<h1 class="sec">${b.appendix ? "Appendix&nbsp;" : ""}${b.number}.&nbsp;&nbsp;${inline(
            b.text,
            ctx
          )}</h1>`
        );
        firstAfterHeading = true;
        break;
      case "h2":
        out.push(`<h2 class="sub">${b.number}. ${inline(b.text, ctx)}</h2>`);
        firstAfterHeading = true;
        break;
      case "h3":
        out.push(
          `<p class="noindent"><em>${inline(b.text, ctx)}:</em> ${inline(b.body || "", ctx)}</p>`
        );
        firstAfterHeading = false;
        break;
      case "p":
        out.push(`<p class="${firstAfterHeading ? "first" : ""}">${inline(b.text, ctx)}</p>`);
        firstAfterHeading = false;
        break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        out.push(`<${tag}>${b.items.map((i) => `<li>${inline(i, ctx)}</li>`).join("")}</${tag}>`);
        firstAfterHeading = false;
        break;
      }
      case "fig":
        out.push(
          `<figure class="${b.wide ? "wide" : ""}">${b.svg}<figcaption><strong>Fig.&nbsp;${
            b.number
          }.</strong> ${inline(b.caption, ctx)}</figcaption></figure>`
        );
        break;
      case "table": {
        const head = `<thead><tr>${b.head.map((h) => `<th>${inline(h, ctx)}</th>`).join("")}</tr></thead>`;
        const body = `<tbody>${b.rows
          .map((r) =>
            Array.isArray(r)
              ? `<tr>${r.map((c) => `<td>${inline(String(c), ctx)}</td>`).join("")}</tr>`
              : `<tr class="grp"><td colspan="${b.head.length}">${inline(r.group, ctx)}</td></tr>`
          )
          .join("")}</tbody>`;
        out.push(
          `<div class="tabwrap ${b.wide ? "wide" : ""}"><div class="tabcap"><span class="n">Table&nbsp;${
            ROMAN[b.number] || b.number
          }</span>${inline(b.caption, ctx)}</div><table class="data${
            b.prose ? " prose" : ""
          }">${head}${body}</table>${
            b.note ? `<div class="tabnote">${inline(b.note, ctx)}</div>` : ""
          }</div>`
        );
        break;
      }
      case "eq":
        out.push(`<span class="eq">${b.html}${b.num ? `<span class="num">(${b.num})</span>` : ""}</span>`);
        break;
      case "callout":
        out.push(
          `<div class="callout"><span class="ct">${inline(b.title, ctx)}</span>${inline(b.text, ctx)}</div>`
        );
        break;
      case "code":
        out.push(`<pre class="code${b.wide ? " wide" : ""}">${esc(b.text)}</pre>`);
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
        // Built from the same numbering pass that drives cross-references, so
        // the contents list can never disagree with the body.
        const items = [];
        for (const x of ctx.__headings) {
          if (x.t === "h1") {
            items.push(
              `<li class="t1">${x.appendix ? "Appendix " : ""}${x.number}.&nbsp; ${inline(
                x.text,
                ctx
              )}</li>`
            );
          } else if (!b.topLevelOnly) {
            items.push(`<li class="t2">${x.number}. ${inline(x.text, ctx)}</li>`);
          }
        }
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

function renderHtml(doc) {
  const ctx = buildIndex(doc);
  const body = renderBlocks(doc.blocks, ctx);
  const refs = doc.references.map((r) => `<li>${inline(r.text, ctx)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(doc.title)}</title>
<style>${CSS}</style>
</head><body>
<div class="runninghead"><span>${esc(doc.runningHead)}</span><span>${esc(doc.runningRight)}</span></div>
<div class="titleblock">
  <div class="paper-title">${esc(doc.title)}</div>
  <div class="authors">${esc(doc.author)}</div>
  <div class="affil">${esc(doc.affiliation)}</div>
  <div class="affil">${esc(doc.email)}</div>
</div>
<div class="cols">
<p class="abstract noindent"><span class="lead">Abstract&mdash;</span>${inline(doc.abstract, ctx)}</p>
<p class="keywords noindent"><span class="lead">Index Terms&mdash;</span>${esc(doc.keywords)}</p>
${body}
<h1 class="sec">References</h1>
<div class="refs"><ol>${refs}</ol></div>
</div>
</body></html>`;
}

module.exports = { renderHtml, buildIndex, inline, ROMAN, ALPHA };
