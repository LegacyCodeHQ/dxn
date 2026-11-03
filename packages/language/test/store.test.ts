import { checkStored, folderOf } from "@language/evidence/store.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

describe("where a record is stored", () => {
  it("is a folder named after the record, in kebab-case, with no plural", () => {
    expect(
      ["Evidence", "DesignReview", "HTTPLog", "Step2Result", "A"].map((name) => folderOf(name)),
    ).toEqual(["evidence", "design-review", "http-log", "step2-result", "a"]);
  });
});

describe("the stored records beside a file", () => {
  const model = `enum Hover = rest | hovered
type Link {
  state hover: Hover
}
record Evidence {
  note: NonEmptyString
}
actor Designer records Evidence
record Draft {
  note: NonEmptyString
}
`;
  const entry = (hover: string) =>
    `{ "context": { "type": "Link", "dimensions": {}, "states": { "hover": "${hover}" } }, "actor": "Designer", "note": "Seen." }`;
  const file = (path: string, record: string, ...entries: string[]) => ({
    record,
    path,
    source: `[\n  ${entries.join(",\n  ")}\n]\n`,
  });

  it("are checked one way, for dxn and an editor alike: each file, then repeats, and the records no actor records", () => {
    const snapshot: unknown[] = [];
    const checked = (...stored: ReturnType<typeof file>[]) => {
      const { withoutContext, problems } = checkStored(parse(model), stored);
      return [
        ...withoutContext.map(({ message }) => message),
        ...problems.map(({ file: at, line, column, code }) => `${at}:${line}:${column}: ${code}`),
      ];
    };
    snapshot.push(checked(file("evidence/a.json", "Evidence", entry("rest"))));
    // A value its enum does not have: a problem in its file.
    snapshot.push(checked(file("evidence/a.json", "Evidence", entry("bogus"))));
    // The same record twice, across files: a repeat, once each file checks.
    snapshot.push(
      checked(
        file("evidence/a.json", "Evidence", entry("rest")),
        file("evidence/b.json", "Evidence", entry("rest")),
      ),
    );
    snapshot.push(
      checked(
        file("evidence/a.json", "Evidence", entry("bogus")),
        file("evidence/b.json", "Evidence", entry("bogus")),
      ),
    );
    // Stored for a record no actor records: said so, and its files not read.
    snapshot.push(checked(file("draft/a.json", "Draft", entry("bogus"))));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [
          "evidence/a.json:2:73: unknown-value",
        ],
        [
          "evidence/b.json:2:3: duplicate-record",
        ],
        [
          "evidence/a.json:2:73: unknown-value",
          "evidence/b.json:2:73: unknown-value",
        ],
        [
          "\`Draft\` is stored in draft/, but no actor records it; declare \`actor <name> records Draft\`",
        ],
      ]
    `);
  });
});
