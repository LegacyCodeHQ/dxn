import type {
  Child,
  Derived,
  Field,
  Located,
  ParseResult,
  RecordDeclaration,
  Rule,
  State,
  Type,
} from "./ast.js";
import { among, article, Names } from "./names.js";
import { scalar } from "./scalars.js";
import { around } from "./scope.js";

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
  // A child's bindings: each a state of the child, set once, from a state of
  // the type, both with their values from one enum.
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
      if (inner !== undefined && target === undefined) {
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
      if (target.derived !== undefined || target.fixed !== undefined || target.received) {
        const why = target.received
          ? "is received"
          : `is decided by ${target.fixed === undefined ? "its when" : "its value"}`;
        report("bound-derived", `${target.name} ${why}; it cannot also be bound`, state);
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
      const { on, values } = child.when;
      if (/^[a-z]/.test(on.name)) {
        const state = type.states.find(({ name }) => name === on.name);
        if (state === undefined) {
          const states = type.states.map(({ name }) => name);
          report(
            "unknown-state",
            `${on.name} is not a state of ${type.name}${among(states, "it has none")}`,
            on,
          );
          continue;
        }
        checkChosen(values, state.enum.name, names, report, "the condition", state.name);
      } else if (!names.is(on.name, "dimension")) {
        report("unknown-dimension", names.not(on.name, "dimension"), on);
      } else {
        if (!needed.has(on.name)) {
          report(
            "unneeded-dimension",
            `${type.name} does not need ${on.name}; declare ${declare}`,
            on,
          );
        }
        checkChosen(values, on.name, names, report, "the condition");
      }
    }
  };
  // A derived state: on a dimension the type needs, covering each of its
  // values once, each branch giving a value of the state's enum.
  const checkDerived = (state: State, type: string, needed: Set<string>, declare: string) => {
    const { dimension, branches } = state.derived as Derived;
    if (!names.is(dimension.name, "dimension")) {
      report("unknown-dimension", names.not(dimension.name, "dimension"), dimension);
    } else {
      if (!needed.has(dimension.name)) {
        report(
          "unneeded-dimension",
          `${type} does not need ${dimension.name}; declare ${declare}`,
          dimension,
        );
      }
      const allowed = names.values(dimension.name);
      if (allowed !== undefined) {
        const covered = new Set<string>();
        for (const value of branches.flatMap(({ values }) => values)) {
          if (!allowed.includes(value.name)) {
            report(
              "unknown-value",
              `${JSON.stringify(value.name)} is not a value of ${dimension.name} (${allowed.join(", ")})`,
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
          report(
            "incomplete-when",
            `when ${dimension.name} does not cover ${missing.join(", ")}`,
            dimension,
          );
        }
      }
    }
    const results = names.values(state.enum.name);
    for (const { result } of branches) {
      if (results !== undefined && !results.includes(result.name)) {
        report(
          "unknown-value",
          `${JSON.stringify(result.name)} is not a value of ${state.name} (${results.join(", ")})`,
          result,
        );
      }
    }
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
    // The dimensions its rules and its derived states use, in the order
    // first used.
    const used = [
      ...new Set(
        [
          ...type.rules.map(({ when }) => when.dimension.name),
          ...type.states.flatMap(({ derived }) => (derived ? [derived.dimension.name] : [])),
          ...type.children.flatMap(({ when }) => (when ? [when.on.name] : [])),
        ].filter((name) => names.is(name, "dimension")),
      ),
    ];
    const declare = `"type ${type.name} needs ${[...new Set([...needed, ...used])].join(", ")}"`;
    if (!type.broken) {
      for (const need of type.needs) {
        if (names.is(need.name, "dimension") && !used.includes(need.name)) {
          report(
            "unused-need",
            `${type.name} needs ${need.name}, but no rule uses it`,
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
      if (state.derived !== undefined) checkDerived(state, type.name, needed, declare);
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
        report(
          "duplicate-rule",
          `${rule.state.name} = ${rule.value.name} already has a condition at line ${earlier.state.line}`,
          rule.state,
        );
      } else {
        conditioned.set(key, rule);
      }
      const { dimension, values: chosen } = rule.when;
      if (!names.is(dimension.name, "dimension")) {
        report("unknown-dimension", names.not(dimension.name, "dimension"), dimension);
        continue;
      }
      // A broken type's needs may not all have been read.
      if (!needed.has(dimension.name) && !type.broken) {
        report(
          "unneeded-dimension",
          `${type.name} does not need ${dimension.name}; declare ${declare}`,
          dimension,
        );
      }
      checkChosen(chosen, dimension.name, names, report, "the condition");
    }
    checkChildren(type, needed, declare);
    // What it provides: its own states, each once.
    const provided = new Set<string>();
    for (const name of type.provides) {
      const own = type.states.filter(({ received }) => received === undefined);
      if (!own.some((state) => state.name === name.name)) {
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
  const first = file.profiles[0];
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
  if (subject.derived !== undefined || !names.is(subject.type.name, "enum")) {
    report(
      "derived-field",
      `${field.name} is derived from ${on.name}, whose values are not an enum's`,
      on,
    );
    return;
  }
  const allowed = names.values(subject.type.name) ?? [];
  const covered = new Set<string>();
  for (const value of branches.flatMap(({ values }) => values)) {
    if (!allowed.includes(value.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(value.name)} is not a value of ${on.name} (${allowed.join(", ")})`,
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
    report("incomplete-when", `when ${on.name} does not cover ${missing.join(", ")}`, on);
  }
  const results = names.values(field.type.name) ?? [];
  for (const { result } of branches) {
    if (!results.includes(result.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(result.name)} is not a value of ${field.name} (${results.join(", ")})`,
        result,
      );
    }
  }
}

// Modifiers: on profiles that exist, each once; setting dimensions of the
// profiles' environment, each once, with one of their values; and changing
// something on each profile, or the profile it makes already exists.
function checkModifiers(file: ParseResult, names: Names, report: Report): void {
  const environment = file.environments.find(
    ({ name }) => name === file.profiles[0]?.environment.name,
  );
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
