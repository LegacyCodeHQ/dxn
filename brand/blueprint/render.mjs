#!/usr/bin/env node
// Usage: node brand/blueprint/render.mjs <layout.json>... [options]
//
// Each layout file is one capture. Several files stack as layers, labelled with
// their viewport widths: the same page at several breakpoints, the widest at the
// bottom.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderSvg } from "./isometric.mjs";

const DEFAULT_BRAND_FILE = fileURLToPath(new URL("../brand.json", import.meta.url));

const USAGE = `Usage: node brand/blueprint/render.mjs <layout.json>... [options]

Options:
  --out <file>           Write the svg here (default: stdout)
  --palette ink|paper    Background and tones (default: ink)
  --brand <file.json>    Brand colors to use (default: brand/brand.json), named as in the brand file: ink, paper,
                         accent, accent-light, slate, slate-on-ink, white
  --color <name=#hex>    One brand color, over the file's (repeatable)
  --tone <name=#hex>     One tone outright: background, line, slab, grid, label,
                         highlight, lifted (repeatable)
  --rotate <deg>         Turn the view by 0, 90, 180 or 270 degrees (default: 0)
  --lift <tag>           Raise every box with this tag, and what it holds, off the page and measure it
  --lift-index <n,...>   Raise the boxes at these positions instead
  --lift-height <px>     How far a lifted box floats (default: 90)
  --highlight <tag>      Draw the first box with this tag in the accent
  --highlight-index <n>  Draw the nth box of the first layout in the accent
  --min-size <px>        Skip boxes narrower or shorter than this (default: 0)
  --max-layer <n>        Fold boxes nested deeper than this into the box that holds them
  --merge-gap <px>       Neighbours closer than this may merge into one slab (default: 16)
  --overflow bleed|clip  Boxes that run past the viewport: draw them whole (bleed,
                         the default) or only the part inside it (clip)
  --no-paint             Draw unpainted wrappers and hit areas too (default: only what is painted)
  --no-measure           Leave out the page's width and height lines (a lifted box keeps its own)
  --titles               Write each capture's width above it
  --no-slab              Draw the viewport as a plain plane, not a slab
  --slab-thickness <px>  Thickness of the viewport slab (default: 18)
  --flat                 A wireframe on the ground: no layers, no thickness, captures
                         side by side, a cross in images and lines in text
  --no-wire              With --flat, leave out the crosses and lines
  --no-merge             Keep every box: do not merge neighbours
  --keep <kinds>         Kinds never folded away by depth: media,control,text
                         (default: all three; "none" folds by depth only)
  --only <widths>        Draw only these breakpoints, e.g. 375,1440 (default: all)
  --budget <n>           Show about this many slabs per capture: keep the deepest
                         layers that fit
  --layer-height <px>    Height between nested layers (default: 28)
  --stack-gap <px>       Height between stacked captures (default: fits the layers)
  --width <px>           Output width (default: 1600)`;

function parse(argv) {
  const files = [];
  const options = {};
  let out;
  let brandFile;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      files.push(arg);
      continue;
    }
    if (arg === "--no-merge") {
      options.merge = false;
      continue;
    }
    if (arg === "--no-paint") {
      options.paint = false;
      continue;
    }
    if (arg === "--titles") {
      options.titles = true;
      continue;
    }
    if (arg === "--no-measure") {
      options.measure = false;
      continue;
    }
    if (arg === "--no-slab") {
      options.viewportSlab = false;
      continue;
    }
    if (arg === "--flat") {
      options.flat = true;
      continue;
    }
    if (arg === "--no-wire") {
      options.wire = false;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === "--out") out = value;
    else if (arg === "--palette") options.palette = value;
    else if (arg === "--brand") brandFile = value;
    else if (arg === "--color" || arg === "--tone") {
      const [name, color] = value.split("=");
      if (!name || !color) throw new Error(`${arg} is name=#hex, got ${value}`);
      const target = arg === "--color" ? "brand" : "colors";
      options[target] = { ...options[target], [name]: color };
    } else if (arg === "--rotate") options.rotate = Number(value);
    else if (arg === "--lift") options.lift = { tag: value };
    else if (arg === "--lift-index") options.lift = { index: value.split(",").map(Number) };
    else if (arg === "--lift-height") options.liftHeight = Number(value);
    else if (arg === "--highlight") options.highlight = { tag: value };
    else if (arg === "--highlight-index") options.highlight = { index: Number(value) };
    else if (arg === "--min-size") options.minSize = Number(value);
    else if (arg === "--max-layer") options.maxLayer = Number(value);
    else if (arg === "--merge-gap") options.mergeGap = Number(value);
    else if (arg === "--budget") options.budget = Number(value);
    else if (arg === "--keep") options.keep = value === "none" ? [] : value.split(",");
    else if (arg === "--slab-thickness") options.viewportThickness = Number(value);
    else if (arg === "--overflow") options.overflow = value;
    else if (arg === "--only") options.show = value.split(",").map(Number);
    else if (arg === "--layer-height") options.layerHeight = Number(value);
    else if (arg === "--stack-gap") options.stackGap = Number(value);
    else if (arg === "--width") options.width = Number(value);
    else throw new Error(`Unknown option ${arg}`);
  }
  return { files, options, out, brandFile };
}

async function main() {
  const { files, options, out, brandFile } = parse(process.argv.slice(2));
  // The brand colors live in brand/brand.json, beside the brand file they come from.
  const brand = JSON.parse(await readFile(brandFile ?? DEFAULT_BRAND_FILE, "utf8"));
  options.brand = { ...brand, ...options.brand };
  if (files.length === 0) {
    console.error(USAGE);
    return 2;
  }
  if (options.overflow && !["bleed", "clip"].includes(options.overflow)) {
    console.error("--overflow is bleed or clip");
    return 2;
  }
  if (options.palette && !["ink", "paper"].includes(options.palette)) {
    console.error("--palette is ink or paper");
    return 2;
  }
  const layouts = [];
  for (const file of files) {
    const layout = JSON.parse(await readFile(file, "utf8"));
    if (layout.unloadedImages > 0)
      console.error(
        `${file}: ${layout.unloadedImages} image(s) had not loaded when measured, so they are empty boxes. Capture again after the page has finished loading.`,
      );
    layouts.push({ label: String(Math.round(layout.viewport.w)), layout });
  }
  const svg = renderSvg(layouts, options);
  if (out) await writeFile(out, `${svg}\n`);
  else process.stdout.write(`${svg}\n`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  },
);
