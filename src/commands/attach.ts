import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { revisionOf } from "../compiler/evidence.js";
import type { Context } from "../resolve.js";
import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, isObject, parse, Refusal, UsageError } from "./edit.js";
import { contextArgs, resolver, rootFor, withProfile } from "./verify.js";

const attachUsage = `Usage: dimensions attach <node-id> --actor <role> --file <path> --frame <id>
                        [<group>=<value>[|<value>]...] [<dimension>=<value>[|<value>]...]
                        [<shared-node>=<state>[|<state>]...] [profile=<name>[|<name>]]
                        [--at <time>] [--root <root-id>]

Records evidence that an actor made for a node in one context: a frame in a
file of the repository, such as a design. The context must be complete, as
"dimensions evidence" lists it; profile=<name> fills in its dimensions.
Values joined with | record the frame for every combination that is a context
of the node, such as "profile=laptop|desktop" "hover=rest|hovered" for a frame
that shows them all alike; a listed value the node never has is refused. The
file's git revision is recorded, so the entry shows as stale once the file
changes; attaching it again records the new revision. --file is relative to
the folder that holds .dimensions. --at defaults to now; --root is needed when
several roots include the node.
`;

const detachUsage = `Usage: dimensions detach <node-id> --actor <role> --frame <id>
                        [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]
                        [--root <root-id>]

Removes the actor's evidence for that node, context and frame.
`;

const sorted = (context: Context): Context =>
  Object.fromEntries(Object.entries(context).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function entries(workspace: Workspace, root: string, create: boolean): unknown[] | undefined {
  const file = `evidence/${root}.json`;
  let document = workspace.read(file);
  if (document === undefined) {
    if (!create) return undefined;
    document = { version: 1, evidence: [] };
    workspace.write(file, document);
  }
  if (!Array.isArray(document.evidence)) document.evidence = [];
  workspace.touch(file);
  return document.evidence as unknown[];
}

// Whether an entry is the actor's, for that node, context and frame.
function same(node: string, context: Context, actor: string, frame: string) {
  const key = JSON.stringify(sorted(context));
  return (entry: unknown) =>
    isObject(entry) &&
    entry.node === node &&
    entry.actor === actor &&
    isObject(entry.source) &&
    entry.source.frame === frame &&
    isObject(entry.context) &&
    JSON.stringify(sorted(entry.context as Context)) === key;
}

// Each <name>=<a>|<b> argument expanded into one argument list per
// combination of the values.
function combinations(args: string[]): string[][] {
  let result: string[][] = [[]];
  for (const arg of args) {
    const at = arg.indexOf("=");
    const options = at <= 0 ? [arg] : arg.slice(at + 1).split("|");
    if (options.includes("")) {
      throw new UsageError(`expected <name>=<value>[|<value>...], got ${JSON.stringify(arg)}`);
    }
    result = result.flatMap((chosen) =>
      options.map((option) => [...chosen, at <= 0 ? option : `${arg.slice(0, at)}=${option}`]),
    );
  }
  return result;
}

// The complete contexts the arguments name, in the root: with lists, every
// combination that is a context of the node. A listed value the node never
// has, or lists that match no context, are refused.
function targets(
  workspace: Workspace,
  id: string,
  rest: string[],
  chosen: string | undefined,
  actor: string,
): { root: string; contexts: Context[] } {
  if (!rest.some((arg) => arg.includes("|"))) {
    const { root, context } = target(workspace, id, rest, chosen);
    return { root, contexts: [context] };
  }
  const model = resolver(workspace);
  const root = rootFor(model, id, chosen);
  const existing = model.contexts(id, root).map(sorted);
  for (const arg of rest) {
    const at = arg.indexOf("=");
    if (at <= 0) continue;
    const name = arg.slice(0, at);
    const known =
      name === "profile"
        ? [...model.profiles.keys()]
        : [...new Set(existing.flatMap((context) => context[name] ?? []))];
    for (const value of arg.slice(at + 1).split("|")) {
      if (value !== "" && !known.includes(value)) {
        throw new Refusal(
          name === "profile"
            ? `"${value}" is not a profile (${known.join(", ")})`
            : `"${value}" is not a value of ${name} for ${id} (${known.join(", ")})`,
        );
      }
    }
  }
  const keys = new Set(existing.map((context) => JSON.stringify(context)));
  const found = new Map<string, Context>();
  for (const combination of combinations(rest)) {
    let given: Context;
    try {
      given = withProfile(model, id, contextArgs(combination));
    } catch (error) {
      if (error instanceof Refusal) continue;
      throw error;
    }
    const context = sorted({ ...given, ...model.withDefaults(id, given) });
    const key = JSON.stringify(context);
    if (keys.has(key)) found.set(key, context);
  }
  if (found.size === 0) {
    throw new Refusal(
      `no context of ${id} matches; "dimensions evidence ${id} --actor ${actor}" lists them`,
    );
  }
  return { root, contexts: [...found.values()] };
}

// The node, its complete context and root, from the arguments.
function target(workspace: Workspace, id: string, rest: string[], chosen: string | undefined) {
  const model = resolver(workspace);
  const given = withProfile(model, id, contextArgs(rest));
  const root = rootFor(model, id, chosen);
  return { root, context: sorted({ ...given, ...model.withDefaults(id, given) }) };
}

export const attach: Command = editCommand(attachUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    {
      actor: { type: "string" },
      file: { type: "string" },
      frame: { type: "string" },
      at: { type: "string" },
      root: { type: "string" },
    },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.actor === undefined || values.file === undefined || values.frame === undefined) {
    throw new UsageError("--actor, --file and --frame are required");
  }
  const path = join(dirname(workspace.project), values.file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    throw new Refusal(`${JSON.stringify(values.file)} does not exist in the repository`);
  }
  const { root, contexts } = targets(workspace, id, rest, values.root, values.actor);
  const at = values.at ?? new Date().toISOString();
  const revision = revisionOf(path);
  const list = entries(workspace, root, true) as unknown[];
  for (const context of contexts) {
    const entry: Json = {
      node: id,
      context,
      actor: values.actor,
      at,
      source: { file: values.file, frame: values.frame },
      revision,
    };
    const index = list.findIndex(same(id, context, values.actor, values.frame));
    if (index >= 0) list[index] = entry;
    else list.push(entry);
  }
});

export const detach: Command = editCommand(detachUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    { actor: { type: "string" }, frame: { type: "string" }, root: { type: "string" } },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.actor === undefined || values.frame === undefined) {
    throw new UsageError("--actor and --frame are required");
  }
  const { root, context } = target(workspace, id, rest, values.root);
  const list = entries(workspace, root, false);
  const index = list?.findIndex(same(id, context, values.actor, values.frame)) ?? -1;
  if (list === undefined || index < 0) {
    throw new Refusal(
      `no evidence from ${values.actor} for ${id} in frame ${JSON.stringify(values.frame)} in ${JSON.stringify(context)}`,
    );
  }
  list.splice(index, 1);
});
