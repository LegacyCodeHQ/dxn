import type { Context, Resolver } from "./resolve.js";

// A task's contexts, one entry per context.
export interface Entry {
  task: string;
  context: Context;
}

// A level of the tree: a task, or a name (dimension, shared task, state
// group, page) with the values that lead to the same subtree.
export type StateNode =
  | { task: string; count: number; children?: StateNode[] }
  | { name: string; values: string[]; count: number; children?: StateNode[] };

export interface TreeOptions {
  // Names to put first, above the tasks.
  by?: string[];
  // The only names to show; others are merged away.
  only?: string[];
}

// The names that appear in the entries' contexts, for validating options.
export function treeNames(entries: Entry[]): string[] {
  return [...new Set(entries.flatMap(({ context }) => Object.keys(context)))].sort();
}

// Builds the merged state tree: one level per name, ordered --by names first,
// then tasks, then the page, dimensions, shared states and state groups.
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
    name === "page"
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
      const tasks = [...new Set(group.map(({ task }) => task))];
      return tasks.map((task) => {
        const own = group.filter((entry) => entry.task === task);
        return withChildren({ task, count: own.length }, build(own, below));
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
    // Above the tasks, a task without this level exists at every value of it.
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
export function drawStateTree(nodes: StateNode[]): string {
  const lines: string[] = [];
  const label = (node: StateNode) =>
    "task" in node
      ? `${node.task} (${node.count} combination${node.count === 1 ? "" : "s"})`
      : `${node.name}=${node.values.join(", ")}`;
  const draw = (children: StateNode[], prefix: string) => {
    children.forEach((node, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${label(node)}`);
      draw(node.children ?? [], `${prefix}${last ? "    " : "│   "}`);
    });
  };
  for (const node of nodes) {
    lines.push(label(node));
    draw(node.children ?? [], "");
  }
  return `${lines.join("\n")}\n`;
}

const TASK = "\u0000task";

function withChildren<T extends StateNode>(node: T, children: StateNode[]): T {
  return children.length === 0 ? node : { ...node, children };
}

// Keeps only the named levels, merging entries that become identical.
function project(entries: Entry[], only: string[] | undefined): Entry[] {
  if (only === undefined) return entries;
  const kept = new Map<string, Entry>();
  for (const { task, context } of entries) {
    const narrowed = Object.fromEntries(
      Object.entries(context).filter(([name]) => only.includes(name)),
    );
    kept.set(JSON.stringify([task, narrowed]), { task, context: narrowed });
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
