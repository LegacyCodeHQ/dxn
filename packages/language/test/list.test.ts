import { describe, expect, it } from "vitest";
import { completions } from "../src/complete.js";
import { states } from "../src/evaluate.js";
import { format } from "../src/format.js";
import { hover } from "../src/hover.js";
import { parse } from "../src/parse.js";
import { symbols } from "../src/symbols.js";
import { errors } from "./support/language.js";

// A feed of rows, there while it has articles.
const feed = (list: string) => `enum Reading = unread | read
enum Content = articles | empty
type Row {
  state reading: Reading
}
type Button {}
type Feed {
  state content: Content
  has rows: ${list}
  has follow: Button only when content = empty
}
`;

describe("a list", () => {
  it("is one or more rows of its type, and adds no states to the type", () => {
    const file = parse(feed("[Row]"));
    expect(file.diagnostics).toEqual([]);
    expect(file.types.find(({ name }) => name === "Feed")?.children[0]).toMatchObject({
      name: "rows",
      type: { name: "Row" },
      list: true,
    });
    const [row] = states(file, "Feed").rows;
    expect([row?.states, row?.children]).toEqual([
      { content: ["articles", "empty"] },
      { rows: true, follow: { content: ["empty"] } },
    ]);
  });

  it("is not there, which is no rows, where its only when does not hold", () => {
    const file = parse(feed("[Row] only when content = articles"));
    expect(file.diagnostics).toEqual([]);
    expect(states(file, "Feed").rows[0]?.children).toEqual({
      rows: { content: ["articles"] },
      follow: { content: ["empty"] },
    });
  });

  it("sets every row's states with its bindings", () => {
    const file = parse(feed("[Row] { reading = unread } only when content = articles"));
    expect(file.diagnostics).toEqual([]);
    expect(file.types.find(({ name }) => name === "Feed")?.children[0]?.bindings).toEqual([
      {
        state: { name: "reading", line: 9, column: 21 },
        from: { name: "unread", line: 9, column: 31 },
      },
    ]);
  });

  it("closes its brackets", () => {
    expect(errors(feed("[Row only when content = articles"))).toEqual([
      '9:18: syntax-error: expected "]" after "Row", found "only"',
    ]);
  });

  it("has nothing after its brackets but bindings and only when", () => {
    expect(errors(feed("[Row]+"))).toEqual([
      '9:18: syntax-error: expected "only when" or the end of the line after "]", found "+"',
    ]);
  });
});

describe("a list in an editor", () => {
  const source = feed("[Row] only when content = articles");

  it("is outlined as a child", () => {
    const type = symbols(source).find(({ name }) => name === "Feed");
    expect(type?.children.map(({ name, kind }) => `${kind} ${name}`)).toEqual([
      "state content",
      "child rows",
      "child follow",
    ]);
  });

  it("is shown in brackets", () => {
    const placed = `${source}type Screen {\n  has feed: Feed\n}\n`;
    expect(hover(placed, 13, 14)?.code.split("\n")).toContain("  has rows: [Row]");
  });

  it("is formatted with no space inside its brackets", () => {
    expect(format("type Feed {\n  has rows: [ Row ]   only when x = y\n}\n")).toBe(
      "type Feed {\n  has rows: [Row] only when x = y\n}\n",
    );
  });

  it("is offered types in its brackets", () => {
    const source = "type Row {}\ntype Button {}\ntype Feed {\n  has rows: [\n}\n";
    expect(completions(source, 4, 14).map(({ label }) => label)).toEqual(["Row", "Button"]);
  });

  it("is offered the values that fix its rows' states", () => {
    const source =
      "enum Style = primary | secondary\ntype Row {\n  state style: Style\n}\ntype Feed {\n  has rows: [Row] { style = \n}\n";
    expect(completions(source, 6, 29).map(({ label }) => label)).toEqual(["primary", "secondary"]);
  });
});
