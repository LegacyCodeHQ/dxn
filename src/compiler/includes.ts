import { report } from "./shape.js";
import type { IncludeRef, TreeSymbols } from "./symbols.js";

// Resolves include nodes once every task and component file has been read:
// reports unknown components, cycles between components, and pages that
// would bring the same component in twice; then links each valid include
// into the tree, so dimensions, overrides and verification reach through it.
export function resolveIncludes(tree: TreeSymbols, pages: string[]): void {
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

  for (const page of pages) {
    const seen = new Set<string>();
    // entry: the include in the page's own file that brought this part in.
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
            `${JSON.stringify(component)} is already part of ${JSON.stringify(page)}; its tasks would appear twice`,
            at.path,
            at.component,
          );
          continue;
        }
        seen.add(component);
        visit(component, at);
      }
    };
    visit(page, undefined);
  }

  for (const [parent, includes] of byParent) {
    tree.children.set(parent, [
      ...(tree.children.get(parent) ?? []),
      ...includes.map((include) => include.component.value),
    ]);
  }
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
