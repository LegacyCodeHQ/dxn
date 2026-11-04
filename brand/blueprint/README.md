# blueprint

A prototype that measures the layout of a web page, or of one element, and
draws it as an isometric blueprint: layers of flat slabs, dimension lines and
one highlighted element. The output is SVG, in dxn's ink and paper tones, for
use as a background.

Only boxes are drawn: a tag, a kind, a position, a size and a corner radius. The page's text, images and
attributes are never read, kept or written. An image or an inline SVG is one
slab: what is inside it, such as the shapes of a logo, is not measured.

## Three steps

1. **Measure** a page at one or more widths.
2. **Render** the measurements as an SVG.
3. **Place** the SVG where it is needed.

### 1. Measure

With Playwright (not a dependency of this repository):

```bash
npm i -D playwright && npx playwright install chromium
node brand/blueprint/capture.mjs https://example.com --selector main --widths 375,768,1440 --out out
```

That writes `out/layout-375.json`, `out/layout-768.json` and `out/layout-1440.json`.

Without it, paste `collect.js` into DevTools on the page:

```js
copy(JSON.stringify((/* contents of collect.js */)({ selector: "main", minSize: 24 })));
```

and save the clipboard as a `.json` file. Resize the window and repeat for each
breakpoint.

Capture options: `selector`, `minSize` (default 16 px), `maxLayers` (8) and
`maxBoxes` (300).

### 2. Render

```bash
node brand/blueprint/render.mjs out/layout-*.json --highlight main --min-size 28 --out blueprint.svg
node brand/blueprint/render.mjs out/layout-*.json --palette paper --out blueprint-paper.svg
```

Several captures stack as layers, the widest at the bottom, each labelled with
its width. Capture as many breakpoints as you like and choose which to draw with
`--only`:

```bash
node brand/blueprint/render.mjs out/layout-*.json --only 375,1440 --out blueprint.svg
```

Asking for a width that was not captured lists the widths that were. `--help` is any call without files.

### 3. Place

Drop the SVG into the design file or a page as a pattern-mode surface. It is a
pattern, so do not combine it with a marking.

## Flat: a wireframe in isometric

`--flat` lays the page on the ground instead of stacking it in layers: every box
sits at the same height with no thickness, so the result reads as the page's 2D
wireframe seen in isometric. Several captures sit side by side instead of one on
top of the other. Images get a cross, text gets a few lines, controls get a
heavier outline (`--no-wire` turns the marks off). Folding and merging still
apply, so `--max-layer` and `--budget` set how much detail the wireframe shows.

```bash
node brand/blueprint/render.mjs out/layout-*.json --flat --out wireframe.svg
```

## The viewport slab

Each capture's viewport is drawn as a slab: a top face with the page's grid on
it, and a visible thickness under it. In the stacked view the layers rise from
it; in the flat view the wireframe lies on it. `--slab-thickness` sets the
thickness and `--no-slab` draws a plain plane instead.

## Bleed or clip

Boxes that run past the viewport, like a carousel's cards, can be drawn two ways:

- **`--overflow bleed`** draws them whole, running off the page. It is the default only with `--no-slab`.
- **`--overflow clip`** (default with the viewport slab, which is always the visible part) draws only the part inside the viewport. Boxes wholly
  outside go, and a box that was cut has square corners on the cut side.

## Kinds, and rounded corners

Each box is tagged with what a customer sees there, never what it says:

| Kind        | What it is                                                           |
| ----------- | -------------------------------------------------------------------- |
| `media`     | an image, video, canvas or graphic, or a box with a background image |
| `control`   | a button, link, input, select or text area                           |
| `text`      | a heading, a paragraph, or any box that holds only text              |
| `structure` | everything else: wrappers, rows and columns                          |

Corner radius is measured too, so pills, cards and round buttons draw with
rounded outlines and smooth sides.

## Keeping it readable

A real page has far more boxes than a blueprint can hold. Two controls thin it
out without losing the shape of the page:

- **`--max-layer N`** keeps the first N layers. Boxes deeper than that are not
  dropped from the picture: they fold into the box that holds them, which stays.
- **Merging** (on by default, `--no-merge` to turn off). Boxes that are siblings,
  sit next to each other (within `--merge-gap`, 16 px) and fill the space they
  span together become one group slab. A list's rows become one block; a bar's
  buttons become one bar; lines of text become one block. Wrappers that merge
  fold away, but the images and text inside them stay. Images never merge.
- **`--budget N`** picks the layer limit for you: it keeps the deepest layers
  whose boxes, after merging, still fit in about N slabs per capture. A good way
  to get the same density at every breakpoint.
