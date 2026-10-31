import type { Diagnostics, StringNode } from "@legacycodehq/dxn-language";

// What types.json and the root and fragment files declare, used to check references from
// dimension and override files.
export interface TreeSymbols {
  // Declared attribute name -> allowed values (undefined when the
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
  // Node id -> where it is first defined, as "<file> <path>".
  ids: Map<string, string>;
  // Node id -> its type name, for nodes that name one.
  nodeTypes: Map<string, string>;
  // Node id -> ids of its children, including fragments it includes once
  // includes are resolved.
  children: Map<string, string[]>;
  // Node id -> its parent within its own file (include edges excluded).
  parents: Map<string, string>;
  // Node id -> the attribute/state pairs its own attributes set, as keys
  // from valueKey.
  nodeValues: Map<string, Set<string>>;
  // Ids of the fragments in fragments/.
  fragments: Set<string>;
  // Every include node, resolved once all node and fragment files are read.
  includes: IncludeRef[];
  // "states" on includes, checked once includes are resolved.
  includeStates: IncludeStateRef[];
  // "<parent>><fragment>" -> node -> group -> the values it has through
  // that include.
  includeRestrictions: Map<string, Map<string, Map<string, Set<string>>>>;
  // Types whose states their instances' subtrees vary with.
  sharedTypes: Set<string>;
  // Node id -> shared ancestor id -> the states in which the node exists.
  onlyWhen: Map<string, Map<string, Set<string>>>;
  // onlyWhen entries, resolved once every node's ancestors are known.
  onlyWhenRefs: OnlyWhenRef[];
  // "transitions" on nodes, checked once dimensions and overrides are known.
  transitionRefs: TransitionRef[];
  // Node id -> the ids of its valid transitions.
  transitions: Map<string, Set<string>>;
  // Declared check names, and the checks each type requires.
  checks: Set<string>;
  typeChecks: Map<string, Set<string>>;
}

// A dimension's declared values (undefined when invalid) and the ids of every
// node it applies to, subtrees included. scopeComplete is false when appliesTo
// had invalid entries, so scope errors would only be follow-on noise.
export interface DimensionSymbol {
  values: Set<string> | undefined;
  // The value a context means when it leaves this dimension out.
  default?: string;
  // Node id -> the values where it exists, from the dimension's override file.
  only?: Map<string, Set<string>>;
  scope: Set<string>;
  scopeComplete: boolean;
  // For the overrides of a shared node's states: that node's id. Its states
  // are the values, and its scope is what is below it.
  shared?: string;
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

// State changes for types (by name) and nodes (by id) in one context.
export interface ValueStates {
  types: Map<string, StateChanges>;
  nodes: Map<string, StateChanges>;
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
  item: StringNode;
  path: string;
}

// One valid override of a type or node for one dimension value, with where
// each of its changes is, for reporting conflicts between dimensions.
export interface OverrideEntry {
  // [dimension, value] pairs, sorted by dimension: one for a single-dimension
  // override, several for a combination.
  dimensions: [string, string][];
  file: string;
  diagnostics: Diagnostics;
  kind: "types" | "nodes";
  target: string;
  // By valueKey(attribute, state).
  values: Map<string, Located & { value: string }>;
  added: Map<string, Located>;
  removed: Map<string, Located>;
}

// An { "include": "<fragment>" } node.
export interface IncludeRef {
  fragment: StringNode;
  path: string;
  diagnostics: Diagnostics;
  // Id of the node the include is a child of, when that node is valid.
  parent: string | undefined;
  // Id of the root or fragment of the file the include is in.
  root: string;
}

// An onlyWhen entry: the node, the ancestor it names, and the listed states.
export interface OnlyWhenRef {
  node: string;
  ancestor: StringNode;
  path: string;
  states: [StringNode, string][];
  diagnostics: Diagnostics;
}

// One node's group values in an include's "states".
export interface IncludeStateRef {
  include: IncludeRef;
  node: StringNode;
  nodePath: string;
  group: StringNode;
  groupPath: string;
  values: [StringNode, string][];
}

// A node's "transitions" list, with where it is.
export interface TransitionRef {
  node: string;
  item: import("@legacycodehq/dxn-language").JsonNode;
  path: string;
  diagnostics: Diagnostics;
}
