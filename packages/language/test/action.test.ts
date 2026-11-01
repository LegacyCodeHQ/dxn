import { expect as assert, describe, it } from "vitest";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { errors, problems } from "./support/language.js";

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
        action?.name,
        focus?.name ?? null,
      ]),
      toolbar?.triggers.map(({ event, action, focus }) => [
        event.kind,
        action?.name,
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
      action("action close: menu open -> open"),
    ]).toEqual([
      ['22:30: unknown-value: "shut" is not a value of menu (closed, open)'],
      ["23:10: duplicate-action: close is already an action of Menu"],
      ["22:17: unknown-state: menus is not a state of Menu (menu)"],
      ["22:30: unchanged-action: close changes nothing: menu is open before and after"],
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

  it("reports nothing more about a path through a child whose type is not one", () => {
    assert(
      errors(`enum State = closed | open
type Menu {
  state menu: State
  has toggle: Nope
  action close: menu open -> closed
  on click toggle.x: close
  on key Escape: toggle.y.close, focus toggle.z
}
`),
    ).toEqual(["4:15: unknown-type: Nope is not a type (Menu)"]);
  });

  it("uses a dimension its event changes, which its type needs", () => {
    const menu = (needs: string) => `dimension Breakpoint = base | lg
enum State = closed | open
type Menu${needs} {
  state menu: State
  action close: menu open -> closed
  on Breakpoint = lg: close
}
`;
    assert([problems(menu(" needs Breakpoint")), problems(menu(""))]).toEqual([
      [],
      [
        '6:6: unneeded-dimension: Menu does not need Breakpoint; declare "type Menu needs Breakpoint"',
      ],
    ]);
  });

  it("has a name of its own, not one of a state or a child of its type", () => {
    assert([
      errors(
        model.replace(
          "  action close: menu open -> closed\n",
          "  action close: menu open -> closed\n  action menu: menu open -> closed\n",
        ),
      ),
      errors(
        model.replace(
          "  action close: menu open -> closed\n",
          "  action close: menu open -> closed\n  action toggle: menu open -> closed\n",
        ),
      ),
    ]).toEqual([
      ["23:10: duplicate-action: menu is already a state of Menu"],
      ["23:10: duplicate-action: toggle is already a child of Menu"],
    ]);
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

const button = (...lines: string[]) => `dimension Keyboard = keyboard | no-keyboard
enum Press = released | pressed
enum Focus = blurred | focused

type Button needs Keyboard {
  state press: Press
  state focus: Focus
  focus = focused only when Keyboard = keyboard
  action push: press released -> pressed
${lines.map((line) => `  ${line}\n`).join("")}}

type Page {
  has button: Button
}
`;

describe("a trigger only when", () => {
  it("fires only where its condition holds", () => {
    const source = button("on key Space: push only when focus = focused");
    const trigger = parse(source).types[0]?.triggers[0];
    assert([problems(source), trigger?.when?.kind, trigger?.action?.name]).toEqual([
      [],
      "compare",
      "push",
    ]);
  });

  it("is checked as any condition is", () => {
    assert([
      errors(button("on key Space: push only when fokus = focused")),
      errors(button("on key Space: push only when focus = blurd")),
      problems(button("on key Space: push only when focus in (blurred, focused)")),
    ]).toEqual([
      ["10:32: unknown-state: fokus is not a state of Button (press, focus)"],
      ['10:40: unknown-value: "blurd" is not a value of focus (blurred, focused)'],
      [
        "10:3: warning: vacuous-condition: focus in (blurred, focused) is always true, so the trigger always fires",
      ],
    ]);
  });

  it("does not make an event ambiguous where the conditions can never both hold", () => {
    const twice = (first: string, second: string) =>
      errors(
        button(
          "action hold: press released -> pressed",
          `on key Space: push only when ${first}`,
          `on key Space: hold only when ${second}`,
        ),
      );
    assert([
      twice("focus = focused", "focus = blurred"),
      twice("focus = focused", "Keyboard = keyboard"),
    ]).toEqual([
      [],
      ["12:3: ambiguous-event: key Space triggers both push and hold when press = released"],
    ]);
  });

  it("is applied by an expectation only where it holds, and nothing happens elsewhere", () => {
    const rule = (when: string, then: string) =>
      `${button("on key Space: push only when focus = focused")}
expect "Space presses the button only while it is focused" {
  in Page.button
  when ${when}
  on key Space
  then ${then}
}
`;
    assert([
      problems(rule("focus = focused", "press = pressed")),
      problems(rule("focus = blurred, press = released", "press = released")),
      problems(rule("focus = blurred, press = released", "press = pressed")),
    ]).toEqual([
      [],
      [],
      [
        "17:8: expectation-failed: Space presses the button only while it is focused: nothing happens on key Space to Page.button when focus = blurred, press = released",
      ],
    ]);
  });
});

const pressing = (...lines: string[]) => `dimension Keyboard = keyboard | no-keyboard
enum Press = released | pressed
enum Focus = blurred | focused
enum Layout = compact | inline

type Button needs Keyboard {
  state press: Press
  state focus: Focus
  state layout: Layout = when Keyboard { keyboard -> inline, no-keyboard -> compact }
  focus = focused only when Keyboard = keyboard
${lines.map((line) => `  ${line}\n`).join("")}}

type Page {
  has button: Button
}
`;

describe("an expectation on an event", () => {
  it("finds some combination it changes, where nothing fires in others", () => {
    const rule = (assertion: string) =>
      `${pressing("on key Space: press -> pressed only when focus = focused")}
expect "Space can press it" {
  in Page.button
  when press = released
  on key Space
  ${assertion}
}
`;
    assert([
      problems(rule("some press = pressed")),
      problems(rule("then press = pressed")),
    ]).toEqual([
      [],
      [
        "18:8: expectation-failed: Space can press it: nothing happens on key Space to Page.button when press = released",
      ],
    ]);
  });
});

describe("a change written in a trigger", () => {
  it("changes one of the type's own states to a value, with no action to name", () => {
    const source = pressing(
      "on key Space: press -> pressed only when focus = focused",
      "on key Escape: press -> released",
    );
    const [first] = parse(source).types[0]?.triggers ?? [];
    assert([problems(source), first?.change?.state.name, first?.change?.to.name]).toEqual([
      [],
      "press",
      "pressed",
    ]);
  });

  it("is on a state of the type that a change can change, to one of its values", () => {
    assert([
      errors(pressing("on key Space: pres -> pressed")),
      errors(pressing("on key Space: press -> presed")),
      errors(pressing("on key Space: layout -> compact")),
      errors(pressing("on key Space: page.press -> pressed")),
    ]).toEqual([
      ["11:17: unknown-state: pres is not a state of Button (press, focus, layout)"],
      ['11:26: unknown-value: "presed" is not a value of press (released, pressed)'],
      ["11:17: action-on-derived: layout is decided by its when; no change can change it"],
      [
        '11:17: syntax-error: a change is on one of the type\'s own states, not "page.press"; change a child through one of its actions',
      ],
    ]);
  });

  it("is one change of an event, like a named action's", () => {
    assert([
      errors(
        pressing(
          "action push: press released -> pressed",
          "on key Space: push",
          "on key Space: press -> pressed",
        ),
      ),
      errors(pressing("on key Space: press -> pressed", "on key Space: press -> pressed")),
    ]).toEqual([
      ["13:3: duplicate-trigger: key Space already triggers press -> pressed"],
      ["12:3: duplicate-trigger: key Space already triggers press -> pressed"],
    ]);
  });

  it("is applied by an expectation, wherever the state is not yet its value", () => {
    const rule = (then: string) =>
      `${pressing("on key Space: press -> pressed only when focus = focused")}
expect "Space presses the focused button" {
  in Page.button
  when focus = focused
  on key Space
  then ${then}
}
`;
    assert([problems(rule("press = pressed")), problems(rule("press = released")).length]).toEqual([
      [],
      1,
    ]);
  });

  it("cannot change a state its parent binds, and is renamed with its value", () => {
    const bound = `enum State = closed | open
type Toggle {
  state expanded: State
  on key Space: expanded -> open
}
type Menu {
  state menu: State
  has toggle: Toggle { expanded = menu }
}
`;
    const source = pressing("on key Space: press -> pressed");
    assert([
      errors(bound),
      renameInSource(parse(source), source, "Press", "pressed", "down"),
    ]).toEqual([
      [
        "8:24: bound-action: expanded is bound here, so Toggle's change on key Space can never change it",
      ],
      source.replace("released | pressed", "released | down").replace("-> pressed", "-> down"),
    ]);
  });
});
