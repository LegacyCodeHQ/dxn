// What the tree declares, collected while checking tree.json and used to check
// references from dimensions.json and overrides.json.
export interface TreeSymbols {
  // Declared custom attribute name -> allowed values (undefined when the
  // declaration itself is invalid, so its uses are not checked again).
  attributes: Map<string, Set<string> | undefined>;
  // Type name -> its states.
  types: Map<string, Set<string>>;
  // Task id -> path of its first occurrence.
  ids: Map<string, string>;
  // Task id -> its type name, for tasks that name one.
  taskTypes: Map<string, string>;
  // Task id -> ids of its children.
  children: Map<string, string[]>;
}

// Dimension name -> declared values (undefined when invalid) and the ids of
// every task it applies to, subtrees included.
export type DimensionSymbols = Map<string, { values: Set<string> | undefined; scope: Set<string> }>;

// States in effect, and the states an override removed.
export interface StateSet {
  states: Set<string>;
  removed: Set<string>;
}
