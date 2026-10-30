import { run } from "../../src/cli.js";

// Runs the CLI in-process from the given working directory.
export function capture(argv: string[], cwd: string = process.cwd()) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}
