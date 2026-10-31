import {
  type Child,
  type CombinationOverridesFile,
  isInclude,
  type NestedOverrides,
  type Override,
  type Project,
  type TreeNode,
  type ValueOverrides,
} from "./tree.js";

// A context: dimension name -> value, shared node id -> its state, plus
// "state" for the node's own state.
export type Context = Record<string, string>;

// What a node is in one context, after every override and restriction.
export interface Resolved {
  present: boolean;
  // Every state in effect, across the type's groups.
  states: string[];
  // The states in effect per group; a plain states list is the group "state".
  groups: Record<string, string[]>;
  // Attribute -> state -> value, for the states in effect.
  attributes: Record<string, Record<string, string>>;
}

// A view of a node: the tree present in one context.
export interface ViewNode {
  id: string;
  title: string;
  type?: string;
  // A shared node's state in this view.
  state?: string;
  // A node's own states here: a plain list, or per state group.
  states?: string[];
  stateGroups?: Record<string, string[]>;
  attributes?: Record<string, Record<string, string>>;
  children?: ViewNode[];
}

// Answers questions about a compiled project: where nodes are, which
// dimensions and shared states apply to them, and what they resolve to in a
// context. Precedence, weakest first: type base, type overrides for single
// dimensions, type combinations (fewer dimensions first), the instance's own
// values, then instance overrides in the same order.
// A request that no profile, or more than one, fits; the message says what
// to give instead.
export class ProfileError extends Error {}

export class Resolver {
  private readonly nodes = new Map<string, TreeNode>();
  private readonly children = new Map<string, string[]>();
  // Node id -> its parent in the same file; roots have none.
  private readonly parents = new Map<string, string>();
  private readonly scopes = new Map<string, Set<string>>();
  // "<parent>><fragment>" -> the include's "states".
  private readonly includeStates = new Map<string, Record<string, Record<string, string[]>>>();

  // Profile name -> dimension -> value, and the dimensions profiles cover.
  readonly profiles: Map<string, Record<string, string>>;
  readonly profiled: Set<string>;

