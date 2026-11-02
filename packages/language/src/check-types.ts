import type {
  Child,
  Condition,
  Derived,
  Effect,
  Event,
  Located,
  ParseResult,
  Rule,
  State,
  Trigger,
  Type,
} from "./ast.js";
import { childAt, fixes } from "./ast.js";
import { checkChosen, checkWhen, type Report } from "./check-values.js";
import { comparisons, conditionText, coverage, subjects } from "./condition.js";
import { message, words } from "./message.js";
import { among, enumOf, type Names } from "./names.js";

// What checking a file's types needs at hand: the file, its names, and where
// to report a problem.
interface Context extends Report {
  file: ParseResult;
  names: Names;
}

// One type being checked: the dimensions it needs, and the needs to declare
// in a message when it does not need one it uses.
interface TypeContext extends Context {
  type: Type;
  needed: Set<string>;
  declare: string;
}

// What a trigger changes, named or written in place: its state, from which
// values, to which, and how it reads in messages.
type Change = { label: string; state: string; from: string[]; to: string; named: boolean };

// One change a trigger makes, with the path of the child whose state it
// changes ("" for the type's own) and where it is written.
type Found = { change: Change; path: string; at: Located };

// A change a trigger makes, with the trigger that makes it.
type Triggered = { trigger: Trigger; change: Change; path: string };

// Each type, in turn: its needs, each a dimension, once, and none that has no
// effect; its states; its rules, each on a state of the type and one of its
// values, under needed dimensions, and none that makes a state depend on
// itself; what is alike in it; its children; its events, actions and
// triggers; and the states it provides. Problems are reported in that order.
export function checkTypes(file: ParseResult, names: Names, report: Report): void {
  const context: Context = { file, names, ...report };
  for (const type of file.types) {
    const needed = checkNeeds(context, type);
    const checking: TypeContext = {
      ...context,
      type,
      needed,
      declare: declare(context, type, needed),
    };
    if (!type.broken) checkUnusedNeeds(checking);
    checkStates(checking);
    checkRules(checking);
    checkRuleCycles(checking);
    checkAlikes(checking);
    checkChildren(checking);
    checkMembers(checking);
    checkActions(checking);
    checkProvides(checking);
  }
}

// A type's needs: each a dimension, once. The dimensions it needs.
function checkNeeds({ names, error }: Context, type: Type): Set<string> {
  const needed = new Set<string>();
  for (const need of type.needs) {
    if (!names.is(need.name, "dimension")) {
      error("unknown-dimension", names.not(need.name, "dimension"), need);
    } else if (needed.has(need.name)) {
      error("duplicate-dimension", message`${need.name} is already a need of ${type.name}`, need);
    }
    needed.add(need.name);
  }
  return needed;
}

// The needs a type should declare, as a declaration: those that are
// dimensions, and those its rules, derived states, children, events and
// alikes use, in the order first used.
function declare({ names }: Context, type: Type, needed: Set<string>): string {
  const used = [
    ...new Set(
      [
        ...type.rules.flatMap(({ when }) => subjects(when).map(({ name }) => name)),
        ...type.states.flatMap(({ derived }) => (derived ? [derived.dimension.name] : [])),
        ...type.children.flatMap(({ when }) =>
          when ? subjects(when).map(({ name }) => name) : [],
        ),
        ...type.triggers.flatMap(({ event }) =>
          event.kind === "dimension" ? [event.dimension.name] : [],
        ),
        ...type.triggers.flatMap(({ when }) =>
          when === undefined ? [] : subjects(when).map(({ name }) => name),
        ),
        ...type.alikes.flatMap(({ subject, when }) => [
          subject.name,
          ...(when === undefined ? [] : subjects(when).map(({ name }) => name)),
        ]),
      ].filter((name) => names.is(name, "dimension")),
    ),
  ];
  return `type ${type.name} needs ${[
    ...new Set([...[...needed].filter((name) => names.is(name, "dimension")), ...used]),
  ].join(", ")}`;
}

