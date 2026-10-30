import { afterAll, describe, expect, it } from "vitest";
import {
  at,
  cleanup,
  compileFiles,
  diagnose,
  type Files,
  pointer,
  tree,
} from "../support/project.js";

afterAll(cleanup);

// Links need visual and behavior checks; pointer applies to the page subtree,
// and links have no hovered state on touch.
const project: Files = {
  ...tree,
  "types.json": {
    version: 1,
    customChecks: { visual: {}, behavior: {}, a11y: {} },
    types: { link: { states: ["normal", "hovered", "selected"], checks: ["visual", "behavior"] } },
  },
  "dimensions/pointer.json": pointer,
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
};

const record = (fields: Record<string, unknown> = {}) => ({
  task: "blog-link",
  context: { state: "hovered", pointer: "mouse" },
  check: "visual",
  result: "passed",
  by: "agent",
  at: "2026-10-30T19:20:00Z",
  ...fields,
});

const v = at("verification/page.json");
const file = (doc: unknown, name = "page") =>
  diagnose({ ...project, [`verification/${name}.json`]: doc });
const records = (...entries: unknown[]) => file({ version: 1, records: entries });
const r = (fields: Record<string, unknown>) => records(record(fields));

describe("verification files", () => {
  it("accept records for tasks in the file's root task", () => {
    expect(records(record(), record({ check: "behavior", evidence: "shots/a.png" }))).toEqual([]);
  });

  it("are returned by root task", () => {
    const result = compileFiles({
      ...project,
      "verification/page.json": { version: 1, records: [record()] },
    });
    expect(result.project?.verification.page?.records).toEqual([record()]);
  });

  it("must be named after a root task", () => {
    for (const name of ["nope", "toolbar"]) {
      expect(file({ version: 1, records: [] }, name)).toEqual([
        { file: `verification/${name}.json`, code: "unknown-root-task", path: "$" },
      ]);
    }
  });

  it("must be an object with version and records", () => {
    expect(file([])).toEqual([v("wrong-type", "$")]);
    expect(file({})).toEqual([v("missing-key", "$.version"), v("missing-key", "$.records")]);
    expect(file({ version: 1, records: [], extra: 1 })).toEqual([v("unknown-key", "$.extra")]);
    expect(file({ version: 2, records: [] })).toEqual([v("unsupported-version", "$.version")]);
    expect(file({ version: 1, records: {} })).toEqual([v("wrong-type", "$.records")]);
  });

  it("may point editors at the JSON schema", () => {
    expect(file({ $schema: "x", version: 1, records: [] })).toEqual([]);
    expect(file({ $schema: 1, version: 1, records: [] })).toEqual([v("wrong-type", "$.$schema")]);
  });
});

describe("records", () => {
  it("must be objects with the required keys", () => {
    expect(records(1)).toEqual([v("wrong-type", "$.records[0]")]);
    expect(records({})).toEqual(
      ["task", "context", "check", "result", "by", "at"].map((key) =>
        v("missing-key", `$.records[0].${key}`),
      ),
    );
    expect(r({ note: "x" })).toEqual([v("unknown-key", "$.records[0].note")]);
  });

  it("are unique per task, context and check", () => {
    expect(records(record(), record({ context: { pointer: "mouse", state: "hovered" } }))).toEqual([
      v("duplicate-record", "$.records[1]"),
    ]);
  });
});

describe("record task", () => {
  it("must be a valid name of an existing task", () => {
    expect(r({ task: 1 })).toEqual([v("wrong-type", "$.records[0].task")]);
    expect(r({ task: "nope" })).toEqual([v("unknown-task", "$.records[0].task")]);
  });

  it("must be inside the file's root task", () => {
    expect(r({ task: "footer-link", context: { state: "normal" } })).toEqual([
      v("task-outside-file", "$.records[0].task"),
    ]);
  });

  it("must have a type that requires checks", () => {
    expect(r({ task: "logo", context: { pointer: "mouse" } })).toEqual([
      v("verification-without-type", "$.records[0].task"),
    ]);
  });
});

