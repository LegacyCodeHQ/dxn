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
  // A fixed state: always this one value.
  fixed?: Located;
  // A received state: its value is provided by a type above, wherever this
  // type is placed.
  received?: true;
}

// "when <Dimension> { <value>, ... -> <value> ... }".
export interface Derived {
  dimension: Located;
  branches: { values: Located[]; result: Located }[];
}

// A condition: a state or a dimension has one of these values, or several
// such comparisons, all of which hold, with "and", or one, with "or".
export type Condition =
  | { kind: "compare"; subject: Located; values: Located[] }
  | { kind: "and" | "or"; terms: Condition[] };

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
  // Its states that the types inside it can receive.
  provides: Located[];
  // How its own states change, by name; and what triggers each change.
  actions: Action[];
  triggers: Trigger[];
  // The events it can receive, by name; a parent names one as
  // "<child>.<event>".
  events: Located[];
  // What cannot be told apart: values of one of its states or needs, all of
  // them or some, everywhere or where a condition holds.
  alikes: Alike[];
}

// "alike <state or dimension> [in (<value>, ...)] [when <condition>]".
export interface Alike {
  subject: Located;
  values?: Located[];
  when?: Condition;
}

// An action: a named change of one of a type's own states, from one value to
// another.
export interface Action {
  name: Located;
  state: Located;
  from: Located;
  to: Located;
}

// What can trigger a change: an event the type declares, or a child's by
// its path, or a dimension changing to one of these values.
export type Event =
  | { kind: "named"; name: Located }
  | { kind: "dimension"; dimension: Located; values: Located[] };

// One change a trigger makes: a named action, or a change of a state in place
// to one of its values.
export type Effect =
  | { kind: "action"; name: Located }
  | { kind: "change"; state: Located; to: Located };

// "on <event>: <change>, <change> … [only when <condition>]": what an event
// changes, each change a named action or a change in place.
export interface Trigger extends Located {
  event: Event;
  // What it does, in order: each a named action, its own or a child's by its
  // path, or a change written in place, of one of the type's own states.
  does: Effect[];
  // Where it fires: everywhere, or only where this holds.
  when?: Condition;
}

// A child of a type: its name, its type, and, when it is not always there,
// the state of the type or the dimension it needs that decides where it is:
// a lowercase name is a state, a capitalized one a dimension.
export interface Child extends Located {
  type: Located;
  when?: Condition;
  // The child's states the type sets, each from one of its own states:
  // without a map, both with their values from the same enum; with a map,
  // the child's state takes the value its branch gives for the type's state.
  bindings?: { state: Located; from: Located; map?: { values: Located[]; result: Located }[] }[];
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

// An expectation: a rule the model must follow, by its title, about an
// element in place, or it and every element below it.
export interface Expectation extends Declaration {
  title: string;
  path: Located;
  below: boolean;
  when: { key: Located; value: Located }[];
  assertion: "then" | "some" | "absent";
  // With an event: the assertion is about after it.
  on?: Event;
  values: { key: Located; value: Located }[];
}

export interface Diagnostic {
  // An error makes a file unusable; a warning does not.
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
  column: number;
}

// An actor: who records a record, with context, and is responsible for each
// one it stores. One record each, for now.
export interface Actor extends Declaration {
  records: Located;
}

export interface ParseResult {
  enums: Enum[];
  dimensions: Dimension[];
  types: Type[];
  environments: Environment[];
  profiles: Profile[];
  modifiers: Modifier[];
  records: RecordDeclaration[];
  actors: Actor[];
  expectations: Expectation[];
  diagnostics: Diagnostic[];
}
