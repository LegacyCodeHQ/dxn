import { afterAll, describe, expect, it } from "vitest";
import { inProject } from "../support/cli.js";
import { cleanup } from "../support/project.js";

afterAll(cleanup);
const source = (tags: string) =>
  `${tags}\nenum Mode = off | on\ntype Button { state mode: Mode }\n`;

describe("documentation diagnostics through dxn check", () => {
  it("reports a detached block once as a warning and exits successfully", () => {
    const run = inProject({ "model.dxn": source("## Detached.\n## @value off Still detached.\n") });
    const result = run("check", "model.dxn", "--json");
    const output = JSON.parse(result.stdout);
    expect({
      code: result.code,
      stderr: result.stderr,
      problems: output.problems,
      documentation: output.enums[0].documentation,
    }).toMatchInlineSnapshot(`
      {
        "code": 0,
        "documentation": undefined,
        "problems": [
          {
            "code": "unattached-documentation",
            "column": 1,
            "file": "model.dxn",
            "line": 1,
            "message": "documentation is not attached to a declaration; remove the separating blank line or use \`#\` for an ordinary comment",
            "severity": "warning",
          },
        ],
        "stderr": "",
      }
    `);
  });
  it("reports an unknown tag as an error in JSON with a failing exit code", () => {
    const run = inProject({ "model.dxn": source("## @bogus off Description.") });
    const result = run("check", "model.dxn", "--json");
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toMatchObject({
      code: 1,
      stderr: "",
      stdout: {
        problems: [
          {
            code: "unknown-documentation-tag",
            severity: "error",
            line: 1,
            column: 5,
          },
        ],
      },
    });
  });

  it("reports duplicate tags as warnings and returns only the first description", () => {
    const run = inProject({ "model.dxn": source("## @value off First.\n## @value off Second.") });
    const result = run("check", "model.dxn", "--json");
    const output = JSON.parse(result.stdout);
    expect({
      code: result.code,
      stderr: result.stderr,
      tags: output.enums[0].documentation.tags,
      problems: output.problems,
    }).toMatchInlineSnapshot(`
      {
        "code": 0,
        "problems": [
          {
            "code": "duplicate-documentation-tag",
            "column": 5,
            "file": "model.dxn",
            "line": 2,
            "message": "\`@value\` already documents \`off\` at line 1; the first description is kept",
            "severity": "warning",
          },
        ],
        "stderr": "",
        "tags": [
          {
            "description": "First.",
            "name": "value",
            "target": "off",
          },
        ],
      }
    `);
  });
});
