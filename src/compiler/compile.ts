import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkExpectations } from "../expectations.js";
import { isName } from "../language/text.js";
import { Resolver } from "../resolve.js";
import type {
  ActorsFile,
  CombinationOverridesFile,
  DimensionFile,
  ExpectationsFile,
  FragmentFile,
  OverridesFile,
  ProfilesFile,
  Project,
  RootFile,
  TypesFile,
  VerificationFile,
} from "../tree.js";
import { type ActorSymbol, checkActorsFile } from "./actors.js";
import { checkRootFile, checkTypesFile, emptySymbols, resolveOnlyWhen } from "./check.js";
import { checkConflicts } from "./conflicts.js";
import { childPath, Diagnostics, type FileDiagnostic } from "./diagnostic.js";
import { checkDimensionFile } from "./dimensions.js";
import { checkEvidence } from "./evidence.js";
import { resolveIncludes } from "./includes.js";
import { type JsonNode, parseJson } from "./json.js";
import { checkCombinationFile, checkOverridesFile } from "./overrides.js";
import { checkProfilesFile, type ProfilesSymbol } from "./profiles.js";
import { readSource } from "./read.js";
import { report } from "./shape.js";
import type { CombinationStates, DimensionSymbol, OverrideEntry } from "./symbols.js";
import { checkTransitions } from "./transitions.js";
import { checkVerificationFile, type DimensionInfo } from "./verification.js";

