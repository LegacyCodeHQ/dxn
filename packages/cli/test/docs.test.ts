import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capture } from "./support/cli.js";

const doc = (name: string) => readFileSync(new URL(`../docs/${name}`, import.meta.url), "utf8");

// The commands an overview lists, help aside: it prints the overview itself.
// Each is the command line that runs it: the prototype's are under
// "prototype", which the top overview lists as a command of its own.
const listed = (prefix: string[]) =>
  [...capture([...prefix, "--help"]).stdout.matchAll(/^ {2}([a-z][a-z-]*)/gm)]
    .map((match) => match[1] as string)
    .filter((name) => name !== "help" && name !== "prototype")
    .map((name) => [...prefix, name]);
const commands = [...listed([]), ...listed(["prototype"])];

describe("docs/commands.md", () => {
  const reference = doc("commands.md");

  it("has a section for every command", () => {
    const missing = commands.filter((line) => !reference.includes(`\n### ${line.join(" ")}\n`));
    expect(missing).toEqual([]);
  });

  it("quotes every command's usage, and the prototype's overview, exactly, so they cannot drift", () => {
    const stale = [...commands, ["prototype"]].filter((line) => {
      const usage = capture([...line, "--help"]).stdout.trimEnd();
      return !reference.includes(`\`\`\`text\n${usage}\n\`\`\``);
    });
    expect(stale).toEqual([]);
  });
});

// Diagnostic codes are the kebab-case strings in the compiler, in the
// expectation checks and in the JSON reader the compiler shares with the
// language package; each one gets a "### `code`" section.
function sourceCodes(): string[] {
  const src = new URL("../src/", import.meta.url);
  const files = [
    ...readdirSync(new URL("compiler/", src)).map((name) => new URL(`compiler/${name}`, src)),
    new URL("expectations.ts", src),
    new URL("../../language/src/json.ts", import.meta.url),
  ].filter((file) => file.pathname.endsWith(".ts"));
  const codes = files.flatMap((file) => [
    ...readFileSync(file, "utf8").matchAll(/"([a-z]+(?:-[a-z]+)+)"/g),
  ]);
  return [...new Set(codes.map((match) => match[1] as string))].sort();
}

describe("docs/diagnostics.md", () => {
  const reference = doc("diagnostics.md");
  const documented = [...reference.matchAll(/^### `([a-z-]+)`$/gm)].map(
    (match) => match[1] as string,
  );

  it("documents every diagnostic code", () => {
    expect(sourceCodes().filter((code) => !documented.includes(code))).toEqual([]);
  });

  it("documents no code that no longer exists", () => {
    const codes = sourceCodes();
    expect(documented.filter((code) => !codes.includes(code))).toEqual([]);
  });

  it("documents each code once", () => {
    expect(documented.filter((code, index) => documented.indexOf(code) !== index)).toEqual([]);
  });
});
