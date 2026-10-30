import {
  type CombinationOverridesFile,
  isInclude,
  type NestedOverrides,
  type Override,
  type Project,
  type Task,
  type TaskNode,
  type ValueOverrides,
} from "./tree.js";

// A context: dimension name -> value, plus "state" when the task has one.
export type Context = Record<string, string>;

// What a task is in one context, after every override and restriction.
export interface Resolved {
  present: boolean;
  states: string[];
  // Attribute -> state -> value, for the states in effect.
  customAttributes: Record<string, Record<string, string>>;
}

// Answers questions about a compiled project: where tasks are, which
// dimensions apply to them, and what they resolve to in a context.
// Precedence, weakest first: type base, type overrides for single
// dimensions, type combinations (fewer dimensions first), the instance's own
// values, then instance overrides in the same order.
export class Resolver {
  private readonly tasks = new Map<string, Task>();
  private readonly children = new Map<string, string[]>();
  private readonly scopes = new Map<string, Set<string>>();

  constructor(readonly project: Project) {
    for (const root of [...project.tasks, ...project.components]) {
      this.index(root);
    }
    for (const [name, dimension] of Object.entries(project.dimensions)) {
      const scope = new Set<string>();
      for (const id of dimension.appliesTo) this.collect(id, scope);
      this.scopes.set(name, scope);
    }
  }

  task(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  // Dimensions that apply to a task, by name.
  dimensions(id: string): string[] {
    return [...this.scopes]
      .filter(([, scope]) => scope.has(id))
      .map(([name]) => name)
      .sort();
  }

  // Pages whose tree, through includes, contains the task.
  pages(id: string): string[] {
    return this.project.tasks
      .map((page) => page.id)
      .filter((page) => this.path(page, id) !== undefined);
  }

  // Every context the task exists in on a page: each combination of its
  // dimensions' values, times its states there.
  contexts(id: string, page: string): Context[] {
    const task = this.tasks.get(id);
    if (task === undefined) return [];
    const names = this.dimensions(id);
    let combinations: Context[] = [{}];
    for (const name of names) {
      const values = this.project.dimensions[name]?.values ?? [];
      combinations = combinations.flatMap((context) =>
        values.map((value) => ({ ...context, [name]: value })),
      );
    }
    return combinations.flatMap((context) => {
      const resolved = this.resolve(id, context, page);
      if (!resolved.present) return [];
      if (task.type === undefined || !this.hasStates(task.type)) return [context];
      return resolved.states.map((state) => ({ state, ...context }));
    });
  }

  // The task in a context. Dimensions missing from the context take their
  // default; ones without a default are not applied.
  resolve(id: string, given: Context, page?: string): Resolved {
    const task = this.tasks.get(id) as Task;
    const context = this.withDefaults(id, given);
    const lineage = (page === undefined ? undefined : this.path(page, id)) ?? this.ancestry(id);
    const present = !Object.entries(context).some(([name, value]) => {
      const only = this.project.overrides[name]?.only;
      return lineage.some((ancestor) => {
        const allowed = only?.[ancestor];
        return allowed !== undefined && !allowed.includes(value);
      });
    });

    const type = task.type === undefined ? undefined : this.project.types.types?.[task.type];
    const levels = this.levels(id, task.type, context);
    const states = new Set(type?.states ?? []);
    for (const override of levels) {
      for (const state of override?.states?.remove ?? []) states.delete(state);
      for (const state of override?.states?.add ?? []) states.add(state);
    }
    const values: Record<string, Record<string, string>> = {};
    const layers = [
      type?.customAttributes,
      ...levels.slice(0, levels.length / 2).map((level) => level?.customAttributes),
      task.customAttributes,
      ...levels.slice(levels.length / 2).map((level) => level?.customAttributes),
    ];
    for (const layer of layers) {
      for (const [attribute, byState] of Object.entries(layer ?? {})) {
        for (const [state, value] of Object.entries(byState)) {
          if (!states.has(state)) continue;
          values[attribute] = { ...values[attribute], [state]: value };
        }
      }
    }
    return { present, states: [...states], customAttributes: values };
  }

  // Fills in defaults for the task's dimensions the context leaves out.
  withDefaults(id: string, given: Context): Context {
    const context: Context = {};
    for (const name of this.dimensions(id)) {
      const value = given[name] ?? this.project.dimensions[name]?.default;
      if (value !== undefined) context[name] = value;
    }
    return context;
  }

  // Whether the type has states, so contexts include one.
  private hasStates(type: string): boolean {
    return (this.project.types.types?.[type]?.states ?? []).length > 0;
  }

  // Type overrides then task overrides: singles, then combinations by size.
  private levels(id: string, type: string | undefined, context: Context): (Override | undefined)[] {
    const singles = Object.entries(context).map(
      ([name, value]) => this.project.overrides[name]?.overrides[value],
    );
    const combinations = Object.entries(this.project.combinations)
      .map(([name, file]) => [name.split("+"), file] as const)
      .filter(([names]) => names.every((name) => context[name] !== undefined))
      .sort(([a], [b]) => a.length - b.length)
      .map(([names, file]) =>
        nested(
          file,
          names.map((name) => context[name] as string),
        ),
      );
    const all = [...singles, ...combinations];
    return [
      ...all.map((override) => (type === undefined ? undefined : override?.types?.[type])),
      ...all.map((override) => override?.tasks?.[id]),
    ];
  }

  private index(node: Task): void {
    this.tasks.set(node.id, node);
    this.children.set(
      node.id,
      (node.children ?? []).map((child: TaskNode) => (isInclude(child) ? child.include : child.id)),
    );
    for (const child of node.children ?? []) {
      if (!isInclude(child)) this.index(child);
    }
  }

  private collect(id: string, into: Set<string>): void {
    if (into.has(id)) return;
    into.add(id);
    for (const child of this.children.get(id) ?? []) this.collect(child, into);
  }

  private path(from: string, to: string, seen = new Set<string>()): string[] | undefined {
    if (from === to) return [to];
    if (seen.has(from)) return undefined;
    seen.add(from);
    for (const child of this.children.get(from) ?? []) {
      const rest = this.path(child, to, seen);
      if (rest !== undefined) return [from, ...rest];
    }
    return undefined;
  }

  // The task and its ancestors within its own file.
  private ancestry(id: string): string[] {
    for (const root of [...this.project.tasks, ...this.project.components]) {
      const found = this.path(root.id, id);
      if (found !== undefined) return found;
    }
    return [id];
  }
}

function nested(file: CombinationOverridesFile, values: string[]): ValueOverrides | undefined {
  let node: NestedOverrides | ValueOverrides | undefined = file.overrides;
  for (const value of values) {
    node = (node as NestedOverrides | undefined)?.[value];
  }
  return node as ValueOverrides | undefined;
}

// A canonical key for a context, for matching records.
export function contextKey(context: Context): string {
  return JSON.stringify(Object.entries(context).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
