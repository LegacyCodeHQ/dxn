import type { Field, Located, ParseResult, RecordDeclaration, Type } from "./ast.js";
import { checkTypes } from "./check-types.js";
import { checkChosen, checkWhen, type Report, reportTo } from "./check-values.js";
import { message, words } from "./message.js";
import { among, article, Names, near } from "./names.js";
import { environmentOf } from "./profiles.js";
import { penNode, scalar } from "./scalars.js";
import { around } from "./scope.js";

// Checks across declarations, scope by scope, adding to the file's
// diagnostics: the file holds each name once, an enum or a dimension each
// value once, and every name that refers to a declaration names one of the
// right kind.
export function check(file: ParseResult): void {
  const report = reportTo(file.diagnostics);
  const names = new Names(file);
  checkDeclared(file, report);
  checkValues(file, report);
  checkUsedEnums(file, names, report);
  checkTypes(file, names, report);
  checkEnvironments(file, names, report);
  checkProfiles(file, names, report);
  checkModifiers(file, names, report);
  checkRecords(file, names, report);
  checkActors(file, names, report);
  checkContainment(file, names, report);
  checkExpectations(file, report);
}

// Enums: each the values of a state or of a record's field, or it is not used.
// A name that is not an enum uses the enums it may be a misspelling of; and a
// syntax error may hide what uses one, so then none is reported.
function checkUsedEnums(file: ParseResult, names: Names, { warn }: Report): void {
  if (file.diagnostics.some(({ code }) => code === "syntax-error")) return;
  const enums = file.enums.map(({ name }) => name);
  const used = new Set(
    [
      ...file.types.flatMap(({ states }) => states.map((state) => state.enum.name)),
      ...file.records.flatMap(({ fields }) => fields.map((field) => field.type.name)),
    ].flatMap((name) => (names.kindOf(name) === undefined ? near(name, enums) : [name])),
  );
  // An enum declared twice is reported as that, and is warned of once.
  const warned = new Set<string>();
  for (const declared of file.enums) {
    if (!used.has(declared.name) && !warned.has(declared.name)) {
      warned.add(declared.name);
      warn(
        "unused-enum",
        message`${declared.name} is not used: no state or record field takes its values`,
        declared,
      );
    }
  }
}

// Actors: each records a record, which recording it gives a context.
function checkActors(file: ParseResult, names: Names, { error }: Report): void {
  for (const actor of file.actors) {
    const recorded = actor.records;
    if (names.kindOf(recorded.name) !== "record") {
      error("unknown-record", names.not(recorded.name, "record"), recorded);
    }
  }
}

