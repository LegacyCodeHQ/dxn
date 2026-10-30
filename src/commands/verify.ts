import { compileDirectory } from "../compiler/compile.js";
import { type Context, contextKey, Resolver } from "../resolve.js";
import type { Json, Workspace } from "../workspace.js";
import type { Command } from "./context.js";
import { editCommand, isObject, parse, Refusal, UsageError } from "./edit.js";

const verifyUsage = `Usage: task-tree verify <task-id> --check <name> --result passed|failed --by <who>
                       [state=<state>] [<dimension>=<value>...]
                       [--evidence <path>] [--at <time>] [--page <page-id>]

Records a check's result for a task in one context, replacing any earlier
record for the same task, context and check. Dimensions left out take their
default; --at defaults to now; --page is needed when several pages include
the task.
`;

const unverifyUsage = `Usage: task-tree unverify <task-id> --check <name> [state=<state>] [<dimension>=<value>...]
                         [--page <page-id>]

Removes the record for that task, context and check.
`;

// The project as compiled from disk, for defaults and pages.
function resolver(workspace: Workspace): Resolver {
  const { project } = compileDirectory(workspace.project);
  if (project === undefined) {
    throw new Refusal("the project has errors; run task-tree validate");
  }
  return new Resolver(project);
}

// state=... and <dimension>=... arguments: state first, then dimensions by name.
function contextArgs(args: string[]): Context {
  const entries = args.map((arg) => {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(
        `expected <dimension>=<value> or state=<state>, got ${JSON.stringify(arg)}`,
      );
    }
    return [arg.slice(0, at), arg.slice(at + 1)] as [string, string];
  });
  entries.sort(([a], [b]) => (a === "state" ? -1 : b === "state" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

function pageFor(resolver: Resolver, id: string, chosen: string | undefined): string {
  if (resolver.task(id) === undefined) {
    throw new Refusal(`task not found: ${id}`);
  }
  const pages = resolver.pages(id).sort();
  if (chosen !== undefined) {
    if (!pages.includes(chosen)) {
      throw new Refusal(`"${id}" is not on page "${chosen}"`);
    }
    return chosen;
  }
  if (pages.length === 0) {
    throw new Refusal(`"${id}" is not on any page`);
  }
  if (pages.length > 1) {
    throw new Refusal(`"${id}" is on several pages (${pages.join(", ")}); choose one with --page`);
  }
  return pages[0] as string;
}

// A record's identity: task, context with defaults filled in, and check.
function identity(resolver: Resolver, task: string, context: Context, check: string): string {
  return JSON.stringify([
    task,
    contextKey({ ...context, ...resolver.withDefaults(task, context) }),
    check,
  ]);
}

function records(workspace: Workspace, page: string, create: boolean): unknown[] | undefined {
  const file = `verification/${page}.json`;
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

function transitionIdentity(task: string, transition: string, check: string): string {
  return JSON.stringify([task, `transition:${transition}`, check]);
}

function matches(resolver: Resolver, key: string) {
  return (record: unknown) => {
    if (!isObject(record) || typeof record.task !== "string" || typeof record.check !== "string") {
      return false;
    }
    if (typeof record.transition === "string") {
      return transitionIdentity(record.task, record.transition, record.check) === key;
    }
    return (
      isObject(record.context) &&
      identity(resolver, record.task, record.context as Context, record.check) === key
    );
  };
}

export const verify: Command = editCommand(verifyUsage, (workspace, args) => {
  const { values, positionals } = parse(
    args,
    ["task-id"],
    {
      check: { type: "string" },
      result: { type: "string" },
      by: { type: "string" },
      evidence: { type: "string" },
      at: { type: "string" },
      page: { type: "string" },
      transition: { type: "string" },
    },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.check === undefined || values.result === undefined || values.by === undefined) {
    throw new UsageError("--check, --result and --by are required");
  }
  if (values.transition !== undefined && rest.length > 0) {
    throw new UsageError("a record is about a transition or a context, not both");
  }
  const context = contextArgs(rest);
  const model = resolver(workspace);
  const page = pageFor(model, id, values.page);
  const record: Json = {
    task: id,
    ...(values.transition === undefined ? { context } : { transition: values.transition }),
    check: values.check,
    result: values.result,
    by: values.by,
    at: values.at ?? new Date().toISOString(),
    ...(values.evidence === undefined ? {} : { evidence: values.evidence }),
  };
  const list = records(workspace, page, true) as unknown[];
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
    ["task-id"],
    { check: { type: "string" }, page: { type: "string" }, transition: { type: "string" } },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  if (values.check === undefined) {
    throw new UsageError("--check is required");
  }
  const context = contextArgs(rest);
  const model = resolver(workspace);
  const page = pageFor(model, id, values.page);
  const list = records(workspace, page, false);
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
