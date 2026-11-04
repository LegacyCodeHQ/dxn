import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_BRAND,
  normalise,
  project,
  renderSvg,
  resolvePalette,
  rotateLayout,
} from "../isometric.mjs";

const layout = (width, boxes) => ({
  viewport: { w: width, h: 800 },
  selector: "body",
  root: { w: width, h: 800 },
  boxes,
});

const box = (tag, layer, x, y, w, h) => ({ tag, layer, x, y, w, h });

test("the origin projects to the origin", () => {
  assert.deepEqual(project(0, 0, 0), { x: 0, y: 0 });
});

test("x runs right and down, y runs left and down, z runs up", () => {
  const x = project(100, 0, 0);
  const y = project(0, 100, 0);
  const z = project(0, 0, 100);
  assert.ok(x.x > 0 && x.y > 0);
  assert.ok(y.x < 0 && y.y > 0);
  assert.equal(z.x, 0);
  assert.equal(z.y, -100);
});

test("the two ground axes are the same length on screen", () => {
  const x = project(100, 0, 0);
  const y = project(0, 100, 0);
  assert.ok(Math.abs(Math.hypot(x.x, x.y) - Math.hypot(y.x, y.y)) < 1e-9);
});

test("a layout renders as an svg with one top face per box", () => {
  const svg = renderSvg([
    {
      label: "1440",
      layout: layout(1440, [box("main", 0, 0, 0, 1440, 800), box("div", 1, 40, 40, 400, 200)]),
    },
  ]);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/data-face="top"/g) ?? []).length, 2);
});

test("page text never reaches the svg", () => {
  const withText = { ...box("p", 1, 10, 10, 100, 40), text: "A headline from the page" };
  const svg = renderSvg([{ label: "1440", layout: layout(1440, [withText]) }]);
  assert.equal(svg.includes("A headline from the page"), false);
});

test("the highlighted box is drawn in the accent, the rest are not", () => {
  const svg = renderSvg(
    [
      {
        label: "1440",
        layout: layout(1440, [box("main", 0, 0, 0, 1440, 800), box("button", 1, 40, 40, 160, 48)]),
      },
    ],
    { palette: "ink", highlight: { tag: "button" } },
  );
  assert.equal((svg.match(/data-highlight="true"/g) ?? []).length, 1);
});

test("several layouts stack, each labelled with its width", () => {
  const svg = renderSvg(
    [
      { label: "375", layout: layout(375, [box("main", 0, 0, 0, 375, 800)]) },
      { label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) },
    ],
    { titles: true },
  );
  assert.ok(svg.includes(">375<"));
  assert.ok(svg.includes(">1440<"));
});

test("min-size and max-layer options thin out the boxes", () => {
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("div", 1, 0, 0, 300, 300),
    box("span", 2, 0, 0, 20, 20),
  ];
  const all = renderSvg([{ label: "a", layout: layout(1000, boxes) }]);
  const thin = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    minSize: 50,
    maxLayer: 1,
  });
  assert.equal((all.match(/data-face="top"/g) ?? []).length, 3);
  assert.equal((thin.match(/data-face="top"/g) ?? []).length, 2);
});

test("boxes with the same rectangle collapse to the outermost one", () => {
  const boxes = [
    box("body", 0, 0, 0, 1000, 800),
    box("div", 1, 0, 0, 1000, 800),
    box("div", 2, 0, 0, 1000, 800),
    box("main", 3, 100, 100, 400, 300),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }]);
  assert.equal((svg.match(/data-face="top"/g) ?? []).length, 2);
});

test("layers count the boxes that enclose a box, not its depth in the page", () => {
  const boxes = [
    box("body", 0, 0, 0, 1000, 800),
    box("div", 5, 0, 0, 1000, 800),
    box("main", 9, 100, 100, 400, 300),
    box("p", 12, 150, 150, 100, 100),
  ];
  const levels = normalise(layout(1000, boxes)).boxes.map((b) => [b.tag, b.layer]);
  assert.deepEqual(levels, [
    ["body", 0],
    ["main", 1],
    ["p", 2],
  ]);
});

test("the widest capture is the bottom layer, so narrower ones sit on top", () => {
  const svg = renderSvg(
    [
      { label: "375", layout: layout(375, [box("main", 0, 0, 0, 375, 800)]) },
      { label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) },
    ],
    { titles: true },
  );
  assert.ok(svg.indexOf(">1440<") < svg.indexOf(">375<"));
});

const tops = (svg) => (svg.match(/data-face="top"/g) ?? []).length;