// A need tells the type's combinations apart unless it is alike throughout;
// one alike throughout that nothing else uses has no effect, and is a
// warning.
function checkUnusedNeeds({ names, warn, type }: TypeContext): void {
  const alikeThroughout = (name: string) =>
    type.alikes.some(
      ({ subject, values, when }) =>
        subject.name === name && values === undefined && when === undefined,
    );
  const usedElsewhere = (name: string) =>
    [
      ...type.rules.map(({ when }) => when),
      ...type.children.flatMap(({ when }) => (when === undefined ? [] : [when])),
      ...type.alikes.flatMap(({ when }) => (when === undefined ? [] : [when])),
      ...type.triggers.flatMap(({ when }) => (when === undefined ? [] : [when])),
    ].some((when) => subjects(when).some((subject) => subject.name === name)) ||
    type.states.some(({ derived }) => derived?.dimension.name === name) ||
    type.triggers.some(({ event }) => event.kind === "dimension" && event.dimension.name === name);
  for (const need of type.needs) {
    if (
      names.is(need.name, "dimension") &&
      alikeThroughout(need.name) &&
      !usedElsewhere(need.name)
    ) {
      warn(
        "unused-need",
        message`${type.name} needs ${need.name}, but nothing in it uses it, and it is alike throughout`,
        need,
      );
    }
  }
}

// A type's states: each once, its values from an enum; a derived one's when
// checked, and a fixed one's value one of its enum's.
function checkStates(checking: TypeContext): void {
  const { names, error, type } = checking;
  const seen = new Set<string>();
  for (const state of type.states) {
    if (seen.has(state.name)) {
      error("duplicate-state", message`${state.name} is already a state of ${type.name}`, state);
    }
    seen.add(state.name);
    if (!names.is(state.enum.name, "enum")) {
      error("unknown-enum", names.not(state.enum.name, "enum"), state.enum);
    }
    if (state.derived !== undefined) checkDerived(checking, state);
    if (state.fixed !== undefined) {
      const values = names.values(state.enum.name);
      if (values !== undefined && !values.includes(state.fixed.name)) {
        error(
          "unknown-value",
          message`${state.fixed.name} is not a value of ${state.name} (${values})`,
          state.fixed,
        );
      }
    }
  }
}

// A derived state: on a dimension the type needs, covering each of its
// values once, each branch giving a value of the state's enum.
function checkDerived(checking: TypeContext, state: State): void {
  const { names } = checking;
  const { dimension, branches } = state.derived as Derived;
  const known = subjectOf(checking, dimension, false) !== undefined;
  // A dimension that is not one has no values to check the branches against.
  checkWhen(
    branches,
    dimension,
    { name: dimension.name, values: known ? names.values(dimension.name) : undefined },
    { name: state.name, values: names.values(state.enum.name) },
    checking,
  );
}

// A type's rules: each on a state the type sets, with one of its values,
// one rule for each state value, and its condition checked.
function checkRules(checking: TypeContext): void {
  const { file, names, error, type } = checking;
  const conditioned = new Map<string, Rule>();
  for (const rule of type.rules) {
    const start = file.diagnostics.length;
    const state = stateOf(checking, type, rule.state);
    const why = state === undefined ? undefined : decidedBy(state);
    if (state !== undefined && why !== undefined) {
      error(
        "rule-on-derived",
        message`${state.name} ${words(why)}; it cannot also have a rule`,
        rule.state,
      );
    }
    const values = state === undefined ? undefined : names.values(state.enum.name);
    if (values !== undefined && !values.includes(rule.value.name)) {
      error(
        "unknown-value",
        message`${rule.value.name} is not a value of ${rule.state.name} (${values})`,
        rule.value,
      );
    }
    const key = `${rule.state.name}=${rule.value.name}`;
    const earlier = conditioned.get(key);
    if (earlier !== undefined) {
      // Both, as one condition: an "and" of each, an "and" inside not in
      // brackets.
      const both: Condition = {
        kind: "and",
        terms: [earlier.when, rule.when].flatMap((when) =>
          when.kind === "and" ? when.terms : [when],
        ),
      };
      error(
        "duplicate-rule",
        message`${`${rule.state.name} = ${rule.value.name}`} already has a condition at line ${earlier.state.line}; join them in one: ${`${rule.state.name} = ${rule.value.name} only when ${conditionText(both)}`}`,
        rule.state,
      );
    } else {
      conditioned.set(key, rule);
    }
    checkCondition(
      checking,
      rule.when,
      rule.state,
      { never: message`${rule.value.name} exists nowhere`, always: "the rule restricts nothing" },
      start,
    );
  }
}

