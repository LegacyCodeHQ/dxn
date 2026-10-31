import { expect as assert, describe, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { errors, problems } from "../support/language.js";

const model = `dimension Breakpoint = base | lg
enum Focus = blurred | focused
enum Layout = compact | inline

type Button {
  state focus: Focus
}
type Link {
  state focus: Focus
}

type Menu {
  enum State = closed | open
  state menu: State
  type Panel {
    has blog: Link
  }
  has toggle: Button
  has panel: Panel only when menu = open

  action open: menu closed -> open
  action close: menu open -> closed

  on click toggle: open
  on click toggle: close
  on key Escape: close, focus toggle
  on click panel.blog: close, focus toggle
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base -> compact
    lg -> inline
  }
  has wordmark: Link
  has link: Link only when layout = inline
  has menu: Menu only when layout = compact

  on click wordmark: menu.close
  on pointer outside: menu.close
  on Breakpoint = lg: menu.close, focus link
}

type Page {
  has toolbar: Toolbar
}
`;

describe("actions and on", () => {
  it("name how a type's own state changes, and what triggers each change", () => {
    const file = parse(model);
    const menu = file.types.find(({ name }) => name === "Menu");
    const toolbar = file.types.find(({ name }) => name === "Toolbar");
    assert([
      problems(model),
      menu?.actions.map(({ name, state, from, to }) => [name.name, state.name, from.name, to.name]),
      menu?.triggers.map(({ event, action, focus }) => [
        event.kind,
        action.name,
        focus?.name ?? null,
      ]),
      toolbar?.triggers.map(({ event, action, focus }) => [
        event.kind,
        action.name,
        focus?.name ?? null,
      ]),
    ]).toEqual([
      [],
      [
        ["open", "menu", "closed", "open"],
        ["close", "menu", "open", "closed"],
      ],
      [
        ["click", "open", null],
        ["click", "close", null],
        ["key", "close", "toggle"],
        ["click", "close", "toggle"],
      ],
      [
        ["click", "menu.close", null],
        ["pointer-outside", "menu.close", null],
        ["dimension", "menu.close", "link"],
      ],
    ]);
  });

  it("changes a state the type owns, from one of its values to another", () => {
    const action = (line: string) =>
      errors(model.replace("  action close: menu open -> closed\n", `  ${line}\n`));
    assert([
      action("action close: menu open -> shut"),
      action("action close: menu open -> closed\n  action close: menu closed -> open"),
      action("action close: menus open -> closed"),
    ]).toEqual([
      ['22:30: unknown-value: "shut" is not a value of menu (closed, open)'],
      ["23:10: duplicate-action: close is already an action of Menu"],
      ["22:17: unknown-state: menus is not a state of Menu (menu)"],
    ]);
    assert(
      errors(
        "dimension Breakpoint = base | lg\nenum Layout = compact | inline\ntype Toolbar needs Breakpoint {\n  state layout: Layout = when Breakpoint {\n    base -> compact\n    lg -> inline\n  }\n  action squeeze: layout inline -> compact\n}\n",
      ),
    ).toEqual(["8:19: action-on-derived: layout is decided by its when; no action can change it"]);
  });

  it("is triggered by an event on the type: a child, a key, a pointer outside it, or a dimension", () => {
    const on = (line: string) =>
      errors(model.replace("  on click wordmark: menu.close\n", `  ${line}\n`));
    assert([
      on("on click wordmrk: menu.close"),
      on("on click wordmark: menu.shut"),
      on("on click wordmark: shut"),
      on("on Breakpoint = xl: menu.close"),
      on("on click wordmark: menu.close, focus layout"),
    ]).toEqual([
      ["39:12: unknown-child: wordmrk is not a child of Toolbar (wordmark, link, menu)"],
      ["39:22: unknown-action: shut is not an action of Menu (open, close)"],
      ["39:22: unknown-action: shut is not an action of Toolbar; it has none"],
      ['39:19: unknown-value: "xl" is not a value of Breakpoint (base, lg)'],
      ["39:40: unknown-child: layout is not a child of Toolbar (wordmark, link, menu)"],
    ]);
    assert(
      errors(
        model.replace(
          "  on key Escape: close, focus toggle",
          "  on key Escape: close, focus panel",
        ),
      ),
    ).toEqual(["26:31: focus-target: panel cannot take focus: Menu.Panel has no focus state"]);
  });

  it("cannot change a state its parent binds", () => {
    assert(
      errors(`enum State = closed | open
type Toggle {
  state expanded: State
  action flip: expanded closed -> open
}
type Menu {
  state menu: State
  has toggle: Toggle { expanded = menu }
}
`),
    ).toEqual([
      "8:24: bound-action: expanded is bound here, so Toggle's action flip can never change it",
    ]);
  });

  it("cannot trigger two actions at once: one event, one change", () => {
    assert(
      errors(
        model.replace(
          "  on click toggle: close\n",
          "  on click toggle: close\n  action reopen: menu closed -> open\n  on click toggle: reopen\n",
        ),
      ),
    ).toEqual([
      "27:3: ambiguous-event: click toggle triggers both open and reopen when menu = closed",
    ]);
  });

  it("cannot trigger two actions at once where events overlap, or a child's", () => {
    const shut = (lines: string) =>
      errors(
        model
          .replace(
            "  action close: menu open -> closed\n",
            "  action close: menu open -> closed\n  action shut: menu open -> closed\n",
          )
          .replace("  on Breakpoint = lg: menu.close, focus link\n", `  ${lines}\n`),
      );
    assert([
      shut("on Breakpoint in (base, lg): menu.close\n  on Breakpoint = lg: menu.shut"),
      shut("on key Escape: menu.close\n  on key Escape: menu.shut"),
      shut("on key Escape: menu.close\n  on key Escape: menu.close"),
      shut("on Breakpoint = base: menu.close\n  on Breakpoint = lg: menu.shut"),
    ]).toEqual([
      [
        "43:3: ambiguous-event: Breakpoint = lg triggers both menu.close and menu.shut when menu.menu = open",
      ],
      [
        "43:3: ambiguous-event: key Escape triggers both menu.close and menu.shut when menu.menu = open",
      ],
      ["43:3: duplicate-trigger: key Escape already triggers menu.close"],
      [],
    ]);
  });

  it("can be the subject of an expectation: its state, and where focus goes, after the event", () => {
    const rule = (then: string) => `${model}
expect "Escape closes the menu and returns focus to its button" {
  in Page.toolbar.menu
  when menu = open
  on key Escape
  then ${then}
}
`;
    assert([
      problems(rule("menu = closed, focus = toggle")),
      problems(rule("menu = closed, focus = panel.blog")),
      problems(
        rule("menu = closed, focus = toggle").replace("  on key Escape: close, focus toggle\n", ""),
      ),
    ]).toEqual([
      [],
      [
        "48:8: expectation-failed: Escape closes the menu and returns focus to its button: on key Escape, focus goes to toggle, not panel.blog",
      ],
      [
        "47:8: expectation-failed: Escape closes the menu and returns focus to its button: nothing happens on key Escape to Page.toolbar.menu when menu = open",
      ],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    assert([
      problems(model.replace("action open: menu closed -> open", "action open: menu closed open")),
      problems(model.replace("on key Escape: close", "on press Escape: close")),
    ]).toEqual([
      ['21:28: syntax-error: expected "->" after "closed", found "open"'],
      [
        '26:6: syntax-error: expected "click", "key", "pointer" or a dimension after "on", found "press"',
      ],
    ]);
  });
});
