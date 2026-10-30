import { compileDirectory } from "../compiler/compile.js";
import type { Io } from "../io.js";
import { printDiagnostics, requireProject } from "../project.js";
import { choices, contextFilter, QueryError, sharedStates, subtreeContexts } from "../queries.js";
import { contextKey, Resolver, type Context as TaskContext } from "../resolve.js";
import { buildStateTree, drawStateTree, type Entry, treeNames } from "../state-tree.js";
import { type Command, type Context, command } from "./context.js";
import { list, parse, Refusal, UsageError } from "./edit.js";

// Compiles the project and hands a Resolver to the command.
function readCommand(
  usage: string,
  read: (resolver: Resolver, args: string[], io: Io) => void,
): Command {
  return command(usage, (args, { io, cwd, dir }: Context) => {
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
  });
}

function print(io: Io, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function requireTaskId(resolver: Resolver, id: string): void {
  if (resolver.task(id) === undefined) {
    throw new Refusal(`task not found: ${id}`);
  }
}

function requireRoot(resolver: Resolver, id: string, root: string | undefined): void {
  if (root !== undefined && !resolver.roots(id).includes(root)) {
    throw new Refusal(`"${id}" is not in root "${root}"`);
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

const axesUsage = `Usage: task-tree axes <task-id> [--root <root-id>]

Lists what a view or query of the task accepts: the dimensions that apply in
its subtree, with their values and defaults, and the shared tasks above or in
it, with their states and the dimension values where each exists.
`;

export const axes = readCommand(axesUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { root: { type: "string" } });
  const [id] = positionals as [string];
  requireTaskId(resolver, id);
  requireRoot(resolver, id, values.root);
  const found = resolver.axes(id, values.root);
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
      const existsWhen = existsWhenFor(resolver, id, task, values.root);
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
  root: string | undefined,
): Record<string, string[]> {
  const names = resolver.dimensions(task);
  let contexts: TaskContext[] = [{}];
  for (const name of names) {
    const values = resolver.project.dimensions[name]?.values ?? [];
    contexts = contexts.flatMap((context) =>
      values.map((value) => ({ ...context, [name]: value })),
    );
  }
  const lineage = resolver.lineageWithin(id, task, root);
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
  const [root] = resolver.roots(id);
  const lineage = resolver.lineage(id, root);
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

const contextsUsage = `Usage: task-tree contexts <task-id> [<name>=<value>...] [--subtree] [--root <root-id>]
                         [--count | --tree [--by a,b] [--only a,b] [--json] [--transitions]]

Lists every context the task exists in, in each root that contains it.
--subtree lists every part of the task's subtree instead, with the component
on its own unless --root names a root. <name>=<value> filters keep only the
contexts with that dimension value, state or shared task state. --count
prints counts instead of the contexts. --tree prints them as a merged tree:
sibling branches with identical subtrees share a line, and dimensions that
change nothing are left out. --by a,b puts those levels first, --only a,b
keeps only those levels, --transitions lists each part's transitions under
it, and --json prints the tree as JSON for tools.
`;

export const contexts = readCommand(contextsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(
    args,
    ["task-id"],
    {
      subtree: { type: "boolean" },
      count: { type: "boolean" },
      tree: { type: "boolean" },
      by: { type: "string" },
      only: { type: "string" },
      json: { type: "boolean" },
      transitions: { type: "boolean" },
      root: { type: "string" },
    },
    true,
  );
  if (values.count === true && values.tree === true) {
    throw new UsageError("give --count or --tree, not both");
  }
  if (
    values.tree !== true &&
    (values.by !== undefined ||
      values.only !== undefined ||
      values.json === true ||
      values.transitions === true)
  ) {
    throw new UsageError("--by, --only, --json and --transitions need --tree");
  }
  // Draws the entries as a merged state tree, as text or JSON.
  const showTree = (entries: Entry[]) => {
    const names = treeNames(entries);
    const levels = (option: string | undefined) => {
      const listed = option === undefined ? undefined : (list(option) ?? []);
      for (const name of listed ?? []) {
        if (!names.includes(name)) {
          throw new Refusal(`"${name}" is not a level here (${choices(names)})`);
        }
      }
      return listed;
    };
    const nodes = buildStateTree(resolver, entries, {
      by: levels(values.by),
      only: levels(values.only),
      transitions: values.transitions === true,
    });
    if (values.json === true) print(io, { task: id, tree: nodes });
    else io.stdout(drawStateTree(nodes));
  };
  const [id, ...filterArgs] = positionals as [string, ...string[]];
  requireTaskId(resolver, id);
  requireRoot(resolver, id, values.root);

  if (values.subtree === true) {
    const tasks = subtreeContexts(resolver, id, values.root);
    const keep = filter(
      resolver,
      filterArgs,
      tasks.flatMap((task) => task.contexts),
      values.root,
    );
    const kept = tasks.map((task) => ({ id: task.id, contexts: task.contexts.filter(keep) }));
    const root = values.root === undefined ? {} : { root: values.root };
    if (values.tree === true) {
      showTree(
        kept.flatMap((task) => task.contexts.map((context) => ({ task: task.id, context }))),
      );
      return;
    }
    if (values.count === true) {
      print(io, {
        task: id,
        ...root,
        counts: Object.fromEntries(kept.map((task) => [task.id, task.contexts.length])),
        total: kept.reduce((sum, task) => sum + task.contexts.length, 0),
      });
    } else {
      print(io, { task: id, ...root, tasks: kept.filter((task) => task.contexts.length > 0) });
    }
    return;
  }

  const roots = values.root === undefined ? resolver.roots(id) : [values.root];
  const all = roots.flatMap((root) =>
    resolver.contexts(id, root).map((context) => ({ root, context })),
  );
  const keep = filter(
    resolver,
    filterArgs,
    all.map(({ context }) => context),
    values.root,
  );
  const kept = all.filter(({ context }) => keep(context));
  if (values.tree === true) {
    // The root is a level of its own only when the task is on several.
    const several = new Set(kept.map(({ root }) => root)).size > 1;
    showTree(
      kept.map(({ root, context }) => ({
        task: id,
        context: several ? { root, ...context } : context,
      })),
    );
    return;
  }
  print(
    io,
    values.count === true ? { task: id, count: kept.length } : { task: id, contexts: kept },
  );
});

// A predicate for <name>=<value> command-line filters.
function filter(
  resolver: Resolver,
  args: string[],
  contexts: TaskContext[],
  root: string | undefined,
): (context: TaskContext) => boolean {
  const wanted: [string, string][] = args.map((arg) => {
    const at = arg.indexOf("=");
    if (at <= 0 || at === arg.length - 1) {
      throw new UsageError(`expected <name>=<value>, got ${JSON.stringify(arg)}`);
    }
    return [arg.slice(0, at), arg.slice(at + 1)];
  });
  try {
    return contextFilter(resolver, wanted, contexts, root);
  } catch (error) {
    if (error instanceof QueryError) throw new Refusal(error.message);
    throw error;
  }
}

const viewsUsage = `Usage: task-tree views <task-id> [--root <root-id>]

Lists every distinct view of the task's subtree: each combination of the
dimensions that apply in it, and the states of shared tasks wherever those
tasks are present. Each view is one diagram to draw.
`;

export const views = readCommand(viewsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { root: { type: "string" } });
  const [id] = positionals as [string];
  requireTaskId(resolver, id);
  requireRoot(resolver, id, values.root);
  print(io, { task: id, views: resolver.views(id, values.root) });
});

