import { report } from "./shape.js";
import type { IncludeRef, TreeSymbols } from "./symbols.js";

// Resolves includes once every root and component file has been read:
// reports unknown components, cycles between components, and roots that
// would bring the same component in twice; then links each valid include
// into the tree, so dimensions, overrides and verification reach through it.
export function resolveIncludes(tree: TreeSymbols, roots: string[]): void {
  const known = tree.includes.filter((include) => {
    if (tree.components.has(include.component.value)) {
      return true;
    }
    report(
      include.diagnostics,
      "unknown-component",
      `no components/${include.component.value}.json defines this component`,
      include.path,
      include.component,
    );
    return false;
  });

  const cyclic = new Set(known.filter((include) => onCycle(known, include)));
  for (const include of cyclic) {
    report(
      include.diagnostics,
      "include-cycle",
      `including ${JSON.stringify(include.component.value)} here leads back to ${JSON.stringify(include.root)}`,
      include.path,
      include.component,
    );
  }
  const usable = known.filter((include) => !cyclic.has(include));

  const byParent = new Map<string, IncludeRef[]>();
  for (const include of usable) {
    if (include.parent !== undefined) {
      byParent.set(include.parent, [...(byParent.get(include.parent) ?? []), include]);
    }
  }

  for (const root of roots) {
    const seen = new Set<string>();
    // entry: the include in the root's own file that brought this part in.
    const visit = (id: string, entry: IncludeRef | undefined): void => {
      for (const child of tree.children.get(id) ?? []) {
        visit(child, entry);
      }
      for (const include of byParent.get(id) ?? []) {
        const component = include.component.value;
        const at = entry ?? include;
        if (seen.has(component)) {
          report(
            at.diagnostics,
            "duplicate-include",
            `${JSON.stringify(component)} is already part of ${JSON.stringify(root)}; its nodes would appear twice`,
            at.path,
            at.component,
          );
          continue;
        }
        seen.add(component);
        visit(component, at);
      }
    };
    visit(root, undefined);
  }

  for (const [parent, includes] of byParent) {
    tree.children.set(parent, [
      ...(tree.children.get(parent) ?? []),
      ...includes.map((include) => include.component.value),
    ]);
  }

  checkIncludeStates(tree, new Set(usable));
}

// Checks each include's "states": a node in the included component, a group
// its type uses, and values of that group. Valid ones become restrictions.
function checkIncludeStates(tree: TreeSymbols, usable: Set<IncludeRef>): void {
  for (const ref of tree.includeStates) {
    const { include } = ref;
    if (!usable.has(include) || include.parent === undefined) continue;
    const component = include.component.value;
    const node = JSON.stringify(ref.node.value);
    if (!within(tree, component, ref.node.value)) {
      report(
        include.diagnostics,
        "node-outside-include",
        `node ${node} is not in the included component ${JSON.stringify(component)}`,
        ref.nodePath,
        ref.node,
      );
      continue;
    }
    const type = tree.nodeTypes.get(ref.node.value);
    const values = type === undefined ? undefined : tree.typeGroups.get(type)?.get(ref.group.value);
    if (values === undefined) {
      report(
        include.diagnostics,
        "unknown-state-group",
        `node ${node} has no state group ${JSON.stringify(ref.group.value)}`,
        ref.groupPath,
        ref.group,
      );
      continue;
    }
    const allowed = new Set<string>();
    for (const [value, valuePath] of ref.values) {
      if (!values.has(value.value)) {
        report(
          include.diagnostics,
          "unknown-state",
          `${JSON.stringify(value.value)} is not in node ${node}'s ${JSON.stringify(ref.group.value)} group`,
          valuePath,
          value,
        );
        continue;
      }
      allowed.add(value.value);
    }
    const key = `${include.parent}>${component}`;
    const byNode = tree.includeRestrictions.get(key) ?? new Map<string, Map<string, Set<string>>>();
    const byGroup = byNode.get(ref.node.value) ?? new Map<string, Set<string>>();
    byGroup.set(ref.group.value, allowed);
    byNode.set(ref.node.value, byGroup);
    tree.includeRestrictions.set(key, byNode);
  }
}

// Whether a node is in a component's subtree, through includes.
function within(tree: TreeSymbols, root: string, id: string, seen = new Set<string>()): boolean {
  if (root === id) return true;
  if (seen.has(root)) return false;
  seen.add(root);
  return (tree.children.get(root) ?? []).some((child) => within(tree, child, id, seen));
}

// Whether the component an include brings in leads back to the component
// the include is written in.
function onCycle(includes: IncludeRef[], start: IncludeRef): boolean {
  const seen = new Set<string>();
  const pending = [start.component.value];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (current === start.root) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const include of includes) {
      if (include.root === current) {
        pending.push(include.component.value);
      }
    }
  }
  return false;
}
