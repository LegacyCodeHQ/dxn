# Brand

Everything that makes the dxn brand, in one place.

| Path           | What it is                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branding.pen` | The brand file: wordmark, palette, type, logomark, cutting-mat pattern, markings, IDE icons, launch images. Open it in pen.dev; it is encrypted, so read and change it only through the app or its MCP tools. |
| `brand.json`   | The brand colors the tools use, exported from the variables of `branding.pen`, under the same names.                                                                                                          |
| `blueprint/`   | Turns a measured web page into an isometric blueprint SVG, for backgrounds and promo material. See its README.                                                                                                |

## Changing the palette

1. Change the colors in `branding.pen` (the variables `ink`, `paper`, `accent`,
   `accent-light`, `slate`, `slate-on-ink`).
2. Export them to `brand.json`: ask Claude to "export the brand colors from
   branding.pen to brand/brand.json". The names stay as they are in the file.
3. Run `node --test brand/blueprint/test/`. It fails if `brand.json` holds a color
   the tool does not use or one that is not valid hex.

Every blueprint rendered afterwards uses the new colors; nothing is hardcoded in
the tool. Pass `--brand other.json` or `--color name=#hex` to render with different
colors for one picture.
