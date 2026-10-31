// The tree a file of the dxn language parses to. Every name and value
// keeps its line and column, so checks can point at it.

export interface Located {
  name: string;
  line: number;
  column: number;
}

// A declaration that did not parse to its end is kept with what was read, so
// its name is known, and marked broken: what it holds may be incomplete, so
// nothing is checked against it.
export interface Declaration extends Located {
  broken?: true;
  // For a declaration inside a type: the type it is in, by its full name. Its
  // own name is then its full name, "<Type>.<Name>", and short its name as
  // written.
  scope?: string;
  short?: string;
}

export interface Enum extends Declaration {
  values: Located[];
}

// A state of a type: its name, and the enum its values come from.
export interface State extends Located {
  enum: Located;
  // A derived state: its value decided by a dimension's value, one branch
  // for each group of the dimension's values.
  derived?: Derived;
}

// "when <Dimension> { <value>, ... -> <value> ... }".
export interface Derived {
  dimension: Located;
  branches: { values: Located[]; result: Located }[];
}

// A condition on a dimension: it has one of these values.
export interface Condition {
  dimension: Located;
  values: Located[];
}

// A rule: the state's value exists only when the condition holds.
export interface Rule {
  state: Located;
  value: Located;
  when: Condition;
}

export interface Type extends Declaration {
  // The dimensions it depends on, which something else provides.
  needs: Located[];
  states: State[];
  rules: Rule[];
  // The enums and types declared inside it, seen from inside by their names
  // and from outside by "<Type>.<Name>".
  enums: Enum[];
  types: Type[];
  // The elements it contains.
  children: Child[];
}

// A child of a type: its name, its type, and, when it is not always there,
// the state of the type or the dimension it needs that decides where it is:
// a lowercase name is a state, a capitalized one a dimension.
export interface Child extends Located {
  type: Located;
  when?: { on: Located; values: Located[] };
  // The child's states the type sets, each from one of its own states, whose
  // values come from the same enum.
  bindings?: { state: Located; from: Located }[];
}

// An environment: a product of dimensions, whose instances are profiles.
export interface Environment extends Declaration {
  dimensions: Located[];
}

// One dimension's value in a profile.
export interface Assignment {
  dimension: Located;
  value: Located;
}

// A profile: an instance of an environment, giving each of its dimensions a
// value.
export interface Profile extends Declaration {
  environment: Located;
  values: Assignment[];
}

// A modifier: an accessory that fits some profiles and sets some of their
// dimensions, making a profile "<profile>+<modifier>" for each.
export interface Modifier extends Declaration {
  on: Located[];
  values: Assignment[];
}

// A dimension: what the environment varies by, with its own values. Its
// values cascade down the tree, which an enum's do not.
export type Dimension = Enum;

// A field of a record: its name, and the enum or record its value is.
export interface Field extends Located {
  type: Located;
  // A derived field: its value decided by another field's, which is not
  // stored, one branch for each group of that field's values.
  derived?: { on: Located; branches: { values: Located[]; result: Located }[] };
}

// A record: plain data, a named group of typed fields, every one of which is
// given.
export interface RecordDeclaration extends Declaration {
  // Whether it is a fact about one combination of a type: each stored one
  // then has a context, which its fields do not list.
  context: boolean;
  fields: Field[];
}

export interface Diagnostic {
  // An error makes a file unusable; a warning does not.
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  enums: Enum[];
  dimensions: Dimension[];
  types: Type[];
  environments: Environment[];
  profiles: Profile[];
  modifiers: Modifier[];
  records: RecordDeclaration[];
  diagnostics: Diagnostic[];
}
