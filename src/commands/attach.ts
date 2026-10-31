import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Fingerprints } from "../compiler/fingerprint.js";
import type { Context } from "../resolve.js";
import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, isObject, parse, Refusal, UsageError } from "./edit.js";
import { chooseEvidenceActor } from "./reading.js";
import { contextArgs, resolver, rootFor, withProfile } from "./verify.js";

const attachUsage = `Usage: dxn attach <node-id> [--actor <role>] --file <path> --frame <id>
                        [<group>=<value>[|<value>]...] [<dimension>=<value>[|<value>]...]
                        [<shared-node>=<state>[|<state>]...] [profile=<name>[|<name>]]
                        [--at <time>] [--root <root-id>]

Records evidence that an actor made for a node in one context: a frame in a
file of the repository, such as a design. The context must be complete, as
"dxn evidence" lists it; profile=<name> fills in its dimensions.
Values joined with | record the frame for every combination that is a context
of the node, such as "profile=laptop|desktop" "hover=rest|hovered" for a frame
that shows them all alike; a listed value the node never has is refused. The
frame's fingerprint is recorded, so the entry shows as stale once what the
frame shows changes: for a pen.dev file, the frame and the components and
variables it uses; for any other file, the file. Attaching it again records
the new fingerprint. --file is relative to
the folder that holds .dxn. --at defaults to now; --root is needed when
several roots include the node.
`;

const detachUsage = `Usage: dxn detach <node-id> [--actor <role>] --frame <id>
                        [<group>=<value>[|<value>]...] [<dimension>=<value>[|<value>]...]
                        [<shared-node>=<state>[|<state>]...] [profile=<name>[|<name>]]
                        [--root <root-id>]

Removes the actor's evidence for that node, context and frame; with values
joined with |, for every combination that is a context of the node. --actor
may be left out when only one actor records evidence.
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
      `no context of ${id} matches; "dxn evidence ${id} --actor ${actor}" lists them`,
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
  if (values.file === undefined || values.frame === undefined) {
    throw new UsageError("--file and --frame are required");
  }
  const actor = chooseEvidenceActor(resolver(workspace), values.actor);
  const path = join(dirname(workspace.project), values.file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    throw new Refusal(`${JSON.stringify(values.file)} does not exist in the repository`);
  }
  const { root, contexts } = targets(workspace, id, rest, values.root, actor);
  const at = values.at ?? new Date().toISOString();
  const source = resolver(workspace).project.actors?.actors[actor]?.source;
  const measure = new Fingerprints();
  if (source === "pen.dev" && !measure.isPen(path)) {
    throw new Refusal(
      `actor ${JSON.stringify(actor)} records pen.dev frames; ${JSON.stringify(values.file)} is not a pen.dev file`,
    );
  }
  const fingerprint = measure.of(path, values.frame, source);
  if (fingerprint === undefined) {
    throw new Refusal(`frame ${JSON.stringify(values.frame)} is not in ${values.file}`);
  }
  const list = entries(workspace, root, true) as unknown[];
  for (const context of contexts) {
    const entry: Json = {
      node: id,
      context,
      actor,
      at,
      source: { file: values.file, frame: values.frame },
      fingerprint,
    };
    const index = list.findIndex(same(id, context, actor, values.frame));
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
  if (values.frame === undefined) {
    throw new UsageError("--frame is required");
  }
  const actor = chooseEvidenceActor(resolver(workspace), values.actor);
  const listed = rest.some((arg) => arg.includes("|"));
  const { root, contexts } = targets(workspace, id, rest, values.root, actor);
  const list = entries(workspace, root, false) ?? [];
  let removed = 0;
  for (const context of contexts) {
    const index = list.findIndex(same(id, context, actor, values.frame));
    if (index < 0) continue;
    list.splice(index, 1);
    removed += 1;
  }
  if (removed === 0) {
    const where = listed ? "matches" : `in ${JSON.stringify(contexts[0])}`;
    throw new Refusal(
      `no evidence from ${actor} for ${id} in frame ${JSON.stringify(values.frame)} ${where}`,
    );
  }
});
