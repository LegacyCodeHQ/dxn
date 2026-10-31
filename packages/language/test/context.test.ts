import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

describe("record with context", () => {
  it("marks a record as a fact about one combination, with its context implicit", () => {
    const source = `enum Actor = design-agent
record Evidence with context {
  actor: Actor
}
record Source {
  actor: Actor
}
`;
    expect([
      problems(source),
      parse(source).records.map(({ name, context, fields }) => [name, context, fields.length]),
    ]).toEqual([
      [],
      [
        ["Evidence", true, 1],
        ["Source", false, 1],
      ],
    ]);
  });

  it("cannot declare a field named context, which it already has", () => {
    expect(problems("record Evidence with context {\n  context: NonEmptyString\n}\n")).toEqual([
      "2:3: reserved-name: context is Evidence's context; choose another field name",
    ]);
    expect(problems("record Note {\n  context: NonEmptyString\n}\n")).toEqual([]);
  });

  it("cannot be inside another record, which would give it a second context", () => {
    expect(
      problems(
        "record Evidence with context {\n  note: NonEmptyString\n}\nrecord Review with context {\n  evidence: Evidence\n}\nrecord Source {\n  evidence: Evidence\n}\n",
      ),
    ).toEqual([
      "5:3: nested-context: Review.evidence is an Evidence, which has its own context",
      "8:3: nested-context: Source.evidence is an Evidence, which has its own context",
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems("record Evidence with {\n}\n"),
      problems("record Evidence with context\n}\n"),
    ]).toEqual([
      ['1:22: syntax-error: expected "context" after "with", found "{"'],
      ['1:29: syntax-error: expected "{" after the record name, found the end of the line'],
    ]);
  });
});
