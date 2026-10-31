import { compileDirectory } from "../compiler/compile.js";
import type { Io } from "../io.js";
import { printDiagnostics, requireProject } from "../project.js";
import { choices, contextFilter, QueryError, sharedStates, subtreeContexts } from "../queries.js";
import {
  contextKey,
  type Context as NodeContext,
  ProfileError,
  Resolver,
  type ViewNode,
} from "../resolve.js";
import { buildStateTree, drawStateTree, type Entry, treeNames } from "../state-tree.js";
import {
  drawNodeTables,
  drawPresenceMatrix,
  markdown,
  nodeTables,
  presenceMatrix,
  TableError,
  tableAxis,
} from "../tables.js";
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
        io.stderr(`dimensions: ${error.message}\n\n${usage}`);
        return 2;
      }
      if (error instanceof Refusal) {
        io.stderr(`dimensions: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
  });
}

function print(io: Io, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function requireNodeId(resolver: Resolver, id: string): void {
  if (resolver.node(id) === undefined) {
    throw new Refusal(`node not found: ${id}`);
  }
}

function requireRoot(resolver: Resolver, id: string, root: string | undefined): void {
  if (root !== undefined && !resolver.roots(id).includes(root)) {
    throw new Refusal(`"${id}" is not in root "${root}"`);
  }
}

// <name>=<value> arguments for dimensions and shared nodes, checked against
// the ones allowed here. unknown names what an unexpected name is not.
function contextValues(
  resolver: Resolver,
  args: string[],
  dimensions: string[],
  shared: string[],
  unknown: (name: string, choices: string) => string,
): NodeContext {
  const context: NodeContext = {};
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
    } else if (name === "profile" && resolver.profiles.size > 0) {
      // Checked when the profile fills in the dimensions.
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

const dimensionsUsage = `Usage: dimensions dimension list

Lists every dimension: its values, default, and the nodes it applies to.
`;

const byName = <T>(entries: [string, T][]): [string, T][] =>
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export const typeList = readCommand("Usage: dimensions type list\n", (resolver, args, io) => {
  parse(args, [], {});
  const declared = resolver.project.types.types ?? {};
  print(io, {
    types: byName(Object.entries(declared)).map(([name, type]) => ({
      name,
      ...(type.stateGroups === undefined
        ? type.states === undefined
          ? {}
          : { states: type.states }
        : { stateGroups: resolver.groupsOf(name) }),
      ...(type.shared === true ? { shared: true } : {}),
      ...(type.checks === undefined ? {} : { checks: type.checks }),
      ...(type.attributes === undefined ? {} : { attributes: type.attributes }),
    })),
  });
});

// The types that use a state group, or require a check, by name.
function typesWhere(resolver: Resolver, uses: (type: string) => boolean): string[] {
  return Object.keys(resolver.project.types.types ?? {})
    .filter(uses)
    .sort();
}

export const stateGroupList = readCommand(
  "Usage: dimensions state-group list\n",
  (resolver, args, io) => {
    parse(args, [], {});
    print(io, {
      stateGroups: byName(Object.entries(resolver.project.types.stateGroups ?? {})).map(
        ([name, values]) => ({
          name,
          values,
          usedBy: typesWhere(resolver, (type) => {
            const used = resolver.project.types.types?.[type]?.stateGroups;
            return Array.isArray(used) ? used.includes(name) : used?.[name] !== undefined;
          }),
        }),
      ),
    });
  },
);

export const checkList = readCommand("Usage: dimensions check list\n", (resolver, args, io) => {
  parse(args, [], {});
  print(io, {
    checks: Object.keys(resolver.project.types.checks ?? {})
      .sort()
      .map((name) => ({
        name,
        requiredBy: typesWhere(
          resolver,
          (type) => resolver.project.types.types?.[type]?.checks?.includes(name) === true,
        ),
      })),
  });
});

export const actorList = readCommand("Usage: dimensions actor list\n", (resolver, args, io) => {
  parse(args, [], {});
  print(io, {
    actors: Object.keys(resolver.project.actors?.actors ?? {})
      .sort()
      .map((name) => ({ name })),
  });
});

export const attributeList = readCommand(
  "Usage: dimensions attribute list\n",
  (resolver, args, io) => {
    parse(args, [], {});
    print(io, {
      attributes: byName(Object.entries(resolver.project.types.attributes ?? {})).map(
        ([name, { values }]) => ({ name, values }),
      ),
    });
  },
);

export const dimensions = readCommand(dimensionsUsage, (resolver, args, io) => {
  parse(args, [], {});
  print(io, {
    dimensions: Object.entries(resolver.project.dimensions)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, dimension]) => ({
        name,
        values: dimension.values,
        ...(dimension.default === undefined ? {} : { default: dimension.default }),
        appliesTo: dimension.appliesTo ?? [],
        // Values of a dimension the profiles cover that no profile uses.
        ...(() => {
          if (!resolver.profiled.has(name)) return {};
          const used = new Set([...resolver.profiles.values()].map((profile) => profile[name]));
          const unused = dimension.values.filter((value) => !used.has(value));
          return unused.length === 0 ? {} : { inNoProfile: unused };
        })(),
      })),
  });
});

const axesUsage = `Usage: dimensions axes <node-id> [<name>=<value>...] [--root <root-id>]

Lists what view and show accept for the node: the dimensions that apply in
its subtree, with their values and defaults, and the shared nodes above or in
it, with their states and the dimension values where each exists.
<name>=<value> filters describe only the views with that dimension value,
shared node state or profile.
`;

export const axes = readCommand(axesUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["node-id"], { root: { type: "string" } }, true);
  const [id, ...rest] = positionals as [string, ...string[]];
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);
  const found = resolver.axes(id, values.root);
  if (rest.length > 0) {
    // Describe only the views the filters keep.
    const all = resolver.views(id, values.root);
    const matching = all.filter(filter(resolver, rest, all, values.root));
    const seen = (name: string, options: string[]) =>
      options.filter((option) => matching.some((view) => view[name] === option));
    print(io, {
      node: id,
      dimensions: found.dimensions.map((name) => {
        const dimension = resolver.project.dimensions[name];
        const kept = seen(name, dimension?.values ?? []);
        return {
          name,
          values: kept,
          ...(dimension?.default !== undefined && kept.includes(dimension.default)
            ? { default: dimension.default }
            : {}),
        };
      }),
      shared: found.shared.flatMap((node) => {
        const states = seen(node, sharedStates(resolver, node));
        if (states.length === 0) return [];
        const existsWhen: Record<string, string[]> = {};
        for (const name of found.dimensions) {
          const everywhere = seen(name, resolver.project.dimensions[name]?.values ?? []);
          const where = everywhere.filter((value) =>
            matching.some((view) => view[name] === value && view[node] !== undefined),
          );
          if (where.length < everywhere.length) existsWhen[name] = where;
        }
        return [{ node, states, ...(Object.keys(existsWhen).length === 0 ? {} : { existsWhen }) }];
      }),
      ...(resolver.profiles.size === 0
        ? {}
        : {
            profiles: profileList(resolver).filter(({ values: profile }) =>
              matching.some((view) =>
                Object.keys(view)
                  .filter((name) => resolver.profiled.has(name))
                  .every((name) => profile[name] === view[name]),
              ),
            ),
          }),
    });
    return;
  }
  print(io, {
    node: id,
    dimensions: found.dimensions.map((name) => {
      const dimension = resolver.project.dimensions[name];
      return {
        name,
        values: dimension?.values ?? [],
        ...(dimension?.default === undefined ? {} : { default: dimension.default }),
      };
    }),
    shared: found.shared.map((node) => {
      const existsWhen = existsWhenFor(resolver, id, node, values.root);
      return {
        node,
        states: sharedStates(resolver, node),
        ...(Object.keys(existsWhen).length === 0 ? {} : { existsWhen }),
      };
    }),
    ...(resolver.profiles.size === 0 ? {} : { profiles: profileList(resolver) }),
  });
});

// Every profile, by name, with its dimension values.
function profileList(resolver: Resolver): { name: string; values: Record<string, string> }[] {
  return [...resolver.profiles].map(([name, values]) => ({ name, values }));
}

// The profiled dimensions' values from the one profile that fits, or a
// refusal that says what to give.
export function fillProfile(
  resolver: Resolver,
  dimensions: string[],
  given: NodeContext,
  subject: string,
): NodeContext {
  try {
    return resolver.fillProfile(dimensions, given, subject);
  } catch (error) {
    if (error instanceof ProfileError) throw new Refusal(error.message);
    throw error;
  }
}

export const expectationList = readCommand(
  "Usage: dimensions expectation list\n",
  (resolver, args, io) => {
    parse(args, [], {});
    print(io, { expectations: resolver.project.expectations?.expectations ?? [] });
  },
);

export const profileListCommand = readCommand(
  "Usage: dimensions profile list\n",
  (resolver, args, io) => {
    parse(args, [], {});
    print(io, { profiles: profileList(resolver) });
  },
);

// The values of each of a shared node's dimensions at which it exists in some
// context, leaving out dimensions it exists at in full.
function existsWhenFor(
  resolver: Resolver,
  id: string,
  node: string,
  root: string | undefined,
): Record<string, string[]> {
  const names = resolver.dimensions(node);
  let contexts: NodeContext[] = [{}];
  for (const name of names) {
    const values = resolver.project.dimensions[name]?.values ?? [];
    contexts = contexts.flatMap((context) =>
      values.map((value) => ({ ...context, [name]: value })),
    );
  }
  const lineage = resolver.lineageWithin(id, node, root);
  const present = contexts.filter((context) => resolver.resolve(node, context, lineage).present);
  const existsWhen: Record<string, string[]> = {};
  for (const name of names) {
    const all = resolver.project.dimensions[name]?.values ?? [];
    const where = all.filter((value) => present.some((context) => context[name] === value));
    if (where.length < all.length) existsWhen[name] = where;
  }
  return existsWhen;
}

const showUsage = `Usage: dimensions show <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                       [--root <root-id>]

Shows the node's states and attribute values in a context. Dimensions
left out take their default; those without one are not applied. Each shared
node above the node needs its state wherever it exists. Without --root, a
fragment's node is shown on its own, without any root's include states.
`;

export const show = readCommand(showUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["node-id"], { root: { type: "string" } }, true);
  const [id, ...rest] = positionals as [string, ...string[]];
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);
  const node = resolver.node(id) as NonNullable<ReturnType<Resolver["node"]>>;
  const lineage = resolver.lineage(id, values.root);
  const shared = resolver.sharedAncestors(lineage);
  const given = contextValues(
    resolver,
    rest,
    resolver.dimensions(id),
    shared,
    (name, allowed) => `"${name}" is not a dimension of ${id} (${allowed})`,
  );
  const context: NodeContext = {
    ...resolver.withDefaults(id, {
      ...given,
      ...fillProfile(resolver, resolver.dimensions(id), given, "this node"),
    }),
  };
  for (const ancestor of shared) {
    const present = resolver.resolve(
      ancestor,
      { ...context, ...given },
      resolver.lineage(ancestor, values.root),
    ).present;
    if (!present) {
      if (given[ancestor] !== undefined) {
        throw new Refusal(
          `"${ancestor}" does not exist when ${describe(context)}; leave out ${ancestor}=${given[ancestor]}`,
        );
      }
      continue;
    }
    if (given[ancestor] === undefined) {
      throw new Refusal(
        `give ${ancestor}=<${sharedStates(resolver, ancestor).join("|")}> for this node`,
      );
    }
    context[ancestor] = given[ancestor];
  }
  const resolved = resolver.resolve(id, context, lineage);
  print(io, {
    id: node.id,
    title: node.title,
    ...(node.type === undefined ? {} : { type: node.type }),
    ...(Object.keys(context).length === 0 ? {} : { context }),
    present: resolved.present,
    states: resolved.states,
    ...(node.type !== undefined &&
    resolver.project.types.types?.[node.type]?.stateGroups !== undefined
      ? { stateGroups: resolved.groups }
      : {}),
    ...(Object.keys(resolved.attributes).length === 0 ? {} : { attributes: resolved.attributes }),
  });
});

const contextsUsage = `Usage: dimensions contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]
                          [--count | --tree [--by a,b] [--only a,b] [--json] [--transitions]
                          | --table [--by profile|a,b] [--json]]

Lists every context the node exists in, in each root that contains it.
--subtree lists every part of the node's subtree instead, with the fragment
on its own unless --root names a root. <name>=<value> filters keep only the
contexts with that dimension value, state or shared node state. --count
prints counts instead of the contexts. --tree prints them as a merged tree:
sibling branches with identical subtrees share a line, and dimensions that
change nothing are left out. --by a,b puts those levels first, --only a,b
keeps only those levels, --transitions lists each part's transitions under
it, and --json prints the tree as JSON for tools. --table prints Markdown
tables instead: for a node, one per state group, with a row per profile (or
per combination when there are no profiles) and a column per value; with
--subtree, which nodes exist in which profiles. --by profile or --by a,b
picks the rows, where a and b are dimensions or shared nodes (a row per
state); a cell names the profiles when they differ. --json prints the tables
as JSON.
`;

export const contexts = readCommand(contextsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    {
      subtree: { type: "boolean" },
      count: { type: "boolean" },
      tree: { type: "boolean" },
      by: { type: "string" },
      only: { type: "string" },
      json: { type: "boolean" },
      transitions: { type: "boolean" },
      table: { type: "boolean" },
      root: { type: "string" },
    },
    true,
  );
  const shapes = [values.count, values.tree, values.table].filter((flag) => flag === true);
  if (shapes.length > 1) {
    throw new UsageError("give one of --count, --tree and --table");
  }
  if (
    values.tree !== true &&
    values.table !== true &&
    (values.by !== undefined || values.json === true)
  ) {
    throw new UsageError("--by and --json need --tree or --table");
  }
  if (values.tree !== true && (values.only !== undefined || values.transitions === true)) {
    throw new UsageError("--only and --transitions need --tree");
  }
  // Prints tables, as Markdown or JSON.
  const axis = (dimensions: string[], subject: string, shared: string[]) => {
    try {
      return tableAxis(
        resolver,
        dimensions,
        values.by === undefined ? undefined : list(values.by),
        subject,
        shared,
      );
    } catch (error) {
      if (error instanceof TableError) throw new Refusal(error.message);
      throw error;
    }
  };
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
    const items = buildStateTree(resolver, entries, {
      by: levels(values.by),
      only: levels(values.only),
      transitions: values.transitions === true,
    });
    if (values.json === true) print(io, { node: id, tree: items });
    else io.stdout(drawStateTree(items));
  };
  const [id, ...filterArgs] = positionals as [string, ...string[]];
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);

  if (values.subtree === true) {
    const nodes = subtreeContexts(resolver, id, values.root);
    const keep = filter(
      resolver,
      filterArgs,
      nodes.flatMap((node) => node.contexts),
      values.root,
    );
    const kept = nodes.map((node) => ({ id: node.id, contexts: node.contexts.filter(keep) }));
    const root = values.root === undefined ? {} : { root: values.root };
    if (values.table === true) {
      const matrix = presenceMatrix(
        resolver,
        id,
        kept,
        axis(resolver.axes(id, values.root).dimensions, id, resolver.axes(id, values.root).shared),
      );
      if (values.json === true) print(io, matrix);
      else io.stdout(drawPresenceMatrix(matrix));
      return;
    }
    if (values.tree === true) {
      showTree(
        kept.flatMap((node) => node.contexts.map((context) => ({ node: node.id, context }))),
      );
      return;
    }
    if (values.count === true) {
      print(io, {
        node: id,
        ...root,
        counts: Object.fromEntries(kept.map((node) => [node.id, node.contexts.length])),
        total: kept.reduce((sum, node) => sum + node.contexts.length, 0),
      });
    } else {
      print(io, { node: id, ...root, nodes: kept.filter((node) => node.contexts.length > 0) });
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
  if (values.table === true) {
    const tables = nodeTables(
      resolver,
      id,
      kept.map(({ context }) => context),
      axis(resolver.dimensions(id), id, [
        ...resolver.sharedAncestors(resolver.lineage(id, values.root)),
        ...(resolver.isShared(id) ? [id] : []),
      ]),
    );
    if (values.json === true) print(io, tables);
    else io.stdout(drawNodeTables(tables));
    return;
  }
  if (values.tree === true) {
    // The root is a level of its own only when the node is on several.
    const several = new Set(kept.map(({ root }) => root)).size > 1;
    showTree(
      kept.map(({ root, context }) => ({
        node: id,
        context: several ? { root, ...context } : context,
      })),
    );
    return;
  }
  print(
    io,
    values.count === true ? { node: id, count: kept.length } : { node: id, contexts: kept },
  );
});

// A predicate for <name>=<value> command-line filters.
function filter(
  resolver: Resolver,
  args: string[],
  contexts: NodeContext[],
  root: string | undefined,
): (context: NodeContext) => boolean {
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

const viewsUsage = `Usage: dimensions views <node-id> [<name>=<value>...] [--root <root-id>] [--table]

Lists every distinct view of the node's subtree: each combination of the
dimensions that apply in it, and the states of shared nodes wherever those
nodes are present. Each view is one diagram to draw. <name>=<value> filters
keep only the views with that dimension value, shared node state or profile.
--table prints them as a Markdown table, a row per view.
`;

export const views = readCommand(viewsUsage, (resolver, args, io) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    { root: { type: "string" }, table: { type: "boolean" } },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);
  const all = resolver.views(id, values.root);
  const kept = all.filter(filter(resolver, rest, all, values.root));
  if (values.table === true) {
    // A column for the profile each view matches, then one per name.
    const names = [...new Set(kept.flatMap((view) => Object.keys(view)))];
    const profiled = names.some((name) => resolver.profiled.has(name));
    const lines = markdown(
      [...(profiled ? ["profile"] : []), ...names],
      kept.map((view) => [
        ...(profiled ? [profileOf(resolver, view) ?? "—"] : []),
        ...names.map((name) => view[name] ?? "—"),
      ]),
    );
    io.stdout(`${lines.join("\n")}\n`);
    return;
  }
  print(io, { node: id, views: kept });
});

// The profile a context or view matches, by the dimensions profiles cover.
function profileOf(resolver: Resolver, context: NodeContext): string | undefined {
  return [...resolver.profiles].find(([, profile]) =>
    Object.keys(context)
      .filter((name) => resolver.profiled.has(name))
      .every((name) => profile[name] === context[name]),
  )?.[0];
}

const evidenceUsage = `Usage: dimensions evidence <node-id> --actor <name> [--root <root-id>] [--table]

Lists every context the node exists in, with the profile it matches and the
evidence the actor has recorded for it. Nothing can be recorded yet, so every
context has none. --table prints a Markdown table, a row per context and a
column for the actor, where — means no evidence.
`;

export const evidence = readCommand(evidenceUsage, (resolver, args, io) => {
  const { values, positionals } = parse(args, ["node-id"], {
    actor: { type: "string" },
    root: { type: "string" },
    table: { type: "boolean" },
  });
  const [id] = positionals as [string];
  const actor = values.actor;
  if (actor === undefined) throw new UsageError("--actor is required");
  const actors = Object.keys(resolver.project.actors?.actors ?? {});
  if (actors.length === 0) {
    throw new Refusal('no actors; add one with "dimensions actor add <name>"');
  }
  if (!actors.includes(actor)) {
    throw new Refusal(`actor not found: ${JSON.stringify(actor)} (${choices(actors)})`);
  }
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);
  const roots = values.root === undefined ? resolver.roots(id) : [values.root];
  const rows = roots.flatMap((root) =>
    resolver.contexts(id, root).map((context) => {
      const profile = profileOf(resolver, context);
      return {
        root,
        ...(profile === undefined ? {} : { profile }),
        context,
        evidence: [] as unknown[],
      };
    }),
  );
  if (values.table === true) {
    const names = [...new Set(rows.flatMap(({ context }) => Object.keys(context)))];
    const profiled = rows.some((row) => row.profile !== undefined);
    const lines = markdown(
      [...(profiled ? ["profile"] : []), ...names, actor],
      rows.map((row) => [
        ...(profiled ? [row.profile ?? "—"] : []),
        ...names.map((name) => row.context[name] ?? "—"),
        row.evidence.length === 0 ? "—" : String(row.evidence.length),
      ]),
    );
    io.stdout(`${lines.join("\n")}\n`);
    return;
  }
  print(io, { node: id, actor, contexts: rows });
});

const viewUsage = `Usage: dimensions view <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                      [--root <root-id>] [--tree]

Prints the tree present in one view, with each node's states and values.
Dimensions left out take their default; each shared node in the view needs
its state. --tree prints it as indented text instead of JSON.
`;

export const view = readCommand(viewUsage, (resolver, args, io) => {
  const { values, positionals } = parse(
    args,
    ["node-id"],
    { root: { type: "string" }, tree: { type: "boolean" } },
    true,
  );
  const [id, ...rest] = positionals as [string, ...string[]];
  requireNodeId(resolver, id);
  requireRoot(resolver, id, values.root);
  const axes = resolver.axes(id, values.root);
  const given = contextValues(
    resolver,
    rest,
    axes.dimensions,
    axes.shared,
    (name, allowed) => `"${name}" is not a dimension or shared node in this view (${allowed})`,
  );
  const filled = fillProfile(resolver, axes.dimensions, given, "this view");
  const context: NodeContext = {};
  for (const name of axes.dimensions) {
    const value = filled[name] ?? given[name] ?? resolver.project.dimensions[name]?.default;
    if (value !== undefined) context[name] = value;
  }
  for (const node of axes.shared) {
    const present = resolver.resolve(
      node,
      { ...context, ...given },
      resolver.lineageWithin(id, node, values.root),
    ).present;
    if (!present) {
      if (given[node] !== undefined) {
        throw new Refusal(
          `"${node}" does not exist when ${describe(context)}; leave out ${node}=${given[node]}`,
        );
      }
      continue;
    }
    if (given[node] === undefined) {
      throw new Refusal(`give ${node}=<${sharedStates(resolver, node).join("|")}> for this view`);
    }
    context[node] = given[node];
  }
  const tree = resolver.view(id, context, values.root);
  if (tree === undefined) {
    throw new Refusal(`"${id}" does not exist when ${describe(context)}`);
  }
  if (values.tree === true) {
    io.stdout(drawView(tree));
    return;
  }
  print(io, { node: id, context, tree });
});

function describe(context: NodeContext): string {
  return Object.entries(context)
    .map(([name, value]) => `${name}=${value}`)
    .join(" and ");
}

const transitionsUsage = `Usage: dimensions transitions <node-id>

Lists how a shared node's state changes: each transition's states, DOM event,
target and where focus ends up.
`;

export const transitions = readCommand(transitionsUsage, (resolver, args, io) => {
  const [id] = parse(args, ["node-id"], {}).positionals as [string];
  requireNodeId(resolver, id);
  print(io, { node: id, transitions: resolver.node(id)?.transitions ?? [] });
});

const statusUsage = `Usage: dimensions status [<node-id>]

Reports every check each typed node requires, in every context it exists in,
as passed, failed or missing.
`;

export const status = readCommand(statusUsage, (resolver, args, io) => {
  const [only] = parse(args, [], {}, true).positionals;
  if (only !== undefined) requireNodeId(resolver, only);
  const { project } = resolver;
  const items: ({
    root: string;
    node: string;
    check: string;
    result: string;
  } & ({ context: NodeContext } | { transition: string }))[] = [];
  for (const root of project.roots) {
    const results = new Map<string, string>();
    for (const record of project.verification[root.id]?.records ?? []) {
      const key =
        record.transition !== undefined
          ? `transition:${record.transition}`
          : contextKey({
              ...record.context,
              ...resolver.withDefaults(record.node, record.context ?? {}),
            });
      results.set(JSON.stringify([record.node, key, record.check]), record.result);
    }
    for (const id of only === undefined ? nodesIn(resolver, root.id) : [only]) {
      const type = resolver.node(id)?.type;
      const checks = type === undefined ? [] : (project.types.types?.[type]?.checks ?? []);
      if (checks.length === 0 || !resolver.roots(id).includes(root.id)) continue;
      for (const context of resolver.contexts(id, root.id)) {
        for (const check of checks) {
          const key = JSON.stringify([id, contextKey(context), check]);
          items.push({
            root: root.id,
            node: id,
            context,
            check,
            result: results.get(key) ?? "missing",
          });
        }
      }
      for (const transition of resolver.node(id)?.transitions ?? []) {
        for (const check of checks) {
          const key = JSON.stringify([id, `transition:${transition.id}`, check]);
          items.push({
            root: root.id,
            node: id,
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

// Every node id in a root's tree, through includes, in tree order.
function nodesIn(resolver: Resolver, root: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    if (ids.includes(id)) return;
    ids.push(id);
    for (const child of resolver.node(id)?.children ?? []) {
      visit("include" in child ? child.include : child.id);
    }
  };
  visit(root);
  return ids;
}

const treeUsage = "Usage: dimensions tree\n";

export const tree = readCommand(treeUsage, (resolver, args, io) => {
  parse(args, [], {});
  print(io, { roots: resolver.project.roots, fragments: resolver.project.fragments });
});

// A view's tree as indented text: each node with its shared state or the
// values of its state groups.
function drawView(root: ViewNode): string {
  const label = (item: ViewNode) => {
    const details =
      item.state !== undefined
        ? `${item.id}=${item.state}`
        : item.stateGroups !== undefined
          ? Object.entries(item.stateGroups)
              .map(([group, states]) => `${group}: ${states.join("|")}`)
              .join(" · ")
          : item.states !== undefined && item.states.length > 0
            ? `states: ${item.states.join("|")}`
            : "";
    return details === "" ? item.id : `${item.id}  ${details}`;
  };
  const lines = [label(root)];
  const walk = (items: ViewNode[], indent: string) => {
    items.forEach((item, index) => {
      const last = index === items.length - 1;
      lines.push(`${indent}${last ? "└── " : "├── "}${label(item)}`);
      walk(item.children ?? [], `${indent}${last ? "    " : "│   "}`);
    });
  };
  walk(root.children ?? [], "");
  return `${lines.join("\n")}\n`;
}
