import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";

const doc = (name: string) =>
  readFileSync(new URL(`../../../docs/${name}`, import.meta.url), "utf8");

// The commands the overview lists, help aside: it prints the overview itself.
const commands = [...capture(["--help"]).stdout.matchAll(/^ {2}([a-z][a-z-]*)/gm)]
  .map((match) => match[1] as string)
  .filter((name) => name !== "help");

describe("docs/commands.md", () => {
  const reference = doc("commands.md");

  it("has a section for every command", () => {
    const missing = commands.filter((name) => !reference.includes(`\n### ${name}\n`));
    expect(missing).toEqual([]);
  });

  it("quotes every command's usage exactly, so it cannot drift", () => {
    const stale = commands.filter((name) => {
      const usage = capture([name, "--help"]).stdout.trimEnd();
      return !reference.includes(`\`\`\`text\n${usage}\n\`\`\``);
    });
    expect(stale).toEqual([]);
  });
});