test("touching siblings that fill their union collapse into one group slab", () => {
  const rows = [0, 1, 2, 3].map((i) => box("li", 1, 10, 100 + i * 50, 300, 50));
  const boxes = [box("main", 0, 0, 0, 1000, 800), ...rows];
  const merged = renderSvg([{ label: "a", layout: layout(1000, boxes) }]);
  const plain = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge: false });
  assert.equal(tops(merged), 2);
  assert.equal(tops(plain), 5);
});

test("a merged group says how many boxes it holds", () => {
  const rows = [0, 1, 2].map((i) => box("li", 1, 10, 100 + i * 50, 300, 50));
  const svg = renderSvg([
    { label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800), ...rows]) },
  ]);
  assert.ok(svg.includes('data-merged="3"'));
});

test("siblings far apart stay separate", () => {
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("div", 1, 10, 100, 200, 50),
    box("div", 1, 10, 500, 200, 50),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 3);
});

test("boxes that only touch at a corner do not merge, their union is mostly empty", () => {
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("div", 1, 100, 100, 100, 100),
    box("div", 1, 200, 200, 100, 100),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 3);
});

test("what sits inside a merged group is folded into it", () => {
  const rows = [0, 1, 2].map((i) => box("li", 1, 10, 100 + i * 50, 300, 50));
  const inner = rows.map((row) => box("a", 2, row.x + 10, row.y + 10, 100, 30));
  const boxes = [box("main", 0, 0, 0, 1000, 800), ...rows, ...inner];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("limiting layers folds deeper boxes into the box that holds them", () => {
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("section", 1, 50, 50, 600, 600),
    box("div", 2, 100, 100, 300, 300),
    box("a", 3, 120, 120, 100, 60),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    maxLayer: 1,
    merge: false,
  });
  assert.equal(tops(svg), 2);
});

test("a limit of layers also lets siblings in the last layer merge", () => {
  const buttons = [0, 1, 2].map((i) => box("button", 2, 700 + i * 40, 20, 36, 28));
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("header", 1, 0, 0, 1000, 60),
    ...buttons,
    box("a", 3, 705, 24, 20, 20),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { maxLayer: 2 });
  assert.equal(tops(svg), 3);
});

const tree = () => {
  const boxes = [box("main", 0, 0, 0, 2000, 1000)];
  for (let s = 0; s < 3; s++) {
    boxes.push(box("section", 1, 100 + s * 600, 100, 400, 800));
    for (let c = 0; c < 3; c++) boxes.push(box("div", 2, 120 + s * 600, 120 + c * 250, 100, 100));
  }
  return boxes;
};

test("a budget keeps the deepest layers whose boxes still fit in it", () => {
  const draw = (budget) =>
    tops(renderSvg([{ label: "a", layout: layout(2000, tree()) }], { budget }));
  assert.equal(draw(4), 4);
  assert.equal(draw(7), 4);
  assert.equal(draw(13), 13);
});

test("the highlighted box survives a layer limit", () => {
  const boxes = [
    box("main", 0, 0, 0, 1000, 800),
    box("section", 1, 50, 50, 600, 600),
    box("div", 2, 100, 100, 300, 300),
    box("button", 3, 120, 120, 100, 60),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    maxLayer: 1,
    highlight: { tag: "button" },
  });
  assert.equal((svg.match(/data-highlight="true"/g) ?? []).length, 1);
});

const three = () => [
  { label: "375", layout: layout(375, [box("main", 0, 0, 0, 375, 800)]) },
  { label: "768", layout: layout(768, [box("main", 0, 0, 0, 768, 800)]) },
  { label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) },
];

test("only the chosen breakpoints are drawn", () => {
  const svg = renderSvg(three(), { show: [375, 1440], titles: true });
  assert.ok(svg.includes(">375<"));
  assert.ok(svg.includes(">1440<"));
  assert.equal(svg.includes(">768<"), false);
  assert.equal(tops(svg), 2);
});

test("the chosen breakpoints stack with no gap left for the others", () => {
  const some = renderSvg(three(), { show: [768] });
  const alone = renderSvg([three()[1]]);
  assert.equal(some, alone);
});

test("asking for a breakpoint that was not captured says what was", () => {
  assert.throws(
    () => renderSvg(three(), { show: [1024] }),
    /No capture at 1024 px\. Captured: 375, 768, 1440/,
  );
});

const kbox = (tag, kind, layer, x, y, w, h, radius = 0) => ({
  tag,
  kind,
  layer,
  x,
  y,
  w,
  h,
  radius,
});

const topPoints = (svg) =>
  [...svg.matchAll(/data-face="top" points="([^"]+)"/g)].map((m) => m[1].split(" ").length);

