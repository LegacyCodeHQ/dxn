import { printTypeTrees, typeTrees } from "@language/model/tree.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

describe("declared type trees", () => {
  it("resolves nested types without treating their declarations as placements", () => {
    const file = parse(`type Container {
  type Inner {
    type Leaf {}
    has leaf: Leaf
  }
  has inner: Inner
}
`);
    expect(printTypeTrees(typeTrees(file, "Container.Inner"))).toBe(
      "Container.Inner\n└── Container.Inner.Leaf\n",
    );
  });

  it("keeps tagged list member paths and their conditions", () => {
    const file = parse(`enum Plan = free | paid
type Article {}
type Ad {}
type Feed {
  state plan: Plan
  has rows: [
    article: Article
    ad: Ad only when plan = free
  ]
}
`);
    expect(typeTrees(file, "Feed")[0]?.children.map(({ path, when }) => ({ path, when }))).toEqual([
      { path: "Feed.rows.article", when: undefined },
      { path: "Feed.rows.ad", when: "plan = free" },
    ]);
  });

  it("can show a declaration that needs a state supplied by its parent", () => {
    const file = parse(`enum Mode = on | off
type Child receives mode: Mode {}
type Parent {
  state mode: Mode
  provides mode
  has child: Child
}
`);
    expect(printTypeTrees(typeTrees(file, "Child"))).toBe("Child\n");
  });

  it("names an empty forest", () => {
    expect(printTypeTrees(typeTrees(parse("")))).toBe("No types declared.\n");
  });

  it("rejects an invalid model before traversing a cycle", () => {
    expect(() => typeTrees(parse("type Loop { has self: Loop }"))).toThrow(
      "cannot show a tree for a file with problems",
    );
  });
});
