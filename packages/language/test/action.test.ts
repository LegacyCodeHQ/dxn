import { expect as assert, describe, it } from "vitest";
import type { Effect } from "../src/ast.js";
import { parse } from "../src/parse.js";
import { renameInSource } from "../src/rename.js";
import { errors, problems } from "./support/language.js";

const model = `dimension Breakpoint = base | lg
enum Focus = blurred | focused
enum Layout = compact | inline
type Button {
  event activate
  state focus: Focus
  action take-focus: focus blurred -> focused
}
type Link {
  event activate
  state focus: Focus
  action take-focus: focus blurred -> focused
}
type Menu {
  enum State = closed | open
  state menu: State
  type Panel {
    has blog: Link
  }
  has toggle: Button
  has panel: Panel only when menu = open
  event escape
  action open: menu closed -> open
  action close: menu open -> closed

  on toggle.activate: open
  on toggle.activate: close
  on escape: close, toggle.take-focus
  on panel.blog.activate: close, toggle.take-focus
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base -> compact
    lg -> inline
  }
  has wordmark: Link
  has link: Link only when layout = inline
  has menu: Menu only when layout = compact
  event outside, escape
  on wordmark.activate: menu.close
  on outside: menu.close
  on Breakpoint = lg: menu.close, link.take-focus
}

type Page {
  has toolbar: Toolbar
}
`;

// A trigger's only change, as written: an action's name.
const named = (does: Effect[]) =>
  does.map((effect) => (effect.kind === "action" ? effect.name.name : "")).join(", ");

