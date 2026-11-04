#!/usr/bin/env node
// Draws the blueprint images of the launch teaser: node brand/launch/make-teaser-backgrounds.mjs
//   - slide 1: the desktop layout of Tidepool on paper, search bar lifted (1080 x 1350)
//   - slide 4: its mobile layout on ink, nothing lifted (1200 x 960, for a tile)
// The drawing sits whole in the middle, on the surface color, with room around it for
// type. Needs rsvg-convert. Files are named by content, so a design tool that caches
// images by path loads the new one.
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
import { clipLayout, normalise, renderSvg, resolvePalette } from "../blueprint/isometric.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (name) => JSON.parse(readFileSync(here(`sources/${name}`), "utf8"));

const out = here("teaser/backgrounds");
mkdirSync(out, { recursive: true });
for (const old of readdirSync(out)) rmSync(join(out, old));
const scratch = mkdtempSync(join(tmpdir(), "teaser-"));

function draw({ name, layout, palette, width, height, lift }) {
  const svg = renderSvg([{ label: String(layout.viewport.w), layout }], {
    flat: true,
    palette,
    measure: !lift,
    ...(lift ? { lift } : {}),
    width,
  }).replace(
    /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/,
    `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" width="${width}" height="${height}"`,
  );
  const source = join(scratch, `${name}.svg`);
  writeFileSync(source, svg);
  const png = join(scratch, `${name}.png`);
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
  const file = `${name}-${hash}.png`;
  renameSync(png, join(out, file));
  console.log(file);
}

// Slide 1: the desktop page, its search bar lifted and its own measurements left out.
const desktop = read("tidepool-1440.json");
const searchBar = normalise(clipLayout(desktop)).boxes.findIndex(
  (box) => box.tag === "div" && box.radius >= 30 && box.w > 800 && box.y < 200,
);
if (searchBar === -1) throw new Error("the search bar is not in the layout");
draw({
  name: "teaser-blueprint-paper",
  layout: desktop,
  palette: "paper",
  width: 1080,
  height: 1350,
  lift: { index: [searchBar] },
});

// Slide 4: the mobile page, nothing lifted, its width and height measured.
draw({
  name: "teaser-mobile-ink",
  layout: read("tidepool-375.json"),
  palette: "ink",
  width: 1200,
  height: 960,
});
