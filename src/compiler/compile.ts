import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DimensionsFile, OverridesFile, Project, Tree } from "../tree.js";
import { check } from "./check.js";
import { type Diagnostic, Diagnostics } from "./diagnostic.js";
import { checkDimensions } from "./dimensions.js";
import { type JsonNode, parseJson } from "./json.js";
import { checkOverrides } from "./overrides.js";
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
  const files: ParsedFile[] = [];
  const tree = readJson(directory, "tree.json");
  if (tree === undefined) {
    return {
      diagnostics: [
        {
          file: "tree.json",
          code: "missing-file",
          message: "tree.json not found",
          path: "$",
          line: 1,
          column: 1,
        },
      ],
    };
  }
  files.push(tree);
  if (tree.root === undefined) {
    // Without a tree, every reference in the other files would be reported as unknown.
    return { diagnostics: collect(files) };
  }
  const symbols = check(tree.root, tree.diagnostics);

  let dimensions: DimensionSymbols = new Map();
  const dimensionsFile = readJson(directory, "dimensions.json");
  if (dimensionsFile !== undefined) {
    files.push(dimensionsFile);
    if (dimensionsFile.root !== undefined) {
      dimensions = checkDimensions(dimensionsFile.root, dimensionsFile.diagnostics, symbols);
    }
  }

  const overridesFile = readJson(directory, "overrides.json");
  if (overridesFile !== undefined) {
    files.push(overridesFile);
    if (overridesFile.root !== undefined) {
      checkOverrides(overridesFile.root, overridesFile.diagnostics, symbols, dimensions);
    }
  }

  const diagnostics = collect(files);
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const project: Project = { tree: JSON.parse(tree.source) as Tree };
  if (dimensionsFile !== undefined) {
    project.dimensions = JSON.parse(dimensionsFile.source) as DimensionsFile;
  }
  if (overridesFile !== undefined) {
    project.overrides = JSON.parse(overridesFile.source) as OverridesFile;
  }
  return { project, diagnostics: [] };
}

function readJson(directory: string, name: string): ParsedFile | undefined {
  let source: string;
  try {
    source = readFileSync(join(directory, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const parsed = parseJson(source);
  const diagnostics = new Diagnostics(source);
  diagnostics.items.push(...parsed.diagnostics);
  return { name, source, root: parsed.root, diagnostics };
}

function collect(files: ParsedFile[]): FileDiagnostic[] {
  return files.flatMap(({ name, diagnostics }) =>
    diagnostics.items.map((diagnostic) => ({ file: name, ...diagnostic })),
  );
}
