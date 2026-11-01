#!/usr/bin/env node
// Process entrypoint: serves dxn over standard input and output. Kept free of
// logic so that everything worth testing lives in server.ts; `make smoke`
// exercises this file.
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { serve } from "./server.js";
import { version } from "./version.js";

const first = process.argv[2];
if (first === "-V" || first === "--version") {
  process.stdout.write(`${JSON.stringify({ version })}\n`);
} else {
  serve(createConnection(ProposedFeatures.all, process.stdin, process.stdout));
}
