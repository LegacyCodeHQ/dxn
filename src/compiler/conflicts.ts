import { report } from "./shape.js";
import type { DimensionSymbol, OverrideEntry, TreeSymbols } from "./symbols.js";

// Reports overrides that disagree in a context where both apply.
//
// Precedence, weakest first: type overrides, then the instance's own values,
// then instance overrides; within each, an override over more dimensions beats
// one over fewer. So only two equally specific overrides of the same kind can
// conflict, and only when nothing stronger settles every context they share.
export function checkConflicts(
  entries: OverrideEntry[],
  tree: TreeSymbols,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): void {
  for (const [index, first] of entries.entries()) {
    for (const second of entries.slice(index + 1)) {
      if (
        first.kind !== second.kind ||
        first.target !== second.target ||
        first.dimensions.length !== second.dimensions.length
      ) {
        continue;
      }
      const shared = union(first.dimensions, second.dimensions);
      if (shared === undefined) {
        continue;
      }
      const inScope = (id: string) =>
        shared.every(([name]) => dimensions.get(name)?.symbol.scope.has(id) === true);
      const affected =
        first.kind === "tasks"
          ? [first.target].filter(inScope)
          : [...tree.taskTypes]
              .filter(([id, type]) => type === first.target && inScope(id))
              .map(([id]) => id);
      if (affected.length === 0) {
        continue;
      }
      // Overrides that apply in every context both do.
      const covering = entries.filter((entry) =>
        entry.dimensions.every(([name, value]) =>
          shared.some(([sharedName, sharedValue]) => sharedName === name && sharedValue === value),
        ),
      );
      const stronger = (has: (entry: OverrideEntry) => boolean) =>
        covering.some(
          (entry) =>
            entry.kind === first.kind &&
            entry.target === first.target &&
            entry.dimensions.length > first.dimensions.length &&
            has(entry),
        );
      // For type overrides: whether some affected instance leaves this to the types.
      const unsettled = (settles: (id: string) => boolean) =>
        first.kind === "tasks" || affected.some((id) => !settles(id));
      const against = (what: string) =>
        `conflicts with ${describe(first.dimensions)}, which ${what} (${first.file}); ` +
        `both apply when ${describe(shared)}`;

      for (const [key, other] of second.values) {
        const mine = first.values.get(key);
        if (mine === undefined || mine.value === other.value) {
          continue;
        }
        const settles = (id: string) =>
          tree.taskValues.get(id)?.has(key) === true ||
          covering.some(
            (entry) => entry.kind === "tasks" && entry.target === id && entry.values.has(key),
          );
        if (!stronger((entry) => entry.values.has(key)) && unsettled(settles)) {
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
      if (first.kind !== "tasks") {
        continue;
      }
      for (const [changes, opposite, verb] of [
        [second.added, first.removed, "removes"],
        [second.removed, first.added, "adds"],
      ] as const) {
        for (const [state, located] of changes) {
          const settled = (entry: OverrideEntry) =>
            entry.added.has(state) || entry.removed.has(state);
          if (opposite.has(state) && !stronger(settled)) {
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

// The dimension values of both overrides together, or undefined when they
// give one dimension different values and so never apply together.
function union(
  first: [string, string][],
  second: [string, string][],
): [string, string][] | undefined {
  const merged = new Map(first);
  for (const [name, value] of second) {
    const existing = merged.get(name);
    if (existing !== undefined && existing !== value) {
      return undefined;
    }
    merged.set(name, value);
  }
  if (merged.size === first.length) {
    // Same dimensions and values: the same override, not two.
    return undefined;
  }
  return [...merged].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function describe(pairs: [string, string][]): string {
  return pairs.map(([name, value]) => `${name}=${value}`).join(" and ");
}
