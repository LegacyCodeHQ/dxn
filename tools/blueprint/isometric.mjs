// Turns measured layout boxes into an isometric blueprint, as SVG text.
//
// A layout is the JSON that collect.js returns: the boxes of a page or of one
// element, each with a layer (how many visible boxes enclose it). Only boxes
// and measurements are drawn. A page's own text is never read or written.

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

// Solid, pre-blended tones: overlapping strokes never make a third color.
const PALETTES = {
  ink: {
    background: "#0E1116",
    line: "#4A4C4E",
    grid: "#1C1F23",
    label: "#8A8F9A",
    highlight: "#8C95FF",
  },
  paper: {
    background: "#F5F3EE",
    line: "#B0AFAD",
    grid: "#E7E5E1",
    label: "#5B616C",
    highlight: "#4F5BFF",
  },
};

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

// Siblings that sit next to each other and fill the space they span read as one
// thing: a list's rows, a bar's buttons. Each such run becomes one group slab,
// and whatever was inside its members is folded into it.
function mergeSiblings(boxes, mergeGap) {
  const parents = boxes.map((box) => parentOf(box, boxes));
  const families = new Map();
  boxes.forEach((box, index) => {
    const key = `${parents[index]}:${box.layer}`;
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
        if (gap.x <= mergeGap && gap.y <= mergeGap) root.set(find(a), find(b));
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
        box: { tag: "group", x: x0, y: y0, w: x1 - x0, h: y1 - y0, merged: run.length },
      });
    }
  }
  if (merged.length === 0) return { boxes, changed: false };

  const gone = new Set();
  for (const { run } of merged) {
    for (const i of run) gone.add(i);
    boxes.forEach((box, index) => {
      if (run.some((m) => m !== index && encloses(boxes[m], box) && area(boxes[m]) > area(box)))
        gone.add(index);
    });
  }
  const next = [...boxes.filter((_, index) => !gone.has(index)), ...merged.map((m) => m.box)];
  return { boxes: layered(next), changed: true };
}

// Collapses boxes that share a rectangle (a wrapper and its only child are one
// slab) and counts, for each box, how many others enclose it. Then thins the
// result: tiny boxes go, boxes deeper than maxLayer fold into the box that holds
// them, and neighbours that read as one thing merge. Nothing else of a box is
// kept: a page's tags and sizes, never its text.
export function normalise(layout, options = {}) {
  const { minSize = 0, maxLayer = Number.POSITIVE_INFINITY, merge = true, mergeGap = 16 } = options;
  const kept = [];
  for (const box of layout.boxes) {
    if (kept.some((other) => sameRect(other, box))) continue;
    kept.push({ tag: box.tag, x: box.x, y: box.y, w: box.w, h: box.h });
  }
  let boxes = layered(kept.filter((box) => box.w >= minSize && box.h >= minSize));
  boxes = layered(boxes.filter((box) => box.layer <= maxLayer));
  if (merge) {
    for (let pass = 0; pass < 4; pass++) {
      const result = mergeSiblings(boxes, mergeGap);
      boxes = result.boxes;
      if (!result.changed) break;
    }
  }
  return { ...layout, boxes: boxes.filter((box) => box.layer <= maxLayer) };
}
const escapeText = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const points = (list) => list.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");

function matches(box, index, highlight) {
  if (!highlight) return false;
  if (highlight.index !== undefined) return highlight.index === index;
  return highlight.tag !== undefined && box.tag === highlight.tag;
}

