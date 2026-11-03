import { completions } from "@language/editor/complete.js";
import { hover } from "@language/editor/hover.js";
import { renameAt } from "@language/editor/rename-at.js";
import { symbols } from "@language/editor/symbols.js";
import { inPlace, states } from "@language/evaluation/evaluate.js";
import { coverage } from "@language/evaluation/status.js";
import { format } from "@language/syntax/format.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";
import { errors, problems } from "./support/language.js";

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
        state: { name: "reading", line: 9, column: 21, length: 7 },
        from: { name: "unread", line: 9, column: 31, length: 6 },
      },
    ]);
  });

  it("closes its brackets", () => {
    expect(errors(feed("[Row only when content = articles"))).toEqual([
      "9:18: syntax-error: expected `]` after `Row`, found `only`",
    ]);
  });

  it("has nothing after its brackets but bindings and only when", () => {
    expect(errors(feed("[Row]+"))).toEqual([
      "9:18: syntax-error: expected `only when` or the end of the line after `]`, found `+`",
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

// A feed of articles and ads, ads only on the free plan.
const mixed = (members: string, after = "") => `enum Reading = unread | read
enum Plan = free | paid
type ArticleRow {
  state reading: Reading
}
type AdRow {}
type Feed {
  state plan: Plan
  has feed: [
${members}  ]${after}
}
`;
const both = "    article: ArticleRow\n    ad: AdRow only when plan = free\n";

describe("a list of several members", () => {
  it("is a tagged union: each member a child of the type, in the list", () => {
    const file = parse(mixed(both));
    expect(file.diagnostics).toEqual([]);
    const feed = file.types.find(({ name }) => name === "Feed");
    expect(
      feed?.children.map(({ name, type, member, line, column }) => [
        name,
        type.name,
        member,
        line,
        column,
      ]),
    ).toEqual([
      ["feed.article", "ArticleRow", "feed", 10, 5],
      ["feed.ad", "AdRow", "feed", 11, 5],
    ]);
    const [row] = states(file, "Feed").rows;
    expect([row?.states, row?.children]).toEqual([
      { plan: ["free", "paid"] },
      { "feed.article": true, "feed.ad": { plan: ["free"] } },
    ]);
  });

  it("is placed, each member by its path", () => {
    const file = parse(mixed(both));
    expect(inPlace(file, "Feed.feed.ad").rows.map(({ parents }) => parents)).toEqual([
      { plan: "free" },
    ]);
  });

  it("has a whole list's only when on every member", () => {
    const file = parse(
      mixed(both, " only when mode = live").replace(
        "  state plan: Plan\n",
        "  enum Mode = live | paused\n  state plan: Plan, mode: Mode\n",
      ),
    );
    expect(file.diagnostics).toEqual([]);
    expect(states(file, "Feed").rows[0]?.children).toEqual({
      "feed.article": { mode: ["live"] },
      "feed.ad": "plan = free and mode = live",
    });
  });

  it("sets each member's states with its own bindings", () => {
    const file = parse(mixed("    unread: ArticleRow { reading = unread }\n    ad: AdRow\n"));
    expect(file.diagnostics).toEqual([]);
    expect(file.types.find(({ name }) => name === "Feed")?.children[0]?.bindings).toEqual([
      {
        state: { name: "reading", line: 10, column: 26, length: 7 },
        from: { name: "unread", line: 10, column: 36, length: 6 },
      },
    ]);
  });

  it("has at least one member", () => {
    expect(errors(mixed(""))).toEqual([
      "10:3: syntax-error: expected a member, such as `article: <Type>`, found `]`",
    ]);
  });

  it("has members of types, not lists", () => {
    expect(errors(mixed("    rows: [ArticleRow]\n"))).toEqual([
      "10:11: syntax-error: expected a type after `:` (a member is not a list), found `[`",
    ]);
  });

  it("takes no bindings after it, which its members take", () => {
    expect(errors(mixed(both, " { reading = read }"))).toEqual([
      "12:5: syntax-error: expected `only when` or the end of the line after `]` (bind each member's states on its line), found `{`",
    ]);
  });

  it("names each member once", () => {
    expect(errors(mixed("    ad: AdRow\n    ad: AdRow\n"))).toEqual([
      "11:5: duplicate-child: `feed.ad` is already a child of `Feed`",
    ]);
  });

  it("warns of a member that adds no rows: every row it allows, another allows too", () => {
    const touch = (source: string) =>
      source.replace(
        "  state reading: Reading\n",
        "  enum Touch = idle | pressed\n  state reading: Reading, interaction: Touch\n",
      );
    expect([
      problems(
        mixed("    big: ArticleRow { reading = read }\n    any: ArticleRow\n    ad: AdRow\n"),
      ),
      problems(
        mixed(
          "    fresh: ArticleRow { reading = unread }\n    again: ArticleRow { reading = unread }\n",
        ),
      ),
      problems(
        touch(
          mixed(
            "    fresh: ArticleRow { reading = unread, interaction = idle }\n    unread: ArticleRow { reading = unread }\n",
          ),
        ),
      ),
    ]).toEqual([
      [
        "10:5: warning: redundant-member: `big` adds no rows: `any` binds nothing, so it already allows every `ArticleRow`, the `big` ones too; remove `big`, or narrow `any`",
      ],
      [
        "11:5: warning: redundant-member: `again` adds no rows: `fresh` binds the same as `again`, so it already allows every row `again` does; remove `again`, or narrow `fresh`",
      ],
      [
        "11:5: warning: redundant-member: `fresh` adds no rows: `unread` binds only `reading = unread`, so it already allows every row `fresh` does; remove `fresh`, or narrow `unread`",
      ],
    ]);
  });

  it("does not warn of members that each allow rows the other does not", () => {
    expect(
      problems(
        mixed(
          "    unread: ArticleRow { reading = unread }\n    read: ArticleRow { reading = read }\n",
        ),
      ),
    ).toEqual([]);
  });
});

describe("a list of several members in evidence", () => {
  const file = parse(
    `${mixed("    unread: ArticleRow { reading = unread }\n    ad: AdRow only when plan = free\n")}record Evidence {\n  source: PenNode\n}\nactor DesignAgent records Evidence\n`,
  );

  it("counts each member in place, by its path, and nothing for the list", () => {
    expect(
      coverage(file, "Evidence", ["[]"]).paths.map(({ path, combinations }) => [
        path,
        combinations,
      ]),
    ).toEqual([
      ["ArticleRow", 2],
      ["AdRow", 1],
      ["Feed", 2],
      ["Feed.feed.unread", 1],
      ["Feed.feed.ad", 1],
    ]);
  });
});

describe("a list of several members in an editor", () => {
  const source = mixed(both);
  const record = `record Evidence {\n  source: PenNode\n}\nactor DesignAgent records Evidence\n`;
  const stored = [
    {
      path: "evidence.json",
      record: "Evidence",
      source: JSON.stringify([
        {
          context: { path: "Feed.feed.ad", dimensions: {}, parents: { plan: "free" }, states: {} },
          actor: "DesignAgent",
          source: { file: "feed.pen", frame: "F1", fingerprint: "f1" },
        },
      ]),
    },
  ];

  it("is outlined as the list, with its members inside it", () => {
    const type = symbols(source).find(({ name }) => name === "Feed");
    expect(
      type?.children.map(({ name, children }) => [name, children.map(({ name: inner }) => inner)]),
    ).toEqual([
      ["plan", []],
      ["feed", ["article", "ad"]],
    ]);
  });

  it("is shown in its type's hover as written", () => {
    const placed = `${source}type Screen {\n  has main: Feed\n}\n`;
    expect(hover(placed, 15, 14)?.code).toBe(
      "type Feed\n  state plan: Plan\n  has feed: [\n    article: ArticleRow\n    ad: AdRow only when plan = free\n  ]",
    );
  });

  it("is formatted with its members indented inside it", () => {
    const formatted = source.replace("type AdRow {}", "type AdRow { }");
    expect(format(source.replace("    article", "article").replace("  ]", "]"))).toBe(formatted);
  });

  it("renames a member's tag, and the list's name, in the file and in stored paths", () => {
    const renamed = (line: number, column: number, to: string) => {
      const done = renameAt(`${source}${record}`, line, column, to, stored);
      if ("refusal" in done) return done.refusal;
      return [
        done.edits.map(({ line: at, column: from }) => `${at}:${from}`),
        done.data.map(({ source: data }) => JSON.parse(data)[0].context.path),
      ];
    };
    expect([renamed(11, 5, "promo"), renamed(9, 7, "rows")]).toEqual([
      [["11:5"], ["Feed.feed.promo"]],
      [["9:7"], ["Feed.rows.ad"]],
    ]);
  });

  it("is offered types for a member, and the values that fix its states", () => {
    const at = (member: string) => {
      const written = mixed(`    ${member}\n`);
      return completions(written, 10, member.length + 5).map(({ label }) => label);
    };
    expect([at("ad: "), at("unread: ArticleRow { reading = ")]).toEqual([
      ["ArticleRow", "AdRow"],
      ["plan", "unread", "read"],
    ]);
  });
});
