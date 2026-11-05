import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

describe("dxn fmt documentation", () => {
  it("normalizes attached documentation on disk and then passes --check", () => {
    const root = writeProject({
      "model.dxn": "##Modes.\n##\t@value\toff\t Disabled.\n##\t Continued.\nenum Mode=off|on\n",
    });
    const before = capture(["fmt", "model.dxn", "--check"], root);
    const written = capture(["fmt", "model.dxn"], root);
    const source = readFileSync(join(root, "model.dxn"), "utf8");
    const after = capture(["fmt", "model.dxn", "--check"], root);
    expect({
      before: before.code,
      written: written.code,
      source,
      after: after.code,
    }).toMatchInlineSnapshot(`
      {
        "after": 0,
        "before": 1,
        "source": "## Modes.
      ## @value off Disabled.
      ##   Continued.
      enum Mode = off | on
      ",
        "written": 0,
      }
    `);
  });
});
