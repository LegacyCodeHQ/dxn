import type {
  Child,
  Condition,
  Derived,
  Effect,
  Event,
  Field,
  Located,
  ParseResult,
  RecordDeclaration,
  Rule,
  State,
  Trigger,
  Type,
} from "./ast.js";
import { comparisons, conditionText, coverage, subjects } from "./condition.js";
import { among, article, Names } from "./names.js";
import { environmentOf } from "./profiles.js";
import { scalar } from "./scalars.js";
import { around } from "./scope.js";

// What a trigger changes, named or written in place: its state, from which
// values, to which, and how it reads in messages.
type Change = { label: string; state: string; from: string[]; to: string; named: boolean };

type Report = (
  code: string,
  message: string,
  at: { line: number; column: number },
  severity?: "error" | "warning",
) => void;

// Checks across declarations, scope by scope, adding to the file's
// diagnostics: the file holds each name once, an enum or a dimension each
// value once, and every name that refers to a declaration names one of the
// right kind.
export function check(file: ParseResult): void {
  const report: Report = (code, message, at, severity = "error") =>
    file.diagnostics.push({ severity, code, message, line: at.line, column: at.column });
  const names = new Names(file);
  checkDeclared(file, report);
  checkValues(file, report);
  checkTypes(file, names, report);
  checkEnvironments(file, names, report);
  checkProfiles(file, names, report);
  checkModifiers(file, names, report);
  checkRecords(file, names, report);
  checkContainment(file, names, report);
  // Expectations: each title once.
  const titles = new Map<string, number>();
  for (const expectation of file.expectations) {
    const earlier = titles.get(expectation.title);
    if (earlier !== undefined) {
      report(
        "duplicate-name",
        `the expectation ${JSON.stringify(expectation.title)} is already at line ${earlier}`,
        expectation,
      );
    } else {
      titles.set(expectation.title, expectation.line);
    }
  }
}

// No type contains itself through its children: it would be a tree without
// end.
function checkContainment(file: ParseResult, names: Names, report: Report): void {
  const byName = new Map<string, Type>();
  for (const type of file.types) if (!byName.has(type.name)) byName.set(type.name, type);
  // The children that lead from a type back to the target, if any do.
  const path = (
    from: Type,
    target: string,
    visited: Set<string>,
  ): { type: string; child: Located; of: string }[] | undefined => {
    for (const child of from.children) {
      const inner =
        names.kindOf(child.type.name) === "type" ? byName.get(child.type.name) : undefined;
      if (inner === undefined) continue;
      const step = { type: from.name, child, of: inner.name };
      if (inner.name === target) return [step];
      if (visited.has(inner.name)) continue;
      visited.add(inner.name);
      const rest = path(inner, target, visited);
      if (rest !== undefined) return [step, ...rest];
    }
    return undefined;
  };
  for (const type of byName.values()) {
    const steps = path(type, type.name, new Set());
    const first = steps?.[0];
    if (steps === undefined || first === undefined) continue;
    const through = steps
      .map(({ type: owner, child, of }) => `${owner}.${child.name} is ${article(of)} ${of}`)
      .join(", and ");
    report("recursive-type", `${type.name} contains itself: ${through}`, first.child);
  }
}

