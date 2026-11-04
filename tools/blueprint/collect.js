// Runs inside a page. Measures the boxes of a page, or of one element, and
// returns plain data: no text, no images, no attributes of the page.
//
// In DevTools:  copy(JSON.stringify((<paste this file>)({ selector: "main" })))
// With capture.mjs, Playwright runs it for you.
(options) => {
  const { selector = "body", minSize = 16, maxLayers = 8, maxBoxes = 300 } = options || {};
  // Media is one slab: its insides (a logo's shapes, say) are never measured.
  const leaves = new Set(["svg", "img", "picture", "canvas", "video", "iframe"]);
  const root = document.querySelector(selector);
  if (!root) throw new Error(`No element matches ${selector}`);

  const origin = root.getBoundingClientRect();
  const round = (n) => Math.round(n * 10) / 10;
  const boxes = [];

  const visit = (element, layer) => {
    if (boxes.length >= maxBoxes || layer > maxLayers) return;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible =
      rect.width >= minSize &&
      rect.height >= minSize &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0;
    if (visible) {
      boxes.push({
        tag: element.tagName.toLowerCase(),
        layer,
        x: round(rect.left - origin.left),
        y: round(rect.top - origin.top),
        w: round(rect.width),
        h: round(rect.height),
      });
    }
    if (leaves.has(element.tagName.toLowerCase())) return;
    for (const child of element.children) visit(child, visible ? layer + 1 : layer);
  };

  visit(root, 0);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    selector,
    root: { w: round(origin.width), h: round(origin.height) },
    boxes,
  };
};
