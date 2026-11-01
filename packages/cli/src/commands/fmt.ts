import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format, parse } from "@legacycodehq/dxn-language";
import { type Command, command } from "./context.js";
import { misused, options, Reporter } from "./report.js";
import { usage } from "./usage.js";

// Writes each file the one way a .dxn file is written, and names the files it
// changed; with --check, writes nothing, names the files it would change, and
// fails if there are any. A file that does not parse is left alone, its
// problems reported.
export const fmtCommand: Command = command(usage, (args, { io, cwd }) => {
  const { json, rest } = options(args);
  const check = rest.includes("--check");
  const files = rest.filter((arg) => arg !== "--check");
  if (files.length === 0) return misused(io, json, "give one or more files to format");
  const report = new Reporter(io, json, files[0] as string);
  const missing = files.find(
    (file) => statSync(resolve(cwd, file), { throwIfNoEntry: false })?.isFile() !== true,
  );
  if (missing !== undefined) return report.refuse(`file not found: ${JSON.stringify(missing)}`);
  const changed: string[] = [];
  for (const file of files) {
    const path = resolve(cwd, file);
    const source = readFileSync(path, "utf8");
    const formatted = format(source);
    if (formatted === undefined) {
      for (const { line, column, severity, code, message } of parse(source).diagnostics) {
        if (code === "syntax-error")
          report.problem({ file, line, column, severity, code, message });
      }
      continue;
    }
    if (formatted === source) continue;
    changed.push(file);
    if (!check) writeFileSync(path, formatted);
  }
  const listed = changed.map((file) => `${file}\n`).join("");
  report.succeed(check ? { unformatted: changed } : { formatted: changed }, listed);
  return report.failed || (check && changed.length > 0) ? 1 : 0;
});
