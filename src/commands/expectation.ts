import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, group, isObject, parse, Refusal, UsageError } from "./edit.js";
import { expectationList } from "./reading.js";

const usage = `Usage: dimensions expectation <subcommand>

An expectation is a rule the model must follow, in expectations.json. The
compiler checks every rule on every command, so adding one that fails, or that
tests nothing, is refused.

Subcommands:
  list                               List every rule
  add <title> --node <id> [--subtree] [--root <id>] [--when <name>=<value>[|<value>]]...
      (--then <name>=<value>[|<value>]... | --some <name>=<value>... | --exists | --absent)
      [--attribute <name>=<value>[|<value>]]...
      [--on <event> [--key <key>] [--target <id>] [--outside <id>] [--reach <dimension>=<value>]...]
                                     Add a rule. --then: every kept context has these
                                     values; --some: at least one does; --exists or
                                     --absent: the node is there wherever --when holds,
                                     or nowhere. --attribute checks attribute values
                                     with --then or --some. --on makes a transition rule:
                                     its --when names the state before, its --then the
                                     state after and focus.
  remove <title>                     Remove a rule
`;

// <name>=<value>, or <name>=<a>|<b> for a list, into an object.
function values(items: string[] | undefined, lists: boolean): Json | undefined {
  if (items === undefined || items.length === 0) return undefined;
  const result: Json = {};
  for (const item of items) {
    const at = item.indexOf("=");
    if (at <= 0 || at === item.length - 1) {
      throw new UsageError(`expected <name>=<value>, got ${JSON.stringify(item)}`);
    }
    const options = item.slice(at + 1).split("|");
    if (options.includes("")) {
      throw new UsageError(`expected <name>=<value>[|<value>...], got ${JSON.stringify(item)}`);
    }
    result[item.slice(0, at)] = lists && options.length > 1 ? options : options[0];
  }
  return result;
}

function expectations(workspace: Workspace, create: boolean): unknown[] {
  let file = workspace.read("expectations.json");
  if (file === undefined) {
    if (!create) throw new Refusal("no expectations.json; add a rule first");
    file = { version: 1, expectations: [] };
    workspace.write("expectations.json", file);
  }
  if (!Array.isArray(file.expectations)) file.expectations = [];
  workspace.touch("expectations.json");
  return file.expectations as unknown[];
}

const titled = (title: string) => (item: unknown) => isObject(item) && item.title === title;

const add = editCommand(usage, (workspace, args) => {
  const { values: options, positionals } = parse(args, ["title"], {
    node: { type: "string" },
    subtree: { type: "boolean" },
    root: { type: "string" },
    when: { type: "string", multiple: true },
    then: { type: "string", multiple: true },
    some: { type: "string", multiple: true },
    exists: { type: "boolean" },
    absent: { type: "boolean" },
    attribute: { type: "string", multiple: true },
    on: { type: "string" },
    key: { type: "string" },
    target: { type: "string" },
    outside: { type: "string" },
    reach: { type: "string", multiple: true },
  } as const);
  const [title] = positionals as [string];
  if (options.node === undefined) throw new UsageError("--node is required");
  const assertions = [
    options.then !== undefined || (options.attribute !== undefined && options.some === undefined),
    options.some !== undefined,
    options.exists === true,
    options.absent === true,
  ].filter(Boolean).length;
  if (assertions !== 1) {
    throw new UsageError("give one of --then, --some, --exists and --absent");
  }
  const event =
    options.on === undefined
      ? undefined
      : {
          event: options.on,
          ...(options.key === undefined ? {} : { key: options.key }),
          ...(options.target === undefined ? {} : { target: options.target }),
          ...(options.outside === undefined ? {} : { outside: options.outside }),
          ...values(options.reach, true),
        };
  const attributes = values(options.attribute, true);
  const withAttributes = (base: Json | undefined) =>
    attributes === undefined ? base : { ...base, attributes };
  const rule: Json = {
    title,
    node: options.node,
    ...(options.subtree === true ? { subtree: true } : {}),
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.when === undefined ? {} : { when: values(options.when, event === undefined) }),
    ...(event === undefined ? {} : { on: event }),
    ...(options.some !== undefined
      ? { some: withAttributes(values(options.some, true)) }
      : options.exists === true
        ? { exists: true }
        : options.absent === true
          ? { exists: false }
          : { then: withAttributes(values(options.then, event === undefined)) }),
  };
  const all = expectations(workspace, true);
  if (all.some(titled(title))) {
    throw new Refusal(`expectation "${title}" already exists`);
  }
  all.push(rule);
});

const remove = editCommand(usage, (workspace, args) => {
  const [title] = parse(args, ["title"], {}).positionals as [string];
  const all = expectations(workspace, false);
  const index = all.findIndex(titled(title));
  if (index < 0) {
    throw new Refusal(`expectation not found: ${JSON.stringify(title)}`);
  }
  all.splice(index, 1);
});

export const expectation: Command = group(usage, { list: expectationList, add, remove });