describe("record context", () => {
  const context = (value: unknown) => r({ context: value });
  const path = "$.records[0].context";

  it("must be an object", () => {
    expect(context([])).toEqual([v("wrong-type", path)]);
  });

  it("must name the task's state and every dimension that applies to it", () => {
    expect(context({ pointer: "mouse" })).toEqual([v("missing-key", `${path}.state`)]);
    expect(context({ state: "normal" })).toEqual([v("missing-key", `${path}.pointer`)]);
  });

  it("must not name dimensions that do not apply to the task", () => {
    expect(context({ state: "normal", pointer: "mouse", theme: "dark" })).toEqual([
      v("unknown-key", `${path}.theme`),
    ]);
    expect(
      diagnose({
        ...project,
        "verification/footer-link.json": {
          version: 1,
          records: [
            record({ task: "footer-link", context: { state: "normal", pointer: "mouse" } }),
          ],
        },
      }),
    ).toEqual([
      {
        file: "verification/footer-link.json",
        code: "unknown-key",
        path: "$.records[0].context.pointer",
      },
    ]);
  });

  it("must use declared dimension values", () => {
    expect(context({ state: "normal", pointer: 1 })).toEqual([v("wrong-type", `${path}.pointer`)]);
    expect(context({ state: "normal", pointer: "pen" })).toEqual([
      v("unknown-dimension-value", `${path}.pointer`),
    ]);
  });

  it("must use a state the task has in that context", () => {
    expect(context({ state: 1, pointer: "mouse" })).toEqual([v("wrong-type", `${path}.state`)]);
    expect(context({ state: "pressed", pointer: "mouse" })).toEqual([
      v("unknown-state", `${path}.state`),
    ]);
    expect(context({ state: "hovered", pointer: "touch" })).toEqual([
      v("removed-state", `${path}.state`),
    ]);
  });

  it("include states added in that context", () => {
    expect(
      diagnose({
        ...project,
        "overrides/pointer.json": {
          version: 1,
          overrides: { touch: { tasks: { "blog-link": { states: { add: ["pressed"] } } } } },
        },
        "verification/page.json": {
          version: 1,
          records: [record({ context: { state: "pressed", pointer: "touch" } })],
        },
      }),
    ).toEqual([]);
  });
});

describe("record context across dimensions", () => {
  it("let a task's state change beat type state changes from other dimensions", () => {
    // breakpoint sorts first: applying dimensions in name order would let
    // pointer's type removal undo blog-link's own re-add at sm.
    expect(
      diagnose({
        ...project,
        "dimensions/breakpoint.json": { version: 1, values: ["sm"], appliesTo: ["page"] },
        "overrides/breakpoint.json": {
          version: 1,
          overrides: {
            sm: {
              types: { link: { states: { remove: ["hovered"] } } },
              tasks: { "blog-link": { states: { add: ["hovered"] } } },
            },
          },
        },
        "verification/page.json": {
          version: 1,
          records: [record({ context: { state: "hovered", breakpoint: "sm", pointer: "touch" } })],
        },
      }),
    ).toEqual([]);
  });
});

describe("record check", () => {
  it("must be declared", () => {
    expect(r({ check: 1 })).toEqual([v("wrong-type", "$.records[0].check")]);
    expect(r({ check: "speed" })).toEqual([v("undeclared-check", "$.records[0].check")]);
  });

  it("must be one the task's type requires", () => {
    expect(r({ check: "a11y" })).toEqual([v("check-not-required", "$.records[0].check")]);
  });
});

describe("record result, by, at and evidence", () => {
  it("result is passed or failed", () => {
    expect(r({ result: "failed" })).toEqual([]);
    expect(r({ result: 1 })).toEqual([v("wrong-type", "$.records[0].result")]);
    expect(r({ result: "ok" })).toEqual([v("unknown-result", "$.records[0].result")]);
  });

  it("by is a non-blank name", () => {
    expect(r({ by: "ragunath@legacycode.com" })).toEqual([]);
    expect(r({ by: " " })).toEqual([v("empty-string", "$.records[0].by")]);
  });

  it("at is an ISO 8601 date and time with a time zone", () => {
    expect(r({ at: "2026-10-30T19:20:00.123+05:30" })).toEqual([]);
    expect(r({ at: 1 })).toEqual([v("wrong-type", "$.records[0].at")]);
    for (const value of [
      "yesterday",
      "2026-10-30",
      "2026-10-30T19:20:00",
      "2026-13-01T00:00:00Z",
    ]) {
      expect(r({ at: value })).toEqual([v("invalid-timestamp", "$.records[0].at")]);
    }
  });

  it("evidence is optional and non-blank", () => {
    expect(r({ evidence: "" })).toEqual([v("empty-string", "$.records[0].evidence")]);
  });
});