describe("actions and on", () => {
  it("name how a type's own state changes, and what triggers each change", () => {
    const file = parse(model);
    const menu = file.types.find(({ name }) => name === "Menu");
    const toolbar = file.types.find(({ name }) => name === "Toolbar");
    assert([
      problems(model),
      menu?.actions.map(({ name, state, from, to }) => [name.name, state.name, from.name, to.name]),
      menu?.triggers.map(({ event, does }) => [event.kind, named(does)]),
      toolbar?.triggers.map(({ event, does }) => [event.kind, named(does)]),
    ]).toEqual([
      [],
      [
        ["open", "menu", "closed", "open"],
        ["close", "menu", "open", "closed"],
      ],
      [
        ["named", "open"],
        ["named", "close"],
        ["named", "close, toggle.take-focus"],
        ["named", "close, toggle.take-focus"],
      ],
      [
        ["named", "menu.close"],
        ["named", "menu.close"],
        ["dimension", "menu.close, link.take-focus"],
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
      ['24:30: unknown-value: "shut" is not a value of menu (closed, open)'],
      ["25:10: duplicate-action: close is already an action of Menu"],
      ["24:17: unknown-state: menus is not a state of Menu; did you mean menu?"],
      ["24:30: unchanged-action: close changes nothing: menu is open before and after"],
    ]);
    assert(
      errors(
        "dimension Breakpoint = base | lg\nenum Layout = compact | inline\ntype Toolbar needs Breakpoint {\n  state layout: Layout = when Breakpoint {\n    base -> compact\n    lg -> inline\n  }\n  action squeeze: layout inline -> compact\n}\n",
      ),
    ).toEqual(["8:19: action-on-derived: layout is decided by its when; no action can change it"]);
  });

  it("is triggered by an event on the type: a child, a key, a pointer outside it, or a dimension", () => {
    const on = (line: string) =>
      errors(model.replace("  on wordmark.activate: menu.close\n", `  ${line}\n`));
    assert([
      on("on wordmrk.activate: menu.close"),
      on("on wordmark.activate: menu.shut"),
      on("on wordmark.activate: shut"),
      on("on Breakpoint = xl: menu.close"),
      on("on wordmark.activate: menu.close, layout.take-focus"),
    ]).toEqual([
      ["41:6: unknown-child: wordmrk is not a child of Toolbar; did you mean wordmark?"],
      ["41:25: unknown-action: shut is not an action of Menu (open, close)"],
      ["41:25: unknown-action: shut is not an action of Toolbar; it has none"],
      ['41:19: unknown-value: "xl" is not a value of Breakpoint (base, lg)'],
      ["41:37: unknown-child: layout is not a child of Toolbar (wordmark, link, menu)"],
    ]);
    assert(
      problems(
        model.replace("  on escape: close, toggle.take-focus", "  on escape: close, focus toggle"),
      ),
    ).toEqual([
      '28:21: syntax-error: "focus toggle" is not a change: move focus with an action of the child, such as toggle.take-focus',
    ]);
    assert(
      problems(
        model.replace(
          "  on escape: close, toggle.take-focus",
          "  on escape: close, focus panel.blog",
        ),
      ),
    ).toEqual([
      '28:21: syntax-error: "focus panel.blog" is not a change: move focus with an action of the child, such as panel.blog.take-focus',
    ]);
  });

  it("reports nothing more about a path through a child whose type is not one", () => {
    assert(
      errors(`enum State = closed | open
type Menu {
  event escape
  state menu: State
  has toggle: Nope
  action close: menu open -> closed
  on toggle.x.activate: close
  on escape: toggle.y.close, toggle.z.take-focus
}
`),
    ).toEqual(["5:15: unknown-type: Nope is not a type (Menu)"]);
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
      ["25:10: duplicate-action: menu is already a state of Menu"],
      ["25:10: duplicate-action: toggle is already a child of Menu"],
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
          "  on toggle.activate: close\n",
          "  on toggle.activate: close\n  action reopen: menu closed -> open\n  on toggle.activate: reopen\n",
        ),
      ),
    ).toEqual([
      "29:3: ambiguous-event: toggle.activate triggers both open and reopen when menu = closed",
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
          .replace("  on Breakpoint = lg: menu.close, link.take-focus\n", `  ${lines}\n`),
      );
    assert([
      shut("on Breakpoint in (base, lg): menu.close\n  on Breakpoint = lg: menu.shut"),
      shut("on escape: menu.close\n  on escape: menu.shut"),
      shut("on escape: menu.close\n  on escape: menu.close"),
      shut("on Breakpoint = base: menu.close\n  on Breakpoint = lg: menu.shut"),
    ]).toEqual([
      [
        "45:3: ambiguous-event: Breakpoint = lg triggers both menu.close and menu.shut when menu.menu = open",
      ],
      [
        "45:3: ambiguous-event: escape triggers both menu.close and menu.shut when menu.menu = open",
      ],
      ["45:3: duplicate-trigger: escape already triggers menu.close"],
      [],
    ]);
  });

  it("is renamed in an expectation's key on a child's state", () => {
    const source = `${model}
expect "Escape returns focus to the button" {
  in Page.toolbar.menu
  when menu = open
  on escape
  then menu = closed, toggle.focus = focused
}
`;
    const renamed = renameInSource(parse(source), source, "Focus", "focused", "ringed");
    assert([renamed.includes("toggle.focus = ringed"), problems(renamed)]).toEqual([true, []]);
  });

  it("can be the subject of an expectation: its state, and its children's, after the event", () => {
    const rule = (then: string) => `${model}
expect "Escape closes the menu and returns focus to its button" {
  in Page.toolbar.menu
  when menu = open
  on escape
  then ${then}
}
`;
    assert([
      problems(rule("menu = closed, toggle.focus = focused")),
      problems(rule("menu = closed, toggle.focus = blurred")),
      problems(
        rule("menu = closed, toggle.focus = focused").replace(
          "  on escape: close, toggle.take-focus\n",
          "",
        ),
      ),
    ]).toEqual([
      [],
      [
        "50:8: expectation-failed: Escape closes the menu and returns focus to its button: on escape, toggle.focus becomes focused, not blurred",
      ],
      [
        "49:8: expectation-failed: Escape closes the menu and returns focus to its button: nothing happens on escape to Page.toolbar.menu when menu = open",
      ],
    ]);
  });

  it("says what it expected when the syntax is wrong", () => {
    assert([
      problems(model.replace("action open: menu closed -> open", "action open: menu closed open")),
      problems(model.replace("on escape: close", "on press Escape: close")),
    ]).toEqual([
      ['23:28: syntax-error: expected "->" after "closed", found "open"'],
      ['28:12: syntax-error: expected ":" after the event, found "Escape"'],
    ]);
  });
});

