// The tree a file of the dxn language parses to. Every name and value
// keeps its line and column, so checks can point at it.

export interface Located {
  name: string;
  line: number;
  column: number;
  length: number;
}

// Syntax retains every tag, including duplicates and unknown names.
// Semantic analysis validates targets and keeps the first valid description
// for a repeated tag. Invalid tags remain located for diagnostics.
export interface DocumentationTag extends Located {
  target?: Located;
  description: string;
}

export interface Documentation {
  description: string;
  tags: DocumentationTag[];
}

// A declaration that did not parse to its end is kept with what was read, so
// its name is known, and marked broken: what it holds may be incomplete, so
// nothing is checked against it.
export interface Declaration extends Located {
  documentation?: Documentation;
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
  documentation?: Documentation;
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

// A branch of a when: "<value>, ... -> <value>", or "else -> <value>", the
// last, for every value the others do not list, with no values of its own and
// where its "else" is written.
export interface Branch {
  values: Located[];
  result: Located;
  otherwise?: Located;
}

// "when <Dimension> { <value>, ... -> <value> ... }".
export interface Derived {
  dimension: Located;
  branches: Branch[];
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
  // Its lists of several members, each a tagged union: one or more rows,
  // each one of its members, which are among its children.
  unions: Union[];
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
  // A list: one or more of its type, each in any of its looks; none is the
  // list not there.
  list?: true;
  // A member of a list of several: the list's name. The member is a child of
  // the type, named "<list>.<tag>", its tag as written its short name.
  member?: string;
  short?: string;
  when?: Condition;
  // The child's states the type sets, each from one of its own states:
  // without a map, both with their values from the same enum; with a map,
  // the child's state takes the value its branch gives for the type's state.
  bindings?: Binding[];
}

// A list of several members: its name, as written, and its members, in order.
export interface Union extends Located {
  members: Child[];
}

// The child of a type a path names from one of its parts on: by its name, or,
// for a member of a list, by the list's and its tag, "<list>.<tag>"; and the
// part after it.
export function childAt(
  type: Type,
  parts: string[],
  at: number,
): { child: Child; next: number } | undefined {
  const one = type.children.find(({ name }) => name === parts[at]);
  if (one !== undefined) return { child: one, next: at + 1 };
  if (at + 1 >= parts.length) return undefined;
  const named = `${parts[at]}.${parts[at + 1]}`;
  const two = type.children.find(({ name, member }) => member !== undefined && name === named);
  return two === undefined ? undefined : { child: two, next: at + 2 };
}

// A child's state the type sets: from one of its own states, or a dimension;
// mapped by a when; or fixed to one of the child's state's values.
export interface Binding {
  state: Located;
  from: Located;
  map?: Branch[];
}

// Whether a binding fixes its child's state to one of that state's values:
// a lowercase name, with no when, that is not a state of the type.
export function fixes(type: Type, { from, map }: Binding): boolean {
  return (
    map === undefined &&
    /^[a-z]/.test(from.name) &&
    !type.states.some(({ name }) => name === from.name)
  );
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
  derived?: { on: Located; branches: Branch[] };
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

// An actor: who records a record, which it gives a context, and is responsible for each
// one it stores. One record each, for now.
export interface Actor extends Declaration {
  records: Located;
}

// The common data shape at every stage. Phase markers below exist only in
// types: no tags or symbols are written onto a source file at runtime.
export interface SourceFile {
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

declare const sourceStage: unique symbol;

// Optional markers keep structurally constructed files compatible while
// distinguishing the results returned by the language's own entry points.
export interface SyntaxResult extends SourceFile {
  readonly [sourceStage]?: "syntax";
}

// Readers of resolved names also accept the completed analysis result. A
// resolved file may still have errors; evaluation keeps its runtime guards.
export interface ResolvedResult extends SourceFile {
  readonly [sourceStage]?: "resolved" | "analyzed";
}

// Analysis is complete, including diagnostics; this does not mean error-free.
export interface ParseResult extends ResolvedResult {
  readonly [sourceStage]?: "analyzed";
}
