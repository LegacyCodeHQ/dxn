import { documentationReferences } from "@language/editor/documentation-references.js";
import { renameAt, renameable } from "@language/editor/rename-at.js";
import { parse } from "@language/syntax/parse.js";
import * as syntax from "@language/syntax/read.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

const source =
  "## @value off First.\n## @value off Duplicate.\nenum Mode = off | on\ntype Button { state mode: Mode = off }\n";

describe("documentation reference index reuse", () => {
  it("reads the original syntax once across repeated prepare and rename lookups", () => {
    const file = parse(source);
    const read = vi.spyOn(syntax, "read");
    for (const [line, column] of [
      [1, 11],
      [2, 11],
      [3, 13],
    ] as const) {
      const prepared = renameable(source, line, column, file);
      if ("refusal" in prepared) throw new Error(prepared.refusal);
      const renamed = renameAt(source, line, column, "inactive", [], file);
      if ("refusal" in renamed) throw new Error(renamed.refusal);
    }
    // Proposed renamed sources still need their own validation. Only the
    // unchanged original source should reuse its documentation index.
    expect(read.mock.calls.filter(([text]) => text === source)).toHaveLength(1);
  });

  it("refreshes target ranges if the source changes with the same parsed-result identity", () => {
    const file = parse(source);
    documentationReferences(source, file);
    const edited = source.replace("## @value", "##   @value");
    const read = vi.spyOn(syntax, "read");
    const references = documentationReferences(edited, file);
    expect({
      reads: read.mock.calls.length,
      columns: references.map(({ from }) => from.column),
    }).toMatchInlineSnapshot(`
      {
        "columns": [
          13,
          11,
        ],
        "reads": 1,
      }
    `);
  });

  it("binds references to the new declarations when the same source is parsed again", () => {
    const previous = parse(source);
    documentationReferences(source, previous);
    const current = parse(source);
    const references = documentationReferences(source, current);
    expect(references.every(({ to }) => to === current.enums[0]?.values[0])).toBe(true);
  });

  it("refreshes references after an unsaved edit changes the documented value", () => {
    documentationReferences(source, parse(source));
    const edited = source.replaceAll("off", "inactive");
    const file = parse(edited);
    const read = vi.spyOn(syntax, "read");
    const references = documentationReferences(edited, file);
    const prepared = renameable(edited, 1, 11, file);
    expect({
      reads: read.mock.calls.length,
      targets: references.map(({ to }) => to.name),
      prepared,
    }).toMatchInlineSnapshot(`
      {
        "prepared": {
          "from": {
            "column": 11,
            "length": 8,
            "line": 1,
          },
          "name": "inactive",
        },
        "reads": 1,
        "targets": [
          "inactive",
          "inactive",
        ],
      }
    `);
  });
});
