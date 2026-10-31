import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";
import { cleanup, writeProject } from "./support/project.js";

afterAll(cleanup);

// The steps of docs/workflow.md, in order: each `dimensions ...` line of a
// bash block is a command, and a block such as ```json expectations.json is
// a file the reader writes into .dimensions/ (or next to it, for a name that
// starts with ../, such as a design file).
type Step = { command: string[] } | { file: string; content: string };

function steps(): Step[] {
  const doc = readFileSync(new URL("../docs/workflow.md", import.meta.url), "utf8");
  const result: Step[] = [];
  for (const [, info, body] of doc.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
    const [language, file] = (info as string).trim().split(/\s+/);
    if (language === "bash") {
      for (const line of (body as string).split("\n")) {
        if (line.startsWith("dimensions ")) result.push({ command: words(line).slice(1) });
      }
    } else if (file !== undefined) {
      result.push({ file, content: body as string });
    }
  }
  return result;
}

// Splits a command line into words, keeping "quoted words" together.
function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? (match[2] as string));
}

describe("docs/workflow.md", () => {
  it("builds a model from an empty folder, every step succeeding", () => {
    const root = writeProject({});
    const failed: string[] = [];
    for (const step of steps()) {
      if ("file" in step) {
        const path = join(root, ".dimensions", step.file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, step.content);
        continue;
      }
      const result = capture(step.command, root);
      if (result.code !== 0) failed.push(`${step.command.join(" ")}\n${result.stderr}`);
    }
    expect(failed).toEqual([]);
    expect(capture(["validate"], root).stdout).toContain('"errors":0');
    expect(steps().filter((step) => "command" in step).length).toBeGreaterThan(40);
  });
});