// No state depends on itself, through its rules' conditions on other
// states: each dependency is reported where it would close a cycle.
function checkRuleCycles({ error, type }: TypeContext): void {
  const depends = new Map<string, string[]>();
  const path = (from: string, to: string, seen = new Set<string>()): string[] | undefined => {
    if (from === to) return [to];
    if (seen.has(from)) return undefined;
    seen.add(from);
    for (const next of depends.get(from) ?? []) {
      const rest = path(next, to, seen);
      if (rest !== undefined) return [from, ...rest];
    }
    return undefined;
  };
  for (const rule of type.rules) {
    for (const subject of subjects(rule.when)) {
      if (!type.states.some(({ name }) => name === subject.name)) continue;
      const back = path(subject.name, rule.state.name);
      if (back !== undefined) {
        const chain = [rule.state.name, ...back];
        const said = chain
          .slice(1)
          .map((name, index) =>
            index === 0 ? message` depends on ${name}` : message`, which depends on ${name}`,
          )
          .join("");
        error(
          "rule-cycle",
          message`${chain[0]}${words(said)}; no state can depend on itself`,
          subject,
        );
        continue;
      }
      depends.set(rule.state.name, [...(depends.get(rule.state.name) ?? []), subject.name]);
    }
  }
}

// What is alike: one of its states, or a dimension it needs, with two or
// more of its values, and its condition.
function checkAlikes(checking: TypeContext): void {
  const { file, names, error, type } = checking;
  for (const alike of type.alikes) {
    const start = file.diagnostics.length;
    const { subject } = alike;
    const of = subjectOf(checking, subject);
    if (of !== undefined && alike.values !== undefined) {
      checkChosen(alike.values, of, names, checking, "the alike", subject.name);
      if (alike.values.length === 1) {
        error(
          "alike-one-value",
          message`${`alike ${subject.name} in (${alike.values[0]?.name})`} names one value, which is alike only with itself`,
          subject,
        );
      }
    }
    if (alike.when !== undefined) {
      checkCondition(
        checking,
        alike.when,
        subject,
        { never: "nothing is alike", always: "the when restricts nothing" },
        start,
      );
    }
  }
}

// A type's children: each named once, among its children and its states,
// of a type, and there only when one of its states, or a dimension it
// needs, has one of the values given.
// A list's members that add no rows: every row one allows, another member of
// its type allows too, there wherever it is and binding only what it binds,
// to the same values. A member and its double: the later adds nothing.
function checkMembers(checking: TypeContext): void {
  const { warn, type } = checking;
  const covers = (wider: Child, narrower: Child) =>
    wider.type.name === narrower.type.name &&
    (wider.when === undefined ||
      (narrower.when !== undefined &&
        conditionText(wider.when) === conditionText(narrower.when))) &&
    (wider.bindings ?? []).every(
      (binding) =>
        fixes(type, binding) &&
        (narrower.bindings ?? []).some(
          ({ state, from, map }) =>
            map === undefined &&
            state.name === binding.state.name &&
            from.name === binding.from.name,
        ),
    );
  for (const { members } of type.unions) {
    members.forEach((member, index) => {
      const wider = members.find(
        (other, at) =>
          other !== member && covers(other, member) && (!covers(member, other) || at < index),
      );
      if (wider === undefined) return;
      const [narrow, wide] = [member.short, wider.short];
      const bound = wider.bindings ?? [];
      const only = bound.map(({ state, from }) => `${state.name} = ${from.name}`);
      const why =
        bound.length === 0
          ? message`${wide} binds nothing, so it already allows every ${member.type.name}, the ${narrow} ones too`
          : bound.length === (member.bindings ?? []).length
            ? message`${wide} binds the same as ${narrow}, so it already allows every row ${narrow} does`
            : message`${wide} binds only ${only}, so it already allows every row ${narrow} does`;
      warn(
        "redundant-member",
        message`${narrow} adds no rows: ${words(why)}; remove ${narrow}, or narrow ${wide}`,
        member,
      );
    });
  }
}