const button = (...lines: string[]) => `dimension Keyboard = keyboard | no-keyboard
enum Press = released | pressed
enum Focus = blurred | focused

type Button needs Keyboard {
  event space
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
    const source = button("on space: push only when focus = focused");
    const trigger = parse(source).types[0]?.triggers[0];
    assert([problems(source), trigger?.when?.kind, named(trigger?.does ?? [])]).toEqual([
      [],
      "compare",
      "push",
    ]);
  });

  it("is checked as any condition is", () => {
    assert([
      errors(button("on space: push only when fokus = focused")),
      errors(button("on space: push only when focus = blurd")),
      problems(button("on space: push only when focus in (blurred, focused)")),
    ]).toEqual([
      ["11:28: unknown-state: fokus is not a state of Button; did you mean focus?"],
      ['11:36: unknown-value: "blurd" is not a value of focus (blurred, focused)'],
      [
        "11:3: warning: vacuous-condition: focus in (blurred, focused) is always true, so the trigger always fires",
      ],
    ]);
  });

  it("does not make an event ambiguous where the conditions can never both hold", () => {
    const twice = (first: string, second: string) =>
      errors(
        button(
          "action hold: press released -> pressed",
          `on space: push only when ${first}`,
          `on space: hold only when ${second}`,
        ),
      );
    assert([
      twice("focus = focused", "focus = blurred"),
      twice("focus = focused", "Keyboard = keyboard"),
    ]).toEqual([
      [],
      ["13:3: ambiguous-event: space triggers both push and hold when press = released"],
    ]);
  });

  it("is applied by an expectation only where it holds, and nothing happens elsewhere", () => {
    const rule = (when: string, then: string) =>
      `${button("on space: push only when focus = focused")}
expect "Space presses the button only while it is focused" {
  in Page.button
  when ${when}
  on space
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
        "18:8: expectation-failed: Space presses the button only while it is focused: nothing happens on space to Page.button when focus = blurred, press = released",
      ],
    ]);
  });
});

const pressing = (...lines: string[]) => `dimension Keyboard = keyboard | no-keyboard
enum Press = released | pressed
enum Focus = blurred | focused
enum Layout = compact | inline

type Button needs Keyboard {
  event space, escape
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
      `${pressing("on space: press -> pressed only when focus = focused")}
expect "Space can press it" {
  in Page.button
  when press = released
  on space
  ${assertion}
}
`;
    assert([
      problems(rule("some press = pressed")),
      problems(rule("then press = pressed")),
    ]).toEqual([
      [],
      [
        "19:8: expectation-failed: Space can press it: nothing happens on space to Page.button when press = released",
      ],
    ]);
  });
});

describe("an expectation on an event, into a combination", () => {
  it("fails where the change would make a combination that cannot exist", () => {
    const link = `dimension Pointer = mouse | touch
enum Hover = rest | hovered
type Link needs Pointer {
  event h
  state hover: Hover
  hover = hovered only when Pointer = mouse
  on h: hover -> hovered
}
type Page {
  has link: Link
}
expect "H hovers the link" {
  in Page.link
  when Pointer = touch
  on h
  then hover = hovered
}
`;
    assert(problems(link)).toEqual([
      "12:8: expectation-failed: H hovers the link: on h, Page.link on Pointer touch would have hover = hovered, which it cannot have there",
    ]);
  });
});

describe("a change written in a trigger", () => {
  it("changes one of the type's own states to a value, with no action to name", () => {
    const source = pressing(
      "on space: press -> pressed only when focus = focused",
      "on escape: press -> released",
    );
    const [first] = parse(source).types[0]?.triggers[0]?.does ?? [];
    assert([
      problems(source),
      first?.kind === "change" && first.state.name,
      first?.kind === "change" && first.to.name,
    ]).toEqual([[], "press", "pressed"]);
  });

  it("is on a state of the type that a change can change, to one of its values", () => {
    assert([
      errors(pressing("on space: pres -> pressed")),
      errors(pressing("on space: press -> presed")),
      errors(pressing("on space: layout -> compact")),
      errors(pressing("on space: page.press -> pressed")),
    ]).toEqual([
      ["12:13: unknown-state: pres is not a state of Button; did you mean press?"],
      ['12:22: unknown-value: "presed" is not a value of press (released, pressed)'],
      ["12:13: action-on-derived: layout is decided by its when; no change can change it"],
      [
        '12:13: syntax-error: a change is on one of the type\'s own states, not "page.press"; change a child through one of its actions',
      ],
    ]);
  });

  it("is one change of an event, like a named action's", () => {
    assert([
      errors(
        pressing(
          "action push: press released -> pressed",
          "on space: push",
          "on space: press -> pressed",
        ),
      ),
      errors(pressing("on space: press -> pressed", "on space: press -> pressed")),
    ]).toEqual([
      ["14:3: duplicate-trigger: space already triggers press -> pressed"],
      ["13:3: duplicate-trigger: space already triggers press -> pressed"],
    ]);
  });

  it("is applied by an expectation, wherever the state is not yet its value", () => {
    const rule = (then: string) =>
      `${pressing("on space: press -> pressed only when focus = focused")}
