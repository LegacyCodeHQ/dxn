import { afterAll, describe, expect, it } from "vitest";
import { inProject } from "../support/cli.js";
import { cleanup } from "../support/project.js";

afterAll(cleanup);

const source = `type Leaf {}
type Branch {
  has tip: Leaf
}
type Root {
  has left: Branch
  has right: Branch
}
type Independent {}
`;

describe("dxn tree", () => {
  it("prints a type's has tree, expanding shared types at each placement", () => {
    const run = inProject({ "model.dxn": source });
    expect(run("tree", "model.dxn", "Root")).toEqual({
      code: 0,
      stdout: "Root\n├── left: Branch\n│   └── tip: Leaf\n└── right: Branch\n    └── tip: Leaf\n",
      stderr: "",
    });
  });

  it("prints all containment roots when no type is selected", () => {
    const run = inProject({ "model.dxn": source });
    expect(run("tree", "model.dxn")).toEqual({
      code: 0,
      stdout:
        "Root\n├── left: Branch\n│   └── tip: Leaf\n└── right: Branch\n    └── tip: Leaf\n\nIndependent\n",
      stderr: "",
    });
  });

  it("returns structured trees and placement paths as JSON", () => {
    const run = inProject({ "model.dxn": source });
    const result = run("tree", "model.dxn", "Branch", "--json");
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      code: 0,
      stderr: "",
      stdout: {
        file: "model.dxn",
        trees: [
          {
            name: "Branch",
            type: "Branch",
            path: "Branch",
            children: [{ name: "tip", type: "Leaf", path: "Branch.tip", children: [] }],
          },
        ],
        problems: [],
      },
    });
  });

  it("retains conditions and lists without filtering to evaluated combinations", () => {
    const run = inProject({
      "model.dxn": `enum Visibility = hidden | visible
type Leaf {}
type Root {
  state visibility: Visibility
  has panel: Leaf only when visibility = visible
  has items: [Leaf]
}
`,
    });
    expect(run("tree", "model.dxn", "Root")).toEqual({
      code: 0,
      stdout: "Root\n├── panel: Leaf only when visibility = visible\n└── items: [Leaf]\n",
      stderr: "",
    });
  });

  it.each([
    [[], 2],
    [["model.dxn", "--unsupported"], 2],
    [["model.dxn", "Root", "extra"], 2],
    [["missing.dxn"], 1],
    [["model.dxn", "Missing"], 1],
  ] as const)("rejects invalid arguments or selections: %j", (args, code) => {
    const run = inProject({ "model.dxn": source });
    expect(run("tree", ...args).code).toBe(code);
  });

  it("keeps warnings with an unknown-type refusal in JSON", () => {
    const run = inProject({ "model.dxn": "enum Unused = value\ntype Root {}\n" });
    const result = run("tree", "model.dxn", "Missing", "--json");
    expect({
      code: result.code,
      stderr: result.stderr,
      output: JSON.parse(result.stdout),
    }).toMatchObject({
      code: 1,
      stderr: "",
      output: {
        error: "no type `Missing` (`Root`)",
        problems: [{ code: "unused-enum", severity: "warning" }],
      },
    });
  });

  it("refuses containment cycles without walking recursively", () => {
    const run = inProject({ "model.dxn": "type Loop { has self: Loop }\n" });
    const result = run("tree", "model.dxn", "--json");
    expect({
      code: result.code,
      codes: JSON.parse(result.stdout).problems?.map((problem: { code: string }) => problem.code),
    }).toEqual({
      code: 1,
      codes: ["recursive-type"],
    });
  });

  it("prints an empty forest as JSON when no types are declared", () => {
    const run = inProject({ "model.dxn": "# Nothing yet.\n" });
    const result = run("tree", "model.dxn", "--json");
    expect({ ...result, stdout: JSON.parse(result.stdout) }).toEqual({
      code: 0,
      stderr: "",
      stdout: { file: "model.dxn", trees: [], problems: [] },
    });
  });
});
