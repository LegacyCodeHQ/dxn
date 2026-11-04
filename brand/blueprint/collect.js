// Runs inside a page. Measures the boxes of a page, or of one element, and
// returns plain data: a tag, a kind, a position, a size and a corner radius.
// No text, no images, no attributes of the page.
//
// A box's kind says what a customer sees there, never what it says:
//   media      an image, video, canvas or graphic, or a box with a background image
//   control    a button, link, input, select or text area
//   text       a heading, a paragraph or any box that holds only text
//   structure  everything else: wrappers, rows, columns
//
// A box is painted when it has a background, a border, a shadow or an image.
//
// In DevTools:  copy(JSON.stringify((<paste this file>)({ selector: "main" })))
// With capture.mjs, Playwright runs it for you.
(options) => {
  const {
    selector = "body",
    minSize = 16,
    textHeight = 8,
    maxLayers = 8,
    maxBoxes = 300,
  } = options || {};
  // Media is one slab: its insides (a logo's shapes, say) are never measured.
  const leaves = new Set(["svg", "img", "picture", "canvas", "video", "iframe"]);
  const controls = new Set(["button", "input", "select", "textarea", "summary"]);
  const textTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "label", "blockquote"]);
  const inline = new Set([
    "span",
    "b",
    "i",
    "em",
    "strong",
    "small",
    "br",
    "a",
    "u",
    "mark",
    "time",
  ]);
  const rank = { structure: 0, text: 1, control: 2, media: 3 };
  const root = document.querySelector(selector);
  if (!root) throw new Error(`No element matches ${selector}`);

  const origin = root.getBoundingClientRect();
  const round = (n) => Math.round(n * 10) / 10;
  const boxes = [];
  const byRect = new Map();

  const kindOf = (element, style) => {
    const tag = element.tagName.toLowerCase();
    if (leaves.has(tag) || (style.backgroundImage || "").includes("url(")) return "media";
    if (controls.has(tag) || (tag === "a" && element.hasAttribute("href"))) return "control";
    if (element.getAttribute("role") === "button") return "control";
    if (textTags.has(tag)) return "text";
    // A box holding only text, or text in inline wrappers, is a block of text.
    const holdsText = (element.textContent || "").trim().length > 0;
    const onlyInline = [...element.querySelectorAll("*")].every((child) =>
      inline.has(child.tagName.toLowerCase()),
    );
    return holdsText && onlyInline ? "text" : "structure";
  };

  const radiusOf = (style, rect) => {
    const side = Math.min(rect.width, rect.height);
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((value) => {
      const first = String(value).split(" ")[0];
      const n = Number.parseFloat(first);
      if (Number.isNaN(n)) return 0;
      return first.endsWith("%") ? (n / 100) * side : n;
    });
    return Math.min(side / 2, round(corners.reduce((a, b) => a + b, 0) / 4));
  };

  // Painted means a customer sees the box itself: a background, a border, a
  // shadow or an image. An unpainted box only holds things or catches clicks.
  const paintedOf = (element, style) => {
    if (leaves.has(element.tagName.toLowerCase())) return true;
    const background = String(style.backgroundColor).match(/rgba?\(([^)]+)\)/);
    const alpha = background ? Number(background[1].split(/[,/]/)[3] ?? 1) : 0;
    const border = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ].some((width) => Number.parseFloat(width) > 0 && style.borderStyle !== "none");
    return (
      alpha > 0.02 ||
      border ||
      (style.boxShadow || "none") !== "none" ||
      (style.backgroundImage || "none") !== "none"
    );
  };

  // Images that never loaded measure as empty boxes. The result says how many.
  const unloaded = [...root.querySelectorAll("img")].filter(
    (image) =>
      image.getBoundingClientRect().width > 0 && !(image.complete && image.naturalWidth > 0),
  ).length;

  const visit = (element, layer) => {
    if (boxes.length >= maxBoxes || layer > maxLayers) return;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const shown =
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    const kind = shown ? kindOf(element, style) : "structure";
    // A line of text is thin: it only has to be wide enough to read.
    const tall = kind === "text" ? Math.min(minSize, textHeight) : minSize;
    const visible = shown && rect.width >= minSize && rect.height >= tall;
    if (visible) {
      const box = {
        tag: element.tagName.toLowerCase(),
        kind,
        layer,
        x: round(rect.left - origin.left),
        y: round(rect.top - origin.top),
        w: round(rect.width),
        h: round(rect.height),
        radius: radiusOf(style, rect),
        painted: paintedOf(element, style),
      };
      const key = [box.x, box.y, box.w, box.h].map(Math.round).join(",");
      const seen = byRect.get(key);
      if (!seen) {
        byRect.set(key, box);
        boxes.push(box);
      } else if (rank[kind] > rank[seen.kind]) {
        Object.assign(seen, {
          tag: box.tag,
          kind,
          radius: Math.max(seen.radius, box.radius),
          painted: seen.painted || box.painted,
        });
      } else {
        seen.radius = Math.max(seen.radius, box.radius);
        seen.painted = seen.painted || box.painted;
      }
    }
    // A leaf that drew a box is one slab. One that did not (a picture is inline)
    // is searched for the image inside it.
    if (visible && leaves.has(element.tagName.toLowerCase())) return;
    for (const child of element.children) visit(child, visible ? layer + 1 : layer);
  };

  visit(root, 0);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    selector,
    root: { w: round(origin.width), h: round(origin.height) },
    unloadedImages: unloaded,
    boxes,
  };
};
