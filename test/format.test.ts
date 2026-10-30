import { describe, expect, it } from "vitest";
import { formatJson } from "../src/format.js";

describe("formatJson", () => {
  it("expands objects and keeps short arrays of values on one line, as Prettier does", () => {
    expect(
      formatJson({
        version: 1,
        values: ["base", "sm", "lg", "xl"],
        empty: {},
        none: [],
        nested: { flag: true, count: 2, label: null },
      }),
    ).toBe(
      [
        "{",
        '  "version": 1,',
        '  "values": ["base", "sm", "lg", "xl"],',
        '  "empty": {},',
        '  "none": [],',
        '  "nested": {',
        '    "flag": true,',
        '    "count": 2,',
        '    "label": null',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("expands arrays of objects and arrays that do not fit in 80 columns", () => {
    const long = Array.from({ length: 12 }, (_, index) => `value-${index}`);
    expect(formatJson({ children: [{ id: "a" }], long })).toBe(
      [
        "{",
        '  "children": [',
        "    {",
        '      "id": "a"',
        "    }",
        "  ],",
        '  "long": [',
        ...long.map((value, index) => `    "${value}"${index < long.length - 1 ? "," : ""}`),
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
  });

  // Checked against Prettier 3: the trailing comma counts toward the width.
  it("counts the indentation, key and trailing comma toward the 80 columns", () => {
    const snapshot: unknown[] = [];
    // Exactly 80 columns with the trailing comma: stays on one line.
    const fits = { values: ["a".repeat(29), "b".repeat(30)], next: 1 };
    snapshot.push(formatJson(fits).split("\n")[1]);
    // One more character: expands.
    const over = { values: ["a".repeat(30), "b".repeat(30)], next: 1 };
    snapshot.push(formatJson(over).split("\n")[1]);

    expect(snapshot).toMatchInlineSnapshot(`
  [
    "  "values": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],",
    "  "values": [",
  ]
`);
  });
});
