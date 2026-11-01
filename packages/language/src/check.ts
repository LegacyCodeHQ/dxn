import type { Field, Located, ParseResult, RecordDeclaration, Type } from "./ast.js";
import { checkTypes } from "./check-types.js";
import { checkChosen, checkWhen, type Report } from "./check-values.js";
import { among, article, Names } from "./names.js";
import { environmentOf } from "./profiles.js";
import { penNode, scalar } from "./scalars.js";
import { around } from "./scope.js";

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
  checkActors(file, names, report);
  checkContainment(file, names, report);
  checkExpectations(file, report);
}

// Actors: each records a record, which recording it gives a context.
function checkActors(file: ParseResult, names: Names, report: Report): void {
  for (const actor of file.actors) {
    const recorded = actor.records;
    if (names.kindOf(recorded.name) !== "record") {
      report("unknown-record", names.not(recorded.name, "record"), recorded);
    }
  }
}

// Expectations: each title once.
function checkExpectations(file: ParseResult, report: Report): void {
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
    report("recursive-type", `${type.name} contains itself: ${through(steps)}`, first.edge);
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
    .map(({ from, edge, to }) => `${from.name}.${edge.name} is ${article(to.name)} ${to.name}`)
    .join(", and ");
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
    ...file.actors,
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const declared = new Map<string, Located>();
  for (const declaration of declarations) {
    const written = declaration.short ?? declaration.name;
    if (scalar(written) !== undefined || written === penNode.name) {
      const what = written === penNode.name ? "built in" : "a built-in scalar";
      report("reserved-name", `${written} is ${what}; choose another name`, declaration);
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
      `${on.name} is not a field of ${record.name}${among(on.name, fields, "it has none")}`,
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
// one; and no record that contains itself, which could never be written
// down, since every field is given.
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
      if (record.context && field.name === "actor") {
        report(
          "reserved-name",
          `actor is who records ${record.name}; choose another field name`,
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
    report("recursive-record", `${record.name} contains itself: ${through(steps)}`, first.edge);
  }
}
