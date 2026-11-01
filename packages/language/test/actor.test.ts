import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { problems } from "./support/language.js";

const records = `enum Verdict = approved | changes
record Source {
  file: RelativePath
}
record PenEvidence {
  source: Source
}
record DesignReview {
  verdict: Verdict
}
`;

describe("actor", () => {
  it("declares who records a record: one record each, and a record by several", () => {
    const { actors, diagnostics } = parse(
      `${records}actor design-agent records PenEvidence\nactor designer records DesignReview\nactor reviewer records DesignReview\n`,
    );
    expect([
      diagnostics,
      actors.map(({ name, records: recorded, line }) => [name, recorded.name, line]),
    ]).toEqual([
      [],
      [
        ["design-agent", "PenEvidence", 11],
        ["designer", "DesignReview", 12],
        ["reviewer", "DesignReview", 13],
      ],
    ]);
  });

  it("gives the record it records a context: what it stores is about one combination", () => {
    const { records: declared } = parse(
      `${records}actor design-agent records PenEvidence\nactor designer records DesignReview\n`,
    );
    expect(declared.map(({ name, context }) => [name, context])).toEqual([
      ["Source", false],
      ["PenEvidence", true],
      ["DesignReview", true],
    ]);
  });

  it("is what gives a record its context, which with context no longer does", () => {
    expect(problems("record Note with context {\n}\n")).toMatchInlineSnapshot(`
      [
        "1:13: syntax-error: a record has context when an actor records it, not with context: "actor <name> records Note"",
      ]
    `);
  });

  it("refuses an actor that records what is not a record, or no record", () => {
    expect([
      problems(`${records}actor design-agent records PenEvidance\n`),
      problems(`${records}actor design-agent records Verdict\n`),
      problems(`${records}actor design-agent records Source\n`),
      problems(`${records}actor design-agent\n`),
    ]).toMatchInlineSnapshot(`
      [
        [
          "11:28: unknown-record: PenEvidance is not a record; did you mean PenEvidence?",
        ],
        [
          "11:28: unknown-record: Verdict is an enum, not a record",
        ],
        [
          "6:3: nested-context: PenEvidence.source is a Source, which has its own context",
        ],
        [
          "11:19: syntax-error: expected "records" after "design-agent", found the end of the line",
        ],
      ]
    `);
  });

  it("records one record each, for now", () => {
    expect(
      problems(`${records}actor designer records PenEvidence, DesignReview\n`),
    ).toMatchInlineSnapshot(`
      [
        "11:35: syntax-error: an actor records one record, for now: designer records PenEvidence",
      ]
    `);
  });

  it("is named as a single thing is, lowercase, and once in the file", () => {
    expect([
      problems(`${records}actor Designer records DesignReview\n`),
      problems(
        `${records}actor designer records DesignReview\nactor designer records PenEvidence\n`,
      ),
      problems(
        `${records}dimension Pointer = mouse | touch\nenvironment Device = Pointer\nprofile designer: Device { Pointer = mouse }\nactor designer records DesignReview\n`,
      ),
    ]).toMatchInlineSnapshot(`
      [
        [
          "11:7: actor-name: actor names start with a lowercase letter: "Designer"",
        ],
        [
          "12:7: duplicate-name: designer is already declared at line 11",
        ],
        [
          "14:7: duplicate-name: designer is already declared at line 13",
        ],
      ]
    `);
  });
});
