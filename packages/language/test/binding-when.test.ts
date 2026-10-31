import { describe, expect, it } from "vitest";
import { inPlace } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { problems } from "./support/language.js";

const site = (binding: string) => `enum Section = home | blog
enum Selection = unselected | selected

type Link {
  state selection: Selection
}

type Links receives current: Section {
  has blog: Link { selection = ${binding} }
}

type ArticlePage {
  state current: Section = blog
  provides current
  has links: Links
}
`;
const mapped = site("when current { blog -> selected, home -> unselected }");

describe("a binding to a when", () => {
  it("maps a state of the type onto the child's, a branch for each of its values", () => {
    const binding = parse(mapped).types.find(({ name }) => name === "Links")?.children[0]
      ?.bindings?.[0];
    expect([
      problems(mapped),
      binding?.from.name,
      binding?.map?.map(({ values, result }) => [values.map(({ name }) => name), result.name]),
    ]).toEqual([
      [],
      "current",
      [
        [["blog"], "selected"],
        [["home"], "unselected"],
      ],
    ]);
  });

  it("gives the child the value its branch gives, in place", () => {
    expect(
      inPlace(parse(mapped), "ArticlePage.links.blog").rows.map(({ parents, states }) => [
        parents,
        states,
      ]),
    ).toEqual([[{ current: "blog" }, { selection: ["selected"] }]]);
  });

  it("can have a branch a line", () => {
    expect(
      problems(site("when current {\n    blog -> selected\n    home -> unselected\n  }")),
    ).toEqual([]);
  });

  it("covers every value of the state it is on, once, each giving a value of the child's", () => {
    expect([
      problems(site("when current { blog -> selected }")),
      problems(site("when current { blog -> selected, home -> chosen }")),
      problems(site("when current { blog -> selected, news -> unselected }")),
    ]).toEqual([
      ["9:37: incomplete-when: when current does not cover home"],
      ['9:73: unknown-value: "chosen" is not a value of selection (unselected, selected)'],
      [
        "9:37: incomplete-when: when current does not cover home",
        '9:65: unknown-value: "news" is not a value of current (home, blog)',
      ],
    ]);
  });

  it("cannot set a state the child already decides", () => {
    expect([
      problems(
        mapped.replace("state selection: Selection", "state selection: Selection = unselected"),
      ),
      problems(
        mapped.replace(
          "type Link {\n  state selection: Selection",
          "type Link receives selection: Selection {",
        ),
      ),
    ]).toEqual([
      ["9:20: bound-derived: selection is decided by its value; it cannot also be bound"],
      ["8:20: bound-derived: selection is received; it cannot also be bound"],
    ]);
  });

  it("is renamed with the enums of its values and of its branches' values", () => {
    expect(renameInSource(parse(mapped), mapped, "Selection", "selected", "current-page")).toBe(
      mapped
        .replace("unselected | selected", "unselected | current-page")
        .replace("blog -> selected", "blog -> current-page"),
    );
  });
});
