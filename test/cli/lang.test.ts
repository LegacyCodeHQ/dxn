import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

function file(source: string) {
  const root = writeProject({});
  writeFileSync(join(root, "wordmark.dim"), source);
  return (...args: string[]) => capture(["lang", ...args], root);
}

describe("lang check", () => {
  it("prints the enums a file declares, as JSON", () => {
    const run = file(
      "enum Hover = rest | hovered\nenum Size = 19px | 20px | 22px\ntype Wordmark {\n  states hover: Hover\n}\n",
    );
    const result = run("check", "wordmark.dim");
    expect([result.code, JSON.parse(result.stdout)]).toEqual([
      0,
      {
        file: "wordmark.dim",
        enums: [
          { name: "Hover", values: ["rest", "hovered"] },
          { name: "Size", values: ["19px", "20px", "22px"] },
        ],
        types: [{ name: "Wordmark", states: [{ name: "hover", enum: "Hover" }] }],
      },
    ]);
  });

  it("reports every problem with its file, line and column, and fails", () => {
    const run = file("enum hover = rest\nenum Ring = none | none\n");
    const result = run("check", "wordmark.dim");
    expect([result.code, result.stderr, result.stdout]).toEqual([
      1,
      [
        'wordmark.dim:1:6: enum-name: enum names start with a capital letter: "hover"',
        'wordmark.dim:2:20: duplicate-value: "none" appears twice in Ring',
        "",
      ].join("\n"),
      "",
    ]);
  });

  it("needs a file that exists, and no project", () => {
    const run = file("");
    expect([run("check", "nope.dim").stderr, run("check").code]).toEqual([
      'dimensions: file not found: "nope.dim"\n',
      2,
    ]);
  });
});
