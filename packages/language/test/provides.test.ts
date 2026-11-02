import { describe, expect, it } from "vitest";
import { inPlace, states } from "../src/evaluate.js";
import { parse } from "../src/parse.js";
import { errors, problems } from "./support/language.js";

const site = `enum Section = home | blog
enum Layout = compact | inline

type Link {}

type Links receives current: Section {
  has blog: Link only when current = blog
}

type Toolbar {
  has links: Links
}

type ArticlePage {
  state current: Section = blog
  provides current
  has toolbar: Toolbar
}
`;

describe("a provided state", () => {
  it("is received by a type far below, with nothing between passing it on", () => {
    const file = parse(site);
    const links = file.types.find(({ name }) => name === "Links");
    expect([
      errors(site),
      file.types.find(({ name }) => name === "ArticlePage")?.provides.map(({ name }) => name),
      links?.states.map(({ name, enum: of, received }) => [name, of.name, received === true]),
    ]).toEqual([[], ["current"], [["current", "Section", true]]]);
  });

  it("reaches the receiver in place, as one of its parents' states", () => {
    expect([
      inPlace(parse(site), "ArticlePage.toolbar.links").rows.map(({ parents }) => parents),
      inPlace(parse(site), "ArticlePage.toolbar.links.blog").rows.map(({ parents }) => parents),
    ]).toEqual([[{ current: "blog" }], [{ current: "blog" }]]);
  });

  it("is free where the receiver is evaluated on its own", () => {
    expect(
      states(parse(site), "Links").rows.map(({ states: own, children }) => [own.current, children]),
    ).toEqual([[["home", "blog"], { blog: { current: ["blog"] } }]]);
  });

  it("must come from above, with the enum the receiver expects", () => {
    expect(() => inPlace(parse(site), "Toolbar.links")).toThrow(
      "`current` is received by `Links`, but nothing above it provides it",
    );
    const mismatched = parse(
      site.replace("state current: Section = blog", "state current: Layout = inline"),
    );
    expect(() => inPlace(mismatched, "ArticlePage.toolbar.links")).toThrow(
      "`Links` receives `current` as a `Section`, but `ArticlePage` provides it as a `Layout`",
    );
  });

  it("is provided from one of the type's own states, once", () => {
    expect([
      errors(site.replace("provides current", "provides curent")),
      errors(site.replace("provides current", "provides current\n  provides current")),
      errors(site.replace("  has blog: Link", "  provides current\n  has blog: Link")),
    ]).toEqual([
      ["16:12: unknown-state: `curent` is not a state of `ArticlePage`; did you mean `current`?"],
      ["17:12: duplicate-provides: `current` is already provided by `ArticlePage`"],
      [
        "7:12: provides-received: `Links` receives `current`; it can only provide a state of its own",
      ],
    ]);
  });

  it("is received under a name of its own, which no rule or binding can set", () => {
    expect([
      errors(
        site.replace(
          "type Links receives current: Section {",
          "type Links receives current: Section {\n  state current: Layout",
        ),
      ),
      errors(
        site.replace(
          "type Toolbar {\n  has links: Links\n}",
          "type Toolbar {\n  state section: Section\n  has links: Links { current = section }\n}",
        ),
      ),
      problems("type Links receives current: Sectin {}\n"),
    ]).toEqual([
      ["7:9: duplicate-state: `current` is already a state of `Links`"],
      ["12:22: bound-derived: `current` is received; it cannot also be bound"],
      ["1:30: unknown-enum: `Sectin` is not an enum; the file declares none"],
    ]);
  });
});
