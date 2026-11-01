import { afterAll, describe, expect, it } from "vitest";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

// Help needs no file, so run it in an empty directory.
const outside = () => writeProject({});
const help = (...argv: string[]) => capture(argv, outside());

describe("help", () => {
  it("prints a command's usage with --help, -h or help <command>", () => {
    const usage = help("check", "--help");
    expect([usage.code, usage.stderr, usage.stdout.split("\n")[0]]).toEqual([
      0,
      "",
      "Usage: dxn <command> <file> [options]",
    ]);
    expect(help("states", "-h").stdout).toBe(usage.stdout);
    expect(help("help", "cases").stdout).toBe(usage.stdout);
  });

  it("prints the overview with help alone, pointing to the docs", () => {
    const result = help("help");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(help("--help").stdout);
    expect(result.stdout).toContain("dxn help <command>");
    expect(result.stdout).toContain("docs/");
  });

  it("rejects help for an unknown command", () => {
    expect(help("help", "nope")).toEqual({
      code: 2,
      stderr: `dxn: unknown command: nope\n\n${help("--help").stdout}`,
      stdout: "",
    });
  });

  it("documents every command", () => {
    const overview = help("--help").stdout;
    const commands = [...overview.matchAll(/^ {2}([a-z][a-z-]*)/gm)].map(
      (match) => match[1] as string,
    );
    for (const command of commands) {
      const result = help(command, "--help");
      expect([command, result.code, result.stdout.startsWith("Usage: dxn")]).toEqual([
        command,
        0,
        true,
      ]);
    }
  });
});