expect "Space presses the focused button" {
  in Page.button
  when focus = focused
  on space
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
  event space
  state expanded: State
  on space: expanded -> open
}
type Menu {
  state menu: State
  has toggle: Toggle { expanded = menu }
}
`;
    const source = pressing("on space: press -> pressed");
    assert([
      errors(bound),
      renameInSource(parse(source), source, "Press", "pressed", "down"),
    ]).toEqual([
      [
        "9:24: bound-action: expanded is bound here, so Toggle's change on space can never change it",
      ],
      source.replace("released | pressed", "released | down").replace("-> pressed", "-> down"),
    ]);
  });
});

const several = (...lines: string[]) => `enum Openness = closed | open
enum Ring = hidden | visible
enum Lit = off | on

type Button {
  state ring: Ring
  action take-focus: ring hidden -> visible
}

type Menu {
  event escape, space
  state menu: Openness
  state lamp: Lit
  state bell: Lit
  has toggle: Button
  action close: menu open -> closed
${lines.map((line) => `  ${line}\n`).join("")}}

type Page {
  has menu: Menu
}
`;

describe("a trigger with several changes", () => {
  it("makes each, its own actions, a child's, and changes in place", () => {
    const source = several(
      "on escape: close, toggle.take-focus",
      "on space: lamp -> on, bell -> on, toggle.take-focus",
    );
    const triggers = parse(source).types.find(({ name }) => name === "Menu")?.triggers ?? [];
    assert([
      problems(source),
      triggers.map(({ does }) =>
        does.map((effect) =>
          effect.kind === "action" ? effect.name.name : `${effect.state.name} -> ${effect.to.name}`,
        ),
      ),
    ]).toEqual([
      [],
      [
        ["close", "toggle.take-focus"],
        ["lamp -> on", "bell -> on", "toggle.take-focus"],
      ],
    ]);
  });

  it("checks each change, and changes one state once", () => {
    assert([
      errors(several("on escape: close, toggle.take-focs")),
      errors(several("on space: lamp -> on, lamp -> off")),
    ]).toEqual([
      ["17:21: unknown-action: take-focs is not an action of Button; did you mean take-focus?"],
      ["17:25: conflicting-change: space changes lamp twice"],
    ]);
  });

  it("is applied by an expectation, every change of the element's own", () => {
    const rule = `${several("on space: lamp -> on, bell -> on")}
expect "Space lights both" {
  in Page.menu
  when lamp = off, bell = off
  on space
  then lamp = on, bell = on
}
`;
    assert(problems(rule)).toEqual([]);
  });
});

describe("an expectation on a child's state, after an event", () => {
  const rule = (trigger: string, then: string) => `${several(trigger)}
expect "Escape closes the menu and the toggle takes focus" {
  in Page.menu
  when menu = open
  on escape
  then ${then}
}
`;

  it("checks what the event changes in a child, by the child's path", () => {
    assert([
      problems(rule("on escape: close, toggle.take-focus", "menu = closed, toggle.ring = visible")),
      problems(rule("on escape: close, toggle.take-focus", "menu = closed, toggle.ring = hidden")),
      problems(rule("on escape: close", "menu = closed, toggle.ring = visible")),
    ]).toEqual([
      [],
      [
        "24:8: expectation-failed: Escape closes the menu and the toggle takes focus: on escape, toggle.ring becomes visible, not hidden",
      ],
      [
        "24:8: expectation-failed: Escape closes the menu and the toggle takes focus: on escape, toggle.ring does not change",
      ],
    ]);
  });

  it("names a child's state that is one, with one of its values", () => {
    assert([
      problems(rule("on escape: close, toggle.take-focus", "toggle.rng = visible")),
      problems(rule("on escape: close, toggle.take-focus", "toggle.ring = vsible")),
    ]).toEqual([
      [
        "24:8: expectation-empty: Escape closes the menu and the toggle takes focus tests nothing: no element in Page.menu has toggle.rng",
      ],
      [
        '24:8: expectation-empty: Escape closes the menu and the toggle takes focus tests nothing: "vsible" is not a value of toggle.ring (hidden, visible)',
      ],
    ]);
  });
});
