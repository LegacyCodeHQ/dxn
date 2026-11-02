import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";
import { problems } from "./support/language.js";

const record = (tool: string) => `enum Actor = design-agent | reviewer
enum Tool = pen-dev | file
record Review {
  actor: Actor
  tool: Tool = when actor {
${tool}
  }
}
`;
const both = record("    design-agent -> pen-dev\n    reviewer -> file");

describe("a field with when", () => {
  it("is derived from another field of the record: one value for each of its values", () => {
    const tool = parse(both).records[0]?.fields[1];
    expect([
      problems(both),
      tool?.derived?.on.name,
      tool?.derived?.branches.map(({ values, result }) => [
        values.map(({ name }) => name),
        result.name,
      ]),
    ]).toEqual([
      [],
      "actor",
      [
        [["design-agent"], "pen-dev"],
        [["reviewer"], "file"],
      ],
    ]);
  });

  it("covers every value of the field it is on, once, each with a value of its own enum", () => {
    expect([
      problems(record("    design-agent -> pen-dev")),
      problems(record("    design-agent -> pen-dev\n    reviewer -> figma")),
      problems(record("    design-agent, reviewer -> pen-dev\n    reviewer -> file")),
    ]).toEqual([
      ["5:21: incomplete-when: `when actor` does not cover `reviewer`"],
      ["7:17: unknown-value: `figma` is not a value of `tool` (`pen-dev`, `file`)"],
      ["7:5: duplicate-value: `reviewer` is already covered by the when"],
    ]);
  });

  it("is on a field of the record whose values are an enum's, and is one itself", () => {
    expect([
      problems(both.replace("when actor {", "when actr {")),
      problems(
        "enum Tool = pen-dev | file\nrecord Review {\n  note: NonEmptyString\n  tool: Tool = when note {\n  }\n}\n",
      ),
      problems(
        "enum Actor = design-agent\nrecord Review {\n  actor: Actor\n  note: NonEmptyString = when actor {\n    design-agent -> x\n  }\n}\n",
      ),
    ]).toEqual([
      ["5:21: unknown-field: `actr` is not a field of `Review`; did you mean `actor`?"],
      ["4:21: derived-field: `tool` is derived from `note`, whose values are not an enum's"],
      [
        "4:9: derived-field: `note` is derived, so its values must be an enum's, not `NonEmptyString`",
      ],
    ]);
  });

  it("is on another field, and is reported once when its type is not one", () => {
    expect([
      problems(both.replace("when actor {", "when tool {")),
      problems(both.replace("tool: Tool = when", "tool: Tol = when")),
    ]).toEqual([
      ["5:21: derived-field: `tool` cannot be derived from itself"],
      ["5:9: unknown-type: `Tol` is not an enum, a record or a scalar; did you mean `Tool`?"],
    ]);
  });

  it("is not stored: its value follows from the field it is on", () => {
    const schema = parse(both);
    expect([
      validate(schema, "Review", '[{ "actor": "reviewer" }]'),
      validate(schema, "Review", '[{ "actor": "reviewer", "tool": "file" }]').map(
        ({ code, message }) => `${code}: ${message}`,
      ),
    ]).toEqual([[], ["derived-field: `tool` is derived from `actor`; it is not stored"]]);
  });
});