test("a rounded box has a rounded outline, a square one has four corners", () => {
  const square = renderSvg([
    { label: "a", layout: layout(500, [kbox("div", "structure", 0, 0, 0, 200, 100)]) },
  ]);
  const round = renderSvg([
    { label: "a", layout: layout(500, [kbox("div", "structure", 0, 0, 0, 200, 100, 24)]) },
  ]);
  assert.equal(topPoints(square)[0], 4);
  assert.ok(topPoints(round)[0] > 16);
});

test("a radius larger than half the box is clamped to a pill or a circle", () => {
  const svg = renderSvg([
    { label: "a", layout: layout(500, [kbox("button", "control", 0, 0, 0, 120, 40, 999)]) },
  ]);
  assert.ok(topPoints(svg)[0] > 16);
  assert.equal(svg.includes("NaN"), false);
});

test("what a customer sees survives a layer limit, wrappers fold away", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("section", "structure", 1, 50, 50, 600, 600),
    kbox("div", "structure", 2, 100, 100, 300, 300),
    kbox("img", "media", 3, 120, 120, 100, 60),
    kbox("button", "control", 3, 250, 120, 100, 40),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    maxLayer: 1,
    merge: false,
  });
  assert.equal(tops(svg), 4);
});

test("a wrapper and a button with the same rectangle keep the button", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 1, 100, 100, 120, 40),
    kbox("button", "control", 2, 100, 100, 120, 40),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    highlight: { tag: "button" },
  });
  assert.equal(tops(svg), 2);
  assert.equal((svg.match(/data-highlight="true"/g) ?? []).length, 1);
});

test("merging wrappers keeps the images and text inside them", () => {
  const cards = [0, 1, 2].map((i) => kbox("div", "structure", 1, 10 + i * 210, 100, 200, 300));
  const images = cards.map((c) => kbox("img", "media", 2, c.x + 10, c.y + 10, 180, 180));
  const boxes = [kbox("main", "structure", 0, 0, 0, 1000, 800), ...cards, ...images];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }]);
  assert.equal(tops(svg), 5);
});

test("images never merge, even when they touch", () => {
  const images = [0, 1, 2].map((i) => kbox("img", "media", 1, 10 + i * 100, 100, 100, 100));
  const boxes = [kbox("main", "structure", 0, 0, 0, 1000, 800), ...images];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 4);
});

test("lines of text that sit together merge into one block", () => {
  const lines = [0, 1, 2].map((i) => kbox("p", "text", 1, 10, 100 + i * 24, 200, 20));
  const boxes = [kbox("main", "structure", 0, 0, 0, 1000, 800), ...lines];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("clickable cards that hold an image stay separate, buttons in a bar still merge", () => {
  const cards = [0, 1, 2].map((i) => kbox("a", "control", 1, 10 + i * 210, 100, 200, 300));
  const images = cards.map((c) => kbox("img", "media", 2, c.x + 10, c.y + 10, 180, 180));
  const buttons = [0, 1, 2].map((i) => kbox("button", "control", 1, 10 + i * 40, 600, 36, 28));
  const boxes = [kbox("main", "structure", 0, 0, 0, 1000, 800), ...cards, ...images, ...buttons];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 8);
});

test("the kinds that are always kept can be chosen", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("section", "structure", 1, 50, 50, 600, 600),
    kbox("img", "media", 2, 100, 100, 100, 60),
    kbox("button", "control", 2, 300, 100, 100, 40),
  ];
  const draw = (keep) =>
    tops(
      renderSvg([{ label: "a", layout: layout(1000, boxes) }], { maxLayer: 0, merge: false, keep }),
    );
  assert.equal(draw(["media", "control"]), 3);
  assert.equal(draw(["media"]), 2);
  assert.equal(draw([]), 1);
});

const sides = (svg) => (svg.match(/data-face="side"/g) ?? []).length;
const firstPoint = (svg, nth) =>
  [...svg.matchAll(/data-face="top" points="([^ ]+)/g)].map((m) => m[1])[nth];

test("a flat view has no sides and no height: the page lies on the ground", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 3, 0, 0, 100, 100),
  ];
  const flat = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    flat: true,
    merge: false,
  });
  const stacked = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge: false });
  assert.equal(sides(flat), 0);
  assert.ok(sides(stacked) > 0);
  assert.equal(firstPoint(flat, 0), firstPoint(flat, 1));
  assert.notEqual(firstPoint(stacked, 0), firstPoint(stacked, 1));
});

test("a flat view draws wireframe marks: a cross for an image, lines for text", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("img", "media", 1, 50, 50, 300, 200),
    kbox("p", "text", 1, 50, 300, 300, 80),
    kbox("button", "control", 1, 50, 420, 120, 40),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true });
  assert.equal((svg.match(/data-wire="cross"/g) ?? []).length, 1);
  assert.equal((svg.match(/data-wire="lines"/g) ?? []).length, 1);
});