const viewUsage = `Usage: task-tree view <task-id> [<dimension>=<value>...] [<shared-task>=<state>...]
                     [--root <root-id>]

Prints the tree present in one view, with each task's states and values.
Dimensions left out take their default; each shared task in the view needs
its state.
`;

export const view = readCommand(viewUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["task-id"], { root: { type: "string" } }, true);
  const [id, ...rest] = positionals as [string, ...string[]];
  requireTaskId(resolver, id);
  requireRoot(resolver, id, values.root);
  const axes = resolver.axes(id, values.root);
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
      resolver.lineageWithin(id, task, values.root),
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
  const tree = resolver.view(id, context, values.root);
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

const transitionsUsage = `Usage: task-tree transitions <task-id>

Lists how a shared task's state changes: each transition's states, DOM event,
target and where focus ends up.
`;

export const transitions = readCommand(transitionsUsage, (resolver, args, io) => {
  const [id] = parse(args, ["task-id"], {}).positionals as [string];
  requireTaskId(resolver, id);
  print(io, { task: id, transitions: resolver.task(id)?.transitions ?? [] });
});

const statusUsage = `Usage: task-tree status [<task-id>]

Reports every check each typed task requires, in every context it exists in,
as passed, failed or missing.
`;

export const status = readCommand(statusUsage, (resolver, args, io) => {
  const [only] = parse(args, [], {}, true).positionals;
  if (only !== undefined) requireTaskId(resolver, only);
  const { project } = resolver;
  const items: ({
    root: string;
    task: string;
    check: string;
    result: string;
  } & ({ context: TaskContext } | { transition: string }))[] = [];
  for (const root of project.tasks) {
    const results = new Map<string, string>();
    for (const record of project.verification[root.id]?.records ?? []) {
      const key =
        record.transition !== undefined
          ? `transition:${record.transition}`
          : contextKey({
              ...record.context,
              ...resolver.withDefaults(record.task, record.context ?? {}),
            });
      results.set(JSON.stringify([record.task, key, record.check]), record.result);
    }
    for (const id of only === undefined ? tasksIn(resolver, root.id) : [only]) {
      const type = resolver.task(id)?.type;
      const checks = type === undefined ? [] : (project.types.types?.[type]?.checks ?? []);
      if (checks.length === 0 || !resolver.roots(id).includes(root.id)) continue;
      for (const context of resolver.contexts(id, root.id)) {
        for (const check of checks) {
          const key = JSON.stringify([id, contextKey(context), check]);
          items.push({
            root: root.id,
            task: id,
            context,
            check,
            result: results.get(key) ?? "missing",
          });
        }
      }
      for (const transition of resolver.task(id)?.transitions ?? []) {
        for (const check of checks) {
          const key = JSON.stringify([id, `transition:${transition.id}`, check]);
          items.push({
            root: root.id,
            task: id,
            transition: transition.id,
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

// Every task id in a root's tree, through includes, in tree order.
function tasksIn(resolver: Resolver, root: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    if (ids.includes(id)) return;
    ids.push(id);
    for (const child of resolver.task(id)?.children ?? []) {
      visit("include" in child ? child.include : child.id);
    }
  };
  visit(root);
  return ids;
}

const treeUsage = "Usage: task-tree tree\n";

export const tree = readCommand(treeUsage, (resolver, args, io) => {
  parse(args, [], {});
  print(io, { roots: resolver.project.tasks, components: resolver.project.components });
});