export function renderSvg(layouts, options = {}) {
  const {
    palette = "ink",
    layerHeight = 28,
    slab = 6,
    stackGap,
    minSize = 0,
    maxLayer = Number.POSITIVE_INFINITY,
    merge = true,
    mergeGap = 16,
    budget,
    show,
    highlight,
    width = 1600,
  } = options;
  const colors = PALETTES[palette];

  const base = { minSize, merge, mergeGap };

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
  const simplify = (layout) => {
    const result = normalise(layout, { ...base, maxLayer: limitFor(layout) });
    if (highlight?.tag === undefined || result.boxes.some((box) => box.tag === highlight.tag))
      return result;
    const found = normalise(layout, { minSize, merge: false }).boxes.find(
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
  prepared.forEach(({ label, layout }, layoutIndex) => {
    const baseZ = layoutIndex * gap;
    const { w, h } = layout.root;

    const ground = [];
    for (let gx = 0; gx <= w; gx += 100)
      ground.push([project(gx, 0, baseZ), project(gx, h, baseZ)]);
    for (let gy = 0; gy <= h; gy += 100)
      ground.push([project(0, gy, baseZ), project(w, gy, baseZ)]);
    ground.forEach(([a, b]) => {
      grow(a);
      grow(b);
    });
    shapes.push({ order: [layoutIndex, -1, 0], kind: "ground", lines: ground });

    const dimensions = [
      { a: project(0, h + 50, baseZ), b: project(w, h + 50, baseZ), text: `${Math.round(w)} px` },
      { a: project(w + 50, 0, baseZ), b: project(w + 50, h, baseZ), text: `${Math.round(h)} px` },
    ];
    dimensions.forEach((d) => {
      grow(d.a);
      grow(d.b);
    });
    shapes.push({ order: [layoutIndex, -1, 1], kind: "dimensions", dimensions });

    const tag = project(w + 90, 0, baseZ);
    grow(tag);
    labels.push({ at: tag, text: label, size: 16, strong: true });

    layout.boxes.forEach((box, index) => {
      const z = baseZ + box.layer * layerHeight;
      const top = [
        project(box.x, box.y, z),
        project(box.x + box.w, box.y, z),
        project(box.x + box.w, box.y + box.h, z),
        project(box.x, box.y + box.h, z),
      ];
      const left = [
        project(box.x, box.y + box.h, z),
        project(box.x + box.w, box.y + box.h, z),
        project(box.x + box.w, box.y + box.h, z - slab),
        project(box.x, box.y + box.h, z - slab),
      ];
      const right = [
        project(box.x + box.w, box.y, z),
        project(box.x + box.w, box.y + box.h, z),
        project(box.x + box.w, box.y + box.h, z - slab),
        project(box.x + box.w, box.y, z - slab),
      ];
      [...top, ...left, ...right].forEach(grow);
      const chosen = !highlighted && matches(box, index, highlight);
      if (chosen) highlighted = true;
      shapes.push({
        order: [layoutIndex, z, box.x + box.y],
        kind: "box",
        top,
        left,
        right,
        highlight: chosen,
        merged: box.merged,
      });
    });
  });

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
    if (shape.kind === "ground") {
      const d = shape.lines
        .map(([a, b]) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`)
        .join("");
      out.push(`<path d="${d}" fill="none" stroke="${colors.grid}" stroke-width="${stroke}"/>`);
    } else if (shape.kind === "dimensions") {
      for (const d of shape.dimensions) {
        const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
        out.push(
          `<path d="M${round(d.a.x)} ${round(d.a.y)}L${round(d.b.x)} ${round(d.b.y)}" fill="none" stroke="${colors.label}" stroke-width="${stroke}"/>`,
        );
        out.push(
          `<text x="${round(mid.x)}" y="${round(mid.y + 22 * k)}" font-size="${fontSize}" fill="${colors.label}" text-anchor="middle">${escapeText(d.text)}</text>`,
        );
      }
    } else {
      const stroke_ = shape.highlight ? colors.highlight : colors.line;
      const width_ = shape.highlight ? accent : stroke;
      const attrs =
        (shape.highlight ? ' data-highlight="true"' : "") +
        (shape.merged ? ` data-merged="${shape.merged}"` : "");
      out.push(`<g${attrs}>`);
      for (const [face, list] of [
        ["left", shape.left],
        ["right", shape.right],
        ["top", shape.top],
      ]) {
        out.push(
          `<polygon data-face="${face}" points="${points(list)}" fill="${colors.background}" stroke="${stroke_}" stroke-width="${width_}" stroke-linejoin="miter"/>`,
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
