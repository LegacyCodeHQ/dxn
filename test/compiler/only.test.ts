import { afterAll, describe, expect, it } from "vitest";
import {
  at,
  cleanup,
  compileFiles,
  diagnose,
  type Files,
  pointer,
  taskFile,
} from "../support/project.js";

afterAll(cleanup);

// The page has desktop links and a menu panel, each holding a link.
const project: Files = {
  "types.json": {
    version: 1,
    customChecks: { visual: {} },
    types: { "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "tasks/page.json": taskFile({
    id: "page",
    title: "Page",
    children: [
      {
        id: "links",
        title: "Links",
        children: [{ id: "blog-link", title: "Blog link", type: "toolbar-link" }],
      },
      {
        id: "menu-panel",
        title: "Menu panel",
        children: [{ id: "menu-link", title: "Menu link", type: "toolbar-link" }],
      },
    ],
  }),
  "tasks/footer.json": taskFile({ id: "footer", title: "Footer" }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    appliesTo: ["page"],
  },
};

const desktopOnly = { links: ["lg", "xl"], "menu-panel": ["base", "sm"] };
const o = at("overrides/breakpoint.json");
const withOnly = (only: unknown, overrides: unknown = {}, extra: Files = {}) =>
  diagnose({
    ...project,
    ...extra,
    "overrides/breakpoint.json": { version: 1, only, overrides },
  });

describe("only", () => {
  it("lists the values where a task exists", () => {
    const files = {
      ...project,
      "overrides/breakpoint.json": { version: 1, only: desktopOnly, overrides: {} },
    };
    expect(diagnose(files)).toEqual([]);
    expect(compileFiles(files).project?.overrides.breakpoint?.only).toEqual(desktopOnly);
  });

  it("maps task ids to non-empty lists of the dimension's values", () => {
    expect(withOnly([])).toEqual([o("wrong-type", "$.only")]);
    expect(withOnly({ links: "lg" })).toEqual([o("wrong-type", "$.only.links")]);
    expect(withOnly({ links: [] })).toEqual([o("empty-only", "$.only.links")]);
    expect(withOnly({ links: [1] })).toEqual([o("wrong-type", "$.only.links[0]")]);
    expect(withOnly({ links: [""] })).toEqual([o("empty-string", "$.only.links[0]")]);
    expect(withOnly({ links: ["lg", "lg"] })).toEqual([o("duplicate-value", "$.only.links[1]")]);
    expect(withOnly({ links: ["md"] })).toEqual([o("unknown-dimension-value", "$.only.links[0]")]);
  });

  it("names existing tasks the dimension applies to", () => {
    expect(withOnly({ nope: ["lg"] })).toEqual([o("unknown-task", "$.only.nope")]);
    expect(withOnly({ footer: ["lg"] })).toEqual([o("task-out-of-scope", "$.only.footer")]);
  });

  it("is not allowed in combination files", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/pointer.json": pointer,
        "overrides/breakpoint+pointer.json": { version: 1, only: {}, overrides: {} },
      }),
    ).toEqual([{ file: "overrides/breakpoint+pointer.json", code: "unknown-key", path: "$.only" }]);
  });
});

describe("absent tasks", () => {
  it("cannot be overridden where they are absent, including under an absent parent", () => {
    expect(
      withOnly(desktopOnly, {
        base: { tasks: { "blog-link": { states: { remove: ["hovered"] } } } },
        lg: { tasks: { "blog-link": { states: { remove: ["hovered"] } } } },
      }),
    ).toEqual([o("absent-in-context", "$.overrides.base.tasks.blog-link")]);
  });

  it("cannot be overridden by a combination where one of its dimensions excludes them", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/pointer.json": { ...pointer, appliesTo: ["page"] },
        "overrides/breakpoint.json": { version: 1, only: desktopOnly, overrides: {} },
        "overrides/breakpoint+pointer.json": {
          version: 1,
          overrides: {
            base: { touch: { tasks: { "blog-link": { states: { remove: ["hovered"] } } } } },
          },
        },
      }),
    ).toEqual([
      {
        file: "overrides/breakpoint+pointer.json",
        code: "absent-in-context",
        path: "$.overrides.base.touch.tasks.blog-link",
      },
    ]);
  });

  const record = (task: string, context: Record<string, string>) => ({
    task,
    context: { state: "normal", ...context },
    check: "visual",
    result: "passed",
    by: "agent",
    at: "2026-10-30T19:20:00Z",
  });
  const verify = (records: unknown[], extra: Files = {}) =>
    withOnly(desktopOnly, {}, { ...extra, "verification/page.json": { version: 1, records } });
  const v = at("verification/page.json");

  it("have no verification records where they are absent", () => {
    expect(
      verify([
        record("blog-link", { breakpoint: "lg" }),
        record("menu-link", { breakpoint: "sm" }),
      ]),
    ).toEqual([]);
    expect(
      verify([
        record("blog-link", { breakpoint: "base" }),
        record("menu-link", { breakpoint: "xl" }),
      ]),
    ).toEqual([
      v("absent-in-context", "$.records[0].context"),
      v("absent-in-context", "$.records[1].context"),
    ]);
  });

  it("combine the restrictions of several dimensions", () => {
    const extra: Files = {
      "dimensions/pointer.json": { ...pointer, appliesTo: ["page"] },
      "overrides/pointer.json": { version: 1, only: { "menu-link": ["touch"] }, overrides: {} },
    };
    expect(verify([record("menu-link", { breakpoint: "base", pointer: "touch" })], extra)).toEqual(
      [],
    );
    expect(verify([record("menu-link", { breakpoint: "base", pointer: "mouse" })], extra)).toEqual([
      v("absent-in-context", "$.records[0].context"),
    ]);
  });

  it("include tasks under an absent included component", () => {
    expect(
      diagnose({
        ...project,
        "components/menu.json": {
          version: 1,
          component: {
            id: "menu",
            title: "Menu",
            children: [{ id: "menu-item", title: "Menu item", type: "toolbar-link" }],
          },
        },
        "tasks/page.json": taskFile({ id: "page", title: "Page", children: [{ include: "menu" }] }),
        "overrides/breakpoint.json": { version: 1, only: { menu: ["base"] }, overrides: {} },
        "verification/page.json": {
          version: 1,
          records: [record("menu-item", { breakpoint: "xl" })],
        },
      }),
    ).toEqual([
      { file: "verification/page.json", code: "absent-in-context", path: "$.records[0].context" },
    ]);
  });
});
