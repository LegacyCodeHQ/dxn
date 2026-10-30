import { report } from "./shape.js";
import type { DimensionSymbol, OverrideEntry, TreeSymbols } from "./symbols.js";

// Reports overrides from two dimensions that disagree in a context where both
// apply. An instance's own values and overrides beat type overrides from any
// dimension, so a type-level disagreement only counts when some instance in
// both scopes does not settle it itself.
export function checkConflicts(
  entries: OverrideEntry[],
  tree: TreeSymbols,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): void {
  const taskEntry = (id: string, dimension: string, value: string) =>
    entries.find(
      (entry) =>
        entry.kind === "tasks" &&
        entry.target === id &&
        entry.dimension === dimension &&
        entry.value === value,
    );

  for (const [index, first] of entries.entries()) {
    for (const second of entries.slice(index + 1)) {
      if (
        first.dimension === second.dimension ||
        first.kind !== second.kind ||
        first.target !== second.target
      ) {
        continue;
      }
      const both = (id: string) =>
        [first, second].every(
          (entry) => dimensions.get(entry.dimension)?.symbol.scope.has(id) === true,
        );
      const affected =
        first.kind === "tasks"
          ? [first.target].filter(both)
          : [...tree.taskTypes]
              .filter(([id, type]) => type === first.target && both(id))
              .map(([id]) => id);
      // For type overrides: whether some affected instance leaves this to the types.
      const unsettled = (settles: (id: string) => boolean) =>
        first.kind === "tasks" ? affected.length > 0 : affected.some((id) => !settles(id));
      const where = `both apply when ${first.dimension}=${first.value} and ${second.dimension}=${second.value}`;
      const against = (what: string) =>
        `conflicts with ${first.dimension}=${first.value}, which ${what} (${first.file}); ${where}`;

      for (const [key, other] of second.values) {
        const mine = first.values.get(key);
        if (mine === undefined || mine.value === other.value) {
          continue;
        }
        const settles = (id: string) =>
          tree.taskValues.get(id)?.has(key) === true ||
          [first, second].some(
            (entry) => taskEntry(id, entry.dimension, entry.value)?.values.has(key) === true,
          );
        if (unsettled(settles)) {
          report(
            second.diagnostics,
            "conflicting-override",
            against(`sets ${JSON.stringify(mine.value)}`),
            other.path,
            other.node,
          );
        }
      }

      // Only task overrides can disagree about a state: each file checks type
      // overrides against the type's base states, so one type override cannot
      // remove a state another adds.
      if (first.kind !== "tasks" || affected.length === 0) {
        continue;
      }
      for (const [changes, opposite, verb] of [
        [second.added, first.removed, "removes"],
        [second.removed, first.added, "adds"],
      ] as const) {
        for (const [state, located] of changes) {
          if (opposite.has(state)) {
            report(
              second.diagnostics,
              "conflicting-override",
              against(`${verb} state ${JSON.stringify(state)}`),
              located.path,
              located.node,
            );
          }
        }
      }
    }
  }
}
