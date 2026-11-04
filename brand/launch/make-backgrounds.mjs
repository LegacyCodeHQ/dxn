#!/usr/bin/env node
// Draws the launch backgrounds from the measured layout of a dxn docs page:
//   node brand/launch/make-backgrounds.mjs
// The search bar is lifted and the page's own measurements are left out, as the
// blueprint mode rules say. Needs rsvg-convert to make the PNGs. The SVGs are
// drawn into a temporary folder and not kept.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clipLayout, normalise, renderSvg } from "../blueprint/isometric.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const layout = JSON.parse(readFileSync(here("sources/tidepool-1440.json"), "utf8"));
// The search bar is the one lifted element.
const lifted = normalise(clipLayout(layout)).boxes.findIndex(
  (box) => box.tag === "div" && box.radius >= 30 && box.w > 800 && box.y < 200,
);
if (lifted === -1) throw new Error("the search bar is not in the layout");
mkdirSync(here("backgrounds"), { recursive: true });
// A background is named by its content, so a design tool that caches images by
// path loads the new one when the drawing changes.
for (const old of readdirSync(here("backgrounds"))) rmSync(here(`backgrounds/${old}`));
const scratch = mkdtempSync(join(tmpdir(), "launch-"));

for (const [width, height] of [
  [1600, 900],
  [1200, 627],
]) {
  const svg = renderSvg([{ label: String(layout.viewport.w), layout }], {
    flat: true,
    palette: "paper",
    measure: false,
    lift: { index: [lifted] },
    width,
  }).replace(
    /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/,
    `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="${width}" height="${height}"`,
  );
  const name = `tidepool-blueprint-${width}x${height}`;
  const source = join(scratch, `${name}.svg`);
  writeFileSync(source, svg);
  execFileSync("rsvg-convert", [
    "-w",
    String(width),
    "-h",
    String(height),
    source,
    "-o",
    join(scratch, `${name}.png`),
  ]);
  const hash = createHash("sha256")
    .update(readFileSync(join(scratch, `${name}.png`)))
    .digest("hex");
  const file = `${name}-${hash.slice(0, 8)}.png`;
  renameSync(join(scratch, `${name}.png`), here(`backgrounds/${file}`));
  console.log(file);
}
