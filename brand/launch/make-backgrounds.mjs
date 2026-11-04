#!/usr/bin/env node
// Draws the launch backgrounds from the measured layout of a dxn docs page:
//   node brand/launch/make-backgrounds.mjs
// The code block is lifted and the page's own measurements are left out, as the
// blueprint mode rules say. Needs rsvg-convert to make the PNGs. The SVGs are
// drawn into a temporary folder and not kept.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clipLayout, normalise, renderSvg } from "../blueprint/isometric.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const layout = JSON.parse(readFileSync(here("sources/dxn-docs-1440.json"), "utf8"));
const lifted = normalise(clipLayout(layout)).boxes.findIndex((box) => box.tag === "pre");
mkdirSync(here("backgrounds"), { recursive: true });
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
  const name = `dxn-docs-blueprint-${width}x${height}`;
  const source = join(scratch, `${name}.svg`);
  writeFileSync(source, svg);
  execFileSync("rsvg-convert", [
    "-w",
    String(width),
    "-h",
    String(height),
    source,
    "-o",
    here(`backgrounds/${name}.png`),
  ]);
  console.log(name);
}
