#!/usr/bin/env node
// Usage: node brand/blueprint/capture.mjs <url> [--selector <css>] [--widths 375,768,1440] [--out <dir>]
//
// Loads the page in Playwright at each width and saves layout-<width>.json.
// Playwright is not a dependency of this repository: install it where you run
// this (npm i -D playwright, then npx playwright install chromium).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function parse(argv) {
  const options = { selector: "body", widths: [1440], out: "." };
  let url;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      url = arg;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === "--selector") options.selector = value;
    else if (arg === "--widths") options.widths = value.split(",").map(Number);
    else if (arg === "--out") options.out = value;
    else if (arg === "--min-size") options.minSize = Number(value);
    else if (arg === "--max-layers") options.maxLayers = Number(value);
    else if (arg === "--max-boxes") options.maxBoxes = Number(value);
    else throw new Error(`Unknown option ${arg}`);
  }
  return { url, options };
}

async function main() {
  const { url, options } = parse(process.argv.slice(2));
  if (!url) {
    console.error(
      "Usage: node brand/blueprint/capture.mjs <url> [--selector css] [--widths 375,768,1440] [--out dir]",
    );
    return 2;
  }
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium\nOr measure the page in DevTools with collect.js (see the README).",
    );
    return 1;
  }
  const collect = await readFile(path.join(here, "collect.js"), "utf8");
  const { widths, out, ...collectOptions } = options;
  await mkdir(out, { recursive: true });
  const browser = await playwright.chromium.launch();
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(url, { waitUntil: "networkidle" });
      const layout = await page.evaluate(`(${collect})(${JSON.stringify(collectOptions)})`);
      const file = path.join(out, `layout-${width}.json`);
      await writeFile(file, `${JSON.stringify(layout, null, 2)}\n`);
      console.error(`${file}: ${layout.boxes.length} boxes`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
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