test("the wireframe marks can be turned off", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("img", "media", 1, 50, 50, 300, 200),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true, wire: false });
  assert.equal(svg.includes("data-wire"), false);
});

test("flat captures sit side by side on the ground, not stacked", () => {
  const one = renderSvg([three()[2]], { flat: true });
  const two = renderSvg([three()[1], three()[2]], { flat: true, titles: true });
  const width = (svg) => Number(svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/)[1]);
  assert.ok(width(two) > width(one));
  assert.ok(two.includes(">768<"));
  assert.ok(two.includes(">1440<"));
});

const viewWidth = (svg) => Number(svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/)[1]);

const overflowing = () => [
  kbox("main", "structure", 0, 0, 0, 1000, 800),
  kbox("div", "structure", 1, 900, 100, 300, 200),
  kbox("div", "structure", 1, 1100, 400, 200, 100),
];

test("boxes can bleed past the edge of the viewport when asked", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], {
    merge: false,
    overflow: "bleed",
  });
  assert.equal(tops(svg), 3);
});

test("with the viewport slab, the slab is the visible part: boxes are clipped by default", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], { merge: false });
  assert.equal(tops(svg), 2);
});

test("without the slab, boxes bleed by default", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], {
    merge: false,
    viewportSlab: false,
  });
  assert.equal(tops(svg), 3);
});

test("the page's outermost box is square, whatever radius it has", () => {
  const boxes = [kbox("body", "structure", 0, 0, 0, 1000, 800, 40)];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    viewportSlab: false,
  });
  assert.equal(topPoints(svg)[0], 4);
});

test("clipping keeps only what is inside the viewport", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], {
    merge: false,
    overflow: "clip",
  });
  assert.equal(tops(svg), 2);
});

test("a clipped view does not grow past the viewport, a bleeding one does", () => {
  const draw = (overflow) =>
    viewWidth(
      renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], { merge: false, overflow }),
    );
  assert.ok(draw("bleed") > draw("clip"));
});

test("a box cut by the edge loses its rounded corners on the cut side", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 1, 900, 100, 300, 200, 24),
  ];
  const draw = (overflow) =>
    topPoints(
      renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge: false, overflow }),
    )[1];
  assert.equal(draw("bleed"), 28);
  assert.equal(draw("clip"), 16);
});

test("a box wholly inside the viewport is unchanged by clipping", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 1, 100, 100, 300, 200, 24),
  ];
  const draw = (overflow) =>
    renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge: false, overflow });
  assert.equal(draw("clip"), draw("bleed"));
});

const count = (svg, pattern) => (svg.match(pattern) ?? []).length;

test("the viewport is a slab: a top and two sides under the page", () => {
  const svg = renderSvg([
    { label: "a", layout: layout(1000, [kbox("main", "structure", 0, 0, 0, 800, 600)]) },
  ]);
  assert.equal(count(svg, /data-face="viewport-top"/g), 1);
  assert.equal(count(svg, /data-face="viewport-side"/g), 2);
});

test("the slab is drawn before anything that sits on it", () => {
  const svg = renderSvg([
    { label: "a", layout: layout(1000, [kbox("main", "structure", 0, 0, 0, 800, 600)]) },
  ]);
  assert.ok(svg.indexOf('data-face="viewport-top"') < svg.indexOf('data-face="top"'));
});

test("the slab stays in a flat view, where the boxes on it have no thickness", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 1, 50, 50, 200, 100),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true });
  assert.equal(count(svg, /data-face="viewport-side"/g), 2);
  assert.equal(count(svg, /data-face="side"/g), 0);
});

test("every capture gets its own slab", () => {
  const svg = renderSvg(three(), { flat: true });
  assert.equal(count(svg, /data-face="viewport-top"/g), 3);
});

test("the slab can be turned off, or made thicker", () => {
  const plain = renderSvg([three()[0]], { viewportSlab: false });
  assert.equal(count(plain, /data-face="viewport-/g), 0);
  const thin = renderSvg([three()[0]], { viewportThickness: 10 });
  const thick = renderSvg([three()[0]], { viewportThickness: 60 });
  const height = (svg) => Number(svg.match(/height="(\d+)"/)[1]);
  assert.ok(height(thick) > height(thin));
});

test("the slab spans the viewport, so clipped boxes end at its edge", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], {
    merge: false,
    overflow: "clip",
  });
  assert.equal(topPoints(svg.replace(/data-face="viewport-top"/g, "data-x"))[0], 4);
});

