import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  DimensionFile,
  OverridesFile,
  Project,
  TaskFile,
  TypesFile,
  VerificationFile,
} from "../tree.js";
import { checkTaskFile, checkTypesFile, emptySymbols } from "./check.js";
import { type Diagnostic, Diagnostics } from "./diagnostic.js";
import { checkDimensionFile } from "./dimensions.js";
import { type JsonNode, parseJson } from "./json.js";
import { checkOverridesFile } from "./overrides.js";
import { readSource } from "./read.js";
import { isName } from "./shape.js";
import type { DimensionSymbol } from "./symbols.js";
import { checkVerificationFile, type DimensionInfo } from "./verification.js";

export interface FileDiagnostic extends Diagnostic {
  // Relative to the project directory, e.g. "tasks/article-page.json".
  file: string;
}

export interface DirectoryResult {
  // Present only when no file has diagnostics.
  project?: Project;
  diagnostics: FileDiagnostic[];
}

interface DimensionEntry extends DimensionInfo {
  parsed: ParsedFile;
}

interface ParsedFile {
  file: string;
  source: string;
  root?: JsonNode;
  diagnostics: Diagnostics;
}

// Compiles a project directory:
//
//   types.json               required: custom attribute declarations and types
//   tasks/<id>.json          one root task per file, named after its id
//   dimensions/<name>.json   one dimension per file
//   overrides/<name>.json    overrides for the dimension of the same name
//   verification/<id>.json   verification records for the root task <id>
//
// Anything else in the directory is ignored.
export function compileDirectory(directory: string): DirectoryResult {
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() === false) {
    return { diagnostics: [fileDiagnostic(".", "not-a-directory", "not a directory")] };
  }
  const problems: FileDiagnostic[] = [];
  const parsed: ParsedFile[] = [];
  const result = () => ({ diagnostics: [...problems, ...collect(parsed)] });

  const types = readJson(directory, "types.json");
  if (types === undefined) {
    return { diagnostics: [fileDiagnostic("types.json", "missing-file", "types.json not found")] };
  }
  if ("code" in types) {
    return { diagnostics: [types] };
  }
  parsed.push(types);
  if (types.root === undefined) {
    // Without types, every task's type would be reported as undefined.
    return result();
  }
  const symbols = emptySymbols();
  checkTypesFile(types.root, types.diagnostics, symbols);

  const tasks: ParsedFile[] = [];
  let tasksComplete = true;
  for (const name of listJson(directory, "tasks", problems)) {
    const file = readJson(directory, `tasks/${name}.json`);
    if (file === undefined || "code" in file) {
      tasksComplete = false;
      if (file !== undefined) problems.push(file);
      continue;
    }
    parsed.push(file);
    if (file.root === undefined) {
      tasksComplete = false;
      continue;
    }
    tasks.push(file);
    checkTaskFile(file.root, file.diagnostics, symbols, file.file, name);
  }
  if (!tasksComplete) {
    // Dimension and override files would report every task in the unreadable
    // file as unknown.
    return result();
  }

  const dimensions = new Map<string, DimensionEntry>();
  for (const name of listJson(directory, "dimensions", problems)) {
    const path = `dimensions/${name}.json`;
    if (!isName(name)) {
      problems.push(
        fileDiagnostic(
          path,
          "invalid-file-name",
          `${JSON.stringify(name)} is not a valid dimension name`,
        ),
      );
      continue;
    }
    if (name === "state") {
      problems.push(
        fileDiagnostic(
          path,
          "reserved-name",
          'a dimension cannot be named "state": verification contexts use it for task states',
        ),
      );
      continue;
    }
    // Declared even when unreadable, so its override file is not reported as
    // undeclared on top of the real problem.
    const symbol: DimensionSymbol = { values: undefined, scope: new Set(), scopeComplete: false };
    const file = readJson(directory, path);
    if (file === undefined || "code" in file) {
      if (file !== undefined) problems.push(file);
      dimensions.set(name, {
        parsed: { file: path, source: "", diagnostics: new Diagnostics("") },
        symbol,
      });
      continue;
    }
    parsed.push(file);
    dimensions.set(name, {
      parsed: file,
      symbol:
        file.root === undefined ? symbol : checkDimensionFile(file.root, file.diagnostics, symbols),
    });
  }

  const overrides: [string, ParsedFile][] = [];
  for (const name of listJson(directory, "overrides", problems)) {
    const path = `overrides/${name}.json`;
    const dimension = dimensions.get(name);
    if (dimension === undefined) {
      problems.push(
        fileDiagnostic(
          path,
          "undeclared-dimension",
          `no dimensions/${name}.json declares this dimension`,
        ),
      );
      continue;
    }
    const file = readJson(directory, path);
    if (file === undefined || "code" in file) {
      if (file !== undefined) problems.push(file);
      continue;
    }
    parsed.push(file);
    if (file.root !== undefined) {
      dimension.overrides = checkOverridesFile(
        file.root,
        file.diagnostics,
        symbols,
        dimension.symbol,
      );
    }
    overrides.push([name, file]);
  }

  const rootIds = new Set(tasks.map((file) => file.file.slice("tasks/".length, -".json".length)));
  const verification: [string, ParsedFile][] = [];
  for (const name of listJson(directory, "verification", problems)) {
    const path = `verification/${name}.json`;
    if (!rootIds.has(name) || !symbols.ids.has(name)) {
      problems.push(
        fileDiagnostic(path, "unknown-root-task", `no tasks/${name}.json defines this root task`),
      );
      continue;
    }
    const file = readJson(directory, path);
    if (file === undefined || "code" in file) {
      if (file !== undefined) problems.push(file);
      continue;
    }
    parsed.push(file);
    if (file.root !== undefined) {
      checkVerificationFile(file.root, file.diagnostics, symbols, dimensions, name);
    }
    verification.push([name, file]);
  }

  const diagnostics = result().diagnostics;
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  return {
    project: {
      types: JSON.parse(types.source) as TypesFile,
      tasks: tasks.map((file) => (JSON.parse(file.source) as TaskFile).task),
      dimensions: Object.fromEntries(
        [...dimensions].map(([name, { parsed: file }]) => [
          name,
          JSON.parse(file.source) as DimensionFile,
        ]),
      ),
      overrides: Object.fromEntries(
        overrides.map(([name, file]) => [name, JSON.parse(file.source) as OverridesFile]),
      ),
      verification: Object.fromEntries(
        verification.map(([name, file]) => [name, JSON.parse(file.source) as VerificationFile]),
      ),
    },
    diagnostics: [],
  };
}

