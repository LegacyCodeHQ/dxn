import { describe, expect, it } from "vitest";
import { duplicates } from "../src/duplicates.js";

// A stored record, recorded by an actor at a time, of a node whose
// fingerprint was this; with its keys first or last.
const entry = (actor: string, at: string, fingerprint: string, keys: "first" | "last" = "first") =>
  keys === "first"
    ? `{ "context": { "type": "Card", "states": {} }, "actor": "${actor}", "at": "${at}", "source": { "file": "a.pen", "frame": "f", "fingerprint": "${fingerprint}" } }`
    : `{ "source": { "fingerprint": "${fingerprint}", "frame": "f", "file": "a.pen" }, "at": "${at}", "actor": "${actor}", "context": { "states": {}, "type": "Card" } }`;

describe("duplicate stored records", () => {
  it("are those the same in everything but their fingerprints, in one file or across files", () => {
    const at = "2026-01-01T00:00:00Z";
    const stored = [
      {
        record: "Evidence",
        shown: "evidence/a.json",
        source: `[\n  ${entry("designer", at, "one")},\n  ${entry("reviewer", at, "one")},\n  ${entry("designer", at, "two")},\n  ${entry("designer", "2026-02-01T00:00:00Z", "one")}\n]\n`,
      },
      {
        record: "Evidence",
        shown: "evidence/b.json",
        // The same as a.json's second, with its keys in another order.
        source: `[\n  ${entry("reviewer", at, "three", "last")}\n]\n`,
      },
    ];
    expect(duplicates(stored)).toMatchInlineSnapshot(`
      [
        {
          "column": 3,
          "line": 4,
          "message": "the same \`Evidence\` as $[0] in evidence/a.json, apart from their fingerprints",
          "path": "$[2]",
          "shown": "evidence/a.json",
        },
        {
          "column": 3,
          "line": 2,
          "message": "the same \`Evidence\` as $[1] in evidence/a.json, apart from their fingerprints",
          "path": "$[0]",
          "shown": "evidence/b.json",
        },
      ]
    `);
  });

  it("are only of one record: another record's same data is not one", () => {
    const source = `[\n  ${entry("designer", "2026-01-01T00:00:00Z", "one")}\n]\n`;
    expect(
      duplicates([
        { record: "Evidence", shown: "evidence/a.json", source },
        { record: "Review", shown: "review/a.json", source },
      ]),
    ).toEqual([]);
  });
});
