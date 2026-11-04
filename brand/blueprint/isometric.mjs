// Turns measured layout boxes into an isometric blueprint, as SVG text.
//
// A layout is the JSON that collect.js returns: the boxes of a page or of one
// element, each with a kind (what a customer sees there), a corner radius and a
// layer (how many visible boxes enclose it). Only boxes and measurements are
// drawn. A page's own text is never read or written.

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

// The brand's colors, named as they are in the brand file's variables. Pass
// your own in `brand` and every tone of the drawing follows them.
export const DEFAULT_BRAND = {
  ink: "#0E1116",
  paper: "#F5F3EE",
  accent: "#4F5BFF",
  "accent-light": "#8C95FF",
  slate: "#5B616C",
  "slate-on-ink": "#8A8F9A",
};

const TONES = [
  "background",
  "line",
  "slab",
  "grid",
  "label",
  "highlight",
  "lifted",
  "liftedSide",
  "liftedLine",
];

const parseColor = (value, name) => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value));
  if (!match) throw new Error(`color ${name} must be a hex color like #0E1116, got ${value}`);
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
};
const toHex = (rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
// Solid, pre-blended tones: overlapping strokes never make a third color, so a
// tone is the surface with a share of the other color mixed in, never a
// transparent layer.
const mix = (from, to, share) => toHex(from.map((c, i) => c + (to[i] - c) * share));

// The tones of the drawing on one background: ink or paper. Colors come from the
// brand; `colors` sets individual tones outright.
export function resolvePalette(mode = "ink", { brand = {}, colors = {} } = {}) {
  if (mode !== "ink" && mode !== "paper") throw new Error(`palette is ink or paper, got ${mode}`);
  for (const key of Object.keys(brand))
    if (!(key in DEFAULT_BRAND)) throw new Error(`${key} is not a brand color the tool uses`);
  for (const key of Object.keys(colors))
    if (!TONES.includes(key)) throw new Error(`${key} is not a tone of the drawing`);
  const all = { ...DEFAULT_BRAND, ...brand };
  const rgb = Object.fromEntries(
    Object.entries(all).map(([key, value]) => [key, parseColor(value, key)]),
  );
  const ink = mode === "ink";
  const surface = ink ? rgb.ink : rgb.paper;
  const other = ink ? rgb.paper : rgb.ink;
  const palette = {
    background: toHex(surface),
    line: mix(surface, other, ink ? 0.26 : 0.3),
    slab: mix(surface, other, ink ? 0.04 : 0.056),
    grid: mix(surface, other, 0.06),
    label: toHex(ink ? rgb["slate-on-ink"] : rgb.slate),
    highlight: toHex(ink ? rgb["accent-light"] : rgb.accent),
    // What is lifted is the accent: a solid body with paper lines on it.
    lifted: toHex(rgb.accent),
    liftedSide: mix(rgb.accent, rgb.ink, 0.3),
    liftedLine: toHex(rgb.paper),
  };
  for (const [key, value] of Object.entries(colors)) {
    parseColor(value, key);
    palette[key] = toHex(parseColor(value, key));
  }
  return palette;
}

// What a customer sees outranks what only holds it together.
const RANK = { structure: 0, text: 1, control: 2, media: 3 };
const DEFAULT_KEEP = ["media", "control", "text"];

export const project = (x, y, z) => ({ x: (x - y) * COS, y: (x + y) * SIN - z });

const round = (n) => Math.round(n * 100) / 100;
const SAME = 0.5;
const area = (b) => b.w * b.h;
const sameRect = (a, b) =>
  Math.abs(a.x - b.x) <= SAME &&
  Math.abs(a.y - b.y) <= SAME &&
  Math.abs(a.w - b.w) <= SAME &&
  Math.abs(a.h - b.h) <= SAME;
const encloses = (outer, inner) =>
  inner.x >= outer.x - SAME &&
  inner.y >= outer.y - SAME &&
  inner.x + inner.w <= outer.x + outer.w + SAME &&
  inner.y + inner.h <= outer.y + outer.h + SAME;

const FILL = 0.6;
const SIMILAR = 0.7;

const gapBetween = (a, b) => ({
  x: Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)),
  y: Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)),
});

