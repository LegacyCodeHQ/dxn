import type { Context, Resolver } from "./resolve.js";
import type { Transition } from "./tree.js";

// A node's contexts, one entry per context.
export interface Entry {
  node: string;
  context: Context;
}

// A level of the tree: a node, or a name (dimension, shared node, state
// group, root) with the values that lead to the same subtree.
export type StateNode =
  | { node: string; count: number; transitions?: Transition[]; children?: StateNode[] }
  | { name: string; values: string[]; count: number; children?: StateNode[] };

export interface TreeOptions {
  // Names to put first, above the nodes.
  by?: string[];
  // The only names to show; others are merged away.
  only?: string[];
  // Whether nodes list their transitions.
  transitions?: boolean;
}

// The names that appear in the entries' contexts, for validating options.
export function treeNames(entries: Entry[]): string[] {
  return [...new Set(entries.flatMap(({ context }) => Object.keys(context)))].sort();
}

// Builds the merged state tree: one level per name, ordered --by names first,
// then nodes, then the root, dimensions, shared states and state groups.
// Sibling branches with identical subtrees share one node, and a dimension
// level whose values all lead to the same subtree is dropped: it changes
// nothing there. Shared states and state groups always stay, since they are
// the states themselves.
export function buildStateTree(
  resolver: Resolver,
  entries: Entry[],
  options: TreeOptions = {},
): StateNode[] {
  const projected = project(entries, options.only);
  const seen = treeNames(projected).sort(
    (a, b) => firstSeen(projected, a) - firstSeen(projected, b),
  );
  const rank = (name: string) =>
    name === "root"
      ? 0
      : resolver.project.dimensions[name] !== undefined
        ? 1
        : resolver.isShared(name)
          ? 2
          : 3;
  const by = options.by ?? [];
  const rest = seen
    .filter((name) => !by.includes(name))
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return rank(a) === 1 ? (a < b ? -1 : a > b ? 1 : 0) : seen.indexOf(a) - seen.indexOf(b);
    });
  const order = [...by, TASK, ...rest];

  const build = (group: Entry[], levels: string[]): StateNode[] => {
    const [level, ...below] = levels;
    if (level === undefined) return [];
    if (level === TASK) {
      const nodes = [...new Set(group.map(({ node }) => node))];
      return nodes.map((node) => {
        const own = group.filter((entry) => entry.node === node);
        const transitions = options.transitions ? (resolver.node(node)?.transitions ?? []) : [];
        return withChildren(
          { node, count: own.length, ...(transitions.length === 0 ? {} : { transitions }) },
          build(own, below),
        );
      });
    }
    // A level none of these contexts have does not exist here.
    if (!group.some(({ context }) => context[level] !== undefined)) {
      return build(group, below);
    }
    const values = [
      ...new Set(
        group.flatMap(({ context }) => (context[level] === undefined ? [] : [context[level]])),
      ),
    ];
    // Above the nodes, a node without this level exists at every value of it.
    const everywhere = group.filter(({ context }) => context[level] === undefined);
    const merged: { values: string[]; group: Entry[]; children: StateNode[] }[] = [];
    for (const value of values) {
      const matching = [...group.filter(({ context }) => context[level] === value), ...everywhere];
      const children = build(matching, below);
      const twin = merged.find(
        (other) => JSON.stringify(other.children) === JSON.stringify(children),
      );
      if (twin === undefined) {
        merged.push({ values: [value], group: matching, children });
      } else {
        twin.values.push(value);
        twin.group.push(...matching);
      }
    }
    // Merged branches were compared per value; rebuild them from all their
    // values so the counts below cover every value.
    for (const branch of merged) {
      if (branch.values.length > 1) branch.children = build(branch.group, below);
    }
    // A dimension whose every value leads to the same subtree changes nothing.
    const declared = resolver.project.dimensions[level]?.values;
    if (
      declared !== undefined &&
      merged.length === 1 &&
      declared.every((value) => merged[0]?.values.includes(value))
    ) {
      return merged[0]?.children ?? [];
    }
    return merged.map((branch) =>
      withChildren(
        { name: level, values: branch.values, count: branch.group.length },
        branch.children,
      ),
    );
  };
  return build(projected, order);
}

// Draws the tree as text: top-level nodes as headings, the rest indented.
export function drawStateTree(items: StateNode[]): string {
  const lines: string[] = [];
  const label = (item: StateNode) =>
    "node" in item
      ? `${item.node} (${item.count} combination${item.count === 1 ? "" : "s"})`
      : `${item.name}=${item.values.join(", ")}`;
  // A node's children, then its transitions as a branch of their own.
  const below = (item: StateNode): Line[] => [
    ...(item.children ?? []).map((child) => ({
      text: label(child),
      children: below(child),
    })),
    ...("node" in item && item.transitions !== undefined
      ? [
          {
            text: "transitions",
            children: item.transitions.map((transition) => ({
              text: describeTransition(transition),
              children: [],
            })),
          },
        ]
      : []),
  ];
  const draw = (children: Line[], prefix: string) => {
    children.forEach((line, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${line.text}`);
      draw(line.children, `${prefix}${last ? "    " : "│   "}`);
    });
  };
  for (const item of items) {
    lines.push(label(item));
    draw(below(item), "");
  }
  return `${lines.join("\n")}\n`;
}

interface Line {
  text: string;
  children: Line[];
}

// "closed → open: click on menu-button, focus menu-button  [open]"
export function describeTransition(transition: Transition): string {
  const event = [
    transition.on,
    transition.key,
    transition.target === undefined ? undefined : `on ${transition.target}`,
    transition.outside === undefined ? undefined : `outside ${transition.outside}`,
    transition.when === undefined
      ? undefined
      : `to ${Object.entries(transition.when)
          .map(([name, values]) => `${name}=${values.join("|")}`)
          .join(" ")}`,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  const focus = transition.focus === undefined ? "" : `, focus ${transition.focus}`;
  return `${transition.from} → ${transition.to}: ${event}${focus}  [${transition.id}]`;
}

const TASK = "\u0000task";

function withChildren<T extends StateNode>(item: T, children: StateNode[]): T {
  return children.length === 0 ? item : { ...item, children };
}

// Keeps only the named levels, merging entries that become identical.
function project(entries: Entry[], only: string[] | undefined): Entry[] {
  if (only === undefined) return entries;
  const kept = new Map<string, Entry>();
  for (const { node, context } of entries) {
    const narrowed = Object.fromEntries(
      Object.entries(context).filter(([name]) => only.includes(name)),
    );
    kept.set(JSON.stringify([node, narrowed]), { node, context: narrowed });
  }
  return [...kept.values()];
}

function firstSeen(entries: Entry[], name: string): number {
  for (const [index, { context }] of entries.entries()) {
    const position = Object.keys(context).indexOf(name);
    if (position >= 0) return index * 100 + position;
  }
  return Number.MAX_SAFE_INTEGER;
}
