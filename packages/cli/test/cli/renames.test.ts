import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A menu whose state is the openness group, with every kind of reference to
// its nodes, states and dimension values: transitions, onlyWhen, include
// states, records (its own state, an ancestor's state, a transition) and an
// expectation.
const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], openness: ["closed", "open"] },
    checks: { visual: {}, behavior: {} },
    types: {
      link: { stateGroups: ["hover"], checks: ["visual"] },
      menu: { stateGroups: ["openness"], shared: true, checks: ["behavior"] },
    },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          transitions: [
            { id: "expand", from: "closed", to: "open", on: "click", target: "button" },
            {
              id: "escape",
              from: "open",
              to: "closed",
              on: "keydown",
              key: "Escape",
              focus: "button",
            },
            {
              id: "widen",
              from: "open",
              to: "closed",
              on: "resize",
              when: { breakpoint: ["lg"] },
              focus: "button",
            },
          ],
          children: [
            { id: "button", title: "Button", type: "link" },
            {
              id: "panel",
              title: "Panel",
              onlyWhen: { menu: ["open"] },
              children: [{ id: "item", title: "Item", type: "link" }],
            },
          ],
        },
      ],
    },
  },
  "roots/page.json": rootFile({
    id: "page",
    title: "Page",
    children: [{ include: "toolbar", states: { item: { hover: ["hovered"] } } }],
  }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["sm", "lg"],
    default: "sm",
    appliesTo: ["toolbar"],
  },
  "actors.json": { version: 1, actors: { agent: { checks: ["visual", "behavior"] } } },
  "verification/page.json": {
    version: 1,
    records: [
      { node: "menu", context: { menu: "closed" }, ...passed("behavior") },
      { node: "item", context: { menu: "open", hover: "hovered" }, ...passed("visual") },
      { node: "menu", transition: "escape", ...passed("behavior") },
    ],
  },
  "expectations.json": {
    version: 1,
    expectations: [
      {
        title: "The item, hovered in the open menu on a wide screen",
        node: "item",
        root: "page",
        when: { menu: "open", breakpoint: "lg" },
        some: { hover: "hovered" },
      },
    ],
  },
};

function passed(check: string) {
  return { check, result: "passed", actor: "agent", at: "2026-10-30T10:00:00Z" };
}

interface Transition {
  from: string;
  to: string;
  target?: string;
  focus?: string;
  when?: Record<string, string[]>;
}
interface Menu {
  transitions: Transition[];
  children: { onlyWhen?: Record<string, string[]> }[];
}
interface Record_ {
  node: string;
  context?: Record<string, string>;
}
interface Expectation {
  node: string;
  root?: string;
  when: Record<string, string>;
  some: Record<string, string>;
}

function renamed(...argv: string[]) {
  const project = cliProject(files);
  const result = project.run(...argv);
  const validate = project.run("prototype", "validate");
  const read = project.read as (name: string) => unknown;
  return {
    result,
    validate,
    exists: project.exists,
    menu: () =>
      (read("fragments/toolbar.json") as { fragment: { children: Menu[] } }).fragment
        .children[0] as Menu,
    records: () => (read("verification/page.json") as { records: Record_[] }).records,
    expectation: () =>
      (read("expectations.json") as { expectations: Expectation[] }).expectations[0] as Expectation,
    includeStates: () =>
      (read("roots/page.json") as { root: { children: { states?: unknown }[] } }).root.children[0]
        ?.states,
  };
}

describe("renames update every reference", () => {
  it("node rename: a transition's target and focus", () => {
    const { result, validate, menu } = renamed("prototype", "node", "rename", "button", "trigger");
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(menu().transitions.map((t: Transition) => [t.target ?? null, t.focus ?? null])).toEqual([
      ["trigger", null],
      [null, "trigger"],
      [null, "trigger"],
    ]);
  });

  it("node rename: a shared node in onlyWhen, records and expectations", () => {
    const { result, validate, menu, records, expectation } = renamed(
      "prototype",
      "node",
      "rename",
      "menu",
      "nav",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(menu().children[1]?.onlyWhen).toEqual({ nav: ["open"] });
    expect(records().map((r: Record_) => [r.node, r.context])).toEqual([
      ["nav", { nav: "closed" }],
      ["item", { nav: "open", hover: "hovered" }],
      ["nav", undefined],
    ]);
    expect(expectation().when).toEqual({ nav: "open", breakpoint: "lg" });
  });

  it("node rename: include states and an expectation's node", () => {
    const { result, validate, expectation, includeStates } = renamed(
      "prototype",
      "node",
      "rename",
      "item",
      "entry",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(includeStates()).toEqual({
      entry: { hover: ["hovered"] },
    });
    expect(expectation().node).toBe("entry");
  });

  it("node rename: a root in expectations", () => {
    const { result, validate, expectation, exists } = renamed(
      "prototype",
      "node",
      "rename",
      "page",
      "home",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(expectation().root).toBe("home");
    expect([exists("roots/home.json"), exists("verification/home.json")]).toEqual([true, true]);
  });

  it("state-group rename-value: a shared node's transitions, onlyWhen, records and expectations", () => {
    const { result, validate, menu, records, expectation } = renamed(
      "prototype",
      "state-group",
      "rename-value",
      "openness",
      "open",
      "expanded",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(menu().transitions.map((t: Transition) => [t.from, t.to])).toEqual([
      ["closed", "expanded"],
      ["expanded", "closed"],
      ["expanded", "closed"],
    ]);
    expect(menu().children[1]?.onlyWhen).toEqual({ menu: ["expanded"] });
    expect(records()[1]?.context?.menu).toBe("expanded");
    expect(expectation().when.menu).toBe("expanded");
  });

  it("state-group rename-value: include states, records and expectations", () => {
    const { result, validate, records, expectation, includeStates } = renamed(
      "prototype",
      "state-group",
      "rename-value",
      "hover",
      "hovered",
      "over",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(includeStates()).toEqual({ item: { hover: ["over"] } });
    expect(records()[1]?.context?.hover).toBe("over");
    expect(expectation().some.hover).toBe("over");
  });

  it("dimension rename-value: a transition's when and expectations", () => {
    const { result, validate, menu, expectation } = renamed(
      "prototype",
      "dimension",
      "rename-value",
      "breakpoint",
      "lg",
      "wide",
    );
    expect([result.code, validate.code]).toEqual([0, 0]);
    expect(menu().transitions[2]?.when).toEqual({ breakpoint: ["wide"] });
    expect(expectation().when.breakpoint).toBe("wide");
  });
});

describe("renames of a shared node's states", () => {
  it("rename the keys of its overrides file", () => {
    const { run, read } = cliProject({
      ...files,
      "overrides/menu.json": {
        version: 1,
        overrides: { open: { nodes: { button: { states: { remove: ["hovered"] } } } } },
      },
    });
    expect(
      run("prototype", "state-group", "rename-value", "openness", "open", "expanded").code,
    ).toBe(0);
    expect(Object.keys(read("overrides/menu.json").overrides as object)).toEqual(["expanded"]);
  });
});