// Names (without .json) of the JSON files directly inside a folder, sorted.
// A missing folder has none; a folder that is a file is reported.
function listJson(directory: string, folder: string, problems: FileDiagnostic[]): string[] {
  const path = join(directory, folder);
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) {
    return [];
  }
  if (!stat.isDirectory()) {
    problems.push(fileDiagnostic(folder, "not-a-directory", "not a directory"));
    return [];
  }
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort();
}

function fileDiagnostic(
  file: string,
  code: string,
  message: string,
  line = 1,
  column = 1,
): FileDiagnostic {
  return { file, code, message, path: "$", line, column };
}

// Undefined when the file does not exist; a diagnostic when it cannot be read.
function readJson(directory: string, file: string): ParsedFile | FileDiagnostic | undefined {
  const read = readSource(join(directory, file));
  if (!read.ok) {
    return read.code === "missing-file"
      ? undefined
      : fileDiagnostic(file, read.code, read.message, read.line, read.column);
  }
  const parsed = parseJson(read.source);
  const diagnostics = new Diagnostics(read.source);
  diagnostics.items.push(...parsed.diagnostics);
  return { file, source: read.source, root: parsed.root, diagnostics };
}

function collect(files: ParsedFile[]): FileDiagnostic[] {
  return files.flatMap(({ file, diagnostics }) =>
    diagnostics.items.map((diagnostic) => ({ file, ...diagnostic })),
  );
}
