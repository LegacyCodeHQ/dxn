import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// A sign-in form whose submit button is disabled until the form is complete.
const files = {
  "types.json": {
    version: 1,
    stateGroups: { availability: ["enabled", "disabled"] },
    checks: { visual: {} },
    types: {
      form: { states: ["incomplete", "complete"], shared: true },
      button: { stateGroups: ["availability"], checks: ["visual"] },
    },
  },
  "roots/sign-in.json": rootFile({
    id: "sign-in",
    title: "Sign in",
    children: [
      {
        id: "form",
        title: "Form",
        type: "form",
        children: [{ id: "submit", title: "Submit", type: "button" }],
      },
    ],
  }),
  "overrides/form.json": {
    version: 1,
    overrides: {
      incomplete: { nodes: { submit: { states: { remove: ["enabled"] } } } },
      complete: { nodes: { submit: { states: { remove: ["disabled"] } } } },
    },
  },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

function problems(extra: Record<string, unknown>): string[] {
  return cliProject({ ...files, ...extra })
    .run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

describe("overrides by a shared node's state", () => {
  it("change the states of nodes below it", () => {
    const { run } = cliProject(files);
    expect([
      json(run("show", "submit", "form=incomplete")).stateGroups,
      json(run("show", "submit", "form=complete")).stateGroups,
      json(run("contexts", "submit")).contexts.map(({ context }: { context: object }) => context),
    ]).toEqual([
      { availability: ["disabled"] },
      { availability: ["enabled"] },
      [
        { availability: "disabled", form: "incomplete" },
        { availability: "enabled", form: "complete" },
      ],
    ]);
  });

  it("are written with the override command", () => {
    const { "overrides/form.json": _, ...without } = files;
    const { run, read } = cliProject(without);
    expect(
      run("override", "states", "form=incomplete", "--node", "submit", "--remove", "enabled").code,
    ).toBe(0);
    expect(read("overrides/form.json")).toEqual({
      version: 1,
      overrides: { incomplete: { nodes: { submit: { states: { remove: ["enabled"] } } } } },
    });
  });

  it("are checked in records and rules", () => {
    const record = (availability: string) => ({
      "verification/sign-in.json": {
        version: 1,
        records: [
          {
            node: "submit",
            context: { form: "complete", availability },
            check: "visual",
            result: "passed",
            by: "p",
            at: "2026-10-31T10:00:00Z",
          },
        ],
      },
    });
    const rule = (then: string) => ({
      "expectations.json": {
        version: 1,
        expectations: [
          {
            title: "Submit waits for the form",
            node: "submit",
            when: { form: "incomplete" },
            then: { availability: then },
          },
        ],
      },
    });
    expect([
      problems(record("enabled")),
      problems(record("disabled")),
      problems(rule("disabled")),
      problems(rule("enabled")),
    ]).toEqual([
      [],
      ['removed-state: state "disabled" is removed in this context'],
      [],
      [
        "expectation-failed: Submit waits for the form: submit (availability=disabled, form=incomplete) breaks availability=enabled",
      ],
    ]);
  });

  it("name the shared node's states, apply only below it, and have no only", () => {
    const at = (overrides: unknown, extra: Record<string, unknown> = {}) =>
      problems({ "overrides/form.json": { version: 1, overrides, ...extra } });
    expect([
      at({ ajar: { nodes: { submit: { states: { remove: ["enabled"] } } } } }),
      at({ incomplete: { nodes: { "sign-in": { states: { remove: ["enabled"] } } } } }),
      at({}, { only: { submit: ["complete"] } }),
    ]).toEqual([
      ['unknown-state: "ajar" is not a state of form (incomplete, complete)'],
      ['node-out-of-scope: node "sign-in" is not below form'],
      ['unknown-key: unknown key "only"'],
    ]);
  });

  it("follow a renamed shared node", () => {
    const { run, exists, read } = cliProject(files);
    expect(run("node", "rename", "form", "sign-in-form").code).toBe(0);
    expect([exists("overrides/form.json"), exists("overrides/sign-in-form.json")]).toEqual([
      false,
      true,
    ]);
    expect(run("show", "submit", "sign-in-form=incomplete").code).toBe(0);
    expect(Object.keys((read("overrides/sign-in-form.json").overrides as object) ?? {})).toEqual([
      "incomplete",
      "complete",
    ]);
  });
});
