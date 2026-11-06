import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

describe("dxn rename documentation", () => {
  it("includes documentation in dry runs and persists targets, code and stored values together", () => {
    const source =
      "## @value focused Keyboard focus.\nenum Focus = blurred | focused\ntype Button { state focus: Focus }\nrecord Evidence {}\nactor Designer records Evidence\n";
    const data =
      '[{ "context": { "type": "Button", "dimensions": {}, "states": { "focus": "focused" } }, "actor": "Designer" }]';
    const root = writeProject({ "model.dxn": source, "evidence/a.json": data });
    const dry = capture(
      ["rename", "model.dxn", "Focus.focused", "active", "--dry-run", "--json"],
      root,
    );
    const unchanged =
      readFileSync(join(root, "model.dxn"), "utf8") === source &&
      readFileSync(join(root, "evidence/a.json"), "utf8") === data;
    const actual = capture(["rename", "model.dxn", "Focus.focused", "active", "--json"], root);
    expect({
      dryCode: dry.code,
      planned: JSON.parse(dry.stdout).written?.["model.dxn"],
      unchanged,
      code: actual.code,
      source: readFileSync(join(root, "model.dxn"), "utf8"),
      data: JSON.parse(readFileSync(join(root, "evidence/a.json"), "utf8")),
    }).toMatchInlineSnapshot(`
      {
        "code": 0,
        "data": [
          {
            "actor": "Designer",
            "context": {
              "dimensions": {},
              "states": {
                "focus": "active",
              },
              "type": "Button",
            },
          },
        ],
        "dryCode": 0,
        "planned": "## @value active Keyboard focus.
      enum Focus = blurred | active
      type Button { state focus: Focus }
      record Evidence {}
      actor Designer records Evidence
      ",
        "source": "## @value active Keyboard focus.
      enum Focus = blurred | active
      type Button { state focus: Focus }
      record Evidence {}
      actor Designer records Evidence
      ",
        "unchanged": true,
      }
    `);
  });
});
