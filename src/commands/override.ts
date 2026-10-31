import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import {
  editCommand,
  group,
  isObject,
  list,
  pairs,
  parse,
  Refusal,
  reorder,
  setValues,
  UsageError,
  unsetValues,
} from "./edit.js";

const overrideUsage = `Usage: dxn override <subcommand>

<context> is <dimension>=<value>, or several joined by commas for a
combination, e.g. breakpoint=sm,pointer=touch; or a shared node's state,
e.g. form=incomplete, which changes the nodes below that shared node.
Separate several values with | to write the same override at each, e.g.
"form=empty|email-filled" (quote it in a shell).

Subcommands:
  states <context> (--type <t> | --node <id>) [--add <state>]... [--remove <state>]...
                                     Add or remove states in that context
  set <context> (--type <t> | --node <id>) <attribute> <state>=<value>...
                                     Set attribute values in that context
  unset <context> (--type <t> | --node <id>) [<attribute> [<state>...]]
                                     Clear some values, an attribute, or the whole override
`;

const onlyUsage = `Usage: dxn node only <node-id> <dimension> (<value>... | --everywhere)

Says where a node and its subtree exist: only at the given values of the
dimension, or everywhere again with --everywhere.
`;

const overridesOrder = ["$schema", "version", "only", "overrides"];

// The file and nesting path for a context such as "breakpoint=sm,pointer=touch".
function locateContext(context: string): { file: string; path: string[]; label: string } {
  const entries = context.split(",").map((part) => {
    const at = part.indexOf("=");
    if (at <= 0 || at === part.length - 1) {
      throw new UsageError(`expected <dimension>=<value>, got ${JSON.stringify(part)}`);
    }
    return [part.slice(0, at), part.slice(at + 1)] as [string, string];
  });
  const names = entries.map(([name]) => name);
  if (new Set(names).size !== names.length) {
    throw new UsageError("a dimension appears more than once in the context");
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    file: `overrides/${entries.map(([name]) => name).join("+")}.json`,
    path: entries.map(([, value]) => value),
    label: entries.map(([name, value]) => `${name}=${value}`).join(","),
  };
}

function overridesFile(workspace: Workspace, file: string): Json {
  const existing = workspace.read(file);
  if (existing !== undefined) {
    return existing;
  }
  const created = { version: 1, overrides: {} };
  workspace.write(file, created);
  return created;
}

// The override for a type or node in a context, created when asked to.
function target(
  workspace: Workspace,
  args: string[],
  create: boolean,
): { override: Json | undefined; chain: Json[]; file: string; describe: string; rest: string[] } {
  const { values, positionals } = parse(
    args,
    ["context"],
    {
      type: { type: "string" },
      node: { type: "string" },
      add: { type: "string", multiple: true },
      remove: { type: "string", multiple: true },
    } as const,
    true,
  );
  const [context, ...rest] = positionals as [string, ...string[]];
  if ((values.type === undefined) === (values.node === undefined)) {
    throw new UsageError("give exactly one of --type and --node");
  }
  const { file, path, label } = locateContext(context);
  const kind = values.type === undefined ? "nodes" : "types";
  const name = (values.type ?? values.node) as string;
  const describe = `${values.type === undefined ? "node" : "type"} ${name} at ${label}`;
  const document = create ? overridesFile(workspace, file) : workspace.read(file);
  if (document === undefined) {
    return { override: undefined, chain: [], file, describe, rest };
  }
  const chain: Json[] = [document];
  let item: Json = document;
  for (const key of ["overrides", ...path, kind, name]) {
    let next = item[key];
    if (!isObject(next)) {
      if (!create) return { override: undefined, chain, file, describe, rest };
      next = {};
      item[key] = next;
    }
    item = next as Json;
    chain.push(item);
  }
  reorder(document, overridesOrder);
  return { override: item, chain, file, describe, rest };
}

// Removes empty objects from the end of the chain upward, keeping the file
// and its overrides map.
function prune(chain: Json[]): void {
  for (let index = chain.length - 1; index >= 2; index--) {
    const item = chain[index] as Json;
    const parent = chain[index - 1] as Json;
    if (Object.keys(item).length > 0) return;
    for (const [key, value] of Object.entries(parent)) {
      if (value === item) delete parent[key];
    }
  }
}

