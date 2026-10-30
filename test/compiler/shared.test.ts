import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, type Files } from "../support/project.js";

afterAll(cleanup);

const types = {
  version: 1,
  customChecks: { visual: {} },
  types: {
    menu: { states: ["closed", "open"], shared: true },
    "menu-link": { states: ["normal", "hovered"], checks: ["visual"] },
    "plain-link": { states: ["normal"], checks: ["visual"] },
  },
};

// The menu holds a button (varies with the menu's state) and a panel that
// exists only when the menu is open.
const toolbar = (panel: Record<string, unknown> = {}, extra: unknown[] = []) => ({
  version: 1,
  component: {
    id: "toolbar",
    title: "Toolbar",
    children: [
      {
        id: "menu",
        title: "Menu",
        type: "menu",
        children: [
          { id: "menu-button", title: "Menu button", type: "plain-link" },
          {
            id: "menu-panel",
            title: "Menu panel",
            onlyWhen: { menu: ["open"] },
            children: [{ id: "menu-link", title: "Menu link", type: "menu-link" }],
            ...panel,
          },
        ],
      },
      ...extra,
    ],
  },
});

const project = (overrides: Files = {}): Files => ({
  "types.json": types,
  "components/toolbar.json": toolbar(),
  "tasks/page.json": {
    version: 1,
    task: { id: "page", title: "Page", children: [{ include: "toolbar" }] },
  },
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["toolbar"] },
  ...overrides,
});

const t = at("types.json");
const k = at("components/toolbar.json");
const panelPath = "$.component.children[0].children[1]";

describe("shared types", () => {
  it("let a task's subtree vary with its states", () => {
    expect(diagnose(project())).toEqual([]);
  });

  it("must be a boolean on a type with states", () => {
    expect(
      diagnose(
        project({
          "types.json": {
            ...types,
            types: { ...types.types, menu: { states: ["a"], shared: "yes" } },
          },
        }),
      ),
    ).toContainEqual(t("wrong-type", "$.types.menu.shared"));
    expect(diagnose({ "types.json": { version: 1, types: { menu: { shared: true } } } })).toEqual([
      t("shared-without-states", "$.types.menu.shared"),
    ]);
  });
});

describe("onlyWhen", () => {
  const withPanel = (onlyWhen: unknown) =>
    diagnose(project({ "components/toolbar.json": toolbar({ onlyWhen }) }));

  it("maps ancestors to non-empty lists of their states", () => {
    expect(withPanel([])).toEqual([k("wrong-type", `${panelPath}.onlyWhen`)]);
    expect(withPanel({ menu: "open" })).toEqual([k("wrong-type", `${panelPath}.onlyWhen.menu`)]);
    expect(withPanel({ menu: [] })).toEqual([k("empty-only", `${panelPath}.onlyWhen.menu`)]);
    expect(withPanel({ menu: ["open", "open"] })).toEqual([
      k("duplicate-state", `${panelPath}.onlyWhen.menu[1]`),
    ]);
    expect(withPanel({ menu: ["ajar"] })).toEqual([
      k("unknown-state", `${panelPath}.onlyWhen.menu[0]`),
    ]);
  });

  it("names an ancestor in the same file", () => {
    expect(withPanel({ "menu-button": ["normal"] })).toEqual([
      k("not-an-ancestor", `${panelPath}.onlyWhen.menu-button`),
    ]);
    expect(withPanel({ page: ["open"] })).toEqual([
      k("not-an-ancestor", `${panelPath}.onlyWhen.page`),
    ]);
  });

  it("names an ancestor whose type is shared", () => {
    expect(withPanel({ toolbar: ["open"] })).toEqual([
      k("ancestor-not-shared", `${panelPath}.onlyWhen.toolbar`),
    ]);
  });

  it("is a key the schema and the compiler know on tasks", () => {
    expect(withPanel({ menu: ["open"] })).toEqual([]);
  });
});

describe("dimension names", () => {
  it("cannot be the id of a shared task", () => {
    expect(
      diagnose(
        project({ "dimensions/menu.json": { version: 1, values: ["x"], appliesTo: ["toolbar"] } }),
      ),
    ).toEqual([{ file: "dimensions/menu.json", code: "reserved-name", path: "$" }]);
  });
});

describe("verification under a shared ancestor", () => {
  const record = (task: string, context: Record<string, string>) => ({
    task,
    context,
    check: "visual",
    result: "passed",
    by: "agent",
    at: "2026-10-30T19:20:00Z",
  });
  const verify = (...records: unknown[]) =>
    diagnose(project({ "verification/page.json": { version: 1, records } }));
  const v = at("verification/page.json");

  it("names the ancestor's state in the context", () => {
    expect(
      verify(record("menu-button", { state: "normal", breakpoint: "sm", menu: "closed" })),
    ).toEqual([]);
    expect(
      verify(record("menu-link", { state: "hovered", breakpoint: "sm", menu: "open" })),
    ).toEqual([]);
  });

  it("requires it, with one of the ancestor's states", () => {
    expect(verify(record("menu-button", { state: "normal", breakpoint: "sm" }))).toEqual([
      v("missing-key", "$.records[0].context.menu"),
    ]);
    expect(
      verify(record("menu-button", { state: "normal", breakpoint: "sm", menu: "ajar" })),
    ).toEqual([v("unknown-state", "$.records[0].context.menu")]);
  });

  it("has no record where onlyWhen leaves the task out", () => {
    expect(
      verify(record("menu-link", { state: "normal", breakpoint: "sm", menu: "closed" })),
    ).toEqual([v("absent-in-context", "$.records[0].context")]);
  });
});
