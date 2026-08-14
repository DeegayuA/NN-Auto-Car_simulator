/**
 * cropShot.js — Crop a PNG at an exact offset.
 *
 * macOS `sips -c` crops from the centre and silently ignores an offset, which
 * is the wrong operation for pulling a named panel out of a screenshot. This
 * helper renders the source image inside a clipped box in headless Chrome and
 * screenshots the box, which gives an exact top-left-anchored crop.
 *
 * Usage:
 *   node experiments/cropShot.js <src.png> <out.png> <x> <y> <w> <h>
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function crop(src, out, x, y, w, h) {
  const b64 = fs.readFileSync(src).toString("base64");
  const tmp = path.join(path.dirname(out), ".crop.html");
  fs.writeFileSync(
    tmp,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
     html,body{margin:0;padding:0;background:#000}
     .box{position:relative;width:${w}px;height:${h}px;overflow:hidden}
     .box img{position:absolute;left:${-x}px;top:${-y}px;display:block}
     </style></head><body><div class="box">
     <img src="data:image/png;base64,${b64}"></div></body></html>`
  );
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--window-size=${w},${h}`,
      `--screenshot=${path.resolve(out)}`,
      "file://" + path.resolve(tmp),
    ],
    { stdio: "ignore" }
  );
  fs.unlinkSync(tmp);
  console.log(`${path.basename(out)}  ${w}x${h} from (${x},${y})  ${fs.statSync(out).size} bytes`);
}

const [src, out, x, y, w, h] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node experiments/cropShot.js <src> <out> <x> <y> <w> <h>");
  process.exit(1);
}
crop(src, out, +x, +y, +w, +h);
