import { parseArgs } from "node:util";
import type { Io } from "../io.js";
import { requireProject } from "../project.js";
import { type Json, UnreadableFile, Workspace } from "../workspace.js";
import { type Command, type Context, command } from "./context.js";

// A usage error: the command line itself is wrong (exit 2).
export class UsageError extends Error {}

// A refusal: the command line is fine but the project does not allow it (exit 1).
export class Refusal extends Error {}

// Runs a command that edits the project: resolves the project, runs the
// edit against a Workspace, and commits it.
export function editCommand(
  usage: string,
  edit: (workspace: Workspace, args: string[]) => void,
): Command {
  return command(usage, (args, { io, cwd, dir, dryRun }) => {
    const project = requireProject(io, cwd, dir);
    if (project === undefined) {
      return 1;
    }
    const workspace = new Workspace(project);
    try {
      edit(workspace, args);
    } catch (error) {
      return report(io, usage, error);
    }
    return workspace.commit(io, dryRun);
  });
}

// Dispatches "<group> <subcommand> ..." to the subcommand.
export function group(usage: string, subcommands: Record<string, Command>): Command {
  return command(usage, (args, context: Context) => {
    const [name, ...rest] = args;
    const subcommand = name === undefined ? undefined : subcommands[name];
    if (subcommand === undefined) {
      context.io.stderr(usage);
      return 2;
    }
    return subcommand(rest, context);
  });
}

function report(io: Io, usage: string, error: unknown): number {
  if (error instanceof UsageError) {
    io.stderr(`dxn: ${error.message}\n\n${usage}`);
    return 2;
  }
  if (error instanceof Refusal || error instanceof UnreadableFile) {
    io.stderr(`dxn: ${error.message}\n`);
    return 1;
  }
  throw error;
}

