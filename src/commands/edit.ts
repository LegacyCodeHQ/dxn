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
    io.stderr(`task-tree: ${error.message}\n\n${usage}`);
    return 2;
  }
  if (error instanceof Refusal || error instanceof UnreadableFile) {
    io.stderr(`task-tree: ${error.message}\n`);
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
  "customAttributes",
];
export const typesOrder = [
  "$schema",
  "version",
  "stateGroups",
  "customAttributes",
  "customChecks",
  "types",
];
export const typeOrder = ["states", "stateGroups", "shared", "checks", "customAttributes"];

// Where a node is defined.
export interface Located {
  file: string;
  key: "root" | "component";
  item: Json;
  // The array the node is in, unless it is the file's root.
  siblings?: unknown[];
}

// Finds a node in the node and component files.
export function locate(workspace: Workspace, id: string): Located | undefined {
  for (const [folder, key] of [
    ["components", "component"],
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

// Every node in the root and component files, with its file.
export function* nodeNodes(workspace: Workspace): Generator<[string, Json]> {
  for (const [folder, key] of [
    ["components", "component"],
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
    throw new Refusal("types.json not found; run task-tree validate");
  }
  return types;
}

export function setOrdered(workspace: Workspace, path: string, value: Json, order: string[]): void {
  workspace.write(path, ordered(value, order));
}

// Sets attribute values on a type or a node.
export function setValues(item: Json, attribute: string, values: [string, string][]): void {
  const attributes = isObject(item.customAttributes) ? item.customAttributes : {};
  const byState = isObject(attributes[attribute]) ? attributes[attribute] : {};
  for (const [state, value] of values) byState[state] = value;
  attributes[attribute] = byState;
  item.customAttributes = attributes;
}

// Clears some states of an attribute, or all of it; drops empty containers.
export function unsetValues(item: Json, attribute: string, states: string[]): void {
  const attributes = item.customAttributes;
  if (!isObject(attributes)) return;
  const byState = attributes[attribute];
  if (states.length === 0 || !isObject(byState)) {
    delete attributes[attribute];
  } else {
    for (const state of states) delete byState[state];
    if (Object.keys(byState).length === 0) delete attributes[attribute];
  }
  if (Object.keys(attributes).length === 0) delete item.customAttributes;
}