const pbox = (tag, kind, painted, layer, x, y, w, h, radius = 0) => ({
  ...kbox(tag, kind, layer, x, y, w, h, radius),
  painted,
});

test("a wrapper with nothing painted on it is not drawn", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", false, 1, 50, 50, 400, 200),
    pbox("p", "text", false, 2, 60, 60, 200, 20),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("a wrapper with something painted on it is drawn", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", true, 1, 50, 50, 400, 200),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("an invisible control that holds text or an image is shown by its content", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("a", "control", false, 1, 50, 50, 300, 60),
    pbox("span", "text", false, 2, 60, 60, 100, 18),
    pbox("a", "control", false, 1, 50, 200, 300, 160),
    pbox("img", "media", false, 2, 50, 200, 300, 120),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 3);
});

test("an invisible control that holds nothing else is kept, it is all there is", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("button", "control", false, 1, 50, 50, 120, 40),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("a painted box wins over an unpainted one with the same rectangle", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", false, 1, 100, 100, 800, 66, 33),
    pbox("div", "structure", true, 2, 100, 100, 800, 66, 33),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("boxes without paint information are treated as painted", () => {
  const boxes = [
    kbox("main", "structure", 0, 0, 0, 1000, 800),
    kbox("div", "structure", 1, 50, 50, 400, 200),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }])), 2);
});

test("unpainted boxes can be shown", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", false, 1, 50, 50, 400, 200),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { paint: false });
  assert.equal(tops(svg), 2);
});

test("small text is kept under a size limit that drops small boxes", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", true, 1, 50, 50, 20, 20),
    pbox("div", "text", true, 1, 50, 100, 200, 18),
  ];
  assert.equal(tops(renderSvg([{ label: "a", layout: layout(1000, boxes) }], { minSize: 36 })), 2);
});

const card = (x) => [
  pbox("a", "control", false, 1, x, 100, 180, 214),
  pbox("div", "structure", true, 2, x, 100, 180, 172, 20),
  pbox("div", "text", false, 2, x + 4, 280, 170, 16),
];

test("a rounded painted box inside a link is a photo: it stays a tile with a cross", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    ...card(10),
    ...card(200),
    ...card(390),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true });
  assert.equal((svg.match(/data-wire="cross"/g) ?? []).length, 3);
});

test("a large rounded photo area stays a photo with a badge and a heart over it", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    ...card(10),
    pbox("div", "structure", true, 3, 22, 112, 100, 26, 13),
    pbox("div", "text", false, 4, 32, 118, 80, 14),
    pbox("button", "control", false, 3, 150, 108, 32, 32, 16),
    pbox("svg", "media", true, 4, 154, 112, 24, 24),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true });
  assert.equal((svg.match(/data-wire="cross"/g) ?? []).length, 2);
});

test("a small rounded painted box that holds text is a label, not a photo", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("a", "control", false, 1, 10, 100, 180, 214),
    pbox("div", "structure", true, 2, 20, 110, 100, 26, 13),
    pbox("div", "text", false, 3, 30, 116, 80, 14),
  ];
  const svg = renderSvg([{ label: "a", layout: layout(1000, boxes) }], { flat: true });
  assert.equal((svg.match(/data-wire="cross"/g) ?? []).length, 0);
});

test("each measurement line has a cap at both ends, across the line", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }]);
  const caps = [...svg.matchAll(/data-cap="[^"]*" d="M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)"/g)];
  assert.equal(caps.length, 4);
  const lengths = caps.map((m) => Math.hypot(m[3] - m[1], m[4] - m[2]));
  assert.ok(lengths.every((l) => l > 4));
});

test("a measurement line sits level with the foot of the slab, so its caps line up with the slab's corner", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }]);
  const num = (text) => text.split(/[ ,]+/).map(Number);
  const feet = [...svg.matchAll(/data-face="viewport-side" points="([^"]+)"/g)].flatMap((m) =>
    m[1].split(" ").map(num),
  );
  const corner = feet.reduce((a, b) => (b[1] > a[1] ? b : a));
  const caps = [...svg.matchAll(/data-cap="[^"]*" d="M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)"/g)];
  // The width line's far cap: the lowest of its two.
  const mids = caps.slice(0, 2).map((m) => [(+m[1] + +m[3]) / 2, (+m[2] + +m[4]) / 2]);
  const far = mids.reduce((a, b) => (b[1] > a[1] ? b : a));
  // Moving 50px along the page's height is a step of 30 degrees on screen.
  const ratio = (far[0] - corner[0]) / (far[1] - corner[1]);
  assert.ok(Math.abs(ratio + Math.sqrt(3)) < 0.02, `ratio ${ratio}`);
});

