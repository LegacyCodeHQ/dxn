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

// A context: dimension name -> value, shared task id -> its state, plus
// "state" for the task's own state.
export type Context = Record<string, string>;

// What a task is in one context, after every override and restriction.
export interface Resolved {
  present: boolean;
  // Every state in effect, across the type's groups.
  states: string[];
  // The states in effect per group; a plain states list is the group "state".
  groups: Record<string, string[]>;
  // Attribute -> state -> value, for the states in effect.
  customAttributes: Record<string, Record<string, string>>;
}

// A view of a task: the tree present in one context.
export interface ViewNode {
  id: string;
  title: string;
  type?: string;
  // A shared task's state in this view.
  state?: string;
  // A task's own states here: a plain list, or per state group.
  states?: string[];
  stateGroups?: Record<string, string[]>;
  customAttributes?: Record<string, Record<string, string>>;
  children?: ViewNode[];
}

// Answers questions about a compiled project: where tasks are, which
// dimensions and shared states apply to them, and what they resolve to in a
// context. Precedence, weakest first: type base, type overrides for single
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

  isShared(id: string): boolean {
    const type = this.tasks.get(id)?.type;
    return type !== undefined && this.project.types.types?.[type]?.shared === true;
  }

  // Pages whose tree, through includes, contains the task.
  pages(id: string): string[] {
    return this.project.tasks
      .map((page) => page.id)
      .filter((page) => this.path(page, id) !== undefined);
  }

  // The ids from a page (or, without one, the task's own file root) down to
  // the task.
  lineage(id: string, page?: string): string[] {
    return (page === undefined ? undefined : this.path(page, id)) ?? this.ancestry(id);
  }

  // Shared tasks above the task on its lineage.
  sharedAncestors(lineage: string[]): string[] {
    return lineage.slice(0, -1).filter((id) => this.isShared(id));
  }

  // Every context the task exists in on a page: each combination of its
  // dimensions' values and its shared ancestors' states, times its own states.
  contexts(id: string, page: string): Context[] {
    const task = this.tasks.get(id);
    if (task === undefined) return [];
    const lineage = this.lineage(id, page);
    let contexts: Context[] = [{}];
    for (const name of this.dimensions(id)) {
      const values = this.project.dimensions[name]?.values ?? [];
      contexts = contexts.flatMap((context) =>
        values.map((value) => ({ ...context, [name]: value })),
      );
    }
    for (const ancestor of this.sharedAncestors(lineage)) {
      contexts = contexts.flatMap((context) =>
        this.resolve(ancestor, context, this.lineage(ancestor, page)).states.map((state) => ({
          ...context,
          [ancestor]: state,
        })),
      );
    }
    return contexts.flatMap((context) => {
      const resolved = this.resolve(id, context, lineage);
      if (!resolved.present) return [];
      if (task.type === undefined || !this.hasStates(task.type) || this.isShared(id)) {
        return [context];
      }
      // One value per group: the matrix of the type's groups.
      let combinations: Context[] = [{}];
      for (const [group, values] of Object.entries(resolved.groups)) {
        combinations = combinations.flatMap((combination) =>
          values.map((value) => ({ ...combination, [group]: value })),
        );
      }
      return combinations.map((combination) => ({ ...combination, ...context }));
    });
  }

  // Every distinct view of a task's subtree: its dimensions' values, and the
  // states of shared tasks wherever those tasks are present.
  views(id: string, page?: string): Context[] {
    const { dimensions: names, shared } = this.axes(id, page);
    let views: Context[] = [{}];
    for (const name of names) {
      const values = this.project.dimensions[name]?.values ?? [];
      views = views.flatMap((view) => values.map((value) => ({ ...view, [name]: value })));
    }
    for (const task of shared) {
      const taskLineage = this.lineageWithin(id, task, page);
      views = views.flatMap((view) => {
        const resolved = this.resolve(task, view, taskLineage);
        return resolved.present
          ? resolved.states.map((state) => ({ ...view, [task]: state }))
          : [view];
      });
    }
    // Only the views in which the task itself exists.
    return views.filter((view) => this.resolve(id, view, this.lineage(id, page)).present);
  }

  // The dimensions that apply anywhere in a task's subtree, and the shared
  // tasks above it or in it, in tree order.
  axes(id: string, page?: string): { dimensions: string[]; shared: string[] } {
    const subtree = this.subtree(id);
    return {
      dimensions: [...this.scopes]
        .filter(([, scope]) => subtree.some((node) => scope.has(node)))
        .map(([name]) => name)
        .sort(),
      shared: [
        ...this.sharedAncestors(this.lineage(id, page)),
        ...subtree.filter((node) => this.isShared(node)),
      ],
    };
  }

  // The lineage of a task inside a view of another task.
  lineageWithin(id: string, task: string, page?: string): string[] {
    return [...this.lineage(id, page).slice(0, -1), ...(this.path(id, task) ?? [task])];
  }

  // The tree present in a view.
  view(id: string, context: Context, page?: string): ViewNode | undefined {
    const lineage = this.lineage(id, page);
    return this.render(id, context, lineage);
  }

  // The task in a context. Dimensions missing from the context take their
  // default; ones without a default are not applied. lineage decides "only"
  // and onlyWhen; it defaults to the path within the task's own file.
  resolve(id: string, given: Context, lineage: string[] = this.ancestry(id)): Resolved {
    const task = this.tasks.get(id) as Task;
    const context = this.withDefaults(id, given);
    const full = { ...given, ...context };
    const present =
      !Object.entries(context).some(([name, value]) => {
        const only = this.project.overrides[name]?.only;
        return lineage.some((ancestor) => {
          const allowed = only?.[ancestor];
          return allowed !== undefined && !allowed.includes(value);
        });
      }) &&
      !lineage.some((node) =>
        Object.entries(this.tasks.get(node)?.onlyWhen ?? {}).some(
          ([ancestor, states]) => full[ancestor] !== undefined && !states.includes(full[ancestor]),
        ),
      );

    const type = task.type === undefined ? undefined : this.project.types.types?.[task.type];
    const levels = this.levels(id, task.type, context);
    const typeGroups = task.type === undefined ? {} : this.groupsOf(task.type);
    const states = new Set(Object.values(typeGroups).flat());
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
    const groups: Record<string, string[]> = {};
    for (const group of Object.keys(typeGroups)) {
      const declared = this.project.types.stateGroups?.[group];
      groups[group] = [...states].filter(
        (state) => declared === undefined || declared.includes(state),
      );
    }
    if (Object.keys(typeGroups).length === 0 && states.size > 0) {
      groups.state = [...states];
    }
    return { present, states: [...states], groups, customAttributes: values };
  }

  // A type's state groups and the values it uses from each; a plain states
  // list is the group "state".
  groupsOf(typeName: string): Record<string, string[]> {
    const type = this.project.types.types?.[typeName];
    const used = type?.stateGroups;
    if (used === undefined) {
      return (type?.states ?? []).length > 0 ? { state: type?.states ?? [] } : {};
    }
    if (Array.isArray(used)) {
      return Object.fromEntries(
        used.map((group) => [group, this.project.types.stateGroups?.[group] ?? []]),
      );
    }
    return { ...used };
  }

  // The task's dimensions from the context, with defaults filled in.
  withDefaults(id: string, given: Context): Context {
    const context: Context = {};
    for (const name of this.dimensions(id)) {
      const value = given[name] ?? this.project.dimensions[name]?.default;
      if (value !== undefined) context[name] = value;
    }
    return context;
  }

  private render(id: string, context: Context, lineage: string[]): ViewNode | undefined {
    const task = this.tasks.get(id) as Task;
    const resolved = this.resolve(id, context, lineage);
    if (!resolved.present) return undefined;
    const node: ViewNode = { id: task.id, title: task.title };
    if (task.type !== undefined) node.type = task.type;
    if (this.isShared(id)) {
      node.state = context[id] as string;
    } else if (task.type !== undefined && this.hasStates(task.type)) {
      if (this.project.types.types?.[task.type]?.stateGroups === undefined) {
        node.states = resolved.states;
      } else {
        node.stateGroups = resolved.groups;
      }
    }
    if (Object.keys(resolved.customAttributes).length > 0) {
      node.customAttributes = resolved.customAttributes;
    }
    const children = (this.children.get(id) ?? [])
      .map((child) => this.render(child, context, [...lineage, child]))
      .filter((child): child is ViewNode => child !== undefined);
    if (children.length > 0) node.children = children;
    return node;
  }

  // Whether the type has states, so contexts include one.
  private hasStates(type: string): boolean {
    return Object.keys(this.groupsOf(type)).length > 0;
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

  // The task and everything under it, through includes, in tree order.
  private subtree(id: string): string[] {
    const ids: string[] = [];
    const visit = (current: string) => {
      if (ids.includes(current)) return;
      ids.push(current);
      for (const child of this.children.get(current) ?? []) visit(child);
    };
    visit(id);
    return ids;
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
