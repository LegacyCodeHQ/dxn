import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A menu that opens on a click, closes on Escape, a click outside or a wider
// screen, and a link whose states each have a design.
const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
    attributes: { design: { values: ["missing", "ready"] } },
    types: {
      menu: { states: ["closed", "open"], shared: true },
      link: {
        stateGroups: ["hover", "focus"],
        attributes: {
          design: { rest: "ready", hovered: "missing", blurred: "ready", focused: "ready" },
        },
      },
    },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "home-link", title: "Home link", type: "link" },
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          transitions: [
            { id: "open", from: "closed", to: "open", on: "click", target: "button" },
            {
              id: "escape",
              from: "open",
              to: "closed",
              on: "keydown",
              key: "Escape",
              focus: "button",
            },
            { id: "outside", from: "open", to: "closed", on: "pointerdown", outside: "toolbar" },
            {
              id: "widen",
              from: "open",
              to: "closed",
              on: "resize",
              when: { breakpoint: ["lg"] },
              focus: "button",
            },
          ],
          children: [{ id: "button", title: "Button", type: "link" }],
        },
      ],
    },
  },
  "roots/page.json": rootFile({ id: "page", title: "Page", children: [{ include: "toolbar" }] }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["sm", "lg"],
    default: "sm",
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": {
    version: 1,
    values: ["mouse", "touch"],
    default: "mouse",
    appliesTo: ["toolbar"],
  },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

function problems(list: unknown[], extra: Record<string, unknown> = {}): string[] {
  const { run } = cliProject({
    ...files,
    ...extra,
    "expectations.json": { version: 1, expectations: list },
  });
  return run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

const escapeRule = (then: Record<string, string>) => ({
  title: "Escape closes the menu",
  node: "menu",
  when: { menu: "open" },
  on: { event: "keydown", key: "Escape" },
  then,
});

describe("transition rules: when, on an event, then", () => {
  it("pass when every matching transition leads there", () => {
    expect(
      problems([
        escapeRule({ menu: "closed", focus: "button" }),
        {
          title: "A wider screen closes the menu",
          node: "menu",
          on: { event: "resize", breakpoint: "lg" },
          then: { menu: "closed", focus: "button" },
        },
        {
          title: "A click outside closes the menu",
          node: "menu",
          when: { menu: "open" },
          on: { event: "pointerdown", outside: "toolbar" },
          then: { menu: "closed" },
        },
      ]),
    ).toEqual([]);
  });

  it("fail naming the transition and where it leads instead", () => {
    expect(
      problems([
        escapeRule({ menu: "open" }),
        escapeRule({ focus: "home-link" }),
        {
          title: "Opening the menu focuses its button",
          node: "menu",
          when: { menu: "closed" },
          on: { event: "click", target: "button" },
          then: { focus: "button" },
        },
      ]),
    ).toEqual([
      "expectation-failed: Escape closes the menu: transition escape leads to closed, not open",
      "expectation-failed: Escape closes the menu: transition escape moves focus to button, not home-link",
      "expectation-failed: Opening the menu focuses its button: transition open does not move focus (focus=button)",
    ]);
  });

  it("that match no transition test nothing, so they are an error", () => {
    expect(
      problems([
        {
          title: "Enter closes the menu",
          node: "menu",
          when: { menu: "open" },
          on: { event: "keydown", key: "Enter" },
          then: { menu: "closed" },
        },
      ]),
    ).toEqual([
      "empty-expectation: Enter closes the menu: menu has no transition from open on keydown Enter",
    ]);
  });

  it("name an event, its own fields, and only the node's state and focus", () => {
    expect(
      problems([
        { ...escapeRule({ menu: "closed" }), on: { event: "hover" } },
        { ...escapeRule({ menu: "closed" }), on: { event: "click", key: "Enter" } },
        { ...escapeRule({ menu: "closed" }), on: { key: "Escape" } },
        { ...escapeRule({ menu: "closed" }), on: { event: "click", target: "nope" } },
        escapeRule({ hover: "rest" }),
        escapeRule({ menu: "ajar" }),
        { ...escapeRule({ menu: "closed" }), when: { breakpoint: "sm" } },
        { ...escapeRule({ menu: "closed" }), then: undefined, exists: true },
      ]),
    ).toEqual([
      'unknown-event: "hover" is not a supported event (click, keydown, pointerdown, resize)',
      'unknown-key: "key" does not apply to a click event',
      'missing-key: missing required key "event"',
      'unknown-node: node "nope" does not exist',
      'unknown-name: "hover" is not something a transition sets; give menu=<state> or focus=<node>',
      'unknown-value: "ajar" is not a state of menu (closed, open)',
      "unknown-name: \"breakpoint\" is not menu's state; a transition rule's when names only menu",
      'unknown-key: "on" goes only with "then"',
    ]);
  });
});

describe("attribute rules in then and some", () => {
  const design = (pointer: string, value: string | string[]) => ({
    title: "Every state has a ready design",
    node: "home-link",
    when: { pointer },
    then: { attributes: { design: value } },
  });

  it("check every state in each context", () => {
    expect(problems([design("touch", "ready"), design("mouse", ["missing", "ready"])])).toEqual([]);
    expect(problems([design("mouse", "ready")])).toEqual([
      "expectation-failed: Every state has a ready design: home-link (hover=hovered, focus=blurred, breakpoint=sm, pointer=mouse) breaks design=ready: hovered has design=missing",
    ]);
  });

  it("break on a state that has no value", () => {
    const unset = {
      "types.json": {
        ...files["types.json"],
        types: {
          ...files["types.json"].types,
          link: {
            stateGroups: ["hover", "focus"],
            attributes: { design: { rest: "ready", blurred: "ready" } },
          },
        },
      },
    };
    expect(problems([design("touch", "ready")], unset)).toEqual([
      "expectation-failed: Every state has a ready design: home-link (hover=rest, focus=focused, breakpoint=sm, pointer=touch) breaks design=ready: design is not set for focused",
    ]);
  });

  it("work with some, and name declared attributes and values", () => {
    expect(
      problems([
        {
          title: "Some state is ready",
          node: "home-link",
          some: { attributes: { design: "ready" } },
        },
        { title: "Undeclared", node: "home-link", then: { attributes: { colour: "red" } } },
        { title: "Unknown value", node: "home-link", then: { attributes: { design: "perfect" } } },
      ]),
    ).toEqual([
      'undeclared-attribute: attribute "colour" is not declared',
      'unknown-value: "perfect" is not a value of design (missing, ready)',
    ]);
  });
});
