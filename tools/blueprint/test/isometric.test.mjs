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

test("the paper palette uses the paper background and no transparency", () => {
  const svg = renderSvg([{ label: "a", layout: layout(1000, [box("main", 0, 0, 0, 1000, 800)]) }], {
    palette: "paper",
  });
  assert.ok(svg.includes("#F5F3EE"));
  assert.equal(svg.includes("opacity"), false);
});
