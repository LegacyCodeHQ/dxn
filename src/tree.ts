// The project model: what compileDirectory returns for a valid directory.

// Custom attribute name -> state -> value.
export type CustomAttributeValues = Record<string, Record<string, string>>;

export interface CustomAttributeDeclaration {
  values: string[];
}

export interface TypeDefinition {
  states?: string[];
  // State groups the type uses: whole groups, or group -> the values it uses.
  stateGroups?: string[] | Record<string, string[]>;
  // Whether instances' subtrees vary with the instance's state.
  shared?: boolean;
  // Declared checks every instance must pass, in every context.
  checks?: string[];
  customAttributes?: CustomAttributeValues;
}

export interface TreeNode {
  id: string;
  title: string;
  type?: string;
  // Shared ancestor id -> the states in which this node exists.
  onlyWhen?: Record<string, string[]>;
  // How this shared node's state changes.
  transitions?: Transition[];
  children?: Child[];
  customAttributes?: CustomAttributeValues;
}

// A change of a shared node's state on a DOM event.
export interface Transition {
  id: string;
  from: string;
  to: string;
  on: "click" | "keydown" | "pointerdown" | "resize";
  // keydown: the key, as KeyboardEvent.key names it.
  key?: string;
  // click and pointerdown: the node the event happens on.
  target?: string;
  // pointerdown: the node the event happens outside of.
  outside?: string;
  // resize: the dimension values it changes to.
  when?: Record<string, string[]>;
  // Where keyboard focus ends up.
  focus?: string;
}

// Brings a fragment's subtree in at this position.
export interface Include {
  include: string;
  // Node in the fragment -> state group -> the only values it has here.
  states?: Record<string, Record<string, string[]>>;
}

export type Child = TreeNode | Include;

export function isInclude(item: Child): item is Include {
  return "include" in item;
}

// types.json
export interface TypesFile {
  version: number;
  // Named groups of independent states, such as interaction and selection.
  stateGroups?: Record<string, string[]>;
  customAttributes?: Record<string, CustomAttributeDeclaration>;
  // Declared checks, each an empty object for now.
  customChecks?: Record<string, Record<string, never>>;
  types?: Record<string, TypeDefinition>;
}

// roots/<id>.json
export interface RootFile {
  version: number;
  root: TreeNode;
}

// fragments/<id>.json
export interface FragmentFile {
  version: number;
  fragment: TreeNode;
}

// dimensions/<name>.json
export interface DimensionFile {
  version: number;
  values: string[];
  // The value a context means when it leaves this dimension out.
  default?: string;
  appliesTo: string[];
}

export interface Override {
  states?: { add?: string[]; remove?: string[] };
  customAttributes?: CustomAttributeValues;
}

// overrides/<dimension>.json: dimension value -> overrides of types and nodes.
export interface OverridesFile {
  version: number;
  // Node id -> the values where the node and its subtree exist.
  only?: Record<string, string[]>;
  overrides: Record<string, { types?: Record<string, Override>; nodes?: Record<string, Override> }>;
}

// The overrides for one context.
export interface ValueOverrides {
  types?: Record<string, Override>;
  nodes?: Record<string, Override>;
}

// Values of the next dimension -> deeper levels, then ValueOverrides once
// every dimension has a value.
export interface NestedOverrides {
  [value: string]: NestedOverrides | ValueOverrides;
}

// overrides/<a>+<b>.json: overrides for combinations of dimension values,
// nested in the order the file name lists the dimensions.
export interface CombinationOverridesFile {
  version: number;
  overrides: NestedOverrides;
}

export interface VerificationRecord {
  node: string;
  // The state (when the node has states) and a value for every dimension that
  // applies to the node; or, instead, one of the node's transitions.
  context?: Record<string, string>;
  transition?: string;
  check: string;
  result: "passed" | "failed";
  by: string;
  // ISO 8601 date and time with a time zone.
  at: string;
  evidence?: string;
}

// verification/<root-id>.json: records for nodes in that root's subtree.
export interface VerificationFile {
  version: number;
  records: VerificationRecord[];
}

export interface Project {
  types: TypesFile;
  // Reusable fragments, in file name order.
  fragments: TreeNode[];
  // Roots, in root file name order.
  roots: TreeNode[];
  // By dimension name.
  dimensions: Record<string, DimensionFile>;
  overrides: Record<string, OverridesFile>;
  // By file name, e.g. "breakpoint+pointer".
  combinations: Record<string, CombinationOverridesFile>;
  // By root id.
  verification: Record<string, VerificationFile>;
}

// Finds a node by id among the given trees. Includes are skipped: an
// included node is found by searching the fragments as well.
export function findNode(nodes: Child[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (isInclude(node)) {
      continue;
    }
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children ?? [], id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