function checkChildren(checking: TypeContext): void {
  const { names, error, type } = checking;
  const taken = new Map<string, string>(type.states.map(({ name }) => [name, "state"]));
  for (const child of type.children) {
    const earlier = taken.get(child.name);
    if (earlier !== undefined) {
      error(
        "duplicate-child",
        message`${child.name} is already a ${words(earlier)} of ${type.name}`,
        child,
      );
    }
    taken.set(child.name, "child");
    if (!names.is(child.type.name, "type")) {
      error("unknown-type", names.not(child.type.name, "type"), child.type);
    }
    checkBindings(checking, child);
    if (child.when === undefined) continue;
    checkCondition(checking, child.when, child, {
      never: message`${child.name} is never there`,
      always: message`${child.name} is always there`,
    });
  }
}

// A child's bindings: each a state of the child, set once, from a state of
// the type, both with their values from one enum, or mapped by a when; or
// fixed to one of the child's state's values, which is not also a state of
// the type.
function checkBindings(checking: TypeContext, child: Child): void {
  const { file, names, error, type } = checking;
  const inner = file.types.find(({ name }) => name === child.type.name);
  const bound = new Set<string>();
  for (const binding of child.bindings ?? []) {
    const { state, from } = binding;
    if (bound.has(state.name)) {
      error("duplicate-binding", message`${state.name} is already bound`, state);
      continue;
    }
    bound.add(state.name);
    const target = inner === undefined ? undefined : stateOf(checking, inner, state);
    const values = target === undefined ? undefined : names.values(target.enum.name);
    const owned = type.states.find(({ name }) => name === from.name);
    if (owned !== undefined && binding.map === undefined && values?.includes(from.name)) {
      error(
        "ambiguous-binding",
        message`${from.name} is both a state of ${type.name} and a value of ${state.name}; rename one of them`,
        from,
      );
      continue;
    }
    if (fixes(type, binding)) {
      if (target === undefined || values === undefined) continue;
      if (!values.includes(from.name) && !type.broken) {
        const states = type.states.map(({ name }) => name);
        const close = among(from.name, [...states, ...values]);
        error(
          "unknown-state",
          message`${from.name} is not a state of ${type.name}, nor a value of ${state.name} (${values})${close.text.startsWith(";") ? close : words("")}`,
          from,
        );
        continue;
      }
    }
    const source = fixes(type, binding) ? undefined : stateOf(checking, type, from);
    if (target === undefined || (source === undefined && !fixes(type, binding))) continue;
    // Mapped or not, a binding cannot set a state the child decides.
    const why = decidedBy(target);
    if (why !== undefined) {
      error("bound-derived", message`${target.name} ${words(why)}; it cannot also be bound`, state);
      continue;
    }
    // Bound, its value is the parent's: no action or change of the child
    // can change it.
    const action = inner?.actions.find((candidate) => candidate.state.name === target.name);
    const changing = inner?.triggers.find((candidate) =>
      candidate.does.some(
        (effect) => effect.kind === "change" && effect.state.name === target.name,
      ),
    );
    if (action !== undefined) {
      error(
        "bound-action",
        message`${target.name} is bound here, so ${inner?.name}'s action ${action.name.name} can never change it`,
        state,
      );
    } else if (changing !== undefined) {
      error(
        "bound-action",
        message`${target.name} is bound here, so ${inner?.name}'s change on ${eventText(changing.event)} can never change it`,
        state,
      );
    }
    const map = binding.map;
    if (source === undefined) continue;
    if (map !== undefined) {
      checkWhen(
        map,
        from,
        { name: source.name, values: names.values(source.enum.name) },
        { name: target.name, values: names.values(target.enum.name) },
        checking,
      );
    } else if (target.enum.name !== source.enum.name) {
      error(
        "binding-mismatch",
        message`${target.name}'s values come from ${target.enum.name}, but ${source.name}'s from ${source.enum.name}; a binding needs one enum`,
        state,
      );
    }
  }
}