// Parses a subcommand's arguments: exactly `positionals` names, then options.
export function parse<const O extends Record<string, { type: "string" | "boolean" }>>(
  args: string[],
  positionals: string[],
  options: O,
  rest = false,
) {
  let parsed: ReturnType<typeof parseArgs<{ args: string[]; options: O; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  if (parsed.positionals.length < positionals.length) {
    throw new UsageError(`missing ${positionals.slice(parsed.positionals.length).join(", ")}`);
  }
  if (!rest && parsed.positionals.length > positionals.length) {
    throw new UsageError(`unexpected ${parsed.positionals.slice(positionals.length).join(" ")}`);
  }
  return parsed;
}

export function list(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(",").map((item) => item.trim());
}

// "state=value" pairs from the command line.
export function pairs(args: string[]): [string, string][] {
  if (args.length === 0) {
    throw new UsageError("give at least one <state>=<value>");
  }
  return args.map((arg) => {
    const at = arg.indexOf("=");
    if (at <= 0) {
      throw new UsageError(`expected <state>=<value>, got ${JSON.stringify(arg)}`);
    }
    return [arg.slice(0, at), arg.slice(at + 1)];
  });
}

export function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Rebuilds an object with known keys in a fixed order, others after them.
export function ordered(value: Json, order: string[]): Json {
  const result: Json = {};
  for (const key of order) {
    if (key in value) result[key] = value[key];
  }
  for (const [key, item] of Object.entries(value)) {
    if (!(key in result)) result[key] = item;
  }
  return result;
}

// Reorders an object's keys in place.
export function reorder(value: Json, order: string[]): void {
  const sorted = ordered(value, order);
  for (const key of Object.keys(value)) delete value[key];
  Object.assign(value, sorted);
}

// Renames a key in place, keeping its position.
export function renameKey(object: Json, from: string, to: string): void {
  if (!(from in object)) {
    return;
  }
  const entries = Object.entries(object).map(([key, value]): [string, unknown] => [
    key === from ? to : key,
    value,
  ]);
  for (const key of Object.keys(object)) delete object[key];
  Object.assign(object, Object.fromEntries(entries));
}

export const nodeOrder = [
  "id",
  "title",
  "type",
  "onlyWhen",
  "transitions",
  "children",
  "attributes",
];
export const typesOrder = ["$schema", "version", "stateGroups", "attributes", "checks", "types"];
export const typeOrder = ["states", "stateGroups", "shared", "checks", "attributes"];

// Where a node is defined.
export interface Located {
  file: string;
  key: "root" | "fragment";
  item: Json;
  // The array the node is in, unless it is the file's root.
  siblings?: unknown[];
}

// Finds a node in the node and fragment files.
export function locate(workspace: Workspace, id: string): Located | undefined {
  for (const [folder, key] of [
    ["fragments", "fragment"],
    ["roots", "root"],
  ] as const) {
    for (const file of workspace.list(folder)) {
      const root = workspace.read(file)?.[key];
      if (!isObject(root)) continue;
      if (root.id === id) return { file, key, item: root };
      const found = find(root, id);
      if (found !== undefined) return { file, key, ...found };
    }
  }
  return undefined;
}

function find(item: Json, id: string): { item: Json; siblings: unknown[] } | undefined {
  const children = item.children;
  if (!Array.isArray(children)) return undefined;
  for (const child of children) {
    if (!isObject(child)) continue;
    if (child.id === id) return { item: child, siblings: children };
    const found = find(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function requireNode(workspace: Workspace, id: string): Located {
  const located = locate(workspace, id);
  if (located === undefined) {
    throw new Refusal(`node not found: ${id}`);
  }
  return located;
}

// Every node in the root and fragment files, with its file.
export function* treeNodes(workspace: Workspace): Generator<[string, Json]> {
  for (const [folder, key] of [
    ["fragments", "fragment"],
    ["roots", "root"],
  ] as const) {
    for (const file of workspace.list(folder)) {
      const root = workspace.read(file)?.[key];
      if (isObject(root)) yield* walk(file, root);
    }
  }
}

function* walk(file: string, item: Json): Generator<[string, Json]> {
  yield [file, item];
  if (Array.isArray(item.children)) {
    for (const child of item.children) {
      if (isObject(child)) yield* walk(file, child);
    }
  }
}

// Whether the node with this id has a shared type.
export function isSharedNode(workspace: Workspace, id: string): boolean {
  for (const [, item] of treeNodes(workspace)) {
    if (item.id !== id || typeof item.type !== "string") continue;
    const types = typesFile(workspace).types;
    const type = isObject(types) ? types[item.type] : undefined;
    return isObject(type) && type.shared === true;
  }
  return false;
}

// The expectations in expectations.json, each marking the file changed when
// visit returns true.
export function editExpectations(
  workspace: Workspace,
  visit: (expectation: Json) => boolean,
): void {
  const file = workspace.read("expectations.json");
  if (!Array.isArray(file?.expectations)) return;
  let changed = false;
  for (const expectation of file.expectations) {
    if (isObject(expectation) && visit(expectation)) changed = true;
  }
  if (changed) workspace.touch("expectations.json");
}

// An expectation's name -> value objects: when, then and some.
export function expectationValues(expectation: Json): Json[] {
  return ["when", "then", "some"]
    .map((key) => expectation[key])
    .filter((value): value is Json => isObject(value));
}

// Replaces from with to in a name -> value object, for the given names,
// including inside lists of values. Returns whether anything changed.
export function swapValues(item: unknown, names: string[], from: string, to: string): boolean {
  if (!isObject(item)) return false;
  let changed = false;
  for (const name of names) {
    const value = item[name];
    if (value === from) {
      item[name] = to;
      changed = true;
    } else if (Array.isArray(value) && value.includes(from)) {
      item[name] = value.map((each) => (each === from ? to : each));
      changed = true;
    }
  }
  return changed;
}

// Every record in the verification files, each marking its file changed when
// visit returns true.
// Visits every verification record and evidence entry: both name a node and
// a context.
export function editRecords(workspace: Workspace, visit: (record: Json) => boolean): void {
  for (const [folder, key] of [
    ["verification", "records"],
    ["evidence", "evidence"],
  ] as const) {
    for (const file of workspace.list(folder)) {
      const items = workspace.read(file)?.[key];
      if (!Array.isArray(items)) continue;
      let changed = false;
      for (const item of items) {
        if (isObject(item) && visit(item)) changed = true;
      }
      if (changed) workspace.touch(file);
    }
  }
}

// Calls visit on every { types, nodes } target map in an override file,
// at any nesting depth.
export function overrideTargets(
  overrides: unknown,
  visit: (kind: "types" | "nodes", targets: Json) => void,
): void {
  if (!isObject(overrides)) return;
  for (const [key, value] of Object.entries(overrides)) {
    if ((key === "types" || key === "nodes") && isObject(value)) {
      visit(key, value);
    } else {
      overrideTargets(value, visit);
    }
  }
}

// types.json, which every project has.
export function typesFile(workspace: Workspace): Json {
  const types = workspace.read("types.json");
  if (types === undefined) {
    throw new Refusal("types.json not found; run dxn prototype validate");
  }
  return types;
}

export function setOrdered(workspace: Workspace, path: string, value: Json, order: string[]): void {
  workspace.write(path, ordered(value, order));
}

// Sets attribute values on a type or a node.
export function setValues(item: Json, attribute: string, values: [string, string][]): void {
  const attributes = isObject(item.attributes) ? item.attributes : {};
  const byState = isObject(attributes[attribute]) ? attributes[attribute] : {};
  for (const [state, value] of values) byState[state] = value;
  attributes[attribute] = byState;
  item.attributes = attributes;
}

// Clears some states of an attribute, or all of it; drops empty containers.
export function unsetValues(item: Json, attribute: string, states: string[]): void {
  const attributes = item.attributes;
  if (!isObject(attributes)) return;
  const byState = attributes[attribute];
  if (states.length === 0 || !isObject(byState)) {
    delete attributes[attribute];
  } else {
    for (const state of states) delete byState[state];
    if (Object.keys(byState).length === 0) delete attributes[attribute];
  }
  if (Object.keys(attributes).length === 0) delete item.attributes;
}
