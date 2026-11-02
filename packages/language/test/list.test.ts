import { describe, expect, it } from "vitest";
import { completions } from "../src/complete.js";
import { usages } from "../src/definition.js";
import { states } from "../src/evaluate.js";
import { format } from "../src/format.js";
import { hover } from "../src/hover.js";
import { parse } from "../src/parse.js";
import { renameAt } from "../src/rename-at.js";
import { symbols } from "../src/symbols.js";
import { errors, problems } from "./support/language.js";

// A feed of rows, with the view it shows when it has none.
const feed = (list: string, more = "") => `enum Reading = unread | read
type Row {
  state reading: Reading
}
type Empty {}
type Button {}
type Feed {
  has rows: ${list}
${more}}
`;

describe("a list", () => {
  it("has rows of its element, and a count, empty or some, that decides what shows", () => {
    const file = parse(feed("[Row] or empty: Empty"));
    expect(file.diagnostics).toEqual([]);
    const [row] = states(file, "Feed").rows;
    expect([row?.states, row?.children]).toEqual([
      { rows: ["empty", "some"] },
      { rows: { rows: ["some"] }, empty: { rows: ["empty"] } },
    ]);
  });

  it("lets the type's other children depend on its count", () => {
    const file = parse(
      feed("[Row] or empty: Empty", "  has refresh: Button only when rows = some\n"),
    );
    expect(file.diagnostics).toEqual([]);
    expect(states(file, "Feed").rows[0]?.children?.refresh).toEqual({ rows: ["some"] });
  });

  it("can show nothing when it is empty, which it says", () => {
    const file = parse(feed("[Row] or nothing"));
    expect(file.diagnostics).toEqual([]);
    const [row] = states(file, "Feed").rows;
    expect([row?.states, row?.children]).toEqual([
      { rows: ["empty", "some"] },
      { rows: { rows: ["some"] } },
    ]);
  });

  it("is never empty with a +, and then has no count", () => {
    const file = parse(feed("[Row]+"));
    expect(file.diagnostics).toEqual([]);
    const [row] = states(file, "Feed").rows;
    expect([row?.states, row?.children]).toEqual([{}, { rows: true }]);
  });

  it("must say what shows when it is empty", () => {
    expect(errors(feed("[Row]"))).toEqual([
      '8:18: syntax-error: expected "or" and what shows when rows is empty, such as "or empty: <Type>" or "or nothing", or "+" for a list that is never empty, found the end of the line',
    ]);
  });

  it("sets its empty view's states as any child's", () => {
    const file = parse(`enum Style = primary | secondary
type Button {
  state style: Style
}
type Row {}
type Feed {
  has rows: [Row] or follow: Button { style = primary }
}
`);
    expect(file.diagnostics).toEqual([]);
    expect(states(file, "Feed").rows[0]?.children).toEqual({
      rows: { rows: ["some"] },
      follow: { rows: ["empty"] },
    });
  });

  it("is there only when, as a whole, with its empty view", () => {
    const file = parse(
      feed(
        "[Row] or empty: Empty only when mode = live",
        "  enum Mode = live | paused\n  state mode: Mode\n",
      ),
    );
    expect(file.diagnostics).toEqual([]);
    expect(states(file, "Feed").rows[0]?.children).toEqual({
      rows: "rows = some and mode = live",
      empty: "rows = empty and mode = live",
    });
  });

  it("has a count whose values are empty and some", () => {
    expect(
      errors(feed("[Row] or empty: Empty", "  has refresh: Button only when rows = many\n")),
    ).toEqual(['9:40: unknown-value: "many" is not a value of rows (empty, some)']);
  });

  it("takes its name, which a state cannot have too", () => {
    expect(problems(feed("[Row] or empty: Empty", "  state rows: Reading\n"))).toEqual([
      "9:9: duplicate-state: rows is already a state of Feed",
    ]);
  });
});

describe("a list in an editor", () => {
  const source = feed(
    "[Row] or empty: Empty",
    "  has refresh: Button only when rows = some\n  has more: [Row]+ only when rows = some\n",
  );

  it("is outlined once, as a child", () => {
    const [, , , , type] = symbols(source);
    expect(type?.children.map(({ name, kind }) => `${kind} ${name}`)).toEqual([
      "child rows",
      "child empty",
      "child refresh",
      "child more",
    ]);
  });

  it("is shown as written where its count is used", () => {
    expect([hover(source, 9, 34)?.code, hover(source, 8, 8)]).toEqual([
      "has Feed.rows: [Row] or empty: Empty\nrows = empty | some",
      undefined,
    ]);
  });

  it("is used where its count is", () => {
    expect(usages(source, 8, 8)?.usages).toEqual([
      { line: 9, column: 33, length: 4 },
      { line: 10, column: 30, length: 4 },
    ]);
  });

  it("is renamed with its count, in the file and in stored records", () => {
    const stored = [
      {
        path: "evidence.json",
        record: "Evidence",
        source: JSON.stringify([
          { context: { path: "Feed.rows", dimensions: {}, states: { reading: "read" } } },
          { context: { path: "Feed", dimensions: {}, states: { rows: "some" } } },
        ]),
      },
    ];
    const renamed = renameAt(
      `${source}record Evidence {\n  source: PenNode\n}\nactor DesignAgent records Evidence\n`,
      9,
      34,
      "items",
      stored,
    );
    expect(
      "refusal" in renamed
        ? renamed.refusal
        : [renamed.edits, renamed.data.map(({ source }) => JSON.parse(source))],
    ).toEqual([
      [
        { line: 8, column: 7, length: 4, text: "items" },
        { line: 9, column: 33, length: 4, text: "items" },
        { line: 10, column: 30, length: 4, text: "items" },
      ],
      [
        [
          { context: { path: "Feed.items", dimensions: {}, states: { reading: "read" } } },
          { context: { path: "Feed", dimensions: {}, states: { items: "some" } } },
        ],
      ],
    ]);
  });

  it("is formatted with no space inside its brackets", () => {
    expect(format("type Feed {\n  has rows: [ Row ] +   only when x = y\n}\n")).toBe(
      "type Feed {\n  has rows: [Row]+ only when x = y\n}\n",
    );
  });
});

describe("a list being written", () => {
  const types =
    "enum Style = primary | secondary\ntype Row {\n  state style: Style\n}\ntype Button {\n  state style: Style\n}\ntype Feed {\n";
  const at = (line: string) => {
    const source = `${types}  ${line}\n}\n`;
    return completions(source, 9, line.length + 3).map(({ label }) => label);
  };

  it("is offered types in its brackets, and for its empty view", () => {
    expect([at("has rows: ["), at("has rows: [Row] or empty: ")]).toEqual([
      ["Row", "Button"],
      ["Row", "Button"],
    ]);
  });

  it("is offered the values that fix its rows' states, and its empty view's", () => {
    expect([
      at("has rows: [Row] { style = "),
      at("has rows: [Row] or follow: Button { style = "),
    ]).toEqual([
      ["primary", "secondary"],
      ["primary", "secondary"],
    ]);
  });
});