- **The highlighted box** (`--highlight`) is always kept, even if its layer is
  folded away.
- **`--min-size`** drops boxes narrower or shorter than a size before any of this.

Try `--budget 30 --min-size 24`.

## How it draws

- **Layers.** A box's layer is the number of other boxes that enclose it. A
  wrapper and its only child share a rectangle, so they become one slab.
- **Projection.** `x` runs right and down, `y` runs left and down, `z` runs up,
  at 30 degrees.
- **Tones.** Solid, pre-blended colors, never transparency: where strokes cross
  they cannot make a third color.
- **One highlight**, in Accent Light on ink and Accent on paper.

## Limits of the prototype

- It measures what is on screen: boxes inside a closed shadow root or a
  cross-origin frame are not seen.
- `capture.mjs` has not been run here, because Playwright is not installed. The
  same measuring code (`collect.js`) was run in a browser, and `render.mjs` and
  `isometric.mjs` are tested (`node --test brand/blueprint/test/`).
- Pages that are not yours: this draws structure only, but a recognizable page's
  layout can still be a recognizable thing. Prefer your own pages, documentation
  and sites whose owners agree, and leave out logos and text, as the tool does.

## Painted and unpainted boxes

`collect.js` marks each box `painted` when a customer sees the box itself: a
background, a border, a shadow or an image. The renderer draws only what is
painted. An unpainted wrapper is skipped. An unpainted control (a hit area) is
shown by the text or image it holds, and kept as a box only when it holds
nothing else. Text boxes only need to be as tall as `textHeight` (8px), so
small labels appear. `--no-paint` draws every box, as before. Layouts without
`painted` count as fully painted.

A capture also reports `unloadedImages`; `render.mjs` warns when it is above
zero, since those images measure as empty boxes.

## Titles and measurements

A capture has no title by default. `--titles` writes its width above it, which
helps tell several captures apart. The two measurement lines have a cap at each
end and run level with the foot of the viewport slab, so the caps meet the
slab's corners.

## Rotating

`--rotate 90|180|270` turns the page a quarter, half or three-quarter turn
clockwise, so the view can face any of four directions. The page's sides, its
boxes and the cut sides of clipped boxes turn with it, and the measurement
lines follow.

## Lifting

`--lift <tag>` or `--lift-index <n,...>` raises the chosen boxes, and every box
they hold, off the page (`--lift-height`, default 90). A lifted box gets a slab
with sides, even in a flat view. Its sides are rounded when its corners are and
sharp when they are not. Each chosen box is measured across and up at the height
it floats, with the same capped lines as the page, and its footprint stays on
the page as a dashed outline. Choosing nothing is an error.

A lifted slab is solid and drawn in the accent color: the top is the accent, its
sides a darker mix of the accent and the ink, and its lines (and the lines of what
it holds) are paper. It reads as a body floating over the page, not an outline.
It follows the brand's `accent` and `paper`.

## Brand colors

No color is fixed in the renderer. `DEFAULT_BRAND` holds the brand file's colors
under the names of its variables (`ink`, `paper`, `accent`, `accent-light`,
`slate`, `slate-on-ink`), and every tone of the drawing is made from
them: the line, slab and grid are the surface with a share of the other color
mixed in, so they stay solid. Change a brand color and the whole picture follows.

- `--brand file.json` reads colors from a file (default: `brand/brand.json`, beside the brand file) shaped like
  `{ "ink": "#0E1116", "accent": "#4F5BFF" }`. Any color left out keeps its default.
- `--color accent=#FF5A1F` sets one brand color, over the file.
- `--tone line=#445566` sets one tone of the drawing outright.
- From code: `renderSvg(layouts, { brand, colors })` and `resolvePalette(mode, { brand, colors })`.

Colors are `#RGB` or `#RRGGBB`. An unknown name or a color that is not hex is an error.

`--no-measure` leaves out the page's own width and height lines. A lifted
element keeps its measurements, so an image can say one thing: the size of the
part that was lifted.

## The 2d view

`--view 2d` (or `view: "2d"`) draws the page as it is on screen, seen from above,
instead of at the isometric angle. Boxes, rounded corners, marks and colors are the
same; the viewport is a plain rectangle, the grid and measurement lines lie along the
page's axes, and the text of a measurement is horizontal or vertical. There is no
height, so no slab sides and no footprint. A lifted element keeps its accent color and
its measurements, and sits on the page without a body. `--rotate` still turns the page
in quarter steps.
