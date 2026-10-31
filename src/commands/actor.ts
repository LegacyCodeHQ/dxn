import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, group, isObject, list, parse, Refusal, reorder } from "./edit.js";
import { actorList } from "./reading.js";

const usage = `Usage: dxn actor <subcommand>

An actor is a role that does work against the model, declared in actors.json
with what it records: evidence of one kind, such as a design agent's designs,
and the checks whose results it may record, such as a visual reviewer's.
--source says what its evidence must be: frames in a pen.dev file
(pen.dev), fingerprinted by what each frame shows, or any file (file),
fingerprinted as a whole.

Subcommands:
  list                               List every actor and what it records
  add <name> [--evidence <kind>] [--source pen.dev|file] [--checks <check>,...]
                                     Declare an actor, such as design-agent
  set <name> [--evidence <kind>] [--source pen.dev|file] [--checks <check>,...]
                                     Change what an actor records
  remove <name>                      Remove an actor that no evidence or record names
`;

const options = {
  evidence: { type: "string" },
  source: { type: "string" },
  checks: { type: "string" },
} as const;

function actors(workspace: Workspace, create: boolean): Json {
  let file = workspace.read("actors.json");
  if (file === undefined) {
    if (!create) return {};
    file = { version: 1, actors: {} };
    workspace.write("actors.json", file);
  }
  if (!isObject(file.actors)) file.actors = {};
  workspace.touch("actors.json");
  return file.actors as Json;
}

// Writes what the options say the actor records.
function declare(
  actor: Json,
  values: { evidence?: string; source?: string; checks?: string },
): void {
  if (values.evidence !== undefined) actor.evidence = values.evidence;
  if (values.source !== undefined) actor.source = values.source;
  if (values.checks !== undefined) actor.checks = list(values.checks) ?? [];
  reorder(actor, ["evidence", "source", "checks"]);
}

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["name"], options);
  const [name] = positionals as [string];
  const all = actors(workspace, true);
  if (name in all) {
    throw new Refusal(`actor "${name}" already exists`);
  }
  const actor: Json = {};
  declare(actor, values);
  all[name] = actor;
});

const set = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["name"], options);
  const [name] = positionals as [string];
  const actor = actors(workspace, false)[name];
  if (!isObject(actor)) {
    throw new Refusal(`actor not found: ${name}`);
  }
  declare(actor, values);
});

const remove = editCommand(usage, (workspace, args) => {
  const [name] = parse(args, ["name"], {}).positionals as [string];
  const all = actors(workspace, false);
  if (!(name in all)) {
    throw new Refusal(`actor not found: ${name}`);
  }
  delete all[name];
});

export const actor: Command = group(usage, { list: actorList, add, set, remove });
