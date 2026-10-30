import type { Context, Resolver } from "./resolve.js";

// A filter name or value that does not exist; the message lists the choices.
export class QueryError extends Error {
  constructor(
    readonly field: "name" | "value",
    message: string,
  ) {
    super(message);
  }
}

export function choices(names: string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

// A shared node's states: its type's plain states, or the values of the one
// state group it uses.
export function sharedStates(resolver: Resolver, node: string): string[] {
  const type = resolver.node(node)?.type as string;
  return Object.values(resolver.groupsOf(type)).flat();
}

// The contexts of a node, or of every part of its subtree, with the
// fragment on its own unless a root is given.
export function subtreeContexts(
  resolver: Resolver,
  id: string,
  root: string | undefined,
): { id: string; contexts: Context[] }[] {
  return resolver
    .subtree(id)
    .map((node) => ({ id: node, contexts: resolver.contexts(node, root) }));
}

// A predicate for name=value filters. Names must appear in the contexts
// (dimensions, state groups, shared nodes); values must be declared for them.
// Dimensions and shared nodes pick a view, so a part they do not apply to is
// in that view too, as long as a shared node exists there to have that state.
// State groups pick states: a part without the group is left out.
export function contextFilter(
  resolver: Resolver,
  wanted: [string, string][],
  contexts: Context[],
  root: string | undefined,
): (context: Context) => boolean {
  const names = [...new Set(contexts.flatMap((context) => Object.keys(context)))].sort();
  for (const [name, value] of wanted) {
    if (!names.includes(name)) {
      throw new QueryError(
        "name",
        `"${name}" is not a dimension, state group or shared node here (${choices(names)})`,
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
      throw new QueryError(
        "value",
        `"${value}" is not ${kind} of ${name} (${choices(allowed as string[])})`,
      );
    }
  }
  const inView = (name: string, context: Context) => {
    if (resolver.project.dimensions[name] !== undefined) return true;
    if (!resolver.isShared(name)) return false;
    return resolver.resolve(name, context, resolver.lineage(name, root)).present;
  };
  return (context) =>
    wanted.every(([name, value]) =>
      context[name] === undefined ? inView(name, context) : context[name] === value,
    );
}
