// The tree a file of the dimensions language parses to. Every name and value
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
}

export interface Enum extends Declaration {
  values: Located[];
}

// A state of a type: its name, and the enum its values come from.
export interface State extends Located {
  enum: Located;
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
  states: State[];
  rules: Rule[];
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

// A dimension: what the environment varies by, with its own values. Its
// values cascade down the tree, which an enum's do not.
export type Dimension = Enum;

export interface Diagnostic {
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
  diagnostics: Diagnostic[];
}
