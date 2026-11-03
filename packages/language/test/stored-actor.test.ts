import { validate } from "@language/evidence/validate.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";
import { problems } from "./support/language.js";

const source = `enum Verdict = approved | changes
type Card {
}
record Evidence {
  note: NonEmptyString
}
record Review {
  verdict: Verdict
}
actor Designer records Evidence
actor DesignAgent records Evidence
actor Reviewer records Review
`;

const file = parse(source);

// A stored Evidence, with this actor, or with none.
const stored = (actor?: string) =>
  `[{ "context": { "type": "Card", "dimensions": {}, "states": {} }${
    actor === undefined ? "" : `, "actor": ${JSON.stringify(actor)}`
  }, "note": "a drawing" }]`;

const messages = (data: string) => validate(file, "Evidence", data).map(({ message }) => message);

describe("the actor of a stored record", () => {
  it("is one of the actors who record it", () => {
    expect([messages(stored("Designer")), messages(stored("DesignAgent"))]).toEqual([[], []]);
  });

  it("is required, and must be an actor who records that record", () => {
    expect([
      messages(stored()),
      messages(stored("Desginer")),
      messages(stored("Reviewer")),
      messages(
        `[{ "context": { "type": "Card", "dimensions": {}, "states": {} }, "actor": 1, "note": "x" }]`,
      ),
    ]).toMatchInlineSnapshot(`
      [
        [
          "\`Evidence\` is missing \`actor\`",
        ],
        [
          "\`Desginer\` is not an actor who records \`Evidence\`; did you mean \`Designer\`?",
        ],
        [
          "\`Reviewer\` records \`Review\`, not \`Evidence\`",
        ],
        [
          "expected an actor's name (a string), found a number",
        ],
      ]
    `);
  });

  it("is the language's, so a record an actor records cannot declare a field named actor", () => {
    expect(
      problems("record Evidence {\n  actor: NonEmptyString\n}\nactor Designer records Evidence\n"),
    ).toMatchInlineSnapshot(`
      [
        "2:3: reserved-name: \`actor\` is who records \`Evidence\`; choose another field name",
      ]
    `);
    expect(problems("record Note {\n  actor: NonEmptyString\n}\n")).toEqual([]);
  });
});
