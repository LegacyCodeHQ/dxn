import { run } from "@cli/cli.js";
import { type Files, writeProject } from "./project.js";

// Runs the CLI in-process from the given working directory, keeping what it
// caches in the given folder.
export function capture(argv: string[], cwd: string = process.cwd(), cache?: string) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    cwd,
    ...(cache === undefined ? {} : { cache }),
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

// Runs the CLI in a throwaway directory holding these files, by path from it;
// each command given is run before the arguments of each call.
export function inProject(files: Files, ...command: string[]) {
  const root = writeProject(files);
  return (...args: string[]) => capture([...command, ...args], root);
}