export type { FileDiagnostic } from "./diagnostic.js";

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
//   types.json               required: attribute declarations and types
//   fragments/<id>.json     one reusable fragment per file, named after its id
//   roots/<id>.json          one root per file, named after its id
//   dimensions/<name>.json   one dimension per file
//   overrides/<name>.json    overrides for the dimension of the same name
//   overrides/<a>+<b>.json   overrides for combinations of those dimensions' values
//   verification/<id>.json   verification records for the root <id>
//   actors.json              the roles that do work against the model
//   evidence/<id>.json       what actors recorded for nodes in the root <id>
//
// Anything else in the directory is ignored.
// Evidence points to files relative to repository, the folder that holds the
// project unless a caller compiling a copy elsewhere names the original one.
export function compileDirectory(
  directory: string,
  repository: string = dirname(directory),
): DirectoryResult {
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
    if (name === "profile") {
      problems.push(
        fileDiagnostic(
          path,
          "reserved-name",
          'a dimension cannot be named "profile": contexts use profile=<name> to pick a profile',
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

  // profiles.json: the combinations of dimension values that exist. A
  // dimension the profiles cover has no default: a profile fills it in.
  let profiles: ProfilesSymbol = { combinations: [], dimensions: new Set(), complete: true };
  const profilesFile = readJson(directory, "profiles.json");
  if (profilesFile !== undefined) {
    if ("code" in profilesFile) {
      problems.push(profilesFile);
    } else {
      parsed.push(profilesFile);
      if (profilesFile.root !== undefined) {
        profiles = checkProfilesFile(profilesFile.root, profilesFile.diagnostics, dimensions);
      }
    }
  }
  // Profiles build on dimensions: a dimension is valid on its own, and only
  // profiles.json reports what the profiles need of it. A dimension they
  // cover has no default, because a profile fills it in.
  const profileMembers = (() => {
    const root =
      profilesFile !== undefined && !("code" in profilesFile) ? profilesFile.root : undefined;
    const list =
      root?.kind === "object"
        ? root.members.find(({ key }) => key.value === "profiles")?.value
        : undefined;
    return list?.kind === "object" ? list.members : [];
  })();
  for (const name of profiles.dimensions) {
    const root = dimensions.get(name)?.parsed.root;
    const hasDefault =
      root?.kind === "object" && root.members.some(({ key }) => key.value === "default");
    if (!hasDefault || profilesFile === undefined || "code" in profilesFile) continue;
    for (const { key: profile, value } of profileMembers) {
      const entry =
        value.kind === "object" ? value.members.find(({ key }) => key.value === name) : undefined;
      if (entry === undefined) continue;
      report(
        profilesFile.diagnostics,
        "profiled-default",
        `dimension ${name} has a default, but profiles fill it in: remove its default`,
        childPath(childPath("$.profiles", profile.value), name),
        entry.key,
      );
      break;
    }
  }

  const overrides: [string, ParsedFile][] = [];
  const entries: OverrideEntry[] = [];
  // Shared node id -> its states as override keys, for overrides/<id>.json.
  const shared = new Map<string, DimensionInfo>();
  const overrideNames = listJson(directory, "overrides", problems);
  for (const name of overrideNames.filter((name) => !name.includes("+"))) {
    const path = `overrides/${name}.json`;
    const dimension = dimensions.get(name);
    const sharedType = symbols.nodeTypes.get(name);
    if (
      dimension === undefined &&
      sharedType !== undefined &&
      symbols.sharedTypes.has(sharedType)
    ) {
      // overrides/<shared-node>.json: what changes below a shared node in each
      // of its states.
      const file = readJson(directory, path);
      if (file === undefined || "code" in file) {
        if (file !== undefined) problems.push(file);
        continue;
      }
      parsed.push(file);
      const below = new Set<string>();
      const visit = (id: string) => {
        for (const child of symbols.children.get(id) ?? []) {
          if (below.has(child)) continue;
          below.add(child);
          visit(child);
        }
      };
      visit(name);
      const symbol: DimensionSymbol = {
        values: symbols.types.get(sharedType) ?? new Set(),
        scope: below,
        scopeComplete: true,
        shared: name,
      };
      if (file.root !== undefined) {
        const checked = checkOverridesFile(
          file.root,
          file.diagnostics,
          symbols,
          { ...symbol, name },
          { file: path, entries },
          false,
        );
        shared.set(name, { symbol, overrides: checked.states });
      }
      overrides.push([name, file]);
      continue;
    }
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

  // A combination override at a combination no profile has never applies.
  for (const [name, file] of combinations) {
    const names = name.split("+");
    const walk = (item: JsonNode | undefined, depth: number, values: string[], path: string) => {
      if (item?.kind !== "object") return;
      for (const { key, value } of item.members) {
        const here = childPath(path, key.value);
        const chosen = [...values, key.value];
        if (depth < names.length - 1) {
          walk(value, depth + 1, chosen, here);
          continue;
        }
        const covered = names.filter((dimension) => profiles.dimensions.has(dimension));
        const fits =
          covered.length === 0 ||
          profiles.combinations.some((profile) =>
            covered.every(
              (dimension) => profile.get(dimension) === chosen[names.indexOf(dimension)],
            ),
          );
        if (!fits) {
          report(
            file.diagnostics,
            "no-profile",
            `no profile has ${covered.map((dimension) => `${dimension}=${chosen[names.indexOf(dimension)]}`).join(", ")}`,
            here,
            key,
          );
        }
      }
    };
    const root = file.root;
    const overridesNode =
      root?.kind === "object"
        ? root.members.find(({ key }) => key.value === "overrides")?.value
        : undefined;
    walk(overridesNode, 0, [], "$.overrides");
  }

  checkConflicts(entries, symbols, new Map([...dimensions, ...shared]));
  checkTransitions(symbols, dimensions);

  // actors.json: the roles that do work against the model.
  const actorsFile = readJson(directory, "actors.json");
  let actors = new Map<string, ActorSymbol>();
  if (actorsFile !== undefined) {
    if ("code" in actorsFile) {
      problems.push(actorsFile);
    } else {
      parsed.push(actorsFile);
      if (actorsFile.root !== undefined) {
        actors = checkActorsFile(actorsFile.root, actorsFile.diagnostics, symbols.checks);
      }
    }
  }

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
        profiles,
        shared,
        actors,
      );
    }
    verification.push([name, file]);
  }

  const diagnostics = result().diagnostics;
  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const project: Project = {
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
  };
  if (profilesFile !== undefined && !("code" in profilesFile)) {
    project.profiles = JSON.parse(profilesFile.source) as ProfilesFile;
  }
  if (actorsFile !== undefined && !("code" in actorsFile)) {
    project.actors = JSON.parse(actorsFile.source) as ActorsFile;
  }
  // Expectations are checked against the model, so only once it compiles.
  const expected = checkExpectations(directory, new Resolver(project));
  if (expected.length > 0) {
    return { diagnostics: expected };
  }
  // Evidence names the model's contexts, so it is checked once the model compiles.
  const evidence = checkEvidence(directory, repository, new Resolver(project));
  if (evidence.diagnostics.length > 0) {
    return { diagnostics: evidence.diagnostics };
  }
  if (Object.keys(evidence.files).length > 0) {
    project.evidence = evidence.files;
    project.fingerprints = evidence.fingerprints;
    project.frameNames = evidence.frameNames;
    project.conflicts = evidence.conflicts;
  }
  const expectations = readJson(directory, "expectations.json");
  if (expectations !== undefined && !("code" in expectations)) {
    project.expectations = JSON.parse(expectations.source) as ExpectationsFile;
  }
  return { project, diagnostics: [] };
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
