// Writes packages/cli/docs/workflow.md into packages/cli/src/generated/workflow.ts,
// so the guide ships inside the program (a single binary has no docs/ folder).
// A test fails when the two differ; run `make embed-docs` after editing the
// guide.
import { readFileSync, writeFileSync } from "node:fs";

const guide = readFileSync(new URL("../../packages/cli/docs/workflow.md", import.meta.url), "utf8");
writeFileSync(
  new URL("../../packages/cli/src/generated/workflow.ts", import.meta.url),
  `// Generated from docs/workflow.md by \`make embed-docs\`; do not edit.\nexport const workflow = ${JSON.stringify(guide)};\n`,
);