test("a capture has no title by default, and a width title when asked", () => {
  const draw = (options) =>
    renderSvg(
      [{ label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) }],
      options,
    );
  assert.ok(!/font-weight="700"/.test(draw({})));
  assert.ok(/font-weight="700"[^>]*>1440</.test(draw({ titles: true })));
});

test("each measurement's text runs along its line", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }]);
  const angles = [
    ...svg.matchAll(/<text[^>]*transform="rotate\((-?[\d.]+) [^"]*"[^>]*>\d+ px</g),
  ].map((m) => Number(m[1]));
  assert.equal(angles.length, 2);
  assert.ok(Math.abs(angles[0] - 30) < 0.5);
  assert.ok(Math.abs(angles[1] + 30) < 0.5);
});

test("the paper palette uses the paper background and no transparency", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }], {
    palette: "paper",
  });
  assert.ok(svg.includes("#F5F3EE"));
  assert.equal(svg.includes("opacity"), false);
});

const turned = (quarters) =>
  rotateLayout(
    layout(1000, [
      {
        ...kbox("main", "structure", 0, 0, 0, 1000, 800),
        cut: { l: true, t: false, r: false, b: false },
      },
      kbox("div", "structure", 1, 100, 50, 200, 100),
    ]),
    quarters,
  );

test("a quarter turn swaps the page's sides and moves its boxes with it", () => {
  const r = turned(1);
  assert.deepEqual(r.root, { w: 800, h: 1000 });
  const [main, div] = r.boxes;
  assert.deepEqual([div.x, div.y, div.w, div.h], [650, 100, 100, 200]);
  assert.deepEqual([main.x, main.y, main.w, main.h], [0, 0, 800, 1000]);
  assert.deepEqual(main.cut, { l: false, t: true, r: false, b: false });
});

test("a half turn and a three-quarter turn", () => {
  const half = turned(2).boxes[1];
  assert.deepEqual([half.x, half.y, half.w, half.h], [700, 650, 200, 100]);
  const three = turned(3);
  assert.deepEqual(three.root, { w: 800, h: 1000 });
  const box3 = three.boxes[1];
  assert.deepEqual([box3.x, box3.y, box3.w, box3.h], [50, 700, 100, 200]);
});

test("four quarter turns come back to where they started", () => {
  const start = turned(0);
  assert.deepEqual(turned(4), start);
  assert.deepEqual(turned(-1), turned(3));
});

test("the view can be turned in four directions", () => {
  const wide = layout(1000, [box("main", 0, 0, 0, 1000, 800), box("div", 1, 50, 50, 300, 100)]);
  const draw = (rotate) => renderSvg([{ label: "a", layout: wide }], { rotate });
  assert.equal(draw(0), draw(360));
  assert.notEqual(draw(0), draw(90));
  assert.equal(draw(0), draw(undefined));
  assert.ok(draw(180) !== draw(0));
  assert.throws(() => draw(45), /rotate/);
});

const liftable = (radius = 0) => [
  kbox("main", "structure", 0, 0, 0, 1000, 800),
  kbox("section", "structure", 1, 100, 100, 230, 110, radius),
  kbox("p", "text", 2, 120, 120, 100, 30),
  kbox("aside", "structure", 1, 600, 400, 200, 100),
];
const lifted = (options = {}, boxes = liftable()) =>
  renderSvg([{ label: "a", layout: layout(1000, boxes) }], {
    flat: true,
    merge: false,
    lift: { tag: "section" },
    ...options,
  });
const sideCount = (svg) => (svg.match(/data-face="side"/g) ?? []).length;
const maxSidePoints = (svg) =>
  Math.max(
    0,
    ...[...svg.matchAll(/data-face="side" points="([^"]+)"/g)].map((m) => m[1].split(" ").length),
  );

test("a lifted element floats: it gets a slab where flat captures have none", () => {
  const plain = renderSvg([{ label: "a", layout: layout(1000, liftable()) }], {
    flat: true,
    merge: false,
  });
  assert.equal(sideCount(plain), 0);
  assert.ok(sideCount(lifted()) > 0);
});

test("what a lifted element holds is lifted with it, and nothing else", () => {
  assert.equal((lifted().match(/data-lifted="true"/g) ?? []).length, 2);
});

test("a lifted element is chosen by tag or by index", () => {
  const byIndex = lifted({ lift: { index: [3] } });
  assert.equal((byIndex.match(/data-lifted="true"/g) ?? []).length, 1);
  assert.ok(byIndex.includes(">200 px<"));
});