// Its events, each declared once; its actions, each a change of its own
// state between two of its values, once by name; and its triggers, each an
// event on the type, an action of it or of a child. One event triggers one
// action in any state.
function checkActions(checking: TypeContext): void {
  checkEvents(checking);
  checkActionDeclarations(checking);
  const triggered = checking.type.triggers.flatMap((trigger) => checkTrigger(checking, trigger));
  checkOverlaps(checking, triggered);
}

// The events a type declares, each once.
function checkEvents({ error, type }: TypeContext): void {
  const declared = new Set<string>();
  for (const event of type.events) {
    if (declared.has(event.name)) {
      error("duplicate-event", message`${event.name} is already an event of ${type.name}`, event);
    }
    declared.add(event.name);
  }
}

// A type's actions: each named once, among its actions, states and
// children, and each a change of one of its own states that it sets, from
// one of its values to another.
function checkActionDeclarations(checking: TypeContext): void {
  const { names, error, type } = checking;
  const named = new Set<string>();
  for (const action of type.actions) {
    // One name, one thing: an action's name is not a state's or a child's.
    const taken = type.states.some(({ name }) => name === action.name.name)
      ? "a state"
      : type.children.some(({ name }) => name === action.name.name)
        ? "a child"
        : named.has(action.name.name)
          ? "an action"
          : undefined;
    if (taken !== undefined) {
      error(
        "duplicate-action",
        message`${action.name.name} is already ${words(taken)} of ${type.name}`,
        action.name,
      );
    }
    named.add(action.name.name);
    const state = stateOf(checking, type, action.state);
    if (state === undefined) continue;
    const why = decidedBy(state);
    if (why !== undefined) {
      error(
        "action-on-derived",
        message`${state.name} ${words(why)}; no action can change it`,
        action.state,
      );
      continue;
    }
    if (action.from.name === action.to.name) {
      error(
        "unchanged-action",
        message`${action.name.name} changes nothing: ${state.name} is ${action.from.name} before and after`,
        action.to,
      );
      continue;
    }
    checkChosen(
      [action.from, action.to],
      state.enum.name,
      names,
      checking,
      "the action",
      state.name,
    );
  }
}

// A trigger: its event one the type or a child declares, or a change of a
// dimension the type needs to some of its values; what it changes, each
// state once; and its condition. The changes it makes that were found.
function checkTrigger(checking: TypeContext, trigger: Trigger): Triggered[] {
  const { file, names, error, type } = checking;
  const { event } = trigger;
  // A named event: one the type declares, or a child's by its path.
  if (event.kind === "named") {
    const parts = event.name.name.split(".");
    const path = parts.slice(0, -1).join(".");
    const owner =
      parts.length === 1 ? type : childType(checking, type, { ...event.name, name: path });
    const named = parts.at(-1) as string;
    // A broken type's events may not all have been read.
    if (owner !== undefined && !owner.broken && !owner.events.some(({ name }) => name === named)) {
      const events = owner.events.map(({ name }) => name);
      error(
        "unknown-event",
        message`${named} is not an event of ${owner.name}${among(named, events, "it declares none")}`,
        event.name,
      );
    }
  }
  if (event.kind === "dimension" && subjectOf(checking, event.dimension, false) !== undefined) {
    checkChosen(event.values, event.dimension.name, names, checking, "the event");
  }
  // What it changes: each a named action, the type's own or a child's by
  // its path; or one of the type's own states, to one of its values.
  const changes: Found[] = [];
  for (const effect of trigger.does) {
    const found = changeOf(checking, effect);
    if (found !== undefined) changes.push(found);
  }
  // One trigger changes each of its type's own states once.
  changes.forEach(({ change, path, at }, index) => {
    if (
      changes
        .slice(0, index)
        .some((earlier) => earlier.path === path && earlier.change.state === change.state)
    ) {
      error(
        "conflicting-change",
        message`${eventText(trigger.event)} changes ${path === "" ? change.state : `${path}.${change.state}`} twice`,
        at,
      );
    }
  });
  if (trigger.when !== undefined) {
    const before = file.diagnostics.length;
    checkCondition(checking, trigger.when, trigger, {
      never: "the trigger never fires",
      always: "the trigger always fires",
    });
    // A dimension event fires only where the dimension has one of its
    // values: a condition that never holds there never lets it fire.
    if (
      file.diagnostics.length === before &&
      trigger.event.kind === "dimension" &&
      coverage({ kind: "and", terms: firing(trigger) }, valuesIn(checking)) === "never"
    ) {
      error(
        "impossible-condition",
        message`${conditionText(trigger.when)} is never true on ${eventText(trigger.event)}, so the trigger never fires`,
        trigger,
      );
    }
  }
  return changes.map(({ change, path }) => ({ trigger, change, path }));
}

