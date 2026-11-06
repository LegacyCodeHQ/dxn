import { acceptEnum, checkEnum, Enum } from "@next/check/enumeration.js";
import { describe, expect, it } from "vitest";

// The checker of lean/Dxn/Enumeration.lean, with the cases of
// lean/DxnTest/Enumeration.lean. Names sit one after another, from offset 0,
// so each span says which occurrence a problem points at. The declaration is
// built as plain objects the test can change, as any caller's could be.
interface Written {
  name: { text: string; span: { start: number; end: number } };
  values: { text: string; span: { start: number; end: number } }[];
  span: { start: number; end: number };
}

function declaration(name: string, values: string[]): Written {
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
    snapshot.push(acceptEnum(declaration("Light", ["off", "on"])).enum?.values);
    snapshot.push(acceptEnum(declaration("Power", ["off", "on"])).enum?.values);
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

  it("gives an enumeration only for a declaration with no problems", () => {
    const snapshot: unknown[] = [];
    const accepted = acceptEnum(declaration("Light", ["off", "on"]));
    snapshot.push({ accepted: accepted.enum instanceof Enum, problems: accepted.problems });
    const rejected = acceptEnum(declaration("light", ["on", "on"]));
    snapshot.push({ accepted: rejected.enum !== undefined, problems: said("light", ["on", "on"]) });
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "accepted": true,
          "problems": [],
        },
        {
          "accepted": false,
          "problems": [
            "badEnumName light",
            "duplicate on",
          ],
        },
      ]
    `);
  });

  it("makes an enumeration only by checking it", () => {
    // Checked by the type checker: neither line compiles, so values come only
    // from a declaration acceptEnum accepted, as Lean's Enum needs a proof.
    const unchecked = declaration("light", []);
    // @ts-expect-error The constructor is private.
    const made = () => new Enum(unchecked);
    // @ts-expect-error A look-alike object is not an Enum.
    const alike: Enum = { declaration: unchecked, values: [] };
    expect([typeof made, typeof alike]).toEqual(["function", "object"]);
  });

  it("keeps an accepted enumeration valid when the declaration it came from changes", () => {
    const original = declaration("Light", ["off"]);
    const light = acceptEnum(original).enum;
    original.name.text = "light";
    original.name.span.start = 99;
    original.values[0] = { text: "Off", span: { start: 0, end: 0 } };
    original.values.length = 0;
    const snapshot: unknown[] = [];
    snapshot.push(light?.values);
    snapshot.push(light && checkEnum(light.declaration));
    snapshot.push(light?.declaration.name);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          {
            "enum": "Light",
            "name": "off",
          },
        ],
        [],
        {
          "span": {
            "end": 5,
            "start": 0,
          },
          "text": "Light",
        },
      ]
    `);
  });

  it("does not let its own declaration be changed", () => {
    const light = acceptEnum(declaration("Light", ["off"])).enum;
    if (!light) throw new Error("Light { off } is valid");
    // Each change is also a type error; the casts reach past the types to try them at run time.
    const name = light.declaration.name as { text: string };
    const values = light.declaration.values as unknown as { text: string }[];
    const span = light.declaration.values[0]?.span as { start: number };
    const attempts = {
      rename: () => {
        name.text = "light";
      },
      empty: () => {
        values.length = 0;
      },
      add: () => {
        values.push({ text: "Off" });
      },
      replace: () => {
        values[0] = { text: "Off" };
      },
      move: () => {
        span.start = 99;
      },
    };
    const snapshot: unknown[] = [];
    for (const [attempt, change] of Object.entries(attempts)) {
      snapshot.push(
        `${attempt}: ${(() => {
          try {
            change();
            return "changed";
          } catch (error) {
            return error instanceof TypeError ? "refused" : String(error);
          }
        })()}`,
      );
    }
    snapshot.push(light.values);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "rename: refused",
        "empty: refused",
        "add: refused",
        "replace: refused",
        "move: refused",
        [
          {
            "enum": "Light",
            "name": "off",
          },
        ],
      ]
    `);
  });
});
