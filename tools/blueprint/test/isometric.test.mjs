import assert from "node:assert/strict";
import { test } from "node:test";
import { normalise, project, renderSvg } from "../isometric.mjs";

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
  const svg = renderSvg([
    { label: "375", layout: layout(375, [box("main", 0, 0, 0, 375, 800)]) },
    { label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) },
  ]);
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
  const svg = renderSvg([
    { label: "375", layout: layout(375, [box("main", 0, 0, 0, 375, 800)]) },
    { label: "1440", layout: layout(1440, [box("main", 0, 0, 0, 1440, 800)]) },
  ]);
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
  const svg = renderSvg(three(), { show: [375, 1440] });
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
  const two = renderSvg([three()[1], three()[2]], { flat: true });
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

test("by default boxes bleed past the edge of the viewport", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, overflowing()) }], { merge: false });
  assert.equal(tops(svg), 3);
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

test("the paper palette uses the paper background and no transparency", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }], {
    palette: "paper",
  });
  assert.ok(svg.includes("#F5F3EE"));
  assert.equal(svg.includes("opacity"), false);
});
