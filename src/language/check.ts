import type { Declaration, Field, Located, ParseResult, RecordDeclaration, Rule } from "./ast.js";

type Kind = "enum" | "dimension" | "type" | "environment" | "profile" | "record";

type Report = (
  code: string,
  message: string,
  at: { line: number; column: number },
  severity?: "error" | "warning",
) => void;

const article = (word: string) => (/^[AEIOUaeiou]/.test(word) ? "an" : "a");

// The names the file declares, by kind, for checking the names that refer to
// them.
class Names {
  private readonly kinds = new Map<string, Kind>();

  constructor(private readonly file: ParseResult) {
    for (const [kind, list] of this.lists()) {
      for (const { name } of list) if (!this.kinds.has(name)) this.kinds.set(name, kind);
    }
  }

  private lists(): [Kind, Declaration[]][] {
    const { enums, dimensions, types, environments, profiles, records } = this.file;
    return [
      ["enum", enums],
      ["dimension", dimensions],
      ["type", types],
      ["environment", environments],
      ["profile", profiles],
      ["record", records],
    ];
  }

  private of(kind: Kind): Declaration[] {
    return this.lists().find(([candidate]) => candidate === kind)?.[1] ?? [];
  }

  // What a name is, from its first declaration.
  kindOf(name: string): Kind | undefined {
    return this.kinds.get(name);
  }

  is(name: string, kind: Kind): boolean {
    return this.of(kind).some((declaration) => declaration.name === name);
  }

  // Why a name is not of a kind, or of any of several: what it is instead,
  // or what there is to choose from.
  not(name: string, ...kinds: Kind[]): string {
    const wanted = kinds.map((kind) => `${article(kind)} ${kind}`).join(" or ");
    const actual = this.kinds.get(name);
    if (actual !== undefined) return `${name} is ${article(actual)} ${actual}, not ${wanted}`;
    const names = kinds.flatMap((kind) => this.of(kind).map((declaration) => declaration.name));
    return `${name} is not ${wanted}${among(names)}`;
  }

  // The values of an enum or a dimension, unless it is broken.
  values(name: string): string[] | undefined {
    const declaration = [...this.file.enums, ...this.file.dimensions].find(
      (candidate) => candidate.name === name,
    );
    return declaration?.broken ? undefined : declaration?.values.map((item) => item.name);
  }
}

// The names to choose from, after a name that is not one of them.
function among(names: string[], none = "the file declares none"): string {
  return names.length > 0 ? ` (${names.join(", ")})` : `; ${none}`;
}

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
  checkRecords(file, names, report);
}

// The file: each name declared once.
function checkDeclared(file: ParseResult, report: Report): void {
  const declarations = [
    ...file.enums,
    ...file.dimensions,
    ...file.types,
    ...file.environments,
    ...file.profiles,
    ...file.records,
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const declared = new Map<string, Located>();
  for (const declaration of declarations) {
    const earlier = declared.get(declaration.name);
    if (earlier !== undefined) {
      report(
        "duplicate-name",
        `${declaration.name} is already declared at line ${earlier.line}`,
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
    // The dimensions its rules use, in the order first used.
    const used = [
      ...new Set(
        type.rules
          .map(({ when }) => when.dimension.name)
          .filter((name) => names.is(name, "dimension")),
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
    }
    const stateNames = type.states.map(({ name }) => name);
    const conditioned = new Map<string, Rule>();
    for (const rule of type.rules) {
      const state = type.states.find(({ name }) => name === rule.state.name);
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
  }
}

// Values chosen from a dimension: each one of its values, and once.
function checkChosen(
  chosen: Located[],
  dimension: string,
  names: Names,
  report: Report,
  where: string,
): void {
  const allowed = names.values(dimension);
  if (allowed === undefined) return;
  const seen = new Set<string>();
  for (const item of chosen) {
    if (!allowed.includes(item.name)) {
      report(
        "unknown-value",
        `${JSON.stringify(item.name)} is not a value of ${dimension} (${allowed.join(", ")})`,
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

// Records: lowercase fields, each once, each an enum or a record; and no
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
      if (!names.is(field.type.name, "enum") && !names.is(field.type.name, "record")) {
        report("unknown-type", names.not(field.type.name, "enum", "record"), field.type);
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