// One event, one change: no two actions that events which overlap trigger
// can both apply to one state, from one value.
function checkOverlaps(checking: TypeContext, triggered: Triggered[]): void {
  const { error } = checking;
  triggered.forEach(({ trigger, change, path }, index) => {
    const of = (name: string) => (path === "" ? name : `${path}.${name}`);
    for (const earlier of triggered.slice(0, index)) {
      if (earlier.trigger === trigger) continue;
      const other = earlier.change;
      const common = other?.from.filter((value) => change.from.includes(value)) ?? [];
      if (
        other === undefined ||
        earlier.path !== path ||
        !overlap(earlier.trigger.event, trigger.event) ||
        other.state !== change.state ||
        common.length === 0 ||
        !together(
          checking,
          earlier.trigger,
          trigger,
          path === "" ? { name: change.state, from: common } : undefined,
        )
      ) {
        continue;
      }
      // Two named actions are the same only by name; a change in place is
      // the same as any that leads where it leads from the values both
      // change from.
      const same =
        other.named && change.named ? other.label === change.label : other.to === change.to;
      if (same) {
        error(
          "duplicate-trigger",
          message`${eventText(trigger.event)} already triggers ${change.label}`,
          trigger,
        );
      } else {
        error(
          "ambiguous-event",
          message`${eventText(trigger.event)} triggers both ${other.label} and ${change.label} when ${`${of(change.state)} = ${common[0]}`}`,
          trigger,
        );
      }
      break;
    }
  });
}

// Whether two events can be one: the same named event, or changes of one
// dimension to a value in common.
function overlap(a: Event, b: Event): boolean {
  if (a.kind === "named" && b.kind === "named") return a.name.name === b.name.name;
  if (a.kind === "dimension" && b.kind === "dimension") {
    return (
      a.dimension.name === b.dimension.name &&
      a.values.some(({ name }) => b.values.some((value) => value.name === name))
    );
  }
  return false;
}

// Whether two triggers' changes can both apply: where all that is known of
// when each fires can hold at once, its condition and the value its
// dimension event changes to, and, for its type's own state, a value both
// change from. One without a condition holds everywhere.
function together(
  checking: TypeContext,
  a: Trigger,
  b: Trigger,
  state?: { name: string; from: string[] },
): boolean {
  const terms: Condition[] = [...firing(a), ...firing(b)];
  if (state !== undefined) {
    terms.push({
      kind: "compare",
      subject: { name: state.name, line: 0, column: 0 },
      values: state.from.map((name) => ({ name, line: 0, column: 0 })),
    });
  }
  if (terms.length === 0) return true;
  return coverage({ kind: "and", terms }, valuesIn(checking)) !== "never";
}