// The file: each name declared once, and none a built-in scalar's.
function checkDeclared(file: ParseResult, report: Report): void {
  const declarations = [
    ...file.enums,
    ...file.dimensions,
    ...file.types,
    ...file.environments,
    ...file.profiles,
    ...file.modifiers,
    ...file.records,
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const declared = new Map<string, Located>();
  for (const declaration of declarations) {
    const written = declaration.short ?? declaration.name;
    if (scalar(written) !== undefined) {
      report("reserved-name", `${written} is a built-in scalar; choose another name`, declaration);
      continue;
    }
    // Inside a type, a name cannot repeat one from around it either.
    const earlier =
      declared.get(declaration.name) ??
      (declaration.scope === undefined ? undefined : around(file, declaration).get(written));
    if (earlier !== undefined) {
      report(
        "duplicate-name",
        `${written} is already declared at line ${earlier.line}`,
        declaration,
      );
    } else {
      declared.set(declaration.name, declaration);
    }
  }
}

// An enum or a dimension: each value once.
function checkValues(file: ParseResult, report: Report): void {
  for (const declaration of [...file.enums, ...file.dimensions]) {
    const seen = new Set<string>();
    for (const item of declaration.values) {
      if (seen.has(item.name)) {
        report(
          "duplicate-value",
          `${JSON.stringify(item.name)} appears twice in ${declaration.name}`,
          item,
        );
      }
      seen.add(item.name);
    }
  }
}

// A type: each need a dimension, once; each state once, its values from an
// enum; each rule on a state of the type and one of its values, under a
// needed dimension and its values, and one rule for each state value. A need
// no rule uses is a warning.
function checkTypes(file: ParseResult, names: Names, report: Report): void {
  // What a state or a dimension is that a type compares, with what to declare
  // when it does not need it: the declaration its values come from, an enum
  // for one of the type's states, or a dimension, needed or not; undefined,
  // reported, when it is neither. With states false, only a dimension. A
  // broken type's needs may not all have been read.
  const subjectOf = (
    type: Type,
    subject: Located,
    needed: Set<string>,
    declare: string,
    states = true,
  ): string | undefined => {
    if (states && /^[a-z]/.test(subject.name)) {
      const state = type.states.find(({ name }) => name === subject.name);
      if (state === undefined) {
        const all = type.states.map(({ name }) => name);
        report(
          "unknown-state",
          `${subject.name} is not a state of ${type.name}${among(all, "it has none")}`,
          subject,
        );
      }
      return state?.enum.name;
    }
    if (!names.is(subject.name, "dimension")) {
      report("unknown-dimension", names.not(subject.name, "dimension"), subject);
      return undefined;
    }
    if (!needed.has(subject.name) && !type.broken) {
      report(
        "unneeded-dimension",
        `${type.name} does not need ${subject.name}; declare ${declare}`,
        subject,
      );
    }
    return subject.name;
  };
  // A child of a type by its path, "<child>.<child>...": its type, or
  // undefined, reported, when a part is not a child.
  const childType = (type: Type, path: Located): Type | undefined => {
    let at: Type | undefined = type;
    for (const part of path.name.split(".")) {
      // A child whose type is not one, or a broken type, is reported already.
      if (at === undefined) return undefined;
      const child: Child | undefined = at.children.find(({ name }) => name === part);
      if (child === undefined) {
        if (at.broken) return undefined;
        const children = at.children.map(({ name }) => name);
        report(
          "unknown-child",
          `${part} is not a child of ${at.name}${among(children, "it has none")}`,
          path,
        );
        return undefined;
      }
      at = file.types.find(({ name }) => name === child.type.name);
    }
    return at;
  };
  // What is known of where a trigger fires: its condition, and the values its
  // dimension event changes to.
  const firing = (trigger: Trigger): Condition[] => [
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
  // The values a subject of a type's condition can have: a state's enum's,
  // or a dimension's.
  const valuesIn = (type: Type) => (subject: string) => {
    const name = /^[a-z]/.test(subject)
      ? type.states.find((state) => state.name === subject)?.enum.name
      : subject;
    return names.values(name ?? "") ?? [];
  };
  // One change a trigger makes, checked: a named action, the type's own or a
  // child's by its path, or one of the type's own states changed in place to
  // one of its values. Where it is, and what it changes from and to.
  const changeOf = (
    type: Type,
    effect: Effect,
  ): { change: Change; path: string; at: Located } | undefined => {
    if (effect.kind === "action") {
      const parts = effect.name.name.split(".");
      const actionName = parts.at(-1) as string;
      const path = parts.slice(0, -1).join(".");
      const owner = parts.length === 1 ? type : childType(type, { ...effect.name, name: path });
      const action = owner?.actions.find(({ name }) => name.name === actionName);
      // A broken type's actions may not all have been read.
      if (owner !== undefined && action === undefined && !owner.broken) {
        const actions = owner.actions.map(({ name }) => name.name);
        report(
          "unknown-action",
          `${actionName} is not an action of ${owner.name}${among(actions, "it has none")}`,
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
    const state = type.states.find(({ name }) => name === named.name);
    if (state === undefined) {
      const states = type.states.map(({ name }) => name);
      report(
        "unknown-state",
        `${named.name} is not a state of ${type.name}${among(states, "it has none")}`,
        named,
      );
      return undefined;
    }
    if (state.derived !== undefined || state.fixed !== undefined || state.received) {
      const why = state.received
        ? "is received"
        : `is decided by ${state.fixed === undefined ? "its when" : "its value"}`;
      report("action-on-derived", `${state.name} ${why}; no change can change it`, named);
      return undefined;
    }
    const values = names.values(state.enum.name) ?? [];
    if (!values.includes(to.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(to.name)} is not a value of ${state.name} (${values.join(", ")})`,
        to,
      );
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
  };
  // Its actions, each a change of its own state between two of its values,
  // once by name; and its triggers, each an event on the type, an action of
  // it or of a child. One
  // event triggers one action in any state.
  const checkActions = (type: Type, needed: Set<string>, declare: string) => {
    // The events it declares, each once.
    const declared = new Set<string>();
    for (const event of type.events) {
      if (declared.has(event.name)) {
        report("duplicate-event", `${event.name} is already an event of ${type.name}`, event);
      }
      declared.add(event.name);
    }
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
        report(
          "duplicate-action",
          `${action.name.name} is already ${taken} of ${type.name}`,
          action.name,
        );
      }
      named.add(action.name.name);
      const state = type.states.find(({ name }) => name === action.state.name);
      if (state === undefined) {
        const states = type.states.map(({ name }) => name);
        report(
          "unknown-state",
          `${action.state.name} is not a state of ${type.name}${among(states, "it has none")}`,
          action.state,
        );
        continue;
      }
      if (state.derived !== undefined || state.fixed !== undefined || state.received) {
        const why = state.received
          ? "is received"
          : `is decided by ${state.fixed === undefined ? "its when" : "its value"}`;
        report("action-on-derived", `${state.name} ${why}; no action can change it`, action.state);
        continue;
      }
      if (action.from.name === action.to.name) {
        report(
          "unchanged-action",
          `${action.name.name} changes nothing: ${state.name} is ${action.from.name} before and after`,
          action.to,
        );
        continue;
      }
      checkChosen(
        [action.from, action.to],
        state.enum.name,
        names,
        report,
        "the action",
        state.name,
      );
    }
    const resolved = type.triggers.map((trigger) => {
      const { event } = trigger;
      // A named event: one the type declares, or a child's by its path.
      if (event.kind === "named") {
        const parts = event.name.name.split(".");
        const path = parts.slice(0, -1).join(".");
        const owner = parts.length === 1 ? type : childType(type, { ...event.name, name: path });
        const named = parts.at(-1) as string;
        // A broken type's events may not all have been read.
        if (
          owner !== undefined &&
          !owner.broken &&
          !owner.events.some(({ name }) => name === named)
        ) {
          const events = owner.events.map(({ name }) => name);
          report(
            "unknown-event",
            `${named} is not an event of ${owner.name}${among(events, "it declares none")}`,
            event.name,
          );
        }
      }
      if (
        event.kind === "dimension" &&
        subjectOf(type, event.dimension, needed, declare, false) !== undefined
      ) {
        checkChosen(event.values, event.dimension.name, names, report, "the event");
      }
      // What it changes: each a named action, the type's own or a child's by
      // its path; or one of the type's own states, to one of its values.
      const changes: { change: Change; path: string; at: Located }[] = [];
      for (const effect of trigger.does) {
        const found = changeOf(type, effect);
        if (found !== undefined) changes.push(found);
      }
      // One trigger changes each of its type's own states once.
      changes.forEach(({ change, path, at }, index) => {
        if (
          changes
            .slice(0, index)
            .some((earlier) => earlier.path === path && earlier.change.state === change.state)
        ) {
          report(
            "conflicting-change",
            `${eventText(trigger.event)} changes ${path === "" ? change.state : `${path}.${change.state}`} twice`,
            at,
          );
        }
      });
      if (trigger.when !== undefined) {
        const before = file.diagnostics.length;
        checkCondition(type, trigger.when, needed, declare, trigger, {
          never: "the trigger never fires",
          always: "the trigger always fires",
        });
        // A dimension event fires only where the dimension has one of its
        // values: a condition that never holds there never lets it fire.
        if (
          file.diagnostics.length === before &&
          trigger.event.kind === "dimension" &&
          coverage({ kind: "and", terms: firing(trigger) }, valuesIn(type)) === "never"
        ) {
          report(
            "impossible-condition",
            `${conditionText(trigger.when)} is never true on ${eventText(trigger.event)}, so the trigger never fires`,
            trigger,
          );
        }
      }
      return changes.map(({ change, path }) => ({ trigger, change, path }));
    });
    // One event, one change: no two actions that events which overlap
    // trigger can both apply to one state, from one value.
    const overlap = (a: Event, b: Event) => {
      if (a.kind === "named" && b.kind === "named") return a.name.name === b.name.name;
      if (a.kind === "dimension" && b.kind === "dimension") {
        return (
          a.dimension.name === b.dimension.name &&
          a.values.some(({ name }) => b.values.some((value) => value.name === name))
        );
      }
      return false;
    };
    // Two triggers' conditions can both hold where they have values in
    // common; one without a condition holds everywhere.
    // Two triggers' changes can both apply where all that is known of when
    // each fires can hold at once: its condition, the value its dimension
    // event changes to, and, for its type's own state, a value both change
    // from.
    const together = (a: Trigger, b: Trigger, state?: { name: string; from: string[] }) => {
      const terms: Condition[] = [...firing(a), ...firing(b)];
      if (state !== undefined) {
        terms.push({
          kind: "compare",
          subject: { name: state.name, line: 0, column: 0 },
          values: state.from.map((name) => ({ name, line: 0, column: 0 })),
        });
      }
      if (terms.length === 0) return true;
      return coverage({ kind: "and", terms }, valuesIn(type)) !== "never";
    };
    const flat = resolved.flat();
    flat.forEach(({ trigger, change, path }, index) => {
      const of = (name: string) => (path === "" ? name : `${path}.${name}`);
      for (const earlier of flat.slice(0, index)) {
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
          report(
            "duplicate-trigger",
            `${eventText(trigger.event)} already triggers ${change.label}`,
            trigger,
          );
        } else {
          report(
            "ambiguous-event",
            `${eventText(trigger.event)} triggers both ${other.label} and ${change.label} when ${of(change.state)} = ${common[0]}`,
            trigger,
          );
        }
        break;
      }
    });
  };
  // A child's bindings: each a state of the child, set once, from a state of
  // the type, both with their values from one enum, or mapped by a when.
  const checkBindings = (type: Type, child: Child) => {
    const inner = file.types.find(({ name }) => name === child.type.name);
    const bound = new Set<string>();
    for (const { state, from } of child.bindings ?? []) {
      if (bound.has(state.name)) {
        report("duplicate-binding", `${state.name} is already bound`, state);
        continue;
      }
      bound.add(state.name);
      const target = inner?.states.find(({ name }) => name === state.name);
      // A broken type's states may not all have been read.
      if (inner !== undefined && target === undefined && !inner.broken) {
        const states = inner.states.map(({ name }) => name);
        report(
          "unknown-state",
          `${state.name} is not a state of ${inner.name}${among(states, "it has none")}`,
          state,
        );
      }
      const source = type.states.find(({ name }) => name === from.name);
      if (source === undefined) {
        const states = type.states.map(({ name }) => name);
        report(
          "unknown-state",
          `${from.name} is not a state of ${type.name}${among(states, "it has none")}`,
          from,
        );
      }
      if (target === undefined || source === undefined) continue;
      // Mapped or not, a binding cannot set a state the child decides.
      if (target.derived !== undefined || target.fixed !== undefined || target.received) {
        const why = target.received
          ? "is received"
          : `is decided by ${target.fixed === undefined ? "its when" : "its value"}`;
        report("bound-derived", `${target.name} ${why}; it cannot also be bound`, state);
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
        report(
          "bound-action",
          `${target.name} is bound here, so ${inner?.name}'s action ${action.name.name} can never change it`,
          state,
        );
      } else if (changing !== undefined) {
        report(
          "bound-action",
          `${target.name} is bound here, so ${inner?.name}'s change on ${eventText(changing.event)} can never change it`,
          state,
        );
      }
      const map = child.bindings?.find((binding) => binding.state === state)?.map;
      if (map !== undefined) {
        checkWhen(
          map,
          from,
          { name: source.name, values: names.values(source.enum.name) },
          { name: target.name, values: names.values(target.enum.name) },
          report,
        );
      } else if (target.enum.name !== source.enum.name) {
        report(
          "binding-mismatch",
          `${target.name}'s values come from ${target.enum.name}, but ${source.name}'s from ${source.enum.name}; a binding needs one enum`,
          state,
        );
      }
    }
  };
  // A type's children: each named once, among its children and its states,
  // of a type, and there only when one of its states, or a dimension it
  // needs, has one of the values given.
  const checkChildren = (type: Type, needed: Set<string>, declare: string) => {
    const taken = new Map<string, string>(type.states.map(({ name }) => [name, "state"]));
    for (const child of type.children) {
      const earlier = taken.get(child.name);
      if (earlier !== undefined) {
        report("duplicate-child", `${child.name} is already a ${earlier} of ${type.name}`, child);
      }
      taken.set(child.name, "child");
      if (!names.is(child.type.name, "type")) {
        report("unknown-type", names.not(child.type.name, "type"), child.type);
      }
      checkBindings(type, child);
      if (child.when === undefined) continue;
      checkCondition(type, child.when, needed, declare, child, {
        never: `${child.name} is never there`,
        always: `${child.name} is always there`,
      });
    }
  };
  // A condition: each comparison on a dimension the type needs, or, where
  // states may be compared, one of its states, with values of it; each
  // subject compared once in an "and"; and, when that is all so, true in some
  // combinations of its subjects, but not in all.
  const checkCondition = (
    type: Type,
    condition: Condition,
    needed: Set<string>,
    declare: string,
    at: Located,
    then: { never: string; always: string },
    // Where its owner's problems start: with any, it is not checked as a
    // whole.
    before = file.diagnostics.length,
  ) => {
    for (const { subject, values } of comparisons(condition)) {
      const of = subjectOf(type, subject, needed, declare);
      if (of !== undefined) checkChosen(values, of, names, report, "the condition", subject.name);
    }
    const repeated = (part: Condition) => {
      if (part.kind === "compare") return;
      const seen = new Set<string>();
      for (const term of part.terms) {
        if (term.kind !== "compare" || part.kind !== "and") continue;
        if (seen.has(term.subject.name)) {
          report(
            "repeated-comparison",
            `${term.subject.name} is already compared in this and; give its values once, with in (…)`,
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
      const name = /^[a-z]/.test(subject)
        ? type.states.find((state) => state.name === subject)?.enum.name
        : subject;
      return [...file.enums, ...file.dimensions].find((declaration) => declaration.name === name);
    };
    if (subjects(condition).some(({ name }) => declarationOf(name)?.broken)) return;
    const valuesOf = (subject: string) =>
      declarationOf(subject)?.values.map(({ name }) => name) ?? [];
    const holding = coverage(condition, valuesOf);
    if (holding === "never") {
      report(
        "impossible-condition",
        `${conditionText(condition)} is never true, so ${then.never}`,
        at,
      );
    } else if (holding === "always") {
      report(
        "vacuous-condition",
        `${conditionText(condition)} is always true, so ${then.always}`,
        at,
        "warning",
      );
    }
  };
  // A derived state: on a dimension the type needs, covering each of its
  // values once, each branch giving a value of the state's enum.
  const checkDerived = (state: State, type: Type, needed: Set<string>, declare: string) => {
    const { dimension, branches } = state.derived as Derived;
    const known = subjectOf(type, dimension, needed, declare, false) !== undefined;
    // A dimension that is not one has no values to check the branches against.
    checkWhen(
      branches,
      dimension,
      { name: dimension.name, values: known ? names.values(dimension.name) : undefined },
      { name: state.name, values: names.values(state.enum.name) },
      report,
    );
  };
  for (const type of file.types) {
    const needed = new Set<string>();
    for (const need of type.needs) {
      if (!names.is(need.name, "dimension")) {
        report("unknown-dimension", names.not(need.name, "dimension"), need);
      } else if (needed.has(need.name)) {
        report("duplicate-dimension", `${need.name} is already a need of ${type.name}`, need);
      }
      needed.add(need.name);
    }
    // The dimensions its rules, derived states, children and events use, in
    // the order first used.
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
    // The needs to declare: those that are dimensions, and those used.
    const declare = `"type ${type.name} needs ${[
      ...new Set([...[...needed].filter((name) => names.is(name, "dimension")), ...used]),
    ].join(", ")}"`;
    // A need tells the type's combinations apart unless it is alike
    // throughout; one alike throughout that nothing else uses has no effect.
    if (!type.broken) {
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
        type.triggers.some(
          ({ event }) => event.kind === "dimension" && event.dimension.name === name,
        );
      for (const need of type.needs) {
        if (
          names.is(need.name, "dimension") &&
          alikeThroughout(need.name) &&
          !usedElsewhere(need.name)
        ) {
          report(
            "unused-need",
            `${type.name} needs ${need.name}, but nothing in it uses it, and it is alike throughout`,
            need,
            "warning",
          );
        }
      }
    }
    const seen = new Set<string>();
    for (const state of type.states) {
      if (seen.has(state.name)) {
        report("duplicate-state", `${state.name} is already a state of ${type.name}`, state);
      }
      seen.add(state.name);
      if (!names.is(state.enum.name, "enum")) {
        report("unknown-enum", names.not(state.enum.name, "enum"), state.enum);
      }
      if (state.derived !== undefined) checkDerived(state, type, needed, declare);
      if (state.fixed !== undefined) {
        const values = names.values(state.enum.name);
        if (values !== undefined && !values.includes(state.fixed.name)) {
          report(
            "unknown-value",
            `${JSON.stringify(state.fixed.name)} is not a value of ${state.name} (${values.join(", ")})`,
            state.fixed,
          );
        }
      }
    }
    const stateNames = type.states.map(({ name }) => name);
    const conditioned = new Map<string, Rule>();
    for (const rule of type.rules) {
      const start = file.diagnostics.length;
      const state = type.states.find(({ name }) => name === rule.state.name);
      if (state?.derived !== undefined || state?.fixed !== undefined || state?.received) {
        const why = state.received
          ? "is received"
          : `is decided by ${state.fixed === undefined ? "its when" : "its value"}`;
        report("rule-on-derived", `${state.name} ${why}; it cannot also have a rule`, rule.state);
      }
      // A broken type's states may not all have been read.
      if (state === undefined && !type.broken) {
        report(
          "unknown-state",
          `${rule.state.name} is not a state of ${type.name}${among(stateNames, "it has none")}`,
          rule.state,
        );
      }
      const values = state === undefined ? undefined : names.values(state.enum.name);
      if (values !== undefined && !values.includes(rule.value.name)) {
        report(
          "unknown-value",
          `${JSON.stringify(rule.value.name)} is not a value of ${rule.state.name} (${values.join(", ")})`,
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
        report(
          "duplicate-rule",
          `${rule.state.name} = ${rule.value.name} already has a condition at line ${earlier.state.line}; join them in one: "${rule.state.name} = ${rule.value.name} only when ${conditionText(both)}"`,
          rule.state,
        );
      } else {
        conditioned.set(key, rule);
      }
      checkCondition(
        type,
        rule.when,
        needed,
        declare,
        rule.state,
        { never: `${rule.value.name} exists nowhere`, always: "the rule restricts nothing" },
        start,
      );
    }
    // No state depends on itself, through its rules' conditions on other
    // states: each dependency is reported where it would close a cycle.
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
              index === 0 ? ` depends on ${name}` : `, which depends on ${name}`,
            )
            .join("");
          report("rule-cycle", `${chain[0]}${said}; no state can depend on itself`, subject);
          continue;
        }
        depends.set(rule.state.name, [...(depends.get(rule.state.name) ?? []), subject.name]);
      }
    }
    // What is alike: one of its states, or a dimension it needs, with two or
    // more of its values, and its condition.
    for (const alike of type.alikes) {
      const start = file.diagnostics.length;
      const { subject } = alike;
      const of = subjectOf(type, subject, needed, declare);
      if (of !== undefined && alike.values !== undefined) {
        checkChosen(alike.values, of, names, report, "the alike", subject.name);
        if (alike.values.length === 1) {
          report(
            "alike-one-value",
            `alike ${subject.name} in (${alike.values[0]?.name}) names one value, which is alike only with itself`,
            subject,
          );
        }
      }
      if (alike.when !== undefined) {
        checkCondition(
          type,
          alike.when,
          needed,
          declare,
          subject,
          { never: "nothing is alike", always: "the when restricts nothing" },
          start,
        );
      }
    }
    checkChildren(type, needed, declare);
    checkActions(type, needed, declare);
    // What it provides: its own states, each once.
    const provided = new Set<string>();
    for (const name of type.provides) {
      const own = type.states.filter(({ received }) => received === undefined);
      if (type.states.some((state) => state.received && state.name === name.name)) {
        report(
          "provides-received",
          `${type.name} receives ${name.name}; it can only provide a state of its own`,
          name,
        );
      } else if (!own.some((state) => state.name === name.name)) {
        const states = own.map((state) => state.name);
        report(
          "unknown-state",
          `${name.name} is not a state of ${type.name}${among(states, "it has none")}`,
          name,
        );
      } else if (provided.has(name.name)) {
        report("duplicate-provides", `${name.name} is already provided by ${type.name}`, name);
      }
      provided.add(name.name);
    }
  }
}

// Values chosen from a dimension, or from a state's enum: each one of its
// values, and once.
function checkChosen(
  chosen: Located[],
  dimension: string,
  names: Names,
  report: Report,
  where: string,
  // What the values are of, in messages: a state's name, for its enum's values.
  of = dimension,
): void {
  const allowed = names.values(dimension);
  if (allowed === undefined) return;
  const seen = new Set<string>();
  for (const item of chosen) {
    if (!allowed.includes(item.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(item.name)} is not a value of ${of} (${allowed.join(", ")})`,
        item,
      );
    } else if (seen.has(item.name)) {
      report("duplicate-value", `${JSON.stringify(item.name)} appears twice in ${where}`, item);
    }
    seen.add(item.name);
  }
}

// An environment: declared dimensions, each once.
function checkEnvironments(file: ParseResult, names: Names, report: Report): void {
  for (const environment of file.environments) {
    const seen = new Set<string>();
    for (const dimension of environment.dimensions) {
      if (!names.is(dimension.name, "dimension")) {
        report("unknown-dimension", names.not(dimension.name, "dimension"), dimension);
      } else if (seen.has(dimension.name)) {
        report(
          "duplicate-dimension",
          `${dimension.name} is already part of ${environment.name}`,
          dimension,
        );
      }
      seen.add(dimension.name);
    }
  }
}

// Profiles: instances of a declared environment, all of the same one, each
// giving every dimension of it once, with one of its values.
function checkProfiles(file: ParseResult, names: Names, report: Report): void {
  // The first whose environment is one: another's is reported already.
  const first = file.profiles.find(({ environment }) =>
    file.environments.some(({ name }) => name === environment.name),
  );
  for (const profile of file.profiles) {
    const named = profile.environment.name;
    const environment = file.environments.find(({ name }) => name === named);
    if (environment === undefined) {
      report("unknown-environment", names.not(named, "environment"), profile.environment);
      continue;
    }
    if (first !== undefined && first !== profile && first.environment.name !== named) {
      report(
        "mixed-profiles",
        `${profile.name} is ${article(named)} ${named}, but ${first.name} is ${article(first.environment.name)} ${first.environment.name}; all profiles share one environment`,
        profile,
      );
    }
    const required = environment.dimensions.map(({ name }) => name);
    const given = new Set<string>();
    for (const { dimension, value } of profile.values) {
      if (!required.includes(dimension.name)) {
        // A broken environment's dimensions may not all have been read.
        if (environment.broken) continue;
        report(
          "unknown-dimension",
          `${dimension.name} is not a dimension of ${environment.name} (${required.join(", ")})`,
          dimension,
        );
        continue;
      }
      if (given.has(dimension.name)) {
        report(
          "duplicate-dimension",
          `${dimension.name} is already given in ${profile.name}`,
          dimension,
        );
        continue;
      }
      given.add(dimension.name);
      checkChosen([value], dimension.name, names, report, profile.name);
    }
    const missing = required.filter((name) => !given.has(name));
    if (missing.length > 0 && profile.broken !== true && environment.broken !== true) {
      report(
        "incomplete-profile",
        `${profile.name} does not give ${missing.join(", ")}, which ${environment.name} requires`,
        profile,
      );
    }
  }
}

// A derived field: an enum's, on another field of the record that is not
// derived and is an enum's, covering each of its values once, each branch
// giving a value of the field's own enum.
function checkDerivedField(
  record: RecordDeclaration,
  field: Field,
  names: Names,
  report: Report,
): void {
  const { on, branches } = field.derived as NonNullable<Field["derived"]>;
  // A type that is not one is reported already.
  if (names.kindOf(field.type.name) === undefined) return;
  if (!names.is(field.type.name, "enum")) {
    report(
      "derived-field",
      `${field.name} is derived, so its values must be an enum's, not ${field.type.name}`,
      field.type,
    );
    return;
  }
  const subject = record.fields.find(({ name }) => name === on.name);
  if (subject === undefined) {
    const fields = record.fields
      .filter(({ derived }) => derived === undefined)
      .map(({ name }) => name);
    report(
      "unknown-field",
      `${on.name} is not a field of ${record.name}${among(fields, "it has none")}`,
      on,
    );
    return;
  }
  if (subject === field) {
    report("derived-field", `${field.name} cannot be derived from itself`, on);
    return;
  }
  if (subject.derived !== undefined || !names.is(subject.type.name, "enum")) {
    report(
      "derived-field",
      `${field.name} is derived from ${on.name}, whose values are not an enum's`,
      on,
    );
    return;
  }
  checkWhen(
    branches,
    on,
    { name: on.name, values: names.values(subject.type.name) },
    { name: field.name, values: names.values(field.type.name) },
    report,
  );
}

// A when's branches: each value of its subject covered once, each giving a
// value of its result. A side whose values are not known, such as a broken
// enum's, which may not all have been read, is not checked against them.
function checkWhen(
  branches: { values: Located[]; result: Located }[],
  on: Located,
  subject: { name: string; values: string[] | undefined },
  result: { name: string; values: string[] | undefined },
  report: Report,
): void {
  const allowed = subject.values;
  if (allowed !== undefined) {
    const covered = new Set<string>();
    for (const value of branches.flatMap(({ values }) => values)) {
      if (!allowed.includes(value.name)) {
        report(
          "unknown-value",
          `${JSON.stringify(value.name)} is not a value of ${subject.name} (${allowed.join(", ")})`,
          value,
        );
      } else if (covered.has(value.name)) {
        report(
          "duplicate-value",
          `${JSON.stringify(value.name)} is already covered by the when`,
          value,
        );
      }
      covered.add(value.name);
    }
    const missing = allowed.filter((value) => !covered.has(value));
    if (missing.length > 0) {
      report("incomplete-when", `when ${subject.name} does not cover ${missing.join(", ")}`, on);
    }
  }
  const results = result.values;
  if (results === undefined) return;
  for (const branch of branches) {
    if (!results.includes(branch.result.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(branch.result.name)} is not a value of ${result.name} (${results.join(", ")})`,
        branch.result,
      );
    }
  }
}

// Modifiers: on profiles that exist, each once; setting dimensions of the
// profiles' environment, each once, with one of their values; and changing
// something on each profile, or the profile it makes already exists.
function checkModifiers(file: ParseResult, names: Names, report: Report): void {
  const environment = environmentOf(file);
  for (const modifier of file.modifiers) {
    const listed = new Set<string>();
    for (const profile of modifier.on) {
      if (!names.is(profile.name, "profile")) {
        report("unknown-profile", names.not(profile.name, "profile"), profile);
      } else if (listed.has(profile.name)) {
        report(
          "duplicate-profile",
          `${profile.name} is already listed in ${modifier.name}`,
          profile,
        );
      }
      listed.add(profile.name);
    }
    if (environment === undefined) continue;
    const dimensions = environment.dimensions.map(({ name }) => name);
    const set = new Map<string, string>();
    for (const { dimension, value } of modifier.values) {
      if (!dimensions.includes(dimension.name)) {
        report(
          "unknown-dimension",
          `${dimension.name} is not a dimension of ${environment.name} (${dimensions.join(", ")})`,
          dimension,
        );
      } else if (set.has(dimension.name)) {
        report(
          "duplicate-dimension",
          `${dimension.name} is already set by ${modifier.name}`,
          dimension,
        );
      } else {
        set.set(dimension.name, value.name);
        checkChosen([value], dimension.name, names, report, modifier.name);
      }
    }
    if (set.size === 0 || modifier.broken) continue;
    for (const on of modifier.on) {
      const profile = file.profiles.find(({ name }) => name === on.name);
      if (profile === undefined) continue;
      const has = (name: string) =>
        profile.values.find(({ dimension }) => dimension.name === name)?.value.name;
      if ([...set].every(([name, value]) => has(name) === value)) {
        const already = [...set].map(([name, value]) => `${name} = ${value}`).join(", ");
        report(
          "unchanged-profile",
          `${modifier.name} changes nothing on ${profile.name}, which already has ${already}`,
          on,
          "warning",
        );
      }
    }
  }
}

// Records: lowercase fields, each once, each an enum, a record or a scalar,
// none a record with its own context, nor named context in a record with
// one; and no
// record that contains itself, which could never be written down, since
// every field is given.
function checkRecords(file: ParseResult, names: Names, report: Report): void {
  for (const record of file.records) {
    const seen = new Set<string>();
    for (const field of record.fields) {
      if (seen.has(field.name)) {
        report("duplicate-field", `${field.name} is already a field of ${record.name}`, field);
      }
      seen.add(field.name);
      if (record.context && field.name === "context") {
        report(
          "reserved-name",
          `context is ${record.name}'s context; choose another field name`,
          field,
        );
      }
      const type = field.type.name;
      if (!names.is(type, "enum") && !names.is(type, "record") && !names.is(type, "scalar")) {
        report("unknown-type", names.not(type, "enum", "record", "scalar"), field.type);
      }
      if (field.derived !== undefined) checkDerivedField(record, field, names, report);
      const inner = file.records.find(({ name }) => name === type);
      if (names.kindOf(type) === "record" && inner?.context) {
        report(
          "nested-context",
          `${record.name}.${field.name} is ${article(type)} ${type}, which has its own context`,
          field,
        );
      }
    }
  }
  const byName = new Map<string, RecordDeclaration>();
  for (const record of file.records) if (!byName.has(record.name)) byName.set(record.name, record);
  // The fields that lead from a record back to the target, if any do.
  const path = (
    from: RecordDeclaration,
    target: string,
    visited: Set<string>,
  ): { record: string; field: Field }[] | undefined => {
    for (const field of from.fields) {
      const inner =
        names.kindOf(field.type.name) === "record" ? byName.get(field.type.name) : undefined;
      if (inner === undefined) continue;
      const step = { record: from.name, field };
      if (inner.name === target) return [step];
      if (visited.has(inner.name)) continue;
      visited.add(inner.name);
      const rest = path(inner, target, visited);
      if (rest !== undefined) return [step, ...rest];
    }
    return undefined;
  };
  for (const record of byName.values()) {
    const steps = path(record, record.name, new Set());
    const first = steps?.[0];
    if (steps === undefined || first === undefined) continue;
    const through = steps
      .map(({ record: owner, field }) => {
        const type = field.type.name;
        return `${owner}.${field.name} is ${article(type)} ${type}`;
      })
      .join(", and ");
    report("recursive-record", `${record.name} contains itself: ${through}`, first.field);
  }
}

// An event, in words: "escape", "toggle.activate", "Breakpoint in (lg, xl)".
export function eventText(event: Event): string {
  if (event.kind === "named") return event.name.name;
  const values = event.values.map(({ name }) => name);
  return `${event.dimension.name} ${values.length === 1 ? `= ${values[0]}` : `in (${values.join(", ")})`}`;
}