// Expectations: each title once.
function checkExpectations(file: ParseResult, { error }: Report): void {
  const titles = new Map<string, number>();
  for (const expectation of file.expectations) {
    const earlier = titles.get(expectation.title);
    if (earlier !== undefined) {
      error(
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
function checkContainment(file: ParseResult, names: Names, { error }: Report): void {
  const byName = new Map<string, Type>();
  for (const type of file.types) if (!byName.has(type.name)) byName.set(type.name, type);
  // A type's children, each with its type.
  const children = (type: Type): [Located, Type][] =>
    type.children.flatMap((child) => {
      const inner =
        names.kindOf(child.type.name) === "type" ? byName.get(child.type.name) : undefined;
      return inner === undefined ? [] : [[child, inner]];
    });
  for (const type of byName.values()) {
    const steps = cycleFrom(type, children);
    const first = steps?.[0];
    if (steps === undefined || first === undefined) continue;
    error(
      "recursive-type",
      message`${type.name} contains itself: ${words(through(steps))}`,
      first.edge,
    );
  }
}

// The edges that lead from a node back to itself, if any do: each step the
// node it leaves, the edge it takes, and the node it reaches.
function cycleFrom<Node extends { name: string }>(
  start: Node,
  edges: (node: Node) => [Located, Node][],
): { from: Node; edge: Located; to: Node }[] | undefined {
  const visited = new Set<string>();
  const walk = (from: Node): { from: Node; edge: Located; to: Node }[] | undefined => {
    for (const [edge, to] of edges(from)) {
      const step = { from, edge, to };
      if (to.name === start.name) return [step];
      if (visited.has(to.name)) continue;
      visited.add(to.name);
      const rest = walk(to);
      if (rest !== undefined) return [step, ...rest];
    }
    return undefined;
  };
  return walk(start);
}

// A cycle, in words: "A.b is a B, and B.a is an A".
function through(steps: { from: { name: string }; edge: Located; to: { name: string } }[]): string {
  return steps
    .map(
      ({ from, edge, to }) =>
        message`${`${from.name}.${edge.name}`} is ${words(article(to.name))} ${to.name}`,
    )
    .join(", and ");
}

// The file: each name declared once, and none a built-in scalar's.
function checkDeclared(file: ParseResult, { error }: Report): void {
  const declarations = [
    ...file.enums,
    ...file.dimensions,
    ...file.types,
    ...file.environments,
    ...file.profiles,
    ...file.modifiers,
    ...file.records,
    ...file.actors,
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const declared = new Map<string, Located>();
  for (const declaration of declarations) {
    const written = declaration.short ?? declaration.name;
    if (scalar(written) !== undefined || written === penNode.name) {
      const what = written === penNode.name ? "built in" : "a built-in scalar";
      error(
        "reserved-name",
        message`${written} is ${words(what)}; choose another name`,
        declaration,
      );
      continue;
    }
    // Inside a type, a name cannot repeat one from around it either.
    const earlier =
      declared.get(declaration.name) ??
      (declaration.scope === undefined ? undefined : around(file, declaration).get(written));
    if (earlier !== undefined) {
      error(
        "duplicate-name",
        message`${written} is already declared at line ${earlier.line}`,
        declaration,
      );
    } else {
      declared.set(declaration.name, declaration);
    }
  }
}

// An enum or a dimension: each value once.
function checkValues(file: ParseResult, { error }: Report): void {
  for (const declaration of [...file.enums, ...file.dimensions]) {
    const seen = new Set<string>();
    for (const item of declaration.values) {
      if (seen.has(item.name)) {
        error("duplicate-value", message`${item.name} appears twice in ${declaration.name}`, item);
      }
      seen.add(item.name);
    }
  }
}

// An environment: declared dimensions, each once.
function checkEnvironments(file: ParseResult, names: Names, { error }: Report): void {
  for (const environment of file.environments) {
    const seen = new Set<string>();
    for (const dimension of environment.dimensions) {
      if (!names.is(dimension.name, "dimension")) {
        error("unknown-dimension", names.not(dimension.name, "dimension"), dimension);
      } else if (seen.has(dimension.name)) {
        error(
          "duplicate-dimension",
          message`${dimension.name} is already part of ${environment.name}`,
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
  const { error } = report;
  // The first whose environment is one: another's is reported already.
  const first = file.profiles.find(({ environment }) =>
    file.environments.some(({ name }) => name === environment.name),
  );
  for (const profile of file.profiles) {
    const named = profile.environment.name;
    const environment = file.environments.find(({ name }) => name === named);
    if (environment === undefined) {
      error("unknown-environment", names.not(named, "environment"), profile.environment);
      continue;
    }
    if (first !== undefined && first !== profile && first.environment.name !== named) {
      error(
        "mixed-profiles",
        message`${profile.name} is ${words(article(named))} ${named}, but ${first.name} is ${words(article(first.environment.name))} ${first.environment.name}; all profiles share one environment`,
        profile,
      );
    }
    const required = environment.dimensions.map(({ name }) => name);
    const given = new Set<string>();
    for (const { dimension, value } of profile.values) {
      if (!required.includes(dimension.name)) {
        // A broken environment's dimensions may not all have been read.
        if (environment.broken) continue;
        error(
          "unknown-dimension",
          message`${dimension.name} is not a dimension of ${environment.name} (${required})`,
          dimension,
        );
        continue;
      }
      if (given.has(dimension.name)) {
        error(
          "duplicate-dimension",
          message`${dimension.name} is already given in ${profile.name}`,
          dimension,
        );
        continue;
      }
      given.add(dimension.name);
      checkChosen([value], dimension.name, names, report, profile.name);
    }
    const missing = required.filter((name) => !given.has(name));
    if (missing.length > 0 && profile.broken !== true && environment.broken !== true) {
      error(
        "incomplete-profile",
        message`${profile.name} does not give ${missing}, which ${environment.name} requires`,
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
  const { error } = report;
  const { on, branches } = field.derived as NonNullable<Field["derived"]>;
  // A type that is not one is reported already.
  if (names.kindOf(field.type.name) === undefined) return;
  if (!names.is(field.type.name, "enum")) {
    error(
      "derived-field",
      message`${field.name} is derived, so its values must be an enum's, not ${field.type.name}`,
      field.type,
    );
    return;
  }
  const subject = record.fields.find(({ name }) => name === on.name);
  if (subject === undefined) {
    const fields = record.fields
      .filter(({ derived }) => derived === undefined)
      .map(({ name }) => name);
    error(
      "unknown-field",
      message`${on.name} is not a field of ${record.name}${among(on.name, fields, "it has none")}`,
      on,
    );
    return;
  }
  if (subject === field) {
    error("derived-field", message`${field.name} cannot be derived from itself`, on);
    return;
  }
  if (subject.derived !== undefined || !names.is(subject.type.name, "enum")) {
    error(
      "derived-field",
      message`${field.name} is derived from ${on.name}, whose values are not an enum's`,
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

// Modifiers: on profiles that exist, each once; setting dimensions of the
// profiles' environment, each once, with one of their values; and changing
// something on each profile, or the profile it makes already exists.
function checkModifiers(file: ParseResult, names: Names, report: Report): void {
  const { error, warn } = report;
  const environment = environmentOf(file);
  for (const modifier of file.modifiers) {
    const listed = new Set<string>();
    for (const profile of modifier.on) {
      if (!names.is(profile.name, "profile")) {
        error("unknown-profile", names.not(profile.name, "profile"), profile);
      } else if (listed.has(profile.name)) {
        error(
          "duplicate-profile",
          message`${profile.name} is already listed in ${modifier.name}`,
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
        error(
          "unknown-dimension",
          message`${dimension.name} is not a dimension of ${environment.name} (${dimensions})`,
          dimension,
        );
      } else if (set.has(dimension.name)) {
        error(
          "duplicate-dimension",
          message`${dimension.name} is already set by ${modifier.name}`,
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
        const already = [...set].map(([name, value]) => `${name} = ${value}`);
        warn(
          "unchanged-profile",
          message`${modifier.name} changes nothing on ${profile.name}, which already has ${already}`,
          on,
        );
      }
    }
  }
}

// Records: lowercase fields, each once, each an enum, a record or a scalar,
// none a record with its own context, nor named context in a record with
// one; and no record that contains itself, which could never be written
// down, since every field is given.
function checkRecords(file: ParseResult, names: Names, report: Report): void {
  const { error } = report;
  for (const record of file.records) {
    const seen = new Set<string>();
    for (const field of record.fields) {
      if (seen.has(field.name)) {
        error(
          "duplicate-field",
          message`${field.name} is already a field of ${record.name}`,
          field,
        );
      }
      seen.add(field.name);
      if (record.context && field.name === "context") {
        error(
          "reserved-name",
          message`${"context"} is ${record.name}'s context; choose another field name`,
          field,
        );
      }
      if (record.context && field.name === "actor") {
        error(
          "reserved-name",
          message`${"actor"} is who records ${record.name}; choose another field name`,
          field,
        );
      }
      const type = field.type.name;
      if (!names.is(type, "enum") && !names.is(type, "record") && !names.is(type, "scalar")) {
        error("unknown-type", names.not(type, "enum", "record", "scalar"), field.type);
      }
      if (field.derived !== undefined) checkDerivedField(record, field, names, report);
      const inner = file.records.find(({ name }) => name === type);
      if (names.kindOf(type) === "record" && inner?.context) {
        error(
          "nested-context",
          message`${`${record.name}.${field.name}`} is ${words(article(type))} ${type}, which has its own context`,
          field,
        );
      }
    }
  }
  const byName = new Map<string, RecordDeclaration>();
  for (const record of file.records) if (!byName.has(record.name)) byName.set(record.name, record);
  // A record's fields that are records, each with its record.
  const fields = (record: RecordDeclaration): [Located, RecordDeclaration][] =>
    record.fields.flatMap((field) => {
      const inner =
        names.kindOf(field.type.name) === "record" ? byName.get(field.type.name) : undefined;
      return inner === undefined ? [] : [[field, inner]];
    });
  for (const record of byName.values()) {
    const steps = cycleFrom(record, fields);
    const first = steps?.[0];
    if (steps === undefined || first === undefined) continue;
    error(
      "recursive-record",
      message`${record.name} contains itself: ${words(through(steps))}`,
      first.edge,
    );
  }
}