test("a lifted element is measured across and up, at the height it floats", () => {
  const svg = lifted();
  assert.ok(svg.includes(">230 px<"));
  assert.ok(svg.includes(">110 px<"));
  assert.equal((svg.match(/data-cap=/g) ?? []).length, 8);
});

test("the place a lifted element left is outlined on the ground", () => {
  assert.equal((lifted().match(/data-lift="footprint"/g) ?? []).length, 1);
});

test("a rounded element has rounded sides when lifted, a sharp one has sharp edges", () => {
  assert.ok(maxSidePoints(lifted({}, liftable(24))) > maxSidePoints(lifted()) + 8);
  assert.ok(maxSidePoints(lifted()) <= 8);
});

test("lifting nothing is an error, not a silent no-op", () => {
  assert.throws(() => lifted({ lift: { tag: "footer" } }), /lift/);
});

test("without lift the picture is unchanged", () => {
  const draw = (options) =>
    renderSvg([{ label: "a", layout: layout(1000, liftable()) }], { flat: true, ...options });
  assert.equal(draw({}), draw({ lift: undefined }));
});

test("a lifted slab is a solid body, in its own tone, never see-through", () => {
  for (const palette of ["ink", "paper"]) {
    const svg = lifted({ palette });
    const group = svg.match(/<g[^>]*data-lifted="true"[^>]*>[\s\S]*?<\/g>/)[0];
    const fills = [...group.matchAll(/data-face="(top|side)"[^>]*fill="(#[0-9A-Fa-f]{6})"/g)];
    assert.ok(fills.length >= 2);
    const background = svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/)[1];
    for (const [, , fill] of fills) assert.notEqual(fill, background);
    assert.equal(svg.includes("opacity"), false);
  }
});

test("what a lifted element holds lies on its top face: only the chosen one gets a body", () => {
  const withChild = lifted();
  const withoutChild = lifted(
    {},
    liftable().filter((b) => b.tag !== "p"),
  );
  assert.equal(sideCount(withChild), sideCount(withoutChild));
  assert.equal((withChild.match(/data-lifted="true"/g) ?? []).length, 2);
});

const one = [{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }];

test("the default brand gives the brand file's colors on both backgrounds", () => {
  const ink = resolvePalette("ink");
  assert.equal(ink.background, "#0E1116");
  assert.equal(ink.highlight, "#8C95FF");
  assert.equal(ink.label, "#8A8F9A");
  const paper = resolvePalette("paper");
  assert.equal(paper.background, "#F5F3EE");
  assert.equal(paper.highlight, "#4F5BFF");
  assert.equal(paper.label, "#5B616C");
});

test("the brand colors are passed in from outside, and the other tones follow them", () => {
  const brand = { ink: "#102030", paper: "#EEF2F6" };
  const ink = resolvePalette("ink", { brand });
  assert.equal(ink.background, "#102030");
  const paper = resolvePalette("paper", { brand });
  assert.equal(paper.background, "#EEF2F6");
  const svg = renderSvg(one, { brand });
  assert.ok(svg.includes("#102030"));
  assert.equal(svg.includes("#0E1116"), false);
  // Derived tones lie between the two backgrounds, nearer the surface.
  const channel = (hex, i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  for (const tone of ["slab", "grid", "line"])
    assert.ok(channel(ink[tone], 0) >= 0x10 && channel(ink[tone], 0) <= 0xee, tone);
});

test("the accent colors come from the brand", () => {
  const brand = { accent: "#FF0000", "accent-light": "#00FF00" };
  assert.equal(resolvePalette("paper", { brand }).highlight, "#FF0000");
  assert.equal(resolvePalette("ink", { brand }).highlight, "#00FF00");
  assert.equal(resolvePalette("ink", { brand })["accent-light"], undefined);
});

test("a single tone can still be set outright", () => {
  const palette = resolvePalette("paper", { colors: { line: "#123456" } });
  assert.equal(palette.line, "#123456");
  assert.equal(palette.background, "#F5F3EE");
  assert.ok(renderSvg(one, { palette: "paper", colors: { line: "#123456" } }).includes("#123456"));
});

test("a color must be a hex color and a brand key must be one the tool uses", () => {
  assert.throws(() => resolvePalette("ink", { brand: { ink: "blue" } }), /color/);
  assert.throws(() => resolvePalette("ink", { colors: { line: "rgb(0,0,0)" } }), /color/);
  assert.throws(() => resolvePalette("ink", { brand: { teal: "#00AAAA" } }), /teal/);
  assert.throws(() => resolvePalette("ink", { colors: { teal: "#00AAAA" } }), /teal/);
  assert.throws(() => resolvePalette("sepia"), /palette/);
});

test("three-digit hex colors are accepted", () => {
  assert.equal(resolvePalette("ink", { brand: { ink: "#123" } }).background, "#112233");
});

const brandFile = new URL("../../brand.json", import.meta.url);

test("brand.json holds exactly the brand colors the tool uses, all valid", () => {
  const brand = JSON.parse(readFileSync(brandFile, "utf8"));
  assert.deepEqual(Object.keys(brand).sort(), Object.keys(DEFAULT_BRAND).sort());
  for (const mode of ["ink", "paper"]) resolvePalette(mode, { brand });
});

test("the renderer reads brand/brand.json unless told otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "blueprint-"));
  const capture = join(dir, "layout.json");
  writeFileSync(capture, JSON.stringify(layout(1000, [box("main", 0, 0, 0, 1000, 800)])));
  const render = new URL("../render.mjs", import.meta.url).pathname;
  const run = (...args) => execFileSync("node", [render, capture, ...args], { encoding: "utf8" });
  assert.equal(run(), run("--brand", brandFile.pathname));
  const other = join(dir, "other.json");
  writeFileSync(other, JSON.stringify({ ink: "#123456" }));
  assert.ok(run("--brand", other).includes("#123456"));
  assert.equal(run().includes("#123456"), false);
});

