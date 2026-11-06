import { checkEnum, enumValues } from "@next/check/enumeration.js";
import type { EnumDeclaration } from "@next/model/enumeration.js";
import { describe, expect, it } from "vitest";

// The checker of lean/Dxn/Enumeration.lean, with the cases of
// lean/DxnTest/Enumeration.lean. Names sit one after another, from offset 0,
// so each span says which occurrence a problem points at.
function declaration(name: string, values: string[]): EnumDeclaration {
  let offset = 0;
  const at = (text: string) => {
    const span = { start: offset, end: offset + text.length };
    offset += text.length + 1;
    return { text, span };
  };
  const named = at(name);
  return { name: named, values: values.map(at), span: { start: 0, end: offset } };
}

// What the checker says, without positions: the part Lean also says.
const said = (name: string, values: string[]) =>
  checkEnum(declaration(name, values)).map((problem) =>
    "name" in problem ? `${problem.kind} ${problem.name}` : problem.kind,
  );

describe("checking an enumeration", () => {
  it("reports every problem, each once, in the order Lean reports them", () => {
    const snapshot: unknown[] = [];
    snapshot.push(said("Light", ["off", "on"]));
    snapshot.push(said("Theme", ["dark"]));
    snapshot.push(said("Light", []));
    snapshot.push(said("Light", ["on", "off", "on"]));
    snapshot.push(said("Light", ["on", "off", "on", "dim", "off", "on"]));
    snapshot.push(said("light", ["off", "on"]));
    snapshot.push(said("Light", ["Off", "on", "Off", "dim-"]));
    snapshot.push(said("light", []));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [],
        [
          "empty",
        ],
        [
          "duplicate on",
        ],
        [
          "duplicate on",
          "duplicate off",
        ],
        [
          "badEnumName light",
        ],
        [
          "badValueName Off",
          "badValueName dim-",
          "duplicate Off",
        ],
        [
          "badEnumName light",
          "empty",
        ],
      ]
    `);
  });

  it("points a problem at every occurrence of the name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(checkEnum(declaration("Light", ["on", "off", "on"])));
    snapshot.push(checkEnum(declaration("light", ["Off", "Off"])));
    snapshot.push(checkEnum(declaration("Light", [])));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "at": [
              {
                "end": 8,
                "start": 6,
              },
              {
                "end": 15,
                "start": 13,
              },
            ],
            "kind": "duplicate",
            "name": "on",
          },
        ],
        [
          {
            "at": [
              {
                "end": 5,
                "start": 0,
              },
            ],
            "kind": "badEnumName",
            "name": "light",
          },
          {
            "at": [
              {
                "end": 9,
                "start": 6,
              },
              {
                "end": 13,
                "start": 10,
              },
            ],
            "kind": "badValueName",
            "name": "Off",
          },
          {
            "at": [
              {
                "end": 9,
                "start": 6,
              },
              {
                "end": 13,
                "start": 10,
              },
            ],
            "kind": "duplicate",
            "name": "Off",
          },
        ],
        [
          {
            "at": [
              {
                "end": 6,
                "start": 0,
              },
            ],
            "kind": "empty",
          },
        ],
      ]
    `);
  });

  it("tags each value with its enumeration's name, in written order", () => {
    const snapshot: unknown[] = [];
    snapshot.push(enumValues(declaration("Light", ["off", "on"])));
    snapshot.push(enumValues(declaration("Power", ["off", "on"])));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "enum": "Light",
            "name": "off",
          },
          {
            "enum": "Light",
            "name": "on",
          },
        ],
        [
          {
            "enum": "Power",
            "name": "off",
          },
          {
            "enum": "Power",
            "name": "on",
          },
        ],
      ]
    `);
  });
});