  constructor(readonly project: Project) {
    this.profiles = new Map(
      Object.entries(project.profiles?.profiles ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    this.profiled = new Set([...this.profiles.values()].flatMap((values) => Object.keys(values)));
    for (const root of [...project.roots, ...project.fragments]) {
      this.index(root);
    }
    for (const [name, dimension] of Object.entries(project.dimensions)) {
      const scope = new Set<string>();
      for (const id of dimension.appliesTo) this.collect(id, scope);
      this.scopes.set(name, scope);
    }
  }

  node(id: string): TreeNode | undefined {
    return this.nodes.get(id);
  }

  // Whether a profile has the context's values for every profiled dimension
  // it names. A context naming none of them fits.
  fitsProfile(context: Context): boolean {
    const named = Object.keys(context).filter((name) => this.profiled.has(name));
    return (
      named.length === 0 ||
      [...this.profiles.values()].some((profile) =>
        named.every((name) => profile[name] === context[name]),
      )
    );
  }

  // The values of the profiled dimensions among these, from the one profile
  // that fits what was given: a profile=<name>, or some of the values.
  // Several profiles fitting, or none, is an error that says what to give.
  fillProfile(dimensions: string[], given: Context, subject: string): Context {
    const covered = dimensions.filter((name) => this.profiled.has(name));
    const named = given.profile;
    if (named !== undefined && !this.profiles.has(named)) {
      throw new ProfileError(
        `"${named}" is not a profile (${[...this.profiles.keys()].join(", ")})`,
      );
    }
    if (covered.length === 0) return {};
    const chosen = named === undefined ? undefined : this.profiles.get(named);
    for (const name of covered) {
      if (chosen !== undefined && given[name] !== undefined && chosen[name] !== given[name]) {
        throw new ProfileError(
          `profile "${named}" has ${name}=${chosen[name]}, not ${name}=${given[name]}`,
        );
      }
    }
    const asked = covered.filter((name) => given[name] !== undefined);
    const fitting = [...this.profiles].filter(
      ([name, values]) =>
        (named === undefined || name === named) &&
        asked.every((dimension) => values[dimension] === given[dimension]),
    );
    // Profiles that differ only in dimensions not covered here are one.
    const project = (values: Record<string, string>) =>
      JSON.stringify(covered.map((name) => values[name]));
    const distinct = new Map(fitting.map(([name, values]) => [project(values), name]));
    if (distinct.size === 1) {
      const values = (fitting[0] as [string, Record<string, string>])[1];
      return Object.fromEntries(covered.map((name) => [name, values[name] as string]));
    }
    const describe = asked.map((name) => `${name}=${given[name]}`).join(", ");
    if (distinct.size === 0) {
      throw new ProfileError(
        `no profile has ${describe} (${[...this.profiles.keys()].join(", ")})`,
      );
    }
    const choices = fitting.map(([name]) => name).join("|");
    throw new ProfileError(
      asked.length === 0
        ? `give profile=<${choices}> for ${subject}`
        : `${describe} fits several profiles; give profile=<${choices}>`,
    );
  }

  // Dimensions that apply to a node, by name.
  dimensions(id: string): string[] {
    return [...this.scopes]
      .filter(([, scope]) => scope.has(id))
      .map(([name]) => name)
      .sort();
  }

  isShared(id: string): boolean {
    const type = this.nodes.get(id)?.type;
    return type !== undefined && this.project.types.types?.[type]?.shared === true;
  }

  // Roots whose tree, through includes, contains the node.
  roots(id: string): string[] {
    return this.project.roots
      .map((root) => root.id)
      .filter((root) => this.path(root, id) !== undefined);
  }

  // The ids from a root (or, without one, the node's own file root) down to
  // the node.
  lineage(id: string, root?: string): string[] {
    return (root === undefined ? undefined : this.path(root, id)) ?? this.ancestry(id);
  }

  // Shared nodes above the node on its lineage.
  sharedAncestors(lineage: string[]): string[] {
    return lineage.slice(0, -1).filter((id) => this.isShared(id));
  }

  // Every context the node exists in within a root (or, without one, within its
  // own file): each combination of its dimensions' values and its shared
  // ancestors' states, times its own states. A shared node's own state is
  // named by its id, as its descendants name it.
  contexts(id: string, root?: string): Context[] {
    const node = this.nodes.get(id);
    if (node === undefined) return [];
    const lineage = this.lineage(id, root);
    let contexts: Context[] = [{}];
    for (const name of this.dimensions(id)) {
      const values = this.project.dimensions[name]?.values ?? [];
      contexts = contexts.flatMap((context) =>
        values.map((value) => ({ ...context, [name]: value })),
      );
    }
    contexts = contexts.filter((context) => this.fitsProfile(context));
    for (const ancestor of this.sharedAncestors(lineage)) {
      contexts = contexts.flatMap((context) =>
        this.resolve(ancestor, context, this.lineage(ancestor, root)).states.map((state) => ({
          ...context,
          [ancestor]: state,
        })),
      );
    }
    return contexts.flatMap((context) => {
      const resolved = this.resolve(id, context, lineage);
      if (!resolved.present) return [];
      if (this.isShared(id)) {
        return resolved.states.map((state) => ({ ...context, [id]: state }));
      }
      if (node.type === undefined || !this.hasStates(node.type)) {
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

  // Every distinct view of a node's subtree: its dimensions' values, and the
  // states of shared nodes wherever those nodes are present.
  views(id: string, root?: string): Context[] {
    const { dimensions: names, shared } = this.axes(id, root);
    let views: Context[] = [{}];
    for (const name of names) {
      const values = this.project.dimensions[name]?.values ?? [];
      views = views.flatMap((view) => values.map((value) => ({ ...view, [name]: value })));
    }
    views = views.filter((view) => this.fitsProfile(view));
    for (const node of shared) {
      const nodeLineage = this.lineageWithin(id, node, root);
      views = views.flatMap((view) => {
        const resolved = this.resolve(node, view, nodeLineage);
        return resolved.present
          ? resolved.states.map((state) => ({ ...view, [node]: state }))
          : [view];
      });
    }
    // Only the views in which the node itself exists.
    return views.filter((view) => this.resolve(id, view, this.lineage(id, root)).present);
  }

  // The dimensions that apply anywhere in a node's subtree, and the shared
  // nodes above it or in it, in tree order.
  axes(id: string, root?: string): { dimensions: string[]; shared: string[] } {
    const subtree = this.subtree(id);
    return {
      dimensions: [...this.scopes]
        .filter(([, scope]) => subtree.some((item) => scope.has(item)))
        .map(([name]) => name)
        .sort(),
      shared: [
        ...this.sharedAncestors(this.lineage(id, root)),
        ...subtree.filter((item) => this.isShared(item)),
      ],
    };
  }

  // The lineage of a node inside a view of another node.
  lineageWithin(id: string, node: string, root?: string): string[] {
    return [...this.lineage(id, root).slice(0, -1), ...(this.path(id, node) ?? [node])];
  }

  // The tree present in a view.
  view(id: string, context: Context, root?: string): ViewNode | undefined {
    const lineage = this.lineage(id, root);
    return this.render(id, context, lineage);
  }

  // The node in a context. Dimensions missing from the context take their
  // default; ones without a default are not applied. lineage decides "only"
  // and onlyWhen; it defaults to the path within the node's own file.
  resolve(id: string, given: Context, lineage: string[] = this.ancestry(id)): Resolved {
    const node = this.nodes.get(id) as TreeNode;
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
      !lineage.some((item) =>
        Object.entries(this.nodes.get(item)?.onlyWhen ?? {}).some(
          ([ancestor, states]) => full[ancestor] !== undefined && !states.includes(full[ancestor]),
        ),
      );

    const type = node.type === undefined ? undefined : this.project.types.types?.[node.type];
    const levels = this.levels(id, node.type, context);
    const typeGroups = node.type === undefined ? {} : this.groupsOf(node.type);
    const states = new Set(Object.values(typeGroups).flat());
    for (const override of levels) {
      for (const state of override?.states?.remove ?? []) states.delete(state);
      for (const state of override?.states?.add ?? []) states.add(state);
    }
    const values: Record<string, Record<string, string>> = {};
    const layers = [
      type?.attributes,
      ...levels.slice(0, levels.length / 2).map((level) => level?.attributes),
      node.attributes,
      ...levels.slice(levels.length / 2).map((level) => level?.attributes),
    ];
    for (const layer of layers) {
      for (const [attribute, byState] of Object.entries(layer ?? {})) {
        for (const [state, value] of Object.entries(byState)) {
          if (!states.has(state)) continue;
          values[attribute] = { ...values[attribute], [state]: value };
        }
      }
    }
    // Includes on the path from the root may fix some of the node's groups.
    for (let index = 0; index + 1 < lineage.length; index++) {
      const fixed = this.includeStates.get(`${lineage[index]}>${lineage[index + 1]}`)?.[id];
      for (const [group, allowed] of Object.entries(fixed ?? {})) {
        const declared = typeGroups[group] ?? [];
        for (const state of declared) {
          if (!allowed.includes(state)) states.delete(state);
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
    return { present, states: [...states], groups, attributes: values };
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

  // The node's dimensions from the context, with defaults filled in.
  withDefaults(id: string, given: Context): Context {
    const context: Context = {};
    for (const name of this.dimensions(id)) {
      const value = given[name] ?? this.project.dimensions[name]?.default;
      if (value !== undefined) context[name] = value;
    }
    return context;
  }

  private render(id: string, context: Context, lineage: string[]): ViewNode | undefined {
    const node = this.nodes.get(id) as TreeNode;
    const resolved = this.resolve(id, context, lineage);
    if (!resolved.present) return undefined;
    const item: ViewNode = { id: node.id, title: node.title };
    if (node.type !== undefined) item.type = node.type;
    if (this.isShared(id)) {
      item.state = context[id] as string;
    } else if (node.type !== undefined && this.hasStates(node.type)) {
      if (this.project.types.types?.[node.type]?.stateGroups === undefined) {
        item.states = resolved.states;
      } else {
        item.stateGroups = resolved.groups;
      }
    }
    if (Object.keys(resolved.attributes).length > 0) {
      item.attributes = resolved.attributes;
    }
    const children = (this.children.get(id) ?? [])
      .map((child) => this.render(child, context, [...lineage, child]))
      .filter((child): child is ViewNode => child !== undefined);
    if (children.length > 0) item.children = children;
    return item;
  }

  // Whether the type has states, so contexts include one.
  private hasStates(type: string): boolean {
    return Object.keys(this.groupsOf(type)).length > 0;
  }

  // Type overrides then node overrides: singles, then combinations by size.
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
      ...all.map((override) => override?.nodes?.[id]),
    ];
  }

  private index(item: TreeNode): void {
    this.nodes.set(item.id, item);
    this.children.set(
      item.id,
      (item.children ?? []).map((child: Child) => (isInclude(child) ? child.include : child.id)),
    );
    for (const child of item.children ?? []) {
      if (isInclude(child) && child.states !== undefined) {
        this.includeStates.set(`${item.id}>${child.include}`, child.states);
      }
    }
    for (const child of item.children ?? []) {
      if (!isInclude(child)) {
        this.parents.set(child.id, item.id);
        this.index(child);
      }
    }
  }

  private collect(id: string, into: Set<string>): void {
    if (into.has(id)) return;
    into.add(id);
    for (const child of this.children.get(id) ?? []) this.collect(child, into);
  }

  // The node and everything under it, through includes, in tree order.
  subtree(id: string): string[] {
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

  // The node and its ancestors within its own file.
  private ancestry(id: string): string[] {
    const lineage = [id];
    for (
      let parent = this.parents.get(id);
      parent !== undefined;
      parent = this.parents.get(parent)
    ) {
      lineage.unshift(parent);
    }
    return lineage;
  }
}

function nested(file: CombinationOverridesFile, values: string[]): ValueOverrides | undefined {
  let item: NestedOverrides | ValueOverrides | undefined = file.overrides;
  for (const value of values) {
    item = (item as NestedOverrides | undefined)?.[value];
  }
  return item as ValueOverrides | undefined;
}

// A canonical key for a context, for matching records.
export function contextKey(context: Context): string {
  return JSON.stringify(Object.entries(context).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
