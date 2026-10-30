import { compileDirectory } from "../compiler/compile.js";
import type { Io } from "../io.js";
import { printDiagnostics, requireProject } from "../project.js";
import { contextKey, Resolver, type Context as TaskContext } from "../resolve.js";
import type { Command, Context } from "./context.js";
import { parse, Refusal, UsageError } from "./edit.js";

// Compiles the project and hands a Resolver to the command.
function readCommand(
  usage: string,
  read: (resolver: Resolver, args: string[], io: Io) => void,
): Command {
  return (args, { io, cwd, dir }: Context) => {
    const project = requireProject(io, cwd, dir);
    if (project === undefined) return 1;
    const { project: model, diagnostics } = compileDirectory(project);
    if (model === undefined) {
      printDiagnostics(io, project, diagnostics);
      return 1;
    }
    try {
      read(new Resolver(model), args, io);
      return 0;
    } catch (error) {
      if (error instanceof UsageError) {
        io.stderr(`task-tree: ${error.message}\n\n${usage}`);
        return 2;
      }
      if (error instanceof Refusal) {
        io.stderr(`task-tree: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
  };
}

function print(io: Io, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function requireTaskId(resolver: Resolver, id: string): void {
  if (resolver.task(id) === undefined) {
    throw new Refusal(`task not found: ${id}`);
  }
}

function requirePage(resolver: Resolver, id: string, page: string | undefined): void {
  if (page !== undefined && !resolver.pages(id).includes(page)) {
    throw new Refusal(`"${id}" is not on page "${page}"`);
  }
}

// <name>=<value> arguments for dimensions and shared tasks, checked against
// the ones allowed here. unknown names what an unexpected name is not.
function contextValues(
  resolver: Resolver,
  args: string[],
  dimensions: string[],
  shared: string[],
  unknown: (name: string) => string,
): TaskContext {
  const context: TaskContext = {};
  for (const arg of args) {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <dimension>=<value>, got ${JSON.stringify(arg)}`);
    }
    const [name, value] = [arg.slice(0, at), arg.slice(at + 1)];
    if (dimensions.includes(name)) {
      if (!resolver.project.dimensions[name]?.values.includes(value)) {
        throw new Refusal(`"${value}" is not a value of ${name}`);
      }
    } else if (shared.includes(name)) {
      const type = resolver.task(name)?.type as string;
      if (!resolver.project.types.types?.[type]?.states?.includes(value)) {
        throw new Refusal(`"${value}" is not a state of ${name}`);
      }
    } else {
      throw new Refusal(unknown(name));
    }
    context[name] = value;
  }
  return context;
}

const queryUsage = `Usage: task-tree query <task-id> [<dimension>=<value>...] [<shared-task>=<state>...]

Shows the task's states and custom attribute values in a context. Dimensions
left out take their default; those without one are not applied.
`;

export const query = readCommand(queryUsage, (resolver, args, io) => {
  const [id, ...rest] = parse(args, ["task-id"], {}, true).positionals as [string, ...string[]];
  requireTaskId(resolver, id);
  const task = resolver.task(id) as NonNullable<ReturnType<Resolver["task"]>>;
  const [page] = resolver.pages(id);
  const lineage = resolver.lineage(id, page);
  const shared = resolver.sharedAncestors(lineage);
  const given = contextValues(
    resolver,
    rest,
    resolver.dimensions(id),
    shared,
    (name) => `"${name}" is not a dimension of ${id}`,
  );
  const context = {
    ...resolver.withDefaults(id, given),
    ...Object.fromEntries(
      shared
        .filter((name) => given[name] !== undefined)
        .map((name) => [name, given[name] as string]),
    ),
  };
  const resolved = resolver.resolve(id, context, lineage);
  print(io, {
    id: task.id,
    title: task.title,
    ...(task.type === undefined ? {} : { type: task.type }),
    ...(Object.keys(context).length === 0 ? {} : { context }),
    present: resolved.present,
    states: resolved.states,
    ...(Object.keys(resolved.customAttributes).length === 0
      ? {}
      : { customAttributes: resolved.customAttributes }),
  });
});

const contextsUsage = `Usage: task-tree contexts <task-id>

Lists every context the task exists in, on each page that contains it.
`;

export const contexts = readCommand(contextsUsage, (resolver, args, io) => {
  const [id] = parse(args, ["task-id"], {}).positionals as [string];
  requireTaskId(resolver, id);
  print(io, {
    task: id,
    contexts: resolver
      .pages(id)
      .flatMap((page) => resolver.contexts(id, page).map((context) => ({ page, context }))),
  });
});

const viewsUsage = `Usage: task-tree views <task-id> [--page <page-id>]

Lists every distinct view of the task's subtree: each combination of the
dimensions that apply in it, and the states of shared tasks wherever those
tasks are present. Each view is one diagram to draw.
`;

export const views = readCommand(viewsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { page: { type: "string" } });
  const [id] = positionals as [string];
  requireTaskId(resolver, id);
  requirePage(resolver, id, values.page);
  print(io, { task: id, views: resolver.views(id, values.page) });
});

