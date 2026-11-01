import { describe, expect, it } from "vitest";
import { duplicates } from "../src/duplicates.js";

const entry = (actor: string, at: string, keys: "first" | "last" = "first") =>
  keys === "first"
    ? `{ "context": { "type": "Card", "states": { "owner": "${actor}" } }, "actor": "${actor}", "at": "${at}" }`
    : `{ "at": "${at}", "actor": "${actor}", "context": { "states": { "owner": "${actor}" }, "type": "Card" } }`;

describe("duplicate stored records", () => {
  it("are those the same in everything but at and fingerprint, in one file or across files", () => {
    const stored = [
      {
        record: "Evidence",
        shown: "evidence/a.json",
        source: `[\n  ${entry("designer", "2026-01-01T00:00:00Z")},\n  ${entry("reviewer", "2026-01-01T00:00:00Z")},\n  ${entry("designer", "2026-02-01T00:00:00Z")}\n]\n`,
      },
      {
        record: "Evidence",
        shown: "evidence/b.json",
        // The same as a.json's second, with its keys in another order.
        source: `[\n  ${entry("reviewer", "2026-03-01T00:00:00Z", "last")}\n]\n`,
      },
    ];
    expect(duplicates(stored)).toMatchInlineSnapshot(`
      [
        {
          "column": 3,
          "line": 4,
          "message": "the same Evidence as $[0] in evidence/a.json, apart from at and fingerprint",
          "path": "$[2]",
          "shown": "evidence/a.json",
        },
        {
          "column": 3,
          "line": 2,
          "message": "the same Evidence as $[1] in evidence/a.json, apart from at and fingerprint",
          "path": "$[0]",
          "shown": "evidence/b.json",
        },
      ]
    `);
  });

  it("are only of one record: another record's same data is not one", () => {
    const source = `[\n  ${entry("designer", "2026-01-01T00:00:00Z")}\n]\n`;
    expect(
      duplicates([
        { record: "Evidence", shown: "evidence/a.json", source },
        { record: "Review", shown: "review/a.json", source },
      ]),
    ).toEqual([]);
  });
});