const layered = (boxes) =>
  boxes.map((box) => ({
    ...box,
    layer: boxes.filter(
      (other) => other !== box && area(other) >= area(box) && encloses(other, box),
    ).length,
  }));

// The box that directly holds this one: the smallest enclosing box.
function parentOf(box, boxes) {
  let parent = -1;
  boxes.forEach((other, index) => {
    if (other === box || area(other) < area(box) || !encloses(other, box)) return;
    if (parent === -1 || area(other) < area(boxes[parent])) parent = index;
  });
  return parent;
}

// Siblings of one kind that sit next to each other and fill the space they span
// read as one thing: a list's rows, a bar's buttons, a block of text lines. Each
// such run becomes one group slab. Wrappers that merge fold away what only held
// things together; the images, controls and text inside them stay. Images never
// merge: each one is something a customer sees on its own.
function mergeSiblings(boxes, mergeGap) {
  const parents = boxes.map((box) => parentOf(box, boxes));
  const families = new Map();
  // A clickable card that holds an image is a card, not one of a bar's buttons.
  const holdsImage = (box) =>
    box.kind === "control" &&
    boxes.some((other) => other.kind === "media" && other !== box && encloses(box, other));
  boxes.forEach((box, index) => {
    if (box.kind === "media" || holdsImage(box)) return;
    const key = `${parents[index]}:${box.layer}:${box.kind}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(index);
  });

  const merged = [];
  for (const members of families.values()) {
    const root = new Map(members.map((i) => [i, i]));
    const find = (i) => (root.get(i) === i ? i : find(root.get(i)));
    for (const a of members) {
      for (const b of members) {
        if (a >= b) continue;
        const gap = gapBetween(boxes[a], boxes[b]);
        if (gap.x > mergeGap || gap.y > mergeGap) continue;
        // Rows stacked in a column are about as wide as one another, and buttons
        // side by side about as tall: a narrow bar is not a row of a wide band.
        const alike = (p, q) => Math.min(p, q) / Math.max(p, q) >= SIMILAR;
        const stacked = gap.x === 0 && gap.y > 0;
        const beside = gap.y === 0 && gap.x > 0;
        if (stacked && !alike(boxes[a].w, boxes[b].w)) continue;
        if (beside && !alike(boxes[a].h, boxes[b].h)) continue;
        root.set(find(a), find(b));
      }
    }
    const runs = new Map();
    for (const i of members) {
      const key = find(i);
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push(i);
    }
    for (const run of runs.values()) {
      if (run.length < 2) continue;
      const x0 = Math.min(...run.map((i) => boxes[i].x));
      const y0 = Math.min(...run.map((i) => boxes[i].y));
      const x1 = Math.max(...run.map((i) => boxes[i].x + boxes[i].w));
      const y1 = Math.max(...run.map((i) => boxes[i].y + boxes[i].h));
      const filled = run.reduce((sum, i) => sum + area(boxes[i]), 0);
      if (filled / ((x1 - x0) * (y1 - y0)) < FILL) continue;
      merged.push({
        run,
        box: {
          tag: "group",
          kind: boxes[run[0]].kind,
          x: x0,
          y: y0,
          w: x1 - x0,
          h: y1 - y0,
          radius: Math.max(...run.map((i) => boxes[i].radius)),
          cut: orCuts(run.map((i) => boxes[i].cut)),
          merged: run.length,
        },
      });
    }
  }
  if (merged.length === 0) return { boxes, changed: false };

  const gone = new Set();
  for (const { run } of merged) {
    for (const i of run) gone.add(i);
    boxes.forEach((box, index) => {
      if (box.kind !== "structure") return;
      if (run.some((m) => m !== index && encloses(boxes[m], box) && area(boxes[m]) > area(box)))
        gone.add(index);
    });
  }
  const next = [...boxes.filter((_, index) => !gone.has(index)), ...merged.map((m) => m.box)];
  return { boxes: layered(next), changed: true };
}

// Keeps only what is inside the viewport: each box is cut to the page's own
// rectangle, boxes wholly outside go, and a box remembers which sides were cut
// so those corners are drawn square.
export function clipLayout(layout) {
  const { w, h } = layout.root;
  const boxes = [];
  for (const box of layout.boxes) {
    const x0 = Math.max(0, box.x);
    const y0 = Math.max(0, box.y);
    const x1 = Math.min(w, box.x + box.w);
    const y1 = Math.min(h, box.y + box.h);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    boxes.push({
      ...box,
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      cut: {
        l: box.x < -SAME,
        t: box.y < -SAME,
        r: box.x + box.w > w + SAME,
        b: box.y + box.h > h + SAME,
      },
    });
  }
  return { ...layout, boxes };
}

// Turns a capture a quarter at a time, clockwise as seen on the page, so the
// view can face any of four directions. Every side of the page, and every cut
// side of a box, moves with it.
export function rotateLayout(layout, quarters) {
  const turns = ((quarters % 4) + 4) % 4;
  let result = layout;
  for (let i = 0; i < turns; i++) {
    const { w, h } = result.root;
    result = {
      ...result,
      root: { w: h, h: w },
      boxes: result.boxes.map((box) => {
        const next = { ...box, x: h - (box.y + box.h), y: box.x, w: box.h, h: box.w };
        if (box.cut) next.cut = { l: box.cut.b, t: box.cut.l, r: box.cut.t, b: box.cut.r };
        return next;
      }),
    };
  }
  return result;
}

const orCuts = (cuts) => {
  const out = { l: false, t: false, r: false, b: false };
  for (const cut of cuts) for (const side of Object.keys(out)) out[side] ||= Boolean(cut?.[side]);
  return out;
};

// Collapses boxes that share a rectangle (a wrapper and its only child are one
// slab, and the more customer-facing of the two wins) and counts, for each box,
// how many others enclose it. Then thins the result: tiny boxes go, wrappers
// deeper than maxLayer fold into the box that holds them, and neighbours that
// read as one thing merge. The kinds in `keep` (images, controls and text by
// default) are never folded away by depth. Nothing else of a box is kept: a
// page's tags, kinds, sizes and radii, never its text.
export function normalise(layout, options = {}) {
  const {
    minSize = 0,
    maxLayer = Number.POSITIVE_INFINITY,
    merge = true,
    mergeGap = 16,
    keep = DEFAULT_KEEP,
    paint = true,
  } = options;
  const keepKinds = new Set(keep);
  const folds = (box) => !keepKinds.has(box.kind) && box.layer > maxLayer;

  // The page's outermost box has no rounded corners: they would fight the
  // viewport slab it lies on.
  const { w: rootW, h: rootH } = layout.root;
  const covers = (box) =>
    box.x <= SAME && box.y <= SAME && box.w >= rootW - SAME && box.h >= rootH - SAME;
  const kept = [];
  for (const box of layout.boxes) {
    const next = {
      tag: box.tag,
      kind: box.kind ?? "structure",
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      radius: covers(box) ? 0 : (box.radius ?? 0),
      cut: box.cut,
      painted: box.painted ?? true,
    };
    const index = kept.findIndex((other) => sameRect(other, next));
    if (index === -1) kept.push(next);
    else {
      const painted = kept[index].painted || next.painted;
      if (RANK[next.kind] > RANK[kept[index].kind])
        kept[index] = { ...next, radius: Math.max(kept[index].radius, next.radius), painted };
      else
        Object.assign(kept[index], { radius: Math.max(kept[index].radius, next.radius), painted });
    }
  }
  // A rounded painted box inside a link is a photo even when the page drew it as
  // a background or a wrapper. A small one holding text or a control is a label;
  // a large one is a photo with a badge or a heart over it.
  const holds = (outer, inner) =>
    inner !== outer &&
    inner.x >= outer.x - SAME &&
    inner.y >= outer.y - SAME &&
    inner.x + inner.w <= outer.x + outer.w + SAME &&
    inner.y + inner.h <= outer.y + outer.h + SAME;
  for (const box of kept) {
    if (box.kind !== "structure" || !box.painted || box.radius < 8) continue;
    const inLink = kept.some((other) => other.kind === "control" && holds(other, box));
    const holdsContent = kept.some(
      (other) => (other.kind === "text" || other.kind === "control") && holds(box, other),
    );
    const large = box.w >= 96 && box.h >= 96;
    if (inLink && (large || !holdsContent)) box.kind = "media";
  }
  // Text is thin by nature: a line is wide enough to read at any height.
  const big = (box) =>
    box.w >= minSize && (box.kind === "text" ? box.h >= Math.min(minSize, 8) : box.h >= minSize);
  let sized = kept.filter(big);
  if (paint) {
    // Only what is painted is seen. An unpainted wrapper draws nothing, and an
    // unpainted control (a hit area) shows through what it holds.
    const inside = (a, b) =>
      b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
    const shown = sized.filter(
      (box) => box.painted || box.kind === "text" || box.kind === "media" || box.kind === "control",
    );
    sized = shown.filter(
      (box) =>
        box.painted ||
        box.kind !== "control" ||
        !shown.some(
          (other) =>
            other !== box &&
            (other.kind === "text" || other.kind === "media") &&
            inside(box, other),
        ),
    );
  }
  let boxes = layered(sized);
  boxes = layered(boxes.filter((box) => !folds(box)));
  if (merge) {
    for (let pass = 0; pass < 4; pass++) {
      const result = mergeSiblings(boxes, mergeGap);
      boxes = result.boxes;
      if (!result.changed) break;
    }
  }
  return { ...layout, boxes: boxes.filter((box) => !folds(box)) };
}

const escapeText = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const points = (list) => list.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");

const SEGMENTS = 6;

// Sorts before every box: the slab, its grid and its dimensions are drawn first.
const UNDER = -1e12;

// The outline of a box on the ground plane, clockwise, with rounded corners.
// A corner on a side the viewport cut off is square.
function outline(box) {
  const r = Math.min(box.radius || 0, box.w / 2, box.h / 2);
  const cut = box.cut || {};
  const radii = [
    cut.l || cut.t ? 0 : r,
    cut.r || cut.t ? 0 : r,
    cut.r || cut.b ? 0 : r,
    cut.l || cut.b ? 0 : r,
  ];
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const corners = [
    [box.x, box.y, 180, 1, 1],
    [right, box.y, 270, -1, 1],
    [right, bottom, 0, -1, -1],
    [box.x, bottom, 90, 1, -1],
  ];
  const list = [];
  corners.forEach(([x, y, start, sx, sy], i) => {
    const radius = radii[i];
    if (!(radius >= 1)) {
      list.push([x, y]);
      return;
    }
    const cx = x + sx * radius;
    const cy = y + sy * radius;
    for (let k = 0; k <= SEGMENTS; k++) {
      const angle = ((start + (k * 90) / SEGMENTS) * Math.PI) / 180;
      list.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  });
  return list;
}

const TURN = 0.7;

// The runs of the outline that face the viewer (south and east), as ranges of
// segment indices. A run breaks where the outline turns sharply, so a square
// corner keeps its vertical edge and a rounded one stays one smooth face.
function visibleRuns(list) {
  const n = list.length;
  const runs = [];
  let current = null;
  let previous = null;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    const b = list[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const nx = dy / length;
    const ny = -dx / length;
    if (nx + ny <= 1e-6) {
      current = null;
      previous = null;
      continue;
    }
    const angle = Math.atan2(ny, nx);
    if (current && previous !== null && Math.abs(angle - previous) <= TURN) current.to = i;
    else {
      current = { from: i, to: i };
      runs.push(current);
    }
    previous = angle;
  }
  return runs;
}

// What a wireframe draws inside a box: a cross for an image, and a few short
// lines for text. `place` projects a point on the box's plane.
function wireMarks(box, place) {
  if (box.kind === "media") {
    // The cross ends where the diagonal meets a rounded corner, not past it.
    const r = Math.min(box.radius || 0, box.w / 2, box.h / 2);
    const d = r >= 1 ? r * (1 - Math.SQRT1_2) : 0;
    return {
      type: "cross",
      lines: [
        [place(box.x + d, box.y + d), place(box.x + box.w - d, box.y + box.h - d)],
        [place(box.x + box.w - d, box.y + d), place(box.x + d, box.y + box.h - d)],
      ],
    };
  }
  if (box.kind === "text") {
    const count = box.h < 30 ? 1 : box.h < 60 ? 2 : 3;
    const inset = Math.min(box.w * 0.08, 12);
    const lines = [];
    for (let i = 1; i <= count; i++) {
      const y = box.y + (box.h * i) / (count + 1);
      const last = i === count && count > 1;
      const right = last ? box.x + inset + (box.w - inset * 2) * 0.6 : box.x + box.w - inset;
      lines.push([place(box.x + inset, y), place(right, y)]);
    }
    return { type: "lines", lines };
  }
  return null;
}

// Lifted pieces draw after everything on the page.
const LIFTED = 1e9;

function matchesLift(box, index, lift) {
  if (lift.index !== undefined) return [lift.index].flat().includes(index);
  return lift.tag !== undefined && box.tag === lift.tag;
}

function matches(box, index, highlight) {
  if (!highlight) return false;
  if (highlight.index !== undefined) return highlight.index === index;
  return highlight.tag !== undefined && box.tag === highlight.tag;
}

export function renderSvg(layouts, options = {}) {
  const {
    palette = "ink",
    brand,
    colors: tones,
    layerHeight = 28,
    slab = 6,
    stackGap,
    minSize = 0,
    maxLayer = Number.POSITIVE_INFINITY,
    merge = true,
    mergeGap = 16,
    keep = DEFAULT_KEEP,
    paint = true,
    budget,
    show,
    overflow,
    viewportSlab = true,
    viewportThickness = 18,
    flat = false,
    rotate = 0,
    lift,
    liftHeight = 90,
    liftThickness = 14,
    titles = false,
    measure = true,
    wire = true,
    flatGap = 220,
    highlight,
    width = 1600,
  } = options;
  if (!Number.isInteger(rotate / 90)) throw new Error("rotate is a multiple of 90 degrees");
  const quarters = rotate / 90;
  const colors = resolvePalette(palette, { brand, colors: tones });
  // The slab is the visible part of the page: whatever runs past it is cut,
  // unless asked to bleed. Without a slab there is no edge to cut at.
  const overflowMode = overflow ?? (viewportSlab ? "clip" : "bleed");
  // A flat view lies on the ground: no height between layers, no thickness.
  const rise = flat ? 0 : layerHeight;
  const thickness = flat ? 0 : slab;

  const base = { minSize, merge, mergeGap, keep, paint };

  // With a budget, keep the deepest layers whose boxes still fit in it.
  const limitFor = (layout) => {
    if (budget === undefined) return maxLayer;
    const deepestLayer = Math.max(0, ...normalise(layout, base).boxes.map((box) => box.layer));
    let best = 1;
    for (let layer = 1; layer <= Math.min(deepestLayer, maxLayer); layer++) {
      if (normalise(layout, { ...base, maxLayer: layer }).boxes.length <= budget) best = layer;
    }
    return best;
  };

  // The box being highlighted stays even when its layer is folded away.
  const simplify = (source) => {
    const turned = rotateLayout(source, quarters);
    const layout = overflowMode === "clip" ? clipLayout(turned) : turned;
    const result = normalise(layout, { ...base, maxLayer: limitFor(layout) });
    if (highlight?.tag === undefined || result.boxes.some((box) => box.tag === highlight.tag))
      return result;
    const found = normalise(layout, { minSize, merge: false, keep, paint }).boxes.find(
      (box) => box.tag === highlight.tag,
    );
    return found ? { ...result, boxes: [...result.boxes, found] } : result;
  };

  const chosen = show
    ? layouts.filter(({ layout }) => show.includes(Math.round(layout.viewport.w)))
    : layouts;
  if (chosen.length === 0) {
    const captured = layouts
      .map(({ layout }) => Math.round(layout.viewport.w))
      .sort((a, b) => a - b)
      .join(", ");
    throw new Error(`No capture at ${show.join(", ")} px. Captured: ${captured}`);
  }

  const prepared = chosen
    .map(({ label, layout }) => ({ label, layout: simplify(layout) }))
    .sort((a, b) => b.layout.root.w - a.layout.root.w);
  const deepest = Math.max(
    0,
    ...prepared.flatMap(({ layout }) => layout.boxes.map((box) => box.layer)),
  );
  const gap = stackGap ?? layerHeight * (deepest + 1) + 220;
  let offsetX = 0;

  const shapes = [];
  const labels = [];
  const extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (p) => {
    extent.minX = Math.min(extent.minX, p.x);
    extent.maxX = Math.max(extent.maxX, p.x);
    extent.minY = Math.min(extent.minY, p.y);
    extent.maxY = Math.max(extent.maxY, p.y);
  };

  let highlighted = false;
  let liftedAny = false;
  prepared.forEach(({ label, layout }, layoutIndex) => {
    const baseZ = flat ? 0 : layoutIndex * gap;
    const { w, h } = layout.root;
    const ox = flat ? offsetX : 0;
    if (flat) offsetX += w + flatGap;
    const at = (x, y, z) => project(x + ox, y, z);

    // The viewport is a slab the page sits on: a top face and two sides.
    if (viewportSlab && viewportThickness > 0) {
      const ring = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
      const slabTop = ring.map(([x, y]) => at(x, y, baseZ));
      const slabSides = visibleRuns(ring).map(({ from, to }) => {
        const upper = [];
        for (let i = from; i <= to + 1; i++) upper.push(ring[i % ring.length]);
        return [
          ...upper.map(([x, y]) => at(x, y, baseZ)),
          ...upper.reverse().map(([x, y]) => at(x, y, baseZ - viewportThickness)),
        ];
      });
      [...slabTop, ...slabSides.flat()].forEach(grow);
      shapes.push({
        order: [layoutIndex, UNDER, 0],
        kind: "viewport",
        top: slabTop,
        sides: slabSides,
      });
    }

    const ground = [];
    for (let gx = 0; gx <= w; gx += 100) ground.push([at(gx, 0, baseZ), at(gx, h, baseZ)]);
    for (let gy = 0; gy <= h; gy += 100) ground.push([at(0, gy, baseZ), at(w, gy, baseZ)]);
    ground.forEach(([a, b]) => {
      grow(a);
      grow(b);
    });
    shapes.push({ order: [layoutIndex, UNDER, 1], kind: "ground", lines: ground });

    // A cap crosses the line at each end, the way a drawing marks where a
    // measurement starts and stops.
    const CAP = 14;
    // The lines run level with the foot of the slab, so the caps meet its corners.
    const footZ = viewportSlab ? baseZ - viewportThickness : baseZ;
    const dimensions = [
      {
        a: at(0, h + 50, footZ),
        b: at(w, h + 50, footZ),
        caps: [0, w].map((x) => [at(x, h + 50 - CAP, footZ), at(x, h + 50 + CAP, footZ)]),
        text: `${Math.round(w)} px`,
      },
      {
        a: at(w + 50, 0, footZ),
        b: at(w + 50, h, footZ),
        caps: [0, h].map((y) => [at(w + 50 - CAP, y, footZ), at(w + 50 + CAP, y, footZ)]),
        text: `${Math.round(h)} px`,
      },
    ];
    if (measure)
      dimensions.forEach((d) => {
        grow(d.a);
        grow(d.b);
        d.caps.flat().forEach(grow);
      });
    if (measure) shapes.push({ order: [layoutIndex, UNDER, 2], kind: "dimensions", dimensions });

    if (titles) {
      const tag = flat ? at(0, -70, baseZ) : at(w + 90, 0, baseZ);
      grow(tag);
      labels.push({ at: tag, text: label, size: 16, strong: true });
    }

    // Lifted elements: those chosen, and everything they hold. They float above
    // the page; each chosen one is measured and leaves its footprint behind.
    const chosenForLift = new Set(
      lift
        ? layout.boxes.flatMap((box, index) => (matchesLift(box, index, lift) ? [index] : []))
        : [],
    );
    const liftedBoxes = new Set(
      layout.boxes.flatMap((box, index) =>
        chosenForLift.has(index) || [...chosenForLift].some((c) => encloses(layout.boxes[c], box))
          ? [index]
          : [],
      ),
    );
    const leading = [...chosenForLift].filter(
      (index) =>
        ![...chosenForLift].some(
          (other) =>
            other !== index &&
            encloses(layout.boxes[other], layout.boxes[index]) &&
            (!encloses(layout.boxes[index], layout.boxes[other]) || other < index),
        ),
    );
    if (liftedBoxes.size > 0) liftedAny = true;

    for (const index of leading) {
      const box = layout.boxes[index];
      const z = baseZ + box.layer * rise;
      const floatZ = z + liftHeight;
      const footing = floatZ - liftThickness;
      const ground = outline(box).map(([x, y]) => at(x, y, z));
      const drops =
        box.radius < 1
          ? [
              [box.x, box.y],
              [box.x + box.w, box.y],
              [box.x + box.w, box.y + box.h],
              [box.x, box.y + box.h],
            ].map(([x, y]) => [at(x, y, z), at(x, y, footing)])
          : [];
      const gap = 30;
      const cap = 10;
      const dimensions = [
        {
          a: at(box.x, box.y + box.h + gap, footing),
          b: at(box.x + box.w, box.y + box.h + gap, footing),
          caps: [box.x, box.x + box.w].map((x) => [
            at(x, box.y + box.h + gap - cap, footing),
            at(x, box.y + box.h + gap + cap, footing),
          ]),
          text: `${Math.round(box.w)} px`,
        },
        {
          a: at(box.x + box.w + gap, box.y, footing),
          b: at(box.x + box.w + gap, box.y + box.h, footing),
          caps: [box.y, box.y + box.h].map((y) => [
            at(box.x + box.w + gap - cap, y, footing),
            at(box.x + box.w + gap + cap, y, footing),
          ]),
          text: `${Math.round(box.h)} px`,
        },
      ];
      [...ground, ...drops.flat()].forEach(grow);
      dimensions.forEach((d) => {
        grow(d.a);
        grow(d.b);
        d.caps.flat().forEach(grow);
      });
      shapes.push({
        // After the whole page, before every lifted body (their order is LIFTED minus an area).
        order: [layoutIndex, LIFTED - 1e8, index],
        kind: "footprint",
        ring: ground,
        drops,
      });
      shapes.push({ order: [layoutIndex, LIFTED + 1e9, index], kind: "dimensions", dimensions });
    }

    layout.boxes.forEach((box, index) => {
      const isLifted = liftedBoxes.has(index);
      const z = baseZ + box.layer * rise + (isLifted ? liftHeight : 0);
      const ring = outline(box);
      const top = ring.map(([x, y]) => at(x, y, z));
      // Only a chosen box is a body. What it holds lies on its top face.
      const sideDepth = leading.includes(index) ? liftThickness : thickness;
      const sides =
        sideDepth > 0
          ? visibleRuns(ring).map(({ from, to }) => {
              const upper = [];
              for (let i = from; i <= to + 1; i++) upper.push(ring[i % ring.length]);
              return [
                ...upper.map(([x, y]) => at(x, y, z)),
                ...upper.reverse().map(([x, y]) => at(x, y, z - sideDepth)),
              ];
            })
          : [];
      const marks = flat && wire ? wireMarks(box, (x, y) => at(x, y, z)) : null;
      [...top, ...sides.flat(), ...(marks ? marks.lines.flat() : [])].forEach(grow);
      const chosen = !highlighted && matches(box, index, highlight);
      if (chosen) highlighted = true;
      shapes.push({
        order: [layoutIndex, isLifted ? LIFTED - area(box) : flat ? -area(box) : z, box.x + box.y],
        kind: "box",
        top,
        sides,
        marks,
        control: flat && wire && box.kind === "control",
        highlight: chosen,
        merged: box.merged,
        lifted: isLifted,
      });
    });
  });
  if (lift && !liftedAny) throw new Error("lift matched no box in any capture");

  shapes.sort((a, b) => {
    for (let i = 0; i < 3; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
    return 0;
  });

  const padding = 120;
  const viewWidth = extent.maxX - extent.minX + padding * 2;
  const viewHeight = extent.maxY - extent.minY + padding * 2;
  const k = viewWidth / width;
  const stroke = round(1.25 * k);
  const accent = round(2.25 * k);
  const fontSize = round(11 * k);

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(viewHeight / k)}" viewBox="${round(extent.minX - padding)} ${round(extent.minY - padding)} ${round(viewWidth)} ${round(viewHeight)}" font-family="JetBrains Mono, monospace">`,
  );
  out.push(
    `<rect x="${round(extent.minX - padding)}" y="${round(extent.minY - padding)}" width="${round(viewWidth)}" height="${round(viewHeight)}" fill="${colors.background}"/>`,
  );

  for (const shape of shapes) {
    if (shape.kind === "viewport") {
      out.push('<g data-viewport="slab">');
      for (const side of shape.sides) {
        out.push(
          `<polygon data-face="viewport-side" points="${points(side)}" fill="${colors.slab}" stroke="${colors.line}" stroke-width="${stroke}" stroke-linejoin="round"/>`,
        );
      }
      out.push(
        `<polygon data-face="viewport-top" points="${points(shape.top)}" fill="${colors.background}" stroke="${colors.line}" stroke-width="${stroke}" stroke-linejoin="round"/>`,
      );
      out.push("</g>");
    } else if (shape.kind === "ground") {
      const d = shape.lines
        .map(([a, b]) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`)
        .join("");
      out.push(`<path d="${d}" fill="none" stroke="${colors.grid}" stroke-width="${stroke}"/>`);
    } else if (shape.kind === "footprint") {
      const ring = `M${shape.ring.map((p) => `${round(p.x)} ${round(p.y)}`).join("L")}Z`;
      const legs = shape.drops
        .map(([a, b]) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`)
        .join("");
      out.push(
        `<path data-lift="footprint" d="${ring}${legs}" fill="none" stroke="${colors.label}" stroke-width="${stroke}" stroke-dasharray="${round(6 * k)} ${round(5 * k)}"/>`,
      );
    } else if (shape.kind === "dimensions") {
      for (const d of shape.dimensions) {
        const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
        // The text lies along its line, as the line lies on the ground.
        let angle = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        out.push(
          `<path d="M${round(d.a.x)} ${round(d.a.y)}L${round(d.b.x)} ${round(d.b.y)}" fill="none" stroke="${colors.label}" stroke-width="${stroke}"/>`,
        );
        for (const [p, q] of d.caps) {
          out.push(
            `<path data-cap="end" d="M${round(p.x)} ${round(p.y)}L${round(q.x)} ${round(q.y)}" fill="none" stroke="${colors.label}" stroke-width="${stroke}"/>`,
          );
        }
        out.push(
          `<text x="${round(mid.x)}" y="${round(mid.y + 22 * k)}" transform="rotate(${round(angle)} ${round(mid.x)} ${round(mid.y)})" font-size="${fontSize}" fill="${colors.label}" text-anchor="middle">${escapeText(d.text)}</text>`,
        );
      }
    } else {
      const stroke_ = shape.highlight
        ? colors.highlight
        : shape.lifted
          ? colors.liftedLine
          : colors.line;
      const width_ = shape.highlight ? accent : shape.control ? round(stroke * 1.6) : stroke;
      const attrs =
        (shape.highlight ? ' data-highlight="true"' : "") +
        (shape.merged ? ` data-merged="${shape.merged}"` : "") +
        (shape.lifted ? ' data-lifted="true"' : "");
      out.push(`<g${attrs}>`);
      for (const side of shape.sides) {
        out.push(
          `<polygon data-face="side" points="${points(side)}" fill="${shape.lifted ? colors.liftedSide : colors.background}" stroke="${stroke_}" stroke-width="${width_}" stroke-linejoin="round"/>`,
        );
      }
      out.push(
        `<polygon data-face="top" points="${points(shape.top)}" fill="${shape.lifted ? colors.lifted : colors.background}" stroke="${stroke_}" stroke-width="${width_}" stroke-linejoin="round"/>`,
      );
      if (shape.marks) {
        const d = shape.marks.lines
          .map(([a, b]) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`)
          .join("");
        out.push(
          `<path data-wire="${shape.marks.type}" d="${d}" fill="none" stroke="${colors.line}" stroke-width="${stroke}"/>`,
        );
      }
      out.push("</g>");
    }
  }

  for (const label of labels) {
    out.push(
      `<text x="${round(label.at.x)}" y="${round(label.at.y)}" font-size="${round(label.size * k)}" font-weight="700" fill="${colors.label}">${escapeText(label.text)}</text>`,
    );
  }
  out.push("</svg>");
  return out.join("\n");
}
