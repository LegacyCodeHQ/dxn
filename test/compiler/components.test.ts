import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, compileFiles, diagnose, type Files, taskFile } from "../support/project.js";

afterAll(cleanup);

const componentFile = (component: unknown) => ({ version: 1, component });
const include = (id: string) => ({ include: id });

// The article page includes the toolbar component, which holds a link.
const project: Files = {
  "types.json": {
    version: 1,
    customChecks: { visual: {} },
    types: { "toolbar-link": { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "components/toolbar.json": componentFile({
    id: "toolbar",
    title: "Toolbar",
    children: [{ id: "blog-link", title: "Blog link", type: "toolbar-link" }],
  }),
  "tasks/article-page.json": taskFile({
    id: "article-page",
    title: "Article page",
    children: [include("toolbar")],
  }),
};

const k = at("components/toolbar.json");
const p = at("tasks/article-page.json");
const page = (children: unknown[], extra: Files = {}) =>
  diagnose({
    ...project,
    ...extra,
    "tasks/article-page.json": taskFile({ id: "article-page", title: "Article page", children }),
  });
const component = (doc: unknown) => diagnose({ ...project, "components/toolbar.json": doc });

describe("components", () => {
  it("compile and are returned beside the tasks that include them", () => {
    const result = compileFiles(project);
    expect(result.diagnostics).toEqual([]);
    expect(result.project?.components.map(({ id }) => id)).toEqual(["toolbar"]);
    expect(result.project?.tasks[0]?.children).toEqual([include("toolbar")]);
  });

  it("must be an object with version and component", () => {
    expect(component([])).toEqual([k("wrong-type", "$")]);
    expect(component({})).toEqual([k("missing-key", "$.version"), k("missing-key", "$.component")]);
    expect(component({ ...componentFile({ id: "toolbar", title: "T" }), extra: 1 })).toEqual([
      k("unknown-key", "$.extra"),
    ]);
    expect(component({ version: 2, component: { id: "toolbar", title: "T" } })).toEqual([
      k("unsupported-version", "$.version"),
    ]);
    expect(component({ $schema: 1, ...componentFile({ id: "toolbar", title: "T" }) })).toEqual([
      k("wrong-type", "$.$schema"),
    ]);
  });

  it("are checked like tasks", () => {
    expect(component(componentFile([]))).toEqual([k("wrong-type", "$.component")]);
    expect(
      component(componentFile({ id: "toolbar", title: "T", children: [{ id: "x" }] })),
    ).toEqual([k("missing-key", "$.component.children[0].title")]);
  });

  it("must be named after their id", () => {
    expect(component(componentFile({ id: "header", title: "Header" }))).toEqual([
      k("file-name-mismatch", "$.component.id"),
    ]);
  });

  it("share ids with tasks", () => {
    expect(
      diagnose({
        ...project,
        "tasks/toolbar.json": taskFile({ id: "toolbar", title: "Toolbar" }),
      }),
    ).toEqual([{ file: "tasks/toolbar.json", code: "duplicate-id", path: "$.task.id" }]);
  });

  it("may include other components", () => {
    expect(
      diagnose({
        ...project,
        "components/wordmark.json": componentFile({ id: "wordmark", title: "Wordmark" }),
        "components/toolbar.json": componentFile({
          id: "toolbar",
          title: "Toolbar",
          children: [include("wordmark")],
        }),
      }),
    ).toEqual([]);
  });

  it("report a folder that is a file and an unreadable file", () => {
    expect(diagnose({ "types.json": project["types.json"], components: "" })).toEqual([
      { file: "components", code: "not-a-directory", path: "$" },
    ]);
    expect(component(Buffer.from([0x5b, 0xff, 0x5d]))).toEqual([k("invalid-encoding", "$")]);
  });

  it("stop before dimensions when a component file does not parse", () => {
    expect(
      diagnose({
        ...project,
        "components/toolbar.json": "{",
        "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["blog-link"] },
      }),
    ).toEqual([{ file: "components/toolbar.json", code: "unexpected-end", path: "$" }]);
  });
});

describe("include", () => {
  it("names a component", () => {
    expect(page([1])).toEqual([p("wrong-type", "$.task.children[0]")]);
    expect(page([include("")])).toEqual([p("empty-string", "$.task.children[0].include")]);
    expect(page([{ include: 1 }])).toEqual([p("wrong-type", "$.task.children[0].include")]);
    expect(page([include("footer")])).toEqual([
      p("unknown-component", "$.task.children[0].include"),
    ]);
  });

  it("does not name a task that is not a component", () => {
    expect(
      page([include("other")], { "tasks/other.json": taskFile({ id: "other", title: "Other" }) }),
    ).toEqual([p("unknown-component", "$.task.children[0].include")]);
  });

  it("has no other keys", () => {
    expect(page([{ include: "toolbar", title: "Toolbar" }])).toEqual([
      p("unknown-key", "$.task.children[0].title"),
    ]);
  });

  it("is not a file's root task", () => {
    expect(
      diagnose({ ...project, "tasks/article-page.json": taskFile(include("toolbar")) }),
    ).toEqual([p("include-at-root", "$.task")]);
  });

  it("does not bring the same component into a page twice", () => {
    expect(page([include("toolbar"), include("toolbar")])).toEqual([
      p("duplicate-include", "$.task.children[1].include"),
    ]);
    expect(
      page([include("header"), include("footer")], {
        "components/header.json": componentFile({
          id: "header",
          title: "Header",
          children: [include("toolbar")],
        }),
        "components/footer.json": componentFile({
          id: "footer",
          title: "Footer",
          children: [include("toolbar")],
        }),
      }),
    ).toEqual([p("duplicate-include", "$.task.children[1].include")]);
  });

  it("does not form a cycle", () => {
    expect(
      component(componentFile({ id: "toolbar", title: "Toolbar", children: [include("toolbar")] })),
    ).toEqual([k("include-cycle", "$.component.children[0].include")]);
    expect(
      diagnose({
        ...project,
        "components/menu.json": componentFile({
          id: "menu",
          title: "Menu",
          children: [include("toolbar")],
        }),
        "components/toolbar.json": componentFile({
          id: "toolbar",
          title: "Toolbar",
          children: [include("menu")],
        }),
      }),
    ).toEqual([
      {
        file: "components/menu.json",
        code: "include-cycle",
        path: "$.component.children[0].include",
      },
      {
        file: "components/toolbar.json",
        code: "include-cycle",
        path: "$.component.children[0].include",
      },
    ]);
  });
});

describe("included components", () => {
  const breakpoint = { version: 1, values: ["sm", "lg"], appliesTo: ["article-page"] };

  it("are in the scope of dimensions that apply to the page", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": breakpoint,
        "overrides/breakpoint.json": {
          version: 1,
          overrides: { sm: { tasks: { "blog-link": { states: { remove: ["hovered"] } } } } },
        },
      }),
    ).toEqual([]);
  });

  it("are verified as part of the page", () => {
    const record = (task: string) => ({
      version: 1,
      records: [
        {
          task,
          context: { state: "hovered", breakpoint: "lg" },
          check: "visual",
          result: "passed",
          by: "agent",
          at: "2026-10-30T19:20:00Z",
        },
      ],
    });
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": breakpoint,
        "verification/article-page.json": record("blog-link"),
      }),
    ).toEqual([]);
    expect(diagnose({ ...project, "verification/toolbar.json": record("blog-link") })).toEqual([
      { file: "verification/toolbar.json", code: "unknown-root-task", path: "$" },
    ]);
  });

  it("can be the target of a dimension directly", () => {
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": { ...breakpoint, appliesTo: ["toolbar"] },
      }),
    ).toEqual([]);
  });
});