// Runs an override edit once for each context a list names: form=a|b, or
// breakpoint=sm|lg,pointer=touch for each combination.
function eachContext(
  edit: (workspace: Workspace, args: string[]) => void,
): (workspace: Workspace, args: string[]) => void {
  return (workspace, args) => {
    const index = args.findIndex((arg) => !arg.startsWith("--") && arg.includes("="));
    const context = args[index];
    if (context === undefined || !context.includes("|")) {
      edit(workspace, args);
      return;
    }
    let contexts: string[][] = [[]];
    for (const part of context.split(",")) {
      const at = part.indexOf("=");
      const name = part.slice(0, at);
      const values = part.slice(at + 1).split("|");
      if (at <= 0 || values.some((value) => value === "")) {
        throw new UsageError(`expected <name>=<value>[|<value>...], got ${JSON.stringify(part)}`);
      }
      contexts = contexts.flatMap((chosen) =>
        values.map((value) => [...chosen, `${name}=${value}`]),
      );
    }
    for (const chosen of contexts) {
      edit(workspace, [...args.slice(0, index), chosen.join(","), ...args.slice(index + 1)]);
    }
  };
}

const states = editCommand(
  overrideUsage,
  eachContext((workspace, args) => {
    const { values } = parse(
      args,
      ["context"],
      {
        type: { type: "string" },
        node: { type: "string" },
        add: { type: "string", multiple: true },
        remove: { type: "string", multiple: true },
      } as const,
      true,
    );
    const add = (values.add ?? []).flatMap((item) => list(item) ?? []);
    const remove = (values.remove ?? []).flatMap((item) => list(item) ?? []);
    if (add.length === 0 && remove.length === 0) {
      throw new UsageError("give --add or --remove");
    }
    const { override, file, rest } = target(workspace, args, true);
    if (rest.length > 0) {
      throw new UsageError(`unexpected ${rest.join(" ")}`);
    }
    const changes = (isObject(override?.states) ? override.states : {}) as Json;
    for (const [key, items] of [
      ["remove", remove],
      ["add", add],
    ] as const) {
      if (items.length === 0) continue;
      const existing = Array.isArray(changes[key]) ? (changes[key] as string[]) : [];
      changes[key] = [...existing, ...items.filter((item) => !existing.includes(item))];
    }
    (override as Json).states = {
      ...(changes.remove === undefined ? {} : { remove: changes.remove }),
      ...(changes.add === undefined ? {} : { add: changes.add }),
    };
    reorder(override as Json, ["states", "attributes"]);
    workspace.touch(file);
  }),
);

const set = editCommand(
  overrideUsage,
  eachContext((workspace, args) => {
    const { override, file, rest } = target(workspace, args, true);
    const [attribute, ...assignments] = rest;
    if (attribute === undefined) {
      throw new UsageError("missing attribute");
    }
    setValues(override as Json, attribute, pairs(assignments));
    reorder(override as Json, ["states", "attributes"]);
    workspace.touch(file);
  }),
);

const unset = editCommand(
  overrideUsage,
  eachContext((workspace, args) => {
    const { override, chain, file, describe, rest } = target(workspace, args, false);
    if (override === undefined) {
      throw new Refusal(`no override for ${describe}`);
    }
    const [attribute, ...statesToClear] = rest;
    if (attribute === undefined) {
      for (const key of Object.keys(override)) delete override[key];
    } else {
      unsetValues(override, attribute, statesToClear);
    }
    prune(chain);
    workspace.touch(file);
  }),
);

export const override: Command = group(overrideUsage, { states, set, unset });

export const only: Command = editCommand(onlyUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["node-id", "dimension"],
    { everywhere: { type: "boolean" } },
    true,
  );
  const [node, dimension, ...listed] = positionals as [string, string, ...string[]];
  if ((listed.length === 0) === (values.everywhere !== true)) {
    throw new UsageError("give the values where the node exists, or --everywhere");
  }
  const file = `overrides/${dimension}.json`;
  const document = overridesFile(workspace, file);
  const restrictions = isObject(document.only) ? document.only : {};
  if (values.everywhere === true) {
    delete restrictions[node];
  } else {
    restrictions[node] = listed;
  }
  if (Object.keys(restrictions).length === 0) {
    delete document.only;
  } else {
    document.only = restrictions;
  }
  reorder(document, overridesOrder);
  workspace.touch(file);
});
