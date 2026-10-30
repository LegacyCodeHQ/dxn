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

export function sharedStates(resolver: Resolver, task: string): string[] {
  const type = resolver.task(task)?.type as string;
  return resolver.project.types.types?.[type]?.states ?? [];
}

// The contexts of a task, or of every part of its subtree, with the
// component on its own unless a page is given.
export function subtreeContexts(
  resolver: Resolver,
  id: string,
  page: string | undefined,
): { id: string; contexts: Context[] }[] {
  return resolver
    .subtree(id)
    .map((task) => ({ id: task, contexts: resolver.contexts(task, page) }));
}

// A predicate for name=value filters. Names must appear in the contexts
// (dimensions, state groups, shared tasks); values must be declared for them.
// Dimensions and shared tasks pick a view, so a part they do not apply to is
// in that view too, as long as a shared task exists there to have that state.
// State groups pick states: a part without the group is left out.
export function contextFilter(
  resolver: Resolver,
  wanted: [string, string][],
  contexts: Context[],
  page: string | undefined,
): (context: Context) => boolean {
  const names = [...new Set(contexts.flatMap((context) => Object.keys(context)))].sort();
  for (const [name, value] of wanted) {
    if (!names.includes(name)) {
      throw new QueryError(
        "name",
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
      throw new QueryError(
        "value",
        `"${value}" is not ${kind} of ${name} (${choices(allowed as string[])})`,
      );
    }
  }
  const inView = (name: string, context: Context) => {
    if (resolver.project.dimensions[name] !== undefined) return true;
    if (!resolver.isShared(name)) return false;
    return resolver.resolve(name, context, resolver.lineage(name, page)).present;
  };
  return (context) =>
    wanted.every(([name, value]) =>
      context[name] === undefined ? inView(name, context) : context[name] === value,
    );
}