test("a lifted element is drawn in the accent color, with paper lines on it", () => {
  for (const mode of ["ink", "paper"]) {
    const palette = resolvePalette(mode);
    assert.equal(palette.lifted, "#4F5BFF");
    assert.equal(palette.liftedLine, "#F5F3EE");
    assert.notEqual(palette.liftedSide, palette.lifted);
  }
  const svg = lifted({ palette: "paper" });
  const group = svg.match(/<g[^>]*data-lifted="true"[^>]*>[\s\S]*?<\/g>/)[0];
  assert.ok(group.includes('fill="#4F5BFF"'));
  assert.ok(group.includes('stroke="#F5F3EE"'));
  assert.equal(group.includes("#B0AFAD"), false);
});

test("the lifted color follows the brand's accent", () => {
  const brand = { accent: "#E4572E", paper: "#FFF8F0" };
  const palette = resolvePalette("paper", { brand });
  assert.equal(palette.lifted, "#E4572E");
  assert.equal(palette.liftedLine, "#FFF8F0");
  assert.ok(lifted({ palette: "paper", brand }).includes('fill="#E4572E"'));
});

test("the page's own measurements can be turned off, the lifted element's stay", () => {
  const draw = (options) =>
    renderSvg([{ label: "a", layout: layout(1000, liftable()) }], {
      flat: true,
      merge: false,
      ...options,
    });
  const caps = (svg) => (svg.match(/data-cap=/g) ?? []).length;
  assert.equal(caps(draw({})), 4);
  assert.equal(caps(draw({ measure: false })), 0);
  assert.equal(draw({ measure: false }).includes("1000 px"), false);
  const withLift = draw({ measure: false, lift: { tag: "section" } });
  assert.equal(caps(withLift), 4);
  assert.ok(withLift.includes(">230 px<"));
  assert.equal(withLift.includes(">1000 px<"), false);
});

test("the footprint and its legs are drawn under every lifted body, never over it", () => {
  for (const flat of [true, false]) {
    const svg = lifted({ flat });
    const footprint = svg.indexOf('data-lift="footprint"');
    const firstLifted = svg.indexOf('data-lifted="true"');
    const lastLifted = svg.lastIndexOf('data-lifted="true"');
    assert.ok(footprint !== -1 && firstLifted !== -1);
    assert.ok(footprint < firstLifted, `flat ${flat}: footprint after the first lifted body`);
    assert.ok(footprint < lastLifted);
  }
  // A page box with a large area still sits under the footprint, which sits under the lift.
  const svg = lifted();
  assert.ok(svg.lastIndexOf('data-face="top"', svg.indexOf('data-lift="footprint"')) !== -1);
});

test("a narrow bar above a much wider band is not merged into it", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", true, 1, 100, 100, 600, 66, 33),
    pbox("div", "structure", true, 1, 0, 176, 1000, 85),
  ];
  const draw = (merge) => renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge });
  assert.equal(tops(draw(true)), tops(draw(false)));
});

test("a pill beside a much taller box is not merged into it", () => {
  const boxes = [
    pbox("main", "structure", true, 0, 0, 0, 1000, 800),
    pbox("div", "structure", true, 1, 100, 100, 300, 40, 20),
    pbox("div", "structure", true, 1, 410, 60, 300, 120),
  ];
  const draw = (merge) => renderSvg([{ label: "a", layout: layout(1000, boxes) }], { merge });
  assert.equal(tops(draw(true)), tops(draw(false)));
});
