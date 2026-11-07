import { renameEnum } from "@next/refactor/rename.js";
import { describe, expect, it } from "vitest";

// Renaming an enumeration, as lean/Dxn/Rename.lean specifies, with the cases
// of lean/DxnTest/Rename.lean.

const source = "enum Light { off, on }\nenum Power { off, on }\n";

// What a rename says: the new text, or why it is refused.
const said = (text: string, from: string, to: string) => {
  const renamed = renameEnum(text, from, to);
  return (
    renamed.source ?? renamed.refusals.map((r) => ("name" in r ? `${r.kind} ${r.name}` : r.kind))
  );
};

describe("renaming an enumeration", () => {
  it("changes only the enumeration's name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(said(source, "Light", "Lamp"));
    snapshot.push(said("enum Light {\n  off,\n  on\n}\n", "Light", "Lamp"));
    snapshot.push(said(source, "Light", "Light"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "enum Lamp { off, on }
      enum Power { off, on }
      ",
        "enum Lamp {
        off,
        on
      }
      ",
        "enum Light { off, on }
      enum Power { off, on }
      ",
      ]
    `);
  });

  it("is one edit, at the enumeration's name, and none when the name stays", () => {
    const snapshot: unknown[] = [];
    snapshot.push(renameEnum(source, "Power", "Energy").edits);
    snapshot.push(renameEnum(source, "Light", "Light").edits);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "span": {
              "end": 33,
              "start": 28,
            },
            "text": "Energy",
          },
        ],
        [],
      ]
    `);
  });

  it("is refused, with every reason that applies", () => {
    const snapshot: unknown[] = [];
    snapshot.push(said("enum Light { }", "Light", "Lamp"));
    snapshot.push(said("enum Light { off, on, }", "Light", "Lamp"));
    snapshot.push(said(source, "Light", "lamp"));
    snapshot.push(said(source, "Bulb", "Lamp"));
    snapshot.push(said(source, "Light", "Power"));
    snapshot.push(said(source, "Bulb", "power"));
    snapshot.push(said(source, "Bulb", "Power"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "fileHasProblems",
        ],
        [
          "fileHasProblems",
        ],
        [
          "badEnumName lamp",
        ],
        [
          "noSuchEnum Bulb",
        ],
        [
          "nameExists Power",
        ],
        [
          "badEnumName power",
          "noSuchEnum Bulb",
        ],
        [
          "noSuchEnum Bulb",
          "nameExists Power",
        ],
      ]
    `);
  });

  it("says why a file with problems is refused, and where the new name is taken", () => {
    const snapshot: unknown[] = [];
    snapshot.push(renameEnum("enum Light { }", "Light", "Lamp").refusals);
    snapshot.push(renameEnum("enum Light { off, }", "Light", "Lamp").refusals);
    snapshot.push(renameEnum(source, "Light", "Power").refusals);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "kind": "fileHasProblems",
            "problems": [
              {
                "kind": "enum",
                "name": "Light",
                "problem": {
                  "at": [
                    {
                      "end": 14,
                      "start": 0,
                    },
                  ],
                  "kind": "empty",
                  "rule": "E2",
                },
                "rule": "E2",
              },
            ],
            "rule": "RE1",
          },
        ],
        [
          {
            "kind": "fileHasProblems",
            "problems": [
              {
                "at": {
                  "end": 17,
                  "start": 16,
                },
                "message": "a trailing comma is not allowed after the last value",
              },
            ],
            "rule": "RE1",
          },
        ],
        [
          {
            "at": {
              "end": 33,
              "start": 28,
            },
            "kind": "nameExists",
            "name": "Power",
            "rule": "RE4",
          },
        ],
      ]
    `);
  });

  it("gives the renamed file, checked, and renaming back undoes it", () => {
    const renamed = renameEnum(source, "Light", "Lamp");
    const back =
      renamed.source === undefined ? undefined : renameEnum(renamed.source, "Lamp", "Light");
    const snapshot: unknown[] = [];
    snapshot.push(renamed.file?.values);
    snapshot.push(back?.source === source);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "enum": "Lamp",
            "name": "off",
          },
          {
            "enum": "Lamp",
            "name": "on",
          },
          {
            "enum": "Power",
            "name": "off",
          },
          {
            "enum": "Power",
            "name": "on",
          },
        ],
        true,
      ]
    `);
  });
});
