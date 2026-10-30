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
  unknown: (name: string, choices: string) => string,
): TaskContext {
  const context: TaskContext = {};
  for (const arg of args) {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <dimension>=<value>, got ${JSON.stringify(arg)}`);
    }
    const [name, value] = [arg.slice(0, at), arg.slice(at + 1)];
    if (dimensions.includes(name)) {
      const values = resolver.project.dimensions[name]?.values ?? [];
      if (!values.includes(value)) {
        throw new Refusal(`"${value}" is not a value of ${name} (${choices(values)})`);
      }
    } else if (shared.includes(name)) {
      const states = sharedStates(resolver, name);
      if (!states.includes(value)) {
        throw new Refusal(`"${value}" is not a state of ${name} (${choices(states)})`);
      }
    } else {
      throw new Refusal(unknown(name, choices([...dimensions, ...shared])));
    }
    context[name] = value;
  }
  return context;
}

function choices(names: string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

function sharedStates(resolver: Resolver, task: string): string[] {
  const type = resolver.task(task)?.type as string;
  return resolver.project.types.types?.[type]?.states ?? [];
}

const dimensionsUsage = `Usage: task-tree dimensions

Lists every dimension: its values, default, and the tasks it applies to.
`;

export const dimensions = readCommand(dimensionsUsage, (resolver, args, io) => {
  parse(args, [], {});
  print(io, {
    dimensions: Object.entries(resolver.project.dimensions)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, dimension]) => ({
        name,
        values: dimension.values,
        ...(dimension.default === undefined ? {} : { default: dimension.default }),
        appliesTo: dimension.appliesTo,
      })),
  });
});

const axesUsage = `Usage: task-tree axes <task-id> [--page <page-id>]

Lists what a view or query of the task accepts: the dimensions that apply in
its subtree, with their values and defaults, and the shared tasks above or in
it, with their states and the dimension values where each exists.
`;

export const axes = readCommand(axesUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { page: { type: "string" } });
  const [id] = positionals as [string];
  requireTaskId(resolver, id);
  requirePage(resolver, id, values.page);
  const found = resolver.axes(id, values.page);
  print(io, {
    task: id,
    dimensions: found.dimensions.map((name) => {
      const dimension = resolver.project.dimensions[name];
      return {
        name,
        values: dimension?.values ?? [],
        ...(dimension?.default === undefined ? {} : { default: dimension.default }),
      };
    }),
    shared: found.shared.map((task) => {
      const existsWhen = existsWhenFor(resolver, id, task, values.page);
      return {
        task,
        states: sharedStates(resolver, task),
        ...(Object.keys(existsWhen).length === 0 ? {} : { existsWhen }),
      };
    }),
  });
});

// The values of each of a shared task's dimensions at which it exists in some
// context, leaving out dimensions it exists at in full.
function existsWhenFor(
  resolver: Resolver,
  id: string,
  task: string,
  page: string | undefined,
): Record<string, string[]> {
  const names = resolver.dimensions(task);
  let contexts: TaskContext[] = [{}];
  for (const name of names) {
    const values = resolver.project.dimensions[name]?.values ?? [];
    contexts = contexts.flatMap((context) =>
      values.map((value) => ({ ...context, [name]: value })),
    );
  }
  const lineage = resolver.lineageWithin(id, task, page);
  const present = contexts.filter((context) => resolver.resolve(task, context, lineage).present);
  const existsWhen: Record<string, string[]> = {};
  for (const name of names) {
    const all = resolver.project.dimensions[name]?.values ?? [];
    const where = all.filter((value) => present.some((context) => context[name] === value));
    if (where.length < all.length) existsWhen[name] = where;
  }
  return existsWhen;
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
    (name, allowed) => `"${name}" is not a dimension of ${id} (${allowed})`,
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
    ...(task.type !== undefined &&
    resolver.project.types.types?.[task.type]?.stateGroups !== undefined
      ? { stateGroups: resolved.groups }
      : {}),
    ...(Object.keys(resolved.customAttributes).length === 0
      ? {}
      : { customAttributes: resolved.customAttributes }),
  });
});

const contextsUsage = `Usage: task-tree contexts <task-id> [<name>=<value>...] [--subtree] [--count]
                         [--page <page-id>]

Lists every context the task exists in, on each page that contains it.
--subtree lists every part of the task's subtree instead, with the component
on its own unless --page names a page. <name>=<value> filters keep only the
contexts with that dimension value, state or shared task state. --count
prints counts instead of the contexts.
`;

export const contexts = readCommand(contextsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(
    args,
    ["task-id"],
    {
      subtree: { type: "boolean" },
      count: { type: "boolean" },
      page: { type: "string" },
    },
    true,
  );
  const [id, ...filterArgs] = positionals as [string, ...string[]];
  requireTaskId(resolver, id);
  requirePage(resolver, id, values.page);

  if (values.subtree === true) {
    const tasks = resolver
      .subtree(id)
      .map((task) => ({ id: task, contexts: resolver.contexts(task, values.page) }));
    const keep = filter(
      resolver,
      filterArgs,
      tasks.flatMap((task) => task.contexts),
    );
    const kept = tasks.map((task) => ({ id: task.id, contexts: task.contexts.filter(keep) }));
    const page = values.page === undefined ? {} : { page: values.page };
    if (values.count === true) {
      print(io, {
        task: id,
        ...page,
        counts: Object.fromEntries(kept.map((task) => [task.id, task.contexts.length])),
        total: kept.reduce((sum, task) => sum + task.contexts.length, 0),
      });
    } else {
      print(io, { task: id, ...page, tasks: kept.filter((task) => task.contexts.length > 0) });
    }
    return;
  }

  const pages = values.page === undefined ? resolver.pages(id) : [values.page];
  const all = pages.flatMap((page) =>
    resolver.contexts(id, page).map((context) => ({ page, context })),
  );
  const keep = filter(
    resolver,
    filterArgs,
    all.map(({ context }) => context),
  );
  const kept = all.filter(({ context }) => keep(context));
  print(
    io,
    values.count === true ? { task: id, count: kept.length } : { task: id, contexts: kept },
  );
});

// A predicate for <name>=<value> filters. Names must appear in the contexts
// (dimensions, state groups, shared tasks); values must be declared for them.
function filter(
  resolver: Resolver,
  args: string[],
  contexts: TaskContext[],
): (context: TaskContext) => boolean {
  const names = [...new Set(contexts.flatMap((context) => Object.keys(context)))].sort();
  const wanted: [string, string][] = args.map((arg) => {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <name>=<value>, got ${JSON.stringify(arg)}`);
    }
    const [name, value] = [arg.slice(0, at), arg.slice(at + 1)];
    if (!names.includes(name)) {
      throw new Refusal(
        `"${name}" is not a dimension, state group or shared task here (${choices(names)})`,
      );
    }
    const dimension = resolver.project.dimensions[name];
    const group = resolver.project.types.stateGroups?.[name];
    const allowed =
      dimension?.values ??
      group ??
      (resolver.isShared(name)
        ? sharedStates(resolver, name)
        : [...new Set(contexts.map((context) => context[name]).filter((v) => v !== undefined))]);
    if (!allowed.includes(value)) {
      const kind = resolver.isShared(name) ? "a state" : "a value";
      throw new Refusal(`"${value}" is not ${kind} of ${name} (${choices(allowed as string[])})`);
    }
    return [name, value];
  });
  return (context) => wanted.every(([name, value]) => context[name] === value);
}

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
    (name, allowed) => `"${name}" is not a dimension or shared task in this view (${allowed})`,
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
