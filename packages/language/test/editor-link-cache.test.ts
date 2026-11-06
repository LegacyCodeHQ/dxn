import { definition, links, type Span, usages } from "@language/editor/definition.js";
import { hover } from "@language/editor/hover.js";
import { renameable } from "@language/editor/rename-at.js";
import { tokens } from "@language/editor/semantic.js";
import * as evaluation from "@language/evaluation/evaluate.js";
import { parse } from "@language/syntax/parse.js";
import * as scanner from "@language/syntax/scan.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

const source = `enum Mode = off | on
type Button { state mode: Mode }
expect "Off" {
  in Button
  some mode = off
}
`;
const column = (source.split("\n")[1]?.indexOf("Mode") ?? -1) + 1;

describe("shared editor link index", () => {
  it("resolves expectation placements once across definition, usages, hover, tokens and prepare-rename", () => {
    const file = parse(source);
    const placed = vi.spyOn(evaluation, "placement");
    links(source, file);
    const built = placed.mock.calls.length;
    if (built === 0) throw new Error("The fixture must exercise placement resolution");
    definition(source, 2, column, file);
    usages(source, 2, column, file);
    hover(source, 2, column, file);
    tokens(source, file);
    renameable(source, 2, column, file);
    expect(placed.mock.calls.length).toBe(built);
  });

  it("reuses an empty reference index as well", () => {
    const text = "enum Mode = off | on\n";
    const file = parse(text);
    const lines = vi.spyOn(scanner, "sourceLines");
    links(text, file);
    links(text, file);
    expect(lines.mock.calls.length).toBe(1);
  });

  it("rebuilds if source text changes while the parsed-result identity stays the same", () => {
    const file = parse(source);
    const lines = vi.spyOn(scanner, "sourceLines");
    links(source, file);
    links(source, file);
    links(source.replace('"Off"', '"Off mode"'), file);
    expect(lines.mock.calls.length).toBe(2);
  });

  it("binds a fresh parse to its own declaration objects", () => {
    const previous = parse(source);
    links(source, previous);
    const current = parse(source);
    expect(definition(source, 2, column, current)?.to).toBe(current.enums[0]);
  });

  it("refreshes names and ranges for a newly parsed unsaved version", () => {
    links(source, parse(source));
    const edited = source.replaceAll("Mode", "Status");
    const current = parse(edited);
    const found = definition(edited, 2, column, current);
    expect({ name: found?.to.name, from: found?.from }).toEqual({
      name: "Status",
      from: { line: 2, column, length: 6 },
    });
  });

  it.each(["definition", "usages", "hover", "prepareRename"])(
    "keeps a caller's mutation of a %s result out of the shared index",
    (operation) => {
      const file = parse(source);
      let span: Span | undefined;
      if (operation === "definition") span = definition(source, 2, column, file)?.from;
      if (operation === "usages") span = usages(source, 2, column, file)?.usages[0];
      if (operation === "hover") span = hover(source, 2, column, file)?.from;
      if (operation === "prepareRename") {
        const prepared = renameable(source, 2, column, file);
        if ("from" in prepared) span = prepared.from;
      }
      if (!span) throw new Error("The fixture must return a source span");
      span.column = 999;
      expect(definition(source, 2, column, file)?.from).toEqual({ line: 2, column, length: 4 });
    },
  );
});
