import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  CombinationOverridesFile,
  DimensionFile,
  FragmentFile,
  OverridesFile,
  Project,
  RootFile,
  TypesFile,
  VerificationFile,
} from "../tree.js";
import { checkRootFile, checkTypesFile, emptySymbols, resolveOnlyWhen } from "./check.js";
import { checkConflicts } from "./conflicts.js";
import { type Diagnostic, Diagnostics } from "./diagnostic.js";
import { checkDimensionFile } from "./dimensions.js";
import { resolveIncludes } from "./includes.js";
import { type JsonNode, parseJson } from "./json.js";
import { checkCombinationFile, checkOverridesFile } from "./overrides.js";
import { readSource } from "./read.js";
import { isName } from "./shape.js";
import type { CombinationStates, DimensionSymbol, OverrideEntry } from "./symbols.js";
import { checkTransitions } from "./transitions.js";
import { checkVerificationFile, type DimensionInfo } from "./verification.js";

export interface FileDiagnostic extends Diagnostic {
  // Relative to the project directory, e.g. "roots/article-root.json".
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
//   fragments/<id>.json     one reusable fragment per file, named after its id
//   roots/<id>.json          one root per file, named after its id
//   dimensions/<name>.json   one dimension per file
//   overrides/<name>.json    overrides for the dimension of the same name
//   overrides/<a>+<b>.json   overrides for combinations of those dimensions' values
//   verification/<id>.json   verification records for the root <id>
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
    // Without types, every node's type would be reported as undefined.
    return result();
  }
  const symbols = emptySymbols();
  checkTypesFile(types.root, types.diagnostics, symbols);

  // Fragments first, so their ids come before any node that reuses one.
  const fragments: ParsedFile[] = [];
  const nodes: ParsedFile[] = [];
  let nodesComplete = true;
  for (const [folder, key, files] of [
    ["fragments", "fragment", fragments],
    ["roots", "root", nodes],
  ] as const) {
    for (const name of listJson(directory, folder, problems)) {
      const file = readJson(directory, `${folder}/${name}.json`);
      if (file === undefined || "code" in file) {
        nodesComplete = false;
        if (file !== undefined) problems.push(file);
        continue;
      }
      parsed.push(file);
      if (file.root === undefined) {
        nodesComplete = false;
        continue;
      }
      files.push(file);
      if (key === "fragment") {
        symbols.fragments.add(name);
      }
      checkRootFile(file.root, file.diagnostics, symbols, file.file, name, key);
    }
  }
  if (nodesComplete) {
    resolveOnlyWhen(symbols);
    resolveIncludes(
      symbols,
      nodes.map((file) => file.file.slice("roots/".length, -".json".length)),
    );
  }
  if (!nodesComplete) {
    // Dimension and override files would report every node in the unreadable
    // file as unknown.
    return result();
  }

  const dimensions = new Map<string, DimensionEntry>();
  for (const name of listJson(directory, "dimensions", problems)) {
    const path = `dimensions/${name}.json`;
    if (!isName(name) || name.includes("+")) {
      problems.push(
        fileDiagnostic(
          path,
          "invalid-file-name",
          `${JSON.stringify(name)} is not a valid dimension name; names cannot contain "+"`,
        ),
      );
      continue;
    }
    if ([...symbols.nodeTypes].some(([id, type]) => id === name && symbols.sharedTypes.has(type))) {
      problems.push(
        fileDiagnostic(
          path,
          "reserved-name",
          `a dimension cannot be named after the shared node "${name}": contexts use its id for its state`,
        ),
      );
      continue;
    }
    if (symbols.stateGroups.has(name)) {
      problems.push(
        fileDiagnostic(
          path,
          "reserved-name",
          `a dimension cannot be named after the state group "${name}": contexts use it for that group`,
        ),
      );
      continue;
    }
    if (name === "state") {
      problems.push(
        fileDiagnostic(
          path,
          "reserved-name",
          'a dimension cannot be named "state": verification contexts use it for node states',
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
  const entries: OverrideEntry[] = [];
  const overrideNames = listJson(directory, "overrides", problems);
  for (const name of overrideNames.filter((name) => !name.includes("+"))) {
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
      const checked = checkOverridesFile(
        file.root,
        file.diagnostics,
        symbols,
        { ...dimension.symbol, name },
        { file: path, entries },
      );
      dimension.overrides = checked.states;
      dimension.symbol.only = checked.only;
    }
    overrides.push([name, file]);
  }

  const combinations: [string, ParsedFile][] = [];
  const combinationStates: CombinationStates[] = [];
  for (const name of overrideNames.filter((name) => name.includes("+"))) {
    const path = `overrides/${name}.json`;
    const names = name.split("+");
    const problem = combinationNameProblem(names, dimensions);
    if (problem !== undefined) {
      problems.push(fileDiagnostic(path, problem.code, problem.message));
      continue;
    }
    const file = readJson(directory, path);
    if (file === undefined || "code" in file) {
      if (file !== undefined) problems.push(file);
      continue;
    }
    parsed.push(file);
    if (file.root !== undefined) {
      const parts = names.map((part) => {
        const dimension = dimensions.get(part) as DimensionEntry;
        return { name: part, symbol: dimension.symbol, overrides: dimension.overrides };
      });
      combinationStates.push({
        dimensions: names,
        changes: checkCombinationFile(file.root, file.diagnostics, symbols, parts, {
          file: path,
          entries,
        }),
      });
    }
    combinations.push([name, file]);
  }

  checkConflicts(entries, symbols, dimensions);
  checkTransitions(symbols, dimensions);

  const rootIds = new Set(nodes.map((file) => file.file.slice("roots/".length, -".json".length)));
  const verification: [string, ParsedFile][] = [];
  for (const name of listJson(directory, "verification", problems)) {
    const path = `verification/${name}.json`;
    if (!rootIds.has(name) || !symbols.ids.has(name)) {
      problems.push(
        fileDiagnostic(path, "unknown-root", `no roots/${name}.json defines this root`),
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
      checkVerificationFile(
        file.root,
        file.diagnostics,
        symbols,
        dimensions,
        combinationStates,
        name,
      );
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
      fragments: fragments.map((file) => (JSON.parse(file.source) as FragmentFile).fragment),
      roots: nodes.map((file) => (JSON.parse(file.source) as RootFile).root),
      dimensions: Object.fromEntries(
        [...dimensions].map(([name, { parsed: file }]) => [
          name,
          JSON.parse(file.source) as DimensionFile,
        ]),
      ),
      overrides: Object.fromEntries(
        overrides.map(([name, file]) => [name, JSON.parse(file.source) as OverridesFile]),
      ),
      combinations: Object.fromEntries(
        combinations.map(([name, file]) => [
          name,
          JSON.parse(file.source) as CombinationOverridesFile,
        ]),
      ),
      verification: Object.fromEntries(
        verification.map(([name, file]) => [name, JSON.parse(file.source) as VerificationFile]),
      ),
    },
    diagnostics: [],
  };
}

// Why a combination file name like "breakpoint+pointer" is invalid, if it is.
function combinationNameProblem(
  names: string[],
  dimensions: Map<string, unknown>,
): { code: string; message: string } | undefined {
  if (!names.every(isName)) {
    return { code: "invalid-file-name", message: "each dimension name must be a valid name" };
  }
  if (new Set(names).size !== names.length) {
    return { code: "duplicate-dimension", message: "a dimension is listed more than once" };
  }
  if (names.some((name, index) => index > 0 && (names[index - 1] as string) > name)) {
    return {
      code: "unsorted-dimensions",
      message: `dimensions must be in alphabetical order: ${[...names].sort().join("+")}`,
    };
  }
  const undeclared = names.find((name) => !dimensions.has(name));
  if (undeclared !== undefined) {
    return {
      code: "undeclared-dimension",
      message: `no dimensions/${undeclared}.json declares this dimension`,
    };
  }
  return undefined;
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
