import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { errors, problems } from "./support/language.js";

const site = (...menu: string[]) => `dimension Breakpoint = base | lg
enum Openness = closed | open

type Toggle {
  event activate
}

type Menu needs Breakpoint {
  event escape, outside
  state menu: Openness
  has toggle: Toggle
  action open: menu closed -> open
  action close: menu open -> closed
${menu.map((line) => `  ${line}\n`).join("")}}

type Page {
  has menu: Menu
}
`;

describe("an event", () => {
  it("is a name its type declares, or a child's, by the child's path", () => {
    const source = site(
      "on toggle.activate: open",
      "on escape: close",
      "on outside: close",
      "on Breakpoint = lg: close",
    );
    const menu = parse(source).types.find(({ name }) => name === "Menu");
    expect([
      problems(source),
      menu?.events.map(({ name }) => name),
      menu?.triggers.map(({ event }) =>
        event.kind === "named" ? event.name.name : event.dimension.name,
      ),
    ]).toEqual([[], ["escape", "outside"], ["toggle.activate", "escape", "outside", "Breakpoint"]]);
  });

  it("must be declared, by its type or by the child it names", () => {
    expect([
      errors(site("on escpe: close")),
      errors(site("on toggle.activat: open")),
      errors(site("on togle.activate: open")),
    ]).toEqual([
      ["14:6: unknown-event: escpe is not an event of Menu; did you mean escape?"],
      ["14:6: unknown-event: activat is not an event of Toggle; did you mean activate?"],
      ["14:6: unknown-child: togle is not a child of Menu; did you mean toggle?"],
    ]);
  });

  it("has a lowercase name, declared once", () => {
    expect([
      errors(site().replace("event escape, outside", "event Escape, outside")),
      errors(site().replace("event escape, outside", "event escape, escape")),
    ]).toEqual([
      ['9:9: event-name: event names start with a lowercase letter: "Escape"'],
      ["9:17: duplicate-event: escape is already an event of Menu"],
    ]);
  });

  it("is not one of the old built-in words, which say what to write instead", () => {
    expect([
      problems(site("on key Escape: close")),
      problems(site("on click toggle: open")),
      problems(site("on pointer outside: close")),
    ]).toEqual([
      [
        '14:6: syntax-error: "key Escape" is not an event: declare one, such as "event escape", and write "on escape"',
      ],
      [
        '14:6: syntax-error: "click toggle" is not an event: declare one in the child\'s type, such as "event activate", and write "on toggle.activate"',
      ],
      [
        '14:6: syntax-error: "pointer outside" is not an event: declare one, such as "event outside", and write "on outside"',
      ],
    ]);
  });

  it("is named the same way in an expectation", () => {
    const source = `${site("on escape: close")}
expect "Escape closes the menu" {
  in Page.menu
  when menu = open
  on escape
  then menu = closed
}
`;
    expect(problems(source)).toEqual([]);
  });
});
