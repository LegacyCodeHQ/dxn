import { describe, expect, it } from "vitest";
import { states } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { errors, problems } from "./support/language.js";

const toolbar = `dimension Breakpoint = base | sm | lg | xl
enum Layout = compact | inline

type Wordmark {}
type Links {}

type Menu {
  enum State = closed | open
  state menu: State
  type Toggle {}
  type Panel {}
  has toggle: Toggle
  has panel: Panel only when menu = open
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
  has wordmark: Wordmark
  has links: Links only when layout = inline
  has menu: Menu only when layout = compact
}
`;

describe("has", () => {
  it("places children in a type, each a name and a type, with where it exists", () => {
    const menu = parse(toolbar).types.find(({ name }) => name === "Menu");
    expect([
      problems(toolbar),
      menu?.children.map(({ name, type, when }) => [
        name,
        type.name,
        when?.kind === "compare" ? [when.subject.name, when.values.map(({ name }) => name)] : null,
      ]),
    ]).toEqual([
      [],
      [
        ["toggle", "Menu.Toggle", null],
        ["panel", "Menu.Panel", ["menu", ["open"]]],
      ],
    ]);
  });

  it("says in each row of the matrix whether each child is there", () => {
    expect(
      states(parse(toolbar), "Toolbar").rows.map(({ when, children }) => [
        when.Breakpoint,
        children,
      ]),
    ).toEqual([
      ["base", { wordmark: true, links: false, menu: true }],
      ["sm", { wordmark: true, links: false, menu: true }],
      ["lg", { wordmark: true, links: true, menu: false }],
      ["xl", { wordmark: true, links: true, menu: false }],
    ]);
  });

  it("says which values of a free state a child is there for", () => {
    expect(states(parse(toolbar), "Menu").rows.map(({ children }) => children)).toEqual([
      { toggle: true, panel: { menu: ["open"] } },
    ]);
  });

  it("can depend on a dimension the type needs, which then counts as used", () => {
    const source = `dimension Breakpoint = base | lg
type Links {}
type Toolbar needs Breakpoint {
  has links: Links only when Breakpoint = lg
}
`;
    expect([
      problems(source),
      states(parse(source), "Toolbar").rows.map(({ children }) => children?.links),
    ]).toEqual([[], [false, true]]);
  });

  it("has a lowercase name, unique among the type's children and states", () => {
    expect([
      problems(`${toolbar}type Footer {\n  has Links: Links\n}\n`),
      problems(`${toolbar}type Footer {\n  has links: Links\n  has links: Links\n}\n`),
      problems(`${toolbar}type Footer {\n  state links: Layout\n  has links: Links\n}\n`),
    ]).toEqual([
      ['26:7: child-name: child names start with a lowercase letter: "Links"'],
      ["27:7: duplicate-child: links is already a child of Footer"],
      ["27:7: duplicate-child: links is already a state of Footer"],
    ]);
  });

  it("is of a type, which cannot contain itself", () => {
    expect([
      problems(`${toolbar}record Note {}\ntype Footer {\n  has note: Note\n}\n`),
      problems(`${toolbar}type Footer {\n  has page: Page\n}\n`),
      problems("type Card {\n  has inner: Card\n}\n"),
      problems("type A {\n  has b: B\n}\ntype B {\n  has a: A\n}\n"),
    ]).toEqual([
      ["27:13: unknown-type: Note is a record, not a type"],
      [
        "26:13: unknown-type: Page is not a type (Wordmark, Links, Menu, Toolbar, Footer, Menu.Toggle, Menu.Panel)",
      ],
      ["2:7: recursive-type: Card contains itself: Card.inner is a Card"],
      [
        "2:7: recursive-type: A contains itself: A.b is a B, and B.a is an A",
        "5:7: recursive-type: B contains itself: B.a is an A, and A.b is a B",
      ],
    ]);
  });

  it("is there only when one of the type's states, or a dimension it needs, has a value", () => {
    const footer = (condition: string) =>
      errors(
        `${toolbar}type Footer {\n  state layout: Layout\n  has links: Links only when ${condition}\n}\n`,
      );
    expect([
      footer("layot = inline"),
      footer("layout = wide"),
      footer("layout in (inline, inline)"),
      footer("Breakpoint = lg"),
    ]).toEqual([
      ["27:30: unknown-state: layot is not a state of Footer (layout)"],
      ['27:39: unknown-value: "wide" is not a value of layout (compact, inline)'],
      ['27:49: duplicate-value: "inline" appears twice in the condition'],
      [
        '27:30: unneeded-dimension: Footer does not need Breakpoint; declare "type Footer needs Breakpoint"',
      ],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    expect([
      problems(`${toolbar}type Footer {\n  has links Links\n}\n`),
      problems(`${toolbar}type Footer {\n  has links: Links only layout = inline\n}\n`),
    ]).toEqual([
      ['26:13: syntax-error: expected ":" after "links", found "Links"'],
      ['26:25: syntax-error: expected "when" after "only", found "layout"'],
    ]);
  });
});