// A condition: each comparison on a dimension the type needs, or, where
// states may be compared, one of its states, with values of it; each
// subject compared once in an "and"; and, when that is all so, true in some
// combinations of its subjects, but not in all.
function checkCondition(
  checking: TypeContext,
  condition: Condition,
  at: Located,
  then: { never: string; always: string },
  // Where its owner's problems start: with any, it is not checked as a
  // whole.
  before = checking.file.diagnostics.length,
): void {
  const { file, names, error, warn, type } = checking;
  for (const { subject, values } of comparisons(condition)) {
    const of = subjectOf(checking, subject);
    if (of !== undefined) checkChosen(values, of, names, checking, "the condition", subject.name);
  }
  const repeated = (part: Condition) => {
    if (part.kind === "compare") return;
    const seen = new Set<string>();
    for (const term of part.terms) {
      if (term.kind !== "compare" || part.kind !== "and") continue;
      if (seen.has(term.subject.name)) {
        error(
          "repeated-comparison",
          message`${term.subject.name} is already compared in this \`and\`; give its values once, with \`in (…)\``,
          term.subject,
        );
      }
      seen.add(term.subject.name);
    }
    part.terms.forEach(repeated);
  };
  repeated(condition);
  if (file.diagnostics.length > before || type.broken) return;
  // The values each subject can have; a broken declaration's may not all
  // have been read.
  const declarationOf = (subject: string) => {
    const name = enumOf(type, subject);
    return [...file.enums, ...file.dimensions].find((declaration) => declaration.name === name);
  };
  if (subjects(condition).some(({ name }) => declarationOf(name)?.broken)) return;
  const valuesOf = (subject: string) =>
    declarationOf(subject)?.values.map(({ name }) => name) ?? [];
  const holding = coverage(condition, valuesOf);
  if (holding === "never") {
    error(
      "impossible-condition",
      message`${conditionText(condition)} is never true, so ${words(then.never)}`,
      at,
    );
  } else if (holding === "always") {
    warn(
      "vacuous-condition",
      message`${conditionText(condition)} is always true, so ${words(then.always)}`,
      at,
    );
  }
}

// What a provided state is: one of the type's own states, not received, each
// provided once.
function checkProvides({ error, type }: TypeContext): void {
  const provided = new Set<string>();
  for (const name of type.provides) {
    const own = type.states.filter(({ received }) => received === undefined);
    if (type.states.some((state) => state.received && state.name === name.name)) {
      error(
        "provides-received",
        message`${type.name} receives ${name.name}; it can only provide a state of its own`,
        name,
      );
    } else if (!own.some((state) => state.name === name.name)) {
      const states = own.map((state) => state.name);
      error(
        "unknown-state",
        message`${name.name} is not a state of ${type.name}${among(name.name, states, "it has none")}`,
        name,
      );
    } else if (provided.has(name.name)) {
      error("duplicate-provides", message`${name.name} is already provided by ${type.name}`, name);
    }
    provided.add(name.name);
  }
}

// One of a type's states, by name; undefined, reported, when it has none of
// that name. A broken type's states may not all have been read, so a name it
// lacks is not reported.
function stateOf({ error }: Context, type: Type, named: Located): State | undefined {
  const state = type.states.find(({ name }) => name === named.name);
  if (state === undefined && !type.broken) {
    const all = type.states.map(({ name }) => name);
    error(
      "unknown-state",
      message`${named.name} is not a state of ${type.name}${among(named.name, all, "it has none")}`,
      named,
    );
  }
  return state;
}

// What a state or a dimension is that a type compares: the declaration its
// values come from, an enum for one of the type's states, or a dimension,
// needed or not; undefined, reported, when it is neither. With states false,
// only a dimension. A dimension the type does not need is reported, with the
// needs to declare; a broken type's needs may not all have been read.
function subjectOf(checking: TypeContext, subject: Located, states = true): string | undefined {
  const { names, error, type, needed, declare } = checking;
  if (states && /^[a-z]/.test(subject.name)) return stateOf(checking, type, subject)?.enum.name;
  if (!names.is(subject.name, "dimension")) {
    error("unknown-dimension", names.not(subject.name, "dimension"), subject);
    return undefined;
  }
  if (!needed.has(subject.name) && !type.broken) {
    error(
      "unneeded-dimension",
      message`${type.name} does not need ${subject.name}; declare ${declare}`,
      subject,
    );
  }
  return subject.name;
}

