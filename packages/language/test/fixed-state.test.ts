import { describe, expect, it } from "vitest";
import { states } from "../src/evaluation/evaluate.js";
import { parse } from "../src/syntax/parse.js";
import { problems } from "./support/language.js";

const page = `enum Section = home | blog
type ArticlePage {
  state current: Section = blog
}
`;

describe("a fixed state", () => {
  it("has one value, everywhere", () => {
    const state = parse(page).types[0]?.states[0];
    expect([
      problems(page),
      state?.fixed?.name,
      states(parse(page), "ArticlePage").rows.map((row) => row.states.current),
    ]).toEqual([[], "blog", [["blog"]]]);
  });

  it("is one of its enum's values, and has no rules", () => {
    expect([
      problems(page.replace("= blog", "= news")),
      problems(
        page
          .replace(
            "  state current: Section = blog\n",
            "  state current: Section = blog\n  current = home only when Pointer = mouse\n",
          )
          .replace("enum Section", "dimension Pointer = mouse\nenum Section")
          .replace("type ArticlePage {", "type ArticlePage needs Pointer {"),
      ),
    ]).toEqual([
      ["3:28: unknown-value: `news` is not a value of `current` (`home`, `blog`)"],
      ["5:3: rule-on-derived: `current` is decided by its value; it cannot also have a rule"],
    ]);
  });

  it("cannot be bound by a parent: it is decided", () => {
    expect(
      problems(
        `${page}type Site {\n  state section: Section\n  has page: ArticlePage { current = section }\n}\n`,
      ),
    ).toEqual(["7:27: bound-derived: `current` is decided by its value; it cannot also be bound"]);
  });
});
