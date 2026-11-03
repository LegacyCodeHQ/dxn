import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";
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
      `${records}actor DesignAgent records PenEvidence\nactor Designer records DesignReview\nactor Reviewer records DesignReview\n`,
    );
    expect([
      diagnostics,
      actors.map(({ name, records: recorded, line }) => [name, recorded.name, line]),
    ]).toEqual([
      [],
      [
        ["DesignAgent", "PenEvidence", 11],
        ["Designer", "DesignReview", 12],
        ["Reviewer", "DesignReview", 13],
      ],
    ]);
  });

  it("gives the record it records a context: what it stores is about one combination", () => {
    const { records: declared } = parse(
      `${records}actor DesignAgent records PenEvidence\nactor Designer records DesignReview\n`,
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
        "1:13: syntax-error: a record has context when an actor records it, not with context: \`actor <name> records Note\`",
      ]
    `);
  });

  it("refuses an actor that records what is not a record, or no record", () => {
    expect([
      problems(`${records}actor DesignAgent records PenEvidance\n`),
      problems(`${records}actor DesignAgent records Verdict\n`),
      problems(`${records}actor DesignAgent records Source\n`),
      problems(`${records}actor DesignAgent\n`),
    ]).toMatchInlineSnapshot(`
      [
        [
          "11:27: unknown-record: \`PenEvidance\` is not a record; did you mean \`PenEvidence\`?",
        ],
        [
          "11:27: unknown-record: \`Verdict\` is an enum, not a record",
        ],
        [
          "6:3: nested-context: \`PenEvidence.source\` is a \`Source\`, which has its own context",
        ],
        [
          "11:18: syntax-error: expected \`records\` after \`DesignAgent\`, found the end of the line",
        ],
      ]
    `);
  });

  it("records one record each, for now", () => {
    expect(
      problems(`${records}actor Designer records PenEvidence, DesignReview\n`),
    ).toMatchInlineSnapshot(`
      [
        "11:35: syntax-error: an actor records one record, for now: \`Designer records PenEvidence\`",
      ]
    `);
  });

  it("is named as records, enums and types are, capitalized, and once in the file", () => {
    expect([
      problems(`${records}actor designer records DesignReview\n`),
      problems(`${records}actor Design-agent records DesignReview\n`),
      problems(
        `${records}actor Designer records DesignReview\nactor Designer records PenEvidence\n`,
      ),
      problems(`${records}type Designer {\n}\nactor Designer records DesignReview\n`),
    ]).toMatchInlineSnapshot(`
      [
        [
          "11:7: actor-name: actor names start with a capital letter: \`designer\`",
        ],
        [
          "11:7: actor-name: actor names are letters and digits: \`Design-agent\`",
        ],
        [
          "12:7: duplicate-name: \`Designer\` is already declared at line 11",
        ],
        [
          "13:7: duplicate-name: \`Designer\` is already declared at line 11",
        ],
      ]
    `);
  });
});
