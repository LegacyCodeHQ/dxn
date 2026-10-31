import { compileDirectory } from "../compiler/compile.js";
import { type Context, contextKey, Resolver } from "../resolve.js";
import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, isObject, parse, Refusal, UsageError } from "./edit.js";
import { fillProfile } from "./reading.js";

const verifyUsage = `Usage: dimensions verify <node-id> --check <name> --result passed|failed --actor <role>
                        [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]
                        [--transition <id>] [--at <time>] [--root <root-id>]

Records a check's result for a node in one context, replacing any earlier
record for the same node, context and check. --actor is the role that checked,
declared in actors.json. The context gives one value for
each of the node's state groups (state=<state> for a plain states list, or
<node-id>=<state> for a shared node, as contexts names it) and the states of
shared nodes above it; dimensions left out take their default.
--transition records the result for one of the node's transitions instead.
--at defaults to now; --root is needed when several roots include the node.
`;

const unverifyUsage = `Usage: dimensions unverify <node-id> --check <name> [<group>=<value>...] [<dimension>=<value>...]
                          [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]

Removes the record for that node and check, in that context or for that
transition.
`;

// The project as compiled from disk, for defaults and roots.
function resolver(workspace: Workspace): Resolver {
  const { project } = compileDirectory(workspace.project);
  if (project === undefined) {
    throw new Refusal("the project has errors; run dimensions validate");
  }
  return new Resolver(project);
}

// state=... and <dimension>=... arguments: state first, then dimensions by name.
function contextArgs(args: string[]): Context {
  const entries = args.map((arg) => {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <name>=<value>, got ${JSON.stringify(arg)}`);
    }
    return [arg.slice(0, at), arg.slice(at + 1)] as [string, string];
  });
  entries.sort(([a], [b]) => (a === "state" ? -1 : b === "state" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

// The context with profile=<name>, or the values that pick one profile,
// replaced by that profile's values for the node's profiled dimensions.
function withProfile(model: Resolver, id: string, given: Context): Context {
  if (model.node(id) === undefined || (model.profiles.size === 0 && given.profile === undefined)) {
    return given;
  }
  const filled = fillProfile(model, model.dimensions(id), given, "this node");
  const { profile: _, ...rest } = { ...given, ...filled };
  return Object.fromEntries(
    Object.entries(rest).sort(([a], [b]) =>
      a === "state" ? -1 : b === "state" ? 1 : a < b ? -1 : a > b ? 1 : 0,
    ),
  );
}

function rootFor(resolver: Resolver, id: string, chosen: string | undefined): string {
  if (resolver.node(id) === undefined) {
    throw new Refusal(`node not found: ${id}`);
  }
  const roots = resolver.roots(id).sort();
  if (chosen !== undefined) {
    if (!roots.includes(chosen)) {
      throw new Refusal(`"${id}" is not in root "${chosen}"`);
    }
    return chosen;
  }
  if (roots.length === 0) {
    throw new Refusal(`"${id}" is not in any root`);
  }
  if (roots.length > 1) {
    throw new Refusal(`"${id}" is in several roots (${roots.join(", ")}); choose one with --root`);
  }
  return roots[0] as string;
}

// A record's identity: node, context with defaults filled in, and check.
function identity(resolver: Resolver, node: string, context: Context, check: string): string {
  return JSON.stringify([
    node,
    contextKey({ ...context, ...resolver.withDefaults(node, context) }),
    check,
  ]);
}

function records(workspace: Workspace, root: string, create: boolean): unknown[] | undefined {
  const file = `verification/${root}.json`;
  let document = workspace.read(file);
  if (document === undefined) {
    if (!create) return undefined;
    document = { version: 1, records: [] };
    workspace.write(file, document);
  }
  if (!Array.isArray(document.records)) document.records = [];
  workspace.touch(file);
  return document.records as unknown[];
}

function transitionIdentity(node: string, transition: string, check: string): string {
  return JSON.stringify([node, `transition:${transition}`, check]);
}

function matches(resolver: Resolver, key: string) {
  return (record: unknown) => {
    if (!isObject(record) || typeof record.node !== "string" || typeof record.check !== "string") {
      return false;
    }
    if (typeof record.transition === "string") {
      return transitionIdentity(record.node, record.transition, record.check) === key;
    }
    return (
      isObject(record.context) &&
      identity(resolver, record.node, record.context as Context, record.check) === key
    );
  };
}

export const verify: Command = editCommand(verifyUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    {
      check: { type: "string" },
      result: { type: "string" },
      actor: { type: "string" },
      at: { type: "string" },
      root: { type: "string" },
      transition: { type: "string" },
    },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.check === undefined || values.result === undefined || values.actor === undefined) {
    throw new UsageError("--check, --result and --actor are required");
  }
  if (values.transition !== undefined && rest.length > 0) {
    throw new UsageError("a record is about a transition or a context, not both");
  }
  const model = resolver(workspace);
  const context = withProfile(model, id, contextArgs(rest));
  const root = rootFor(model, id, values.root);
  const record: Json = {
    node: id,
    ...(values.transition === undefined ? { context } : { transition: values.transition }),
    check: values.check,
    result: values.result,
    actor: values.actor,
    at: values.at ?? new Date().toISOString(),
  };
  const list = records(workspace, root, true) as unknown[];
  const key =
    values.transition === undefined
      ? identity(model, id, context, values.check)
      : transitionIdentity(id, values.transition, values.check);
  const index = list.findIndex(matches(model, key));
  if (index >= 0) {
    list[index] = record;
  } else {
    list.push(record);
  }
});

export const unverify: Command = editCommand(unverifyUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    { check: { type: "string" }, root: { type: "string" }, transition: { type: "string" } },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.check === undefined) {
    throw new UsageError("--check is required");
  }
  const model = resolver(workspace);
  const context = withProfile(model, id, contextArgs(rest));
  const root = rootFor(model, id, values.root);
  const list = records(workspace, root, false);
  const key =
    values.transition === undefined
      ? identity(model, id, context, values.check)
      : transitionIdentity(id, values.transition, values.check);
  const index = list?.findIndex(matches(model, key)) ?? -1;
  if (list === undefined || index < 0) {
    const about =
      values.transition === undefined
        ? `in ${JSON.stringify(context)}`
        : `for transition ${JSON.stringify(values.transition)}`;
    throw new Refusal(`no ${values.check} record for ${id} ${about}`);
  }
  list.splice(index, 1);
});
