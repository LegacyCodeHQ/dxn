#!/usr/bin/env node
// Process entrypoint: wires the real streams into run(). Kept free of logic so
// that everything worth testing lives in cli.ts; `make smoke` exercises this file.
import { run } from "./cli.js";

process.exitCode = run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