const viewUsage = `Usage: task-tree view <task-id> [<dimension>=<value>...] [<shared-task>=<state>...]
                     [--page <page-id>]

Prints the tree present in one view, with each task's states and values.
Dimensions left out take their default; each shared task in the view needs
its state.
`;

export const view = readCommand(viewUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { page: { type: "string" } }, true);
  const [id, ...rest] = positionals as [string, ...string[]];
  requireTaskId(resolver, id);
  requirePage(resolver, id, values.page);
  const axes = resolver.axes(id, values.page);
  const given = contextValues(
    resolver,
    rest,
    axes.dimensions,
    axes.shared,
    (name) => `"${name}" is not a dimension or shared task in this view`,
  );
  const context: TaskContext = {};
  for (const name of axes.dimensions) {
    const value = given[name] ?? resolver.project.dimensions[name]?.default;
    if (value !== undefined) context[name] = value;
  }
  for (const task of axes.shared) {
    const present = resolver.resolve(
      task,
      { ...context, ...given },
      resolver.lineageWithin(id, task, values.page),
    ).present;
    if (!present) {
      if (given[task] !== undefined) {
        throw new Refusal(
          `"${task}" does not exist when ${describe(context)}; leave out ${task}=${given[task]}`,
        );
      }
      continue;
    }
    if (given[task] === undefined) {
      const type = resolver.task(task)?.type as string;
      const states = resolver.project.types.types?.[type]?.states ?? [];
      throw new Refusal(`give ${task}=<${states.join("|")}> for this view`);
    }
    context[task] = given[task];
  }
  const tree = resolver.view(id, context, values.page);
  if (tree === undefined) {
    throw new Refusal(`"${id}" does not exist when ${describe(context)}`);
  }
  print(io, { task: id, context, tree });
});

function describe(context: TaskContext): string {
  return Object.entries(context)
    .map(([name, value]) => `${name}=${value}`)
    .join(" and ");
}

const statusUsage = `Usage: task-tree status [<task-id>]

Reports every check each typed task requires, in every context it exists in,
as passed, failed or missing.
`;

export const status = readCommand(statusUsage, (resolver, args, io) => {
  const [only] = parse(args, [], {}, true).positionals;
  if (only !== undefined) requireTaskId(resolver, only);
  const { project } = resolver;
  const items: {
    page: string;
    task: string;
    context: TaskContext;
    check: string;
    result: string;
  }[] = [];
  for (const page of project.tasks) {
    const results = new Map<string, string>();
    for (const record of project.verification[page.id]?.records ?? []) {
      const key = contextKey({
        ...record.context,
        ...resolver.withDefaults(record.task, record.context),
      });
      results.set(JSON.stringify([record.task, key, record.check]), record.result);
    }
    for (const id of only === undefined ? tasksIn(resolver, page.id) : [only]) {
      const type = resolver.task(id)?.type;
      const checks = type === undefined ? [] : (project.types.types?.[type]?.checks ?? []);
      if (checks.length === 0 || !resolver.pages(id).includes(page.id)) continue;
      for (const context of resolver.contexts(id, page.id)) {
        for (const check of checks) {
          const key = JSON.stringify([id, contextKey(context), check]);
          items.push({
            page: page.id,
            task: id,
            context,
            check,
            result: results.get(key) ?? "missing",
          });
        }
      }
    }
  }
  const count = (result: string) => items.filter((item) => item.result === result).length;
  print(io, {
    summary: { passed: count("passed"), failed: count("failed"), missing: count("missing") },
    items,
  });
});

// Every task id in a page's tree, through includes, in tree order.
function tasksIn(resolver: Resolver, page: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    if (ids.includes(id)) return;
    ids.push(id);
    for (const child of resolver.task(id)?.children ?? []) {
      visit("include" in child ? child.include : child.id);
    }
  };
  visit(page);
  return ids;
}

const treeUsage = "Usage: task-tree tree\n";

export const tree = readCommand(treeUsage, (resolver, args, io) => {
  parse(args, [], {});
  print(io, { pages: resolver.project.tasks, components: resolver.project.components });
});
