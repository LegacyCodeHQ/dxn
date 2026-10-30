import { afterAll, describe, expect, it } from "vitest";
import { cleanup, taskFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = {
  "types.json": {
    version: 1,
    customChecks: { visual: {} },
    types: { link: { states: ["normal", "hovered"], checks: ["visual"] } },
  },
  "components/toolbar.json": {
    version: 1,
    component: {
      id: "toolbar",
      title: "Toolbar",
      children: [{ id: "blog-link", title: "Blog link", type: "link" }],
    },
  },
  "tasks/page.json": taskFile({ id: "page", title: "Page", children: [{ include: "toolbar" }] }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "lg"],
    default: "lg",
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["toolbar"] },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const at = "2026-10-30T19:20:00Z";
const verify = (...extra: string[]) => [
  "verify",
  "blog-link",
  "--check",
  "visual",
  "--result",
  "passed",
  "--by",
  "agent",
  "--at",
  at,
  ...extra,
];

describe("verify", () => {
  it("records a result in the page's verification file", () => {
    const { run, read } = cliProject(files);
    const result = run(...verify("state=hovered", "pointer=mouse", "--evidence", "shots/a.png"));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ written: ["verification/page.json"], removed: [] });
    expect(read("verification/page.json")).toEqual({
      version: 1,
      records: [
        {
          task: "blog-link",
          context: { state: "hovered", pointer: "mouse" },
          check: "visual",
          result: "passed",
          by: "agent",
          at,
          evidence: "shots/a.png",
        },
      ],
    });
  });

  it("replaces the record for the same task, context and check", () => {
    const { run, read } = cliProject(files);
    run(...verify("state=normal", "pointer=mouse"));
    run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "failed",
      "--by",
      "ragunath",
      "--at",
      at,
      "state=normal",
      "pointer=mouse",
      "breakpoint=lg",
    );
    expect(read("verification/page.json").records).toEqual([
      {
        task: "blog-link",
        context: { state: "normal", breakpoint: "lg", pointer: "mouse" },
        check: "visual",
        result: "failed",
        by: "ragunath",
        at,
      },
    ]);
  });

  it("defaults the time to now", () => {
    const { run, read } = cliProject(files);
    const before = Date.now();
    run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "passed",
      "--by",
      "agent",
      "state=normal",
      "pointer=mouse",
    );
    const records = read("verification/page.json").records as { at: string }[];
    expect(Date.parse(records[0]?.at ?? "")).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses contexts the compiler rejects", () => {
    const { run, exists } = cliProject(files);
    expect(run(...verify("state=hovered", "pointer=touch")).stderr).toContain("removed-state");
    expect(run(...verify("state=normal")).stderr).toContain("missing-key");
    expect(exists("verification/page.json")).toBe(false);
  });

  it("needs --page when several pages contain the task, and a page to be on", () => {
    const { run, exists } = cliProject({
      ...files,
      "tasks/home.json": taskFile({
        id: "home",
        title: "Home",
        children: [{ include: "toolbar" }],
      }),
    });
    expect(run(...verify("state=normal", "pointer=mouse"))).toMatchObject({
      code: 1,
      stderr: 'task-tree: "blog-link" is on several pages (home, page); choose one with --page\n',
    });
    expect(run(...verify("state=normal", "pointer=mouse", "--page", "home")).code).toBe(0);
    expect(exists("verification/home.json")).toBe(true);
    expect(run(...verify("state=normal", "pointer=mouse", "--page", "nope"))).toMatchObject({
      code: 1,
      stderr: 'task-tree: "blog-link" is not on page "nope"\n',
    });
  });

  it("reports tasks on no page and usage errors", () => {
    const { run } = cliProject({
      ...files,
      "tasks/page.json": taskFile({ id: "page", title: "Page" }),
    });
    expect(run(...verify("state=normal"))).toMatchObject({
      code: 1,
      stderr: 'task-tree: "blog-link" is not on any page\n',
    });
    expect(run("verify", "blog-link", "--check", "visual", "--by", "agent").code).toBe(2);
    expect(run(...verify("pointer")).code).toBe(2);
  });
});

describe("unverify", () => {
  it("removes the matching record", () => {
    const { run, read } = cliProject(files);
    run(...verify("state=normal", "pointer=mouse"));
    run(...verify("state=hovered", "pointer=mouse"));
    expect(
      run(
        "unverify",
        "blog-link",
        "--check",
        "visual",
        "state=normal",
        "pointer=mouse",
        "breakpoint=lg",
      ).code,
    ).toBe(0);
    expect(read("verification/page.json").records).toEqual([
      expect.objectContaining({ context: { state: "hovered", pointer: "mouse" } }),
    ]);
  });

  it("refuses when there is no such record", () => {
    const { run } = cliProject(files);
    expect(
      run("unverify", "blog-link", "--check", "visual", "state=normal", "pointer=mouse"),
    ).toMatchObject({
      code: 1,
      stderr: 'task-tree: no visual record for blog-link in {"state":"normal","pointer":"mouse"}\n',
    });
  });
});
