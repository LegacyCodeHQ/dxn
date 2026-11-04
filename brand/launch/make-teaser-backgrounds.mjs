#!/usr/bin/env node
// Draws the portrait blueprint backgrounds of the launch teaser slides (1080 x 1350)
// from the measured Tidepool layout: node brand/launch/make-teaser-backgrounds.mjs
// The page stands as it does on screen, the search bar is lifted, and the page's own
// measurements are left out. The drawing sits whole in the middle of the slide, on
// the surface color, with room above and below for type. Needs rsvg-convert. Files are named by
// content, so a design tool that caches images by path loads the new one.
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
import {
  clipLayout,
  normalise,
  renderSvg,
  resolvePalette,
  rotateLayout,
} from "../blueprint/isometric.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const layout = JSON.parse(readFileSync(here("sources/tidepool-1440.json"), "utf8"));
const TURN = 0;
const turned = rotateLayout(layout, TURN / 90);
const lifted = normalise(clipLayout(turned)).boxes.findIndex(
  (box) => box.tag === "div" && box.radius >= 30 && box.w > 800 && box.y < 200,
);
if (lifted === -1) throw new Error("the search bar is not in the layout");

const out = here("teaser/backgrounds");
mkdirSync(out, { recursive: true });
for (const old of readdirSync(out)) rmSync(join(out, old));
const scratch = mkdtempSync(join(tmpdir(), "teaser-"));
const [width, height] = [1080, 1350];

for (const palette of ["paper", "ink"]) {
  const svg = renderSvg([{ label: String(layout.viewport.w), layout }], {
    flat: true,
    palette,
    measure: false,
    rotate: TURN,
    lift: { index: [lifted] },
    width,
  }).replace(
    /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/,
    `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" width="${width}" height="${height}"`,
  );
  const source = join(scratch, `${palette}.svg`);
  writeFileSync(source, svg);
  const png = join(scratch, `${palette}.png`);
  execFileSync("rsvg-convert", [
    "-w",
    String(width),
    "-h",
    String(height),
    "-b",
    resolvePalette(palette).background,
    source,
    "-o",
    png,
  ]);
  const hash = createHash("sha256").update(readFileSync(png)).digest("hex").slice(0, 8);
  const file = `teaser-blueprint-${palette}-${hash}.png`;
  renameSync(png, join(out, file));
  console.log(file);
}
