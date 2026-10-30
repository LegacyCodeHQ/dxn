import { statSync } from "node:fs";
import { join } from "node:path";
import type { DimensionsFile, OverridesFile, Project, Tree } from "../tree.js";
import { check } from "./check.js";
import { type Diagnostic, Diagnostics } from "./diagnostic.js";
import { checkDimensions } from "./dimensions.js";
import { type JsonNode, parseJson } from "./json.js";
import { checkOverrides } from "./overrides.js";
import { readSource } from "./read.js";
import type { DimensionSymbols } from "./symbols.js";

export interface CompileResult {
  // Present only when the source has no diagnostics.
  document?: Tree;
  diagnostics: Diagnostic[];
}

export function compile(source: string): CompileResult {
  const parsed = parseJson(source);
  if (parsed.root === undefined) {
    return { diagnostics: parsed.diagnostics };
  }
  const diagnostics = new Diagnostics(source);
  check(parsed.root, diagnostics);
  const all = [...parsed.diagnostics, ...diagnostics.items];
  if (all.length > 0) {
    return { diagnostics: all };
  }
  return { document: JSON.parse(source) as Tree, diagnostics: [] };
}

export interface FileDiagnostic extends Diagnostic {
  file: string;
}

export interface DirectoryResult {
  // Present only when no file has diagnostics.
  project?: Project;
  diagnostics: FileDiagnostic[];
}

interface ParsedFile {
  name: string;
  source: string;
  root?: JsonNode;
  diagnostics: Diagnostics;
}

// Compiles a task-tree directory. tree.json is required; dimensions.json and
// overrides.json are optional; any other file is ignored.
export function compileDirectory(directory: string): DirectoryResult {
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() === false) {
    return { diagnostics: [fileDiagnostic(".", "not-a-directory", "not a directory")] };
  }
  const files: ParsedFile[] = [];
  const tree = readJson(directory, "tree.json");
  if (tree === undefined) {
    return { diagnostics: [fileDiagnostic("tree.json", "missing-file", "tree.json not found")] };
  }
  if ("code" in tree) {
    return { diagnostics: [tree] };
  }
  files.push(tree);
  if (tree.root === undefined) {
    // Without a tree, every reference in the other files would be reported as unknown.
    return { diagnostics: collect(files) };
  }
  const symbols = check(tree.root, tree.diagnostics);
  const problems: FileDiagnostic[] = [];

  let dimensions: DimensionSymbols = new Map();
  const dimensionsFile = readJson(directory, "dimensions.json");
  if (dimensionsFile !== undefined && "code" in dimensionsFile) {
    problems.push(dimensionsFile);
  } else if (dimensionsFile !== undefined) {
    files.push(dimensionsFile);
    if (dimensionsFile.root !== undefined) {
      dimensions = checkDimensions(dimensionsFile.root, dimensionsFile.diagnostics, symbols);
    }
  }

  const overridesFile = readJson(directory, "overrides.json");
  if (overridesFile !== undefined && "code" in overridesFile) {
    problems.push(overridesFile);
  } else if (overridesFile !== undefined) {
    files.push(overridesFile);
    if (overridesFile.root !== undefined) {
      checkOverrides(overridesFile.root, overridesFile.diagnostics, symbols, dimensions);
    }
  }

  const diagnostics = [...problems, ...collect(files)];
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const project: Project = { tree: JSON.parse(tree.source) as Tree };
  if (dimensionsFile !== undefined && !("code" in dimensionsFile)) {
    project.dimensions = JSON.parse(dimensionsFile.source) as DimensionsFile;
  }
  if (overridesFile !== undefined && !("code" in overridesFile)) {
    project.overrides = JSON.parse(overridesFile.source) as OverridesFile;
  }
  return { project, diagnostics: [] };
}

function fileDiagnostic(file: string, code: string, message: string): FileDiagnostic {
  return { file, code, message, path: "$", line: 1, column: 1 };
}

// Undefined when the file does not exist; a diagnostic when it cannot be read.
function readJson(directory: string, name: string): ParsedFile | FileDiagnostic | undefined {
  const read = readSource(join(directory, name));
  if (!read.ok) {
    return read.code === "missing-file" ? undefined : fileDiagnostic(name, read.code, read.message);
  }
  const parsed = parseJson(read.source);
  const diagnostics = new Diagnostics(read.source);
  diagnostics.items.push(...parsed.diagnostics);
  return { name, source: read.source, root: parsed.root, diagnostics };
}

function collect(files: ParsedFile[]): FileDiagnostic[] {
  return files.flatMap(({ name, diagnostics }) =>
    diagnostics.items.map((diagnostic) => ({ file: name, ...diagnostic })),
  );
}
