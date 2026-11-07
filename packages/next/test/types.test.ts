import { describe, expect, it } from "vitest";
import { acceptFile, analyze, format, parse, renameEnum } from "../src/index.js";

describe("types from the Lean specification", () => {
  it.each([
    "type Logo {}",
    "type Button { varies Kind, State } enum Kind { primary } enum State { normal }",
    "type button { varies Missing, Missing }",
    "type type { varies enum, varies, type }",
  ])("reads types without checking their names: %s", (source) => {
    expect(parse(source).problems).toEqual([]);
    expect(format(format(source) ?? "")).toBe(format(source));
  });

  it.each([
    "type Button { varies }",
    "type Button { varies Kind, }",
    "type Button { varies Kind State }",
    "type Button { varies Kind varies State }",
    "type Button { Kind }",
    "type Button { varies , Kind }",
    "type Button { varies Kind",
    "type Button { type Nested {} }",
  ])("rejects malformed type syntax: %s", (source) => {
    expect(parse(source).problems).toHaveLength(1);
    expect(format(source)).toBeUndefined();
  });

  it("reports type problems in rule order, then collisions across declaration kinds", () => {
    const source = "enum Kind { primary } type button { varies Size, Kind, Kind } type Kind {}";
    expect(analyze(source).problems.map((p) => [p.rule, p.code])).toMatchInlineSnapshot(`
      [
        [
          "T1",
          "badTypeName",
        ],
        [
          "T2",
          "noSuchEnum",
        ],
        [
          "T3",
          "duplicateVaries",
        ],
        [
          "F1",
          "duplicateName",
        ],
      ]
    `);
  });

  it("enumerates the Cartesian product with the first factor changing slowest", () => {
    const source =
      "type Button { varies Kind, State } enum Kind { primary, secondary } enum State { normal, disabled } type Logo {}";
    const accepted = acceptFile(parse(source).declarations);
    expect(accepted.file?.combinations).toMatchInlineSnapshot(`
      [
        {
          "combinations": [
            [
              {
                "enum": "Kind",
                "name": "primary",
              },
              {
                "enum": "State",
                "name": "normal",
              },
            ],
            [
              {
                "enum": "Kind",
                "name": "primary",
              },
              {
                "enum": "State",
                "name": "disabled",
              },
            ],
            [
              {
                "enum": "Kind",
                "name": "secondary",
              },
              {
                "enum": "State",
                "name": "normal",
              },
            ],
            [
              {
                "enum": "Kind",
                "name": "secondary",
              },
              {
                "enum": "State",
                "name": "disabled",
              },
            ],
          ],
          "type": "Button",
        },
        {
          "combinations": [
            [],
          ],
          "type": "Logo",
        },
      ]
    `);
  });

  it("renames an enumeration and all references, leaving type names and unrelated text alone", () => {
    const source =
      "type Lamp { varies Light, Power }\nenum Light{off,on}\nenum Power { off }\ntype Other { varies Light }\n";
    const result = renameEnum(source, "Light", "Glow");
    expect(result.source).toBe(source.replaceAll("Light", "Glow"));
    expect(result.edits).toHaveLength(3);
    expect(renameEnum(result.source ?? "", "Glow", "Light").source).toBe(source);
    expect(renameEnum(source, "Light", "Lamp").refusals.map((r) => r.rule)).toEqual(["RE4"]);
    expect(renameEnum(source, "Lamp", "Glow").refusals.map((r) => r.rule)).toEqual(["RE3"]);
  });
});

it("stops at the first malformed type and preserves earlier declarations and precise error spans", () => {
  const source = "enum Kind { primary } type Button { varies Kind, } type Later {}";
  const result = parse(source);
  expect({
    names: result.declarations.map((d) => d.name.text),
    problems: result.problems,
  }).toMatchInlineSnapshot(`
    {
      "names": [
        "Kind",
      ],
      "problems": [
        {
          "at": {
            "end": 48,
            "start": 47,
          },
          "message": "a trailing comma is not allowed after the last enumeration",
        },
      ],
    }
  `);
});

it("retains immutable type declarations after acceptance", () => {
  const parsed = parse("type Button { varies Kind } enum Kind { primary }");
  const accepted = acceptFile(parsed.declarations).file;
  if (!accepted) throw new Error("expected an accepted file");
  const original = parsed.declarations[0];
  if (!original || !("varies" in original)) throw new Error("expected type");
  Object.assign(original.name, { text: "Changed" });
  Object.assign(original.varies[0] ?? {}, { text: "Missing" });
  expect(accepted.types[0]?.name.text).toBe("Button");
  expect(accepted.combinations).toEqual([
    { type: "Button", combinations: [[{ enum: "Kind", name: "primary" }]] },
  ]);
  expect(() => Object.assign(accepted.types[0]?.varies[0] ?? {}, { text: "Missing" })).toThrow();
});
