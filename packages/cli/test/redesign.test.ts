import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@cli/cli.js";
import { afterEach, expect, it } from "vitest";

const folders: string[] = [];
afterEach(() => {
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});
function setup(source: string) {
  const cwd = mkdtempSync(join(tmpdir(), "dxn-new-cli-"));
  folders.push(cwd);
  writeFileSync(join(cwd, "test.dxn"), source);
  return {
    cwd,
    invoke: (args: string[]) => {
      let stdout = "",
        stderr = "";
      const code = run(args, {
        cwd,
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      });
      return { code, stdout, stderr };
    },
  };
}
it("checks only the new syntax and reports machine-readable problems", () => {
  const { invoke, cwd } = setup("enum Light{off,on}");
  const snapshot = [invoke(["check", "test.dxn", "--json"])];
  writeFileSync(join(cwd, "test.dxn"), "enum Light = off | on");
  snapshot.push(invoke(["check", "test.dxn", "--json"]));
  expect(snapshot).toMatchInlineSnapshot(`
   [
     {
       "code": 0,
       "stderr": "",
       "stdout": "{"file":"test.dxn","problems":[]}
   ",
     },
     {
       "code": 1,
       "stderr": "",
       "stdout": "{"file":"test.dxn","problems":[{"code":"syntax-error","message":"expected '{' after the enumeration name, found '='","span":{"start":11,"end":12}}]}
   ",
     },
   ]
 `);
});
it("formats and checks without writing unless requested, and rejects malformed input", () => {
  const { invoke, cwd } = setup("enum Light{off,on}");
  const snapshot = [
    invoke(["fmt", "test.dxn", "--check"]),
    invoke(["fmt", "test.dxn"]),
    invoke(["fmt", "test.dxn", "--write"]),
    invoke(["fmt", "test.dxn", "--check"]),
  ];
  expect({ snapshot, source: readFileSync(join(cwd, "test.dxn"), "utf8") }).toMatchInlineSnapshot(`
   {
     "snapshot": [
       {
         "code": 1,
         "stderr": "test.dxn: needs formatting
   ",
         "stdout": "",
       },
       {
         "code": 0,
         "stderr": "",
         "stdout": "enum Light { off, on }
   ",
       },
       {
         "code": 0,
         "stderr": "",
         "stdout": "",
       },
       {
         "code": 0,
         "stderr": "",
         "stdout": "test.dxn: formatted
   ",
       },
     ],
     "source": "enum Light { off, on }
   ",
   }
 `);
});
it("renames through the shared refactoring and leaves a refused rename untouched", () => {
  const { invoke, cwd } = setup("enum Light { off, on }\nenum Power { off }\n");
  const preview = invoke(["rename", "test.dxn", "Light", "Lamp", "--dry-run", "--json"]);
  expect(readFileSync(join(cwd, "test.dxn"), "utf8")).toContain("Light");
  const changed = invoke(["rename", "test.dxn", "Light", "Lamp", "--json"]);
  const refused = invoke(["rename", "test.dxn", "Lamp", "Power", "--json"]);
  expect({
    preview,
    changed,
    refused,
    source: readFileSync(join(cwd, "test.dxn"), "utf8"),
  }).toMatchInlineSnapshot(`
    {
      "changed": {
        "code": 0,
        "stderr": "",
        "stdout": "{"file":"test.dxn","source":"enum Lamp { off, on }\\nenum Power { off }\\n","edits":[{"span":{"start":5,"end":10},"text":"Lamp"}],"dryRun":false}
    ",
      },
      "preview": {
        "code": 0,
        "stderr": "",
        "stdout": "{"file":"test.dxn","source":"enum Lamp { off, on }\\nenum Power { off }\\n","edits":[{"span":{"start":5,"end":10},"text":"Lamp"}],"dryRun":true}
    ",
      },
      "refused": {
        "code": 1,
        "stderr": "",
        "stdout": "{"file":"test.dxn","refusals":[{"kind":"nameExists","rule":"RE4","name":"Power","at":{"start":27,"end":32}}]}
    ",
      },
      "source": "enum Lamp { off, on }
    enum Power { off }
    ",
    }
  `);
});
it("rejects unavailable commands and invalid options without changing a file", () => {
  const { invoke } = setup("enum Light { off }");
  expect(
    [
      invoke(["states", "test.dxn"]),
      invoke(["fmt", "test.dxn", "--check", "--write"]),
      invoke(["check", "absent.dxn"]),
    ].map(({ code }) => code),
  ).toEqual([2, 2, 2]);
});

it("does not overwrite malformed source when formatting is requested", () => {
  const source = "enum Light { off, }";
  const { invoke, cwd } = setup(source);
  const result = invoke(["fmt", "test.dxn", "--write", "--json"]);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).problems[0].code).toBe("syntax-error");
  expect(readFileSync(join(cwd, "test.dxn"), "utf8")).toBe(source);
});

it("lists all types or a selected type as the documented table and keyed JSON", () => {
  const { invoke } = setup(
    "type Button { varies Kind, State } enum Kind { primary, secondary } enum State { normal, disabled } type Logo {}",
  );
  expect(invoke(["combinations", "test.dxn"])).toMatchInlineSnapshot(`
    {
      "code": 0,
      "stderr": "",
      "stdout": "Button: 4 combinations

      #  Kind       State
      1  primary    normal
      2  primary    disabled
      3  secondary  normal
      4  secondary  disabled

    Logo: 1 combination (varies over nothing)
    ",
    }
  `);
  const selected = invoke(["combinations", "test.dxn", "Button", "--json"]);
  expect(selected.code).toBe(0);
  expect(JSON.parse(selected.stdout)).toEqual({
    types: [
      {
        type: "Button",
        varies: ["Kind", "State"],
        count: 4,
        combinations: [
          { Kind: "primary", State: "normal" },
          { Kind: "primary", State: "disabled" },
          { Kind: "secondary", State: "normal" },
          { Kind: "secondary", State: "disabled" },
        ],
      },
    ],
  });
  expect(JSON.parse(invoke(["combinations", "test.dxn", "Logo", "--json"]).stdout)).toEqual({
    types: [{ type: "Logo", varies: [], count: 1, combinations: [{}] }],
  });
});

it("reports invalid files exactly as check and unknown types as usage errors", () => {
  const invalid = setup("type Button { varies Missing }");
  expect(invalid.invoke(["combinations", "test.dxn", "--json"])).toEqual(
    invalid.invoke(["check", "test.dxn", "--json"]),
  );
  const valid = setup("type Logo {}");
  expect(valid.invoke(["combinations", "test.dxn", "Missing", "--json"])).toMatchInlineSnapshot(`
    {
      "code": 2,
      "stderr": "",
      "stdout": "{"file":"test.dxn","error":"type 'Missing' is not declared; available types: Logo","types":["Logo"]}
    ",
    }
  `);
  expect(valid.invoke(["combinations", "test.dxn", "Missing"]).code).toBe(2);
  expect(setup("enum Kind { primary }").invoke(["combinations", "test.dxn"]).stdout).toBe(
    "no types declared\n",
  );
});
