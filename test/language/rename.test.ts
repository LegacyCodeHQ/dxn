import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { renameInData, renameInSource } from "../../src/language/rename.js";

const source = `# What can be hovered.
enum Hover = rest | hovered   # the pointer's
enum Other = hovered | idle
dimension Mode = hovered | quiet
type Wordmark needs Mode {
  state hover: Hover, other: Other
  hover = hovered only when Mode = hovered
  other = hovered only when Mode = quiet
}
record Entry {
  hover: Hover
  other: Other
  note: NonEmptyString
  inner: Inner
}
record Inner {
  hover: Hover
}
`;

describe("renaming an enum value", () => {
  it("renames it where the enum is declared and where a rule names it, and nowhere else", () => {
    expect(renameInSource(parse(source), source, "Hover", "hovered", "over")).toBe(
      source
        .replace("enum Hover = rest | hovered", "enum Hover = rest | over")
        .replace("hover = hovered only when", "hover = over only when"),
    );
  });

  it("renames it in stored records, only in fields of that enum, keeping the file as it was", () => {
    const data = `[
  { "hover": "hovered", "other": "hovered", "note": "hovered",
    "inner": { "hover": "hovered" } },
  { "hover": "rest", "other": "idle", "note": "x", "inner": { "hover": "rest" } }
]
`;
    expect(renameInData(parse(source), "Entry", data, "Hover", "hovered", "over")).toEqual({
      source: `[
  { "hover": "over", "other": "hovered", "note": "hovered",
    "inner": { "hover": "over" } },
  { "hover": "rest", "other": "idle", "note": "x", "inner": { "hover": "rest" } }
]
`,
      changed: 2,
    });
  });
});
