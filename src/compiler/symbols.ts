import type { Diagnostics } from "./diagnostic.js";
import type { StringNode } from "./json.js";

// What types.json and the task files declare, used to check references from
// dimension and override files.
export interface TreeSymbols {
  // Declared custom attribute name -> allowed values (undefined when the
  // declaration itself is invalid, so its uses are not checked again).
  attributes: Map<string, Set<string> | undefined>;
  // Type name -> its states: every value of every group it uses.
  types: Map<string, Set<string>>;
  // Declared state group -> its values (undefined when the declaration is invalid).
  stateGroups: Map<string, Set<string> | undefined>;
  // Type name -> its groups and the values it uses from each. A plain
  // "states" list is one group named "state".
  typeGroups: Map<string, Map<string, Set<string>>>;
  // Type name -> the values an override may add: every value of the groups it
  // uses. Absent for types with a plain "states" list, which may add any.
  addable: Map<string, Set<string>>;
  // Task id -> where it is first defined, as "<file> <path>".
  ids: Map<string, string>;
  // Task id -> its type name, for tasks that name one.
  taskTypes: Map<string, string>;
  // Task id -> ids of its children, including components it includes once
  // includes are resolved.
  children: Map<string, string[]>;
  // Task id -> its parent within its own file (include edges excluded).
  parents: Map<string, string>;
  // Task id -> the attribute/state pairs its own customAttributes set, as keys
  // from valueKey.
  taskValues: Map<string, Set<string>>;
  // Ids of the components in components/.
  components: Set<string>;
  // Every include node, resolved once all task and component files are read.
  includes: IncludeRef[];
  // "states" on include nodes, checked once includes are resolved.
  includeStates: IncludeStateRef[];
  // "<parent>><component>" -> task -> group -> the values it has through
  // that include.
  includeRestrictions: Map<string, Map<string, Map<string, Set<string>>>>;
  // Types whose states their instances' subtrees vary with.
  sharedTypes: Set<string>;
  // Task id -> shared ancestor id -> the states in which the task exists.
  onlyWhen: Map<string, Map<string, Set<string>>>;
  // onlyWhen entries, resolved once every task's ancestors are known.
  onlyWhenRefs: OnlyWhenRef[];
  // "transitions" on tasks, checked once dimensions and overrides are known.
  transitionRefs: TransitionRef[];
  // Task id -> the ids of its valid transitions.
  transitions: Map<string, Set<string>>;
  // Declared check names, and the checks each type requires.
  checks: Set<string>;
  typeChecks: Map<string, Set<string>>;
}

// A dimension's declared values (undefined when invalid) and the ids of every
// task it applies to, subtrees included. scopeComplete is false when appliesTo
// had invalid entries, so scope errors would only be follow-on noise.
export interface DimensionSymbol {
  values: Set<string> | undefined;
  // The value a context means when it leaves this dimension out.
  default?: string;
  // Task id -> the values where it exists, from the dimension's override file.
  only?: Map<string, Set<string>>;
  scope: Set<string>;
  scopeComplete: boolean;
}

// States in effect, and the states an override removed. contested holds states
// that single-dimension overrides both add and remove in this context: a
// combination override may settle them either way.
export interface StateSet {
  states: Set<string>;
  removed: Set<string>;
  contested?: Set<string>;
}

// States an override adds and removes, as applied.
export interface StateChanges {
  add: Set<string>;
  remove: Set<string>;
}

// State changes for types (by name) and tasks (by id) in one context.
export interface ValueStates {
  types: Map<string, StateChanges>;
  tasks: Map<string, StateChanges>;
}

// Dimension value -> state changes.
export type OverrideStates = Map<string, ValueStates>;

// A combination override file's dimensions, and its state changes keyed by
// JSON.stringify of the values in the same order.
export interface CombinationStates {
  dimensions: string[];
  changes: Map<string, ValueStates>;
}

export function valueKey(attribute: string, state: string): string {
  return JSON.stringify([attribute, state]);
}

interface Located {
  node: StringNode;
  path: string;
}

// One valid override of a type or task for one dimension value, with where
// each of its changes is, for reporting conflicts between dimensions.
export interface OverrideEntry {
  // [dimension, value] pairs, sorted by dimension: one for a single-dimension
  // override, several for a combination.
  dimensions: [string, string][];
  file: string;
  diagnostics: Diagnostics;
  kind: "types" | "tasks";
  target: string;
  // By valueKey(attribute, state).
  values: Map<string, Located & { value: string }>;
  added: Map<string, Located>;
  removed: Map<string, Located>;
}

// An { "include": "<component>" } node.
export interface IncludeRef {
  component: StringNode;
  path: string;
  diagnostics: Diagnostics;
  // Id of the task the include is a child of, when that task is valid.
  parent: string | undefined;
  // Id of the root task or component of the file the include is in.
  root: string;
}

// An onlyWhen entry: the task, the ancestor it names, and the listed states.
export interface OnlyWhenRef {
  task: string;
  ancestor: StringNode;
  path: string;
  states: [StringNode, string][];
  diagnostics: Diagnostics;
}

// One task's group values in an include's "states".
export interface IncludeStateRef {
  include: IncludeRef;
  task: StringNode;
  taskPath: string;
  group: StringNode;
  groupPath: string;
  values: [StringNode, string][];
}

// A task's "transitions" list, with where it is.
export interface TransitionRef {
  task: string;
  node: import("./json.js").JsonNode;
  path: string;
  diagnostics: Diagnostics;
}
