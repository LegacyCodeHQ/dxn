# Redesigned DXN syntax

This grammar supports the enum syntax in `lean/notes/enumerations.md` and agrees
with `packages/next/src/syntax/parse.ts`. It reads broad words so naming problems
remain checker errors. No external scanner is needed for the current construct.

Run `npm run generate` here after grammar edits, then `make grammar` at the root.
The native tests compare syntax acceptance with the core parser and compile all
Zed queries. Generated sources are committed. The isolated Zed development
extension is staged from these sources by `make zed-dev`.