// A child of a type by its path, "<child>.<child>...": its type, or
// undefined, reported, when a part is not a child.
function childType({ file, error }: Context, type: Type, path: Located): Type | undefined {
  let at: Type | undefined = type;
  const parts = path.name.split(".");
  for (let index = 0; index < parts.length; ) {
    const part = parts[index] as string;
    // A child whose type is not one, or a broken type, is reported already.
    if (at === undefined) return undefined;
    const found = childAt(at, parts, index);
    const child: Child | undefined = found?.child;
    if (found === undefined || child === undefined) {
      if (at.broken) return undefined;
      const children = at.children.map(({ name }) => name);
      error(
        "unknown-child",
        message`${part} is not a child of ${at.name}${among(part, children, "it has none")}`,
        path,
      );
      return undefined;
    }
    index = found.next;
    at = file.types.find(({ name }) => name === child.type.name);
  }
  return at;
}

// What is known of where a trigger fires: its condition, and the values its
// dimension event changes to.
function firing(trigger: Trigger): Condition[] {
  return [
    ...(trigger.when === undefined ? [] : [trigger.when]),
    ...(trigger.event.kind === "dimension"
      ? [
          {
            kind: "compare" as const,
            subject: trigger.event.dimension,
            values: trigger.event.values,
          },
        ]
      : []),
  ];
}

// The values a subject of the type's conditions can have: a state's enum's,
// or a dimension's.
function valuesIn({ names, type }: TypeContext): (subject: string) => string[] {
  return (subject) => names.values(enumOf(type, subject) ?? "") ?? [];
}

// One change a trigger makes, checked: a named action, the type's own or a
// child's by its path, or one of the type's own states changed in place to
// one of its values. Where it is, and what it changes from and to.
function changeOf(checking: TypeContext, effect: Effect): Found | undefined {
  const { names, error, type } = checking;
  if (effect.kind === "action") {
    const parts = effect.name.name.split(".");
    const actionName = parts.at(-1) as string;
    const path = parts.slice(0, -1).join(".");
    const owner =
      parts.length === 1 ? type : childType(checking, type, { ...effect.name, name: path });
    const action = owner?.actions.find(({ name }) => name.name === actionName);
    // A broken type's actions may not all have been read.
    if (owner !== undefined && action === undefined && !owner.broken) {
      const actions = owner.actions.map(({ name }) => name.name);
      error(
        "unknown-action",
        message`${actionName} is not an action of ${owner.name}${among(actionName, actions, "it has none")}`,
        effect.name,
      );
    }
    if (action === undefined) return undefined;
    return {
      change: {
        label: path === "" ? action.name.name : `${path}.${action.name.name}`,
        state: action.state.name,
        from: [action.from.name],
        to: action.to.name,
        named: true,
      },
      path,
      at: effect.name,
    };
  }
  const { state: named, to } = effect;
  const state = stateOf(checking, type, named);
  if (state === undefined) return undefined;
  const why = decidedBy(state);
  if (why !== undefined) {
    error(
      "action-on-derived",
      message`${state.name} ${words(why)}; no change can change it`,
      named,
    );
    return undefined;
  }
  const values = names.values(state.enum.name) ?? [];
  if (!values.includes(to.name)) {
    error("unknown-value", message`${to.name} is not a value of ${state.name} (${values})`, to);
    return undefined;
  }
  // It applies wherever the state is not yet its value.
  return {
    change: {
      label: `${state.name} -> ${to.name}`,
      state: state.name,
      from: values.filter((value) => value !== to.name),
      to: to.name,
      named: false,
    },
    path: "",
    at: named,
  };
}

// Why a state is not the type's to set, by a rule, an action or a binding:
// it is received, or its when or its value decides it; undefined when it is
// free.
function decidedBy(state: State): string | undefined {
  if (state.received) return "is received";
  if (state.derived !== undefined) return "is decided by its when";
  if (state.fixed !== undefined) return "is decided by its value";
  return undefined;
}

// An event, in words: "escape", "toggle.activate", "Breakpoint in (lg, xl)".
export function eventText(event: Event): string {
  if (event.kind === "named") return event.name.name;
  const values = event.values.map(({ name }) => name);
  return `${event.dimension.name} ${values.length === 1 ? `= ${values[0]}` : `in (${values.join(", ")})`}`;
}
