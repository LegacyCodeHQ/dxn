// What types.json and the task files declare, used to check references from
// dimension and override files.
export interface TreeSymbols {
  // Declared custom attribute name -> allowed values (undefined when the
  // declaration itself is invalid, so its uses are not checked again).
  attributes: Map<string, Set<string> | undefined>;
  // Type name -> its states.
  types: Map<string, Set<string>>;
  // Task id -> where it is first defined, as "<file> <path>".
  ids: Map<string, string>;
  // Task id -> its type name, for tasks that name one.
  taskTypes: Map<string, string>;
  // Task id -> ids of its children.
  children: Map<string, string[]>;
  // Declared check names, and the checks each type requires.
  checks: Set<string>;
  typeChecks: Map<string, Set<string>>;
}

// A dimension's declared values (undefined when invalid) and the ids of every
// task it applies to, subtrees included. scopeComplete is false when appliesTo
// had invalid entries, so scope errors would only be follow-on noise.
export interface DimensionSymbol {
  values: Set<string> | undefined;
  scope: Set<string>;
  scopeComplete: boolean;
}

// States in effect, and the states an override removed.
export interface StateSet {
  states: Set<string>;
  removed: Set<string>;
}

// States an override adds and removes, as applied.
export interface StateChanges {
  add: Set<string>;
  remove: Set<string>;
}

// Dimension value -> state changes for types (by name) and tasks (by id).
export type OverrideStates = Map<
  string,
  { types: Map<string, StateChanges>; tasks: Map<string, StateChanges> }
>;
