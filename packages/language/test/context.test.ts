import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

describe("record with context", () => {
  it("marks a record as a fact about one combination, with its context implicit", () => {
    const source = `enum Actor = design-agent
record Evidence {
  actor: Actor
}
record Source {
  actor: Actor
}
actor evidence-recorder records Evidence
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
    expect(
      problems(
        "record Evidence {\n  context: NonEmptyString\n}\nactor evidence-recorder records Evidence\n",
      ),
    ).toEqual(["2:3: reserved-name: context is Evidence's context; choose another field name"]);
    expect(problems("record Note {\n  context: NonEmptyString\n}\n")).toEqual([]);
  });

  it("cannot be inside another record, which would give it a second context", () => {
    expect(
      problems(
        "record Evidence {\n  note: NonEmptyString\n}\nrecord Review {\n  evidence: Evidence\n}\nrecord Source {\n  evidence: Evidence\n}\nactor evidence-recorder records Evidence\nactor review-recorder records Review\n",
      ),
    ).toEqual([
      "5:3: nested-context: Review.evidence is an Evidence, which has its own context",
      "8:3: nested-context: Source.evidence is an Evidence, which has its own context",
    ]);
  });

  it("is given by an actor, not with context, which says what to write instead", () => {
    expect([
      problems("record Evidence with {\n}\n"),
      problems("record Evidence with context\n}\n"),
    ]).toEqual([
      [
        '1:17: syntax-error: a record has context when an actor records it, not with context: "actor <name> records Evidence"',
      ],
      [
        '1:17: syntax-error: a record has context when an actor records it, not with context: "actor <name> records Evidence"',
      ],
    ]);
  });
});
