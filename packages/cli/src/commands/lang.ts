import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type Cases,
  type Check,
  type Combination,
  cases,
  coverage,
  Diagnostics,
  states as evaluateStates,
  fieldValue,
  folderOf,
  givenDimensions,
  type InPlace,
  inPlace,
  isValue,
  Names,
  type ParseResult,
  type Placement,
  type Presence,
  parse,
  parseJson,
  placement,
  profilesOf,
  type RecordDeclaration,
  renameInData,
  renameInSource,
  storedFiles,
  subjects,
  type Type,
  treePaths,
  validate,
} from "@legacycodehq/dxn-language";
import { canonical, Fingerprints } from "../fingerprint.js";
import { drawTable, NONE } from "../tables.js";
import { type Command, type Context, command } from "./context.js";

// The commands, as the overview and each command's usage list them.
export const commandList = `  check <file>                       Parse and check a file; say what it declares,
                                     or report every problem it has. Warnings
                                     are printed, but do not fail.
  states <file> <type>               Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions it needs,
                                     as a Markdown table; or a child in place,
                                     given its path from a type, such as
                                     Toolbar.menu.toggle: where it is inside its
                                     parents, with the states they give it
  cases <file> <type>                List the cases a type, or a child in place,
        [--combinations]             has: those that can be told apart, each
                                     with what it covers where it covers more
                                     than one combination; with --combinations,
                                     every combination, as if nothing were
                                     alike
  validate <file>                    Check the stored records: each record's data is
                                     every JSON file in a folder named after it in
                                     kebab-case, next to the file, each a list of
                                     records with every field given, each of its
                                     type, and no others. Print what it checked, or
                                     every problem with its line, column and path
  attach <file> <path> --file <f> --frame <id> [--field <name>=<value>]... <key>=<value>...
                                     Record a frame for each combination the
                                     context's keys give (a|b lists several) that
                                     exists in place, with its fingerprint; an
                                     entry for the same combination, frame and
                                     fields is replaced; with --dry-run, say what
                                     it would write
  status <file> [--missing]          Count, for each record with context, the
                                     combinations of every element in the file's
                                     trees, in place, and those a stored record is
                                     about; with --missing, list the others
  rename <file> <Enum>.<value> <new> Rename an enum's value in the file and in every
                                     stored record, once both check; with --dry-run,
                                     say what it would write`;

const usage = `Usage: dxn <command> <file> [options]

dxn, the language of design and dimensions, which grows one concept at a
time: see docs/language/guide.md. A .dxn file declares enums, each a named
set of values; dimensions, each listing the values the environment varies
by; types with the dimensions they need, their states, rules for when a
state's value exists, a when for a state the world decides, and the
children they have; environments, each a product of dimensions; profiles,
each an instance of an environment; modifiers, accessories that change
some profiles; records, each a named group of typed fields; and
expectations, rules checked against the tree in place. A # starts a
comment, to the end of the line:

  # The wordmark's hover only exists with a mouse.
  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark needs Pointer {
    state hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile laptop: Device { Pointer = mouse }

Commands:
${commandList}

Options:
  --json                             Print one JSON document, for tools: the result
                                     and any warnings as "problems"; on a failure,
                                     the file and its problems; on a refusal or
                                     a usage error, {"error": "<message>"}, with
                                     any problems found before a refusal
`;

// What a file declares, without positions, which are for diagnostics: each
// located name becomes just its name.
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value !== "object" || value === null) return value;
  const { line, column, scope, short, ...rest } = value as Record<string, unknown>;
  const fields = Object.keys(rest);
  if (line !== undefined && fields.length === 1 && fields[0] === "name") return rest.name;
  return Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, plain(item)]));
}

// A type, with its nested enums and types, and its children, only when it
// has any.
function nestedOnly(type: Type): unknown {
  const { enums, types, children, provides, actions, triggers, alikes, events, ...rest } = type;
  return {
    ...rest,
    ...(events.length > 0 ? { events } : {}),
    ...(alikes.length > 0 ? { alikes } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(enums.length > 0 ? { enums } : {}),
    ...(types.length > 0 ? { types: types.map(nestedOnly) } : {}),
    ...(children.length > 0 ? { children } : {}),
    ...(provides.length > 0 ? { provides } : {}),
  };
}

// A problem in a file or in its stored data, as text or as JSON.
interface Problem {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  code: string;
  path?: string;
  message: string;
}

// What a command reports, readable by default and one JSON document with
// --json: problems as they come, then a refusal, a failure or the result.
class Reporter {
  readonly problems: Problem[] = [];

  constructor(
    private readonly io: Context["io"],
    private readonly json: boolean,
    private readonly file: string,
  ) {}

  problem(problem: Problem): void {
    this.problems.push(problem);
    if (this.json) return;
    const { file, line, column, severity, code, path, message } = problem;
    const warning = severity === "warning" ? "warning: " : "";
    const at = path === undefined ? "" : `${path}: `;
    this.io.stderr(`${file}:${line}:${column}: ${warning}${code}: ${at}${message}\n`);
  }

  get failed(): boolean {
    return this.problems.some(({ severity }) => severity === "error");
  }

  // The command cannot do what was asked.
  refuse(...messages: string[]): number {
    // With --json, the problems found before the refusal stay with its error.
    const found = this.problems.length > 0 ? { problems: this.problems } : {};
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ error: messages.join("; "), ...found }, null, 2)}\n`);
    } else for (const message of messages) this.io.stderr(`dxn: ${message}\n`);
    return 1;
  }

  // The file or its data has problems, already reported.
  fail(): number {
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ file: this.file, problems: this.problems }, null, 2)}\n`);
    }
    return 1;
  }

  succeed(result: object, text: string): number {
    if (this.json) {
      this.io.stdout(`${JSON.stringify({ ...result, problems: this.problems }, null, 2)}\n`);
    } else {
      this.io.stdout(text);
    }
    return 0;
  }
}

// The arguments without --json, and whether it was given.
function options(args: string[]): { json: boolean; rest: string[] } {
  return { json: args.includes("--json"), rest: args.filter((arg) => arg !== "--json") };
}

// A command given too little or too much: why, and the usage, exit 2; with
// --json, why, as a refusal says it.
function misused(
  io: { stdout: (text: string) => void; stderr: (text: string) => void },
  json: boolean,
  message: string,
): number {
  if (json) io.stdout(`${JSON.stringify({ error: message }, null, 2)}\n`);
  io.stderr(`dxn: ${message}\n\n${usage}`);
  return 2;
}

// A count of things, singular or plural: "1 record", "3 records".
const count = (n: number, thing: string) => `${n} ${thing}${n === 1 ? "" : "s"}`;

// Reads and parses a file, reporting its problems; the exit code when it
// cannot be used.
function read(file: string, cwd: string, report: Reporter): ParseResult | number {
  const path = resolve(cwd, file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    return report.refuse(`file not found: ${JSON.stringify(file)}`);
  }
  const parsed = parse(readFileSync(path, "utf8"));
  for (const { line, column, severity, code, message } of parsed.diagnostics) {
    report.problem({ file, line, column, severity, code, message });
  }
  return report.failed ? report.fail() : parsed;
}

const check: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args);
  if (file === undefined || rest.length > 0) {
    return misused(io, json, "give one file to check");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const { enums, dimensions, types, environments, profiles, modifiers, records, expectations } =
    parsed;
  const output = {
    file,
    // Declarations inside a type are listed in it, not with the file's own.
    ...(plain({
      enums: enums.filter(({ scope }) => scope === undefined),
      dimensions,
      types: types.filter(({ scope }) => scope === undefined).map(nestedOnly),
      environments,
    }) as object),
    profiles: profiles.map(({ values, ...profile }) => ({
      ...(plain(profile) as object),
      values: Object.fromEntries(
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ),
    })),
    modifiers: modifiers.map(({ name, on, values }) => ({
      name,
      on: on.map((profile) => profile.name),
      values: Object.fromEntries(
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ),
    })),
    records: plain(records),
    expectations: expectations.map(({ title, path, below, when, assertion, values }) => ({
      title,
      path: path.name,
      ...(below ? { below } : {}),
      when: Object.fromEntries(when.map(({ key, value }) => [key.name, value.name])),
      assertion,
      ...(assertion === "absent"
        ? {}
        : { values: Object.fromEntries(values.map(({ key, value }) => [key.name, value.name])) }),
    })),
  };
  const declared = (
    [
      ["enum", enums],
      ["dimension", dimensions],
      ["type", types],
      ["environment", environments],
      ["profile", profiles],
      ["modifier", modifiers],
      ["record", records],
      ["expectation", expectations],
    ] as const
  )
    .filter(([, list]) => list.length > 0)
    .map(([kind, list]) => count(list.length, kind));
  return report.succeed(
    output,
    `${file}: ${declared.length > 0 ? declared.join(", ") : "nothing declared"}\n`,
  );
});

const statesCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, typeName, ...rest],
  } = options(args);
  if (file === undefined || typeName === undefined || rest.length > 0) {
    return misused(io, json, "give a file and a type");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  // A path to a child, "<Type>.<child>...", is evaluated in place.
  if (typeName.split(".").some((segment) => /^[a-z]/.test(segment))) {
    return statesInPlace(parsed, typeName, report);
  }
  if (!parsed.types.some(({ name }) => name === typeName)) {
    return report.refuse(
      `no type ${JSON.stringify(typeName)} in ${file} (${parsed.types.map(({ name }) => name).join(", ")})`,
    );
  }
  const evaluated = evaluateStates(parsed, typeName);
  const stateType = parsed.types.find(({ name }) => name === typeName) as Type;
  const children = stateType.children.map(({ name }) => name);
  // Where a child is: there, not there, or for which values of a state.
  const presence = (value: Presence | undefined) => {
    if (value === undefined || value === false) return NONE;
    if (value === true) return "✓";
    if (typeof value === "string") return value;
    return Object.entries(value)
      .map(([state, values]) =>
        values.length === 1 ? `${state} = ${values[0]}` : `${state} in (${values.join(", ")})`,
      )
      .join(", ");
  };
  const [split, own] = splitStates(stateType);
  return report.succeed(
    evaluated,
    compactTable(parsed, {
      name: typeName,
      keys: [...evaluated.dimensions, ...split],
      states: own,
      children: children.map((child) => `has ${child}`),
      rows: evaluated.rows.map((row) => ({
        profiles: row.profiles,
        keys: [
          ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
          ...split.map((state) => values(row.states[state])),
        ],
        states: own.map((state) => values(row.states[state])),
        children: children.map((child) => presence(row.children?.[child])),
      })),
    }),
  );
});

// A type's states that another's rule depends on, which split its rows and so
// say where a row is, and its other states.
function splitStates(type: Type): [string[], string[]] {
  const named = new Set(type.rules.flatMap((rule) => subjects(rule.when).map(({ name }) => name)));
  const names = type.states.map(({ name }) => name);
  return [names.filter((name) => named.has(name)), names.filter((name) => !named.has(name))];
}

// The values a state has in a row, or none.
const values = (list: string[] | undefined) =>
  list === undefined || list.length === 0 ? NONE : list.join(", ");

// A matrix as a compact table. Each row says where it is, in its key columns
// (its profiles, dimensions, parents' states and states another depends on),
// then the values of each other state, then where each child is. Rows that
// read the same are one, naming each of their profiles; where every row is on
// every profile, there is no profiles column; and a key that is the same in
// every row is said once, above the table.
function compactTable(
  parsed: ParseResult,
  table: {
    // What the table is of: a type, or a child by its path.
    name: string;
    keys: string[];
    states: string[];
    children: string[];
    rows: { profiles?: string[]; keys: string[]; states: string[]; children: string[] }[];
  },
): string {
  const merged: { profiles: string[]; cells: string[] }[] = [];
  for (const row of table.rows) {
    const cells = [...row.keys, ...row.states, ...row.children];
    const same = merged.find((earlier) => earlier.cells.every((cell, i) => cell === cells[i]));
    if (same !== undefined) same.profiles.push(...(row.profiles ?? []));
    else merged.push({ profiles: [...(row.profiles ?? [])], cells });
  }
  const all = profilesOf(parsed).map(({ name }) => name);
  const profiled =
    all.length > 0 && !merged.every(({ profiles }) => all.every((name) => profiles.includes(name)));
  const said: string[] = [];
  const shown = (index: number) => {
    if (merged.length < 2 || index >= table.keys.length) return true;
    const first = merged[0]?.cells[index];
    if (merged.some(({ cells }) => cells[index] !== first)) return true;
    said.push(`${table.keys[index]} = ${first}`);
    return false;
  };
  const columns = [...table.keys, ...table.states, ...table.children]
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => shown(index));
  const profilesText = (profiles: string[]) => profiles.join(", ");
  const sameProfiles =
    profiled && merged.length > 1
      ? merged.every(
          ({ profiles }) => profilesText(profiles) === profilesText(merged[0]?.profiles ?? []),
        )
      : false;
  if (sameProfiles) said.unshift(profilesText(merged[0]?.profiles ?? []));
  const withProfiles = profiled && !sameProfiles;
  // One combination with nothing in it has no table to draw.
  if (columns.length === 0 && !withProfiles && said.length === 0) {
    return `${table.name}: one combination, with no states\n`;
  }
  const drawn = drawTable(
    [...(withProfiles ? ["profiles"] : []), ...columns.map(({ header }) => header)],
    merged.map(({ profiles, cells }) => [
      ...(withProfiles ? [profilesText(profiles)] : []),
      ...columns.map(({ index }) => cells[index] as string),
    ]),
  );
  return said.length === 0 ? drawn : `In every row: ${said.join(", ")}\n\n${drawn}`;
}

// The cases of a type, or of a child in place, as a table: each case by the
// values that tell it apart, and, where a case covers several combinations,
// what it covers: its profiles, or, without profiles, each combination, by
// the values the case does not show. With --combinations, every combination,
// as if nothing were alike.
const casesCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, target, ...rest],
  } = options(args.filter((arg) => arg !== "--combinations"));
  if (file === undefined || target === undefined || rest.length > 0) {
    return misused(io, json, "give a file and a type");
  }
  const all = args.includes("--combinations");
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  let found: Cases;
  try {
    found = cases(parsed, target, { alike: !all });
  } catch (error) {
    return report.refuse((error as Error).message);
  }
  const columns = [...new Set(found.cases.flatMap(({ values }) => Object.keys(values)))];
  const profiled = found.cases.some(({ combinations }) =>
    combinations.some(({ profiles }) => profiles !== undefined),
  );
  const profilesOfCase = ({ combinations }: Cases["cases"][number]) =>
    [...new Set(combinations.flatMap(({ profiles }) => profiles ?? []))].join(", ");
  const covered = (each: Cases["cases"][number]) => {
    if (profiled) return profilesOfCase(each);
    return (
      each.combinations
        .map((combination) =>
          found.subjects
            .map((name) => [name, combination.dimensions[name] ?? combination.states[name]])
            .filter(([name, value]) => value !== undefined && each.values[name as string] !== value)
            .map(([name, value]) => `${name} = ${value}`)
            .join(", "),
        )
        .filter((shown) => shown !== "")
        .join("; ") || NONE
    );
  };
  // Every combination its own case: its profiles first, as states shows
  // them. Otherwise, what a case covers only where it covers more than
  // one.
  const single = found.cases.every(({ combinations }) => combinations.length === 1);
  const table = all
    ? drawTable(
        [...(profiled ? ["profiles"] : []), ...columns],
        found.cases.map((each) => [
          ...(profiled ? [profilesOfCase(each)] : []),
          ...columns.map((column) => each.values[column] ?? NONE),
        ]),
      )
    : drawTable(
        [...columns, ...(single ? [] : [profiled ? "profiles" : "combinations"])],
        found.cases.map((each) => [
          ...columns.map((column) => each.values[column] ?? NONE),
          ...(single ? [] : [covered(each)]),
        ]),
      );
  const counted = all
    ? count(found.combinations, "combination")
    : single
      ? count(found.cases.length, "case")
      : `${count(found.cases.length, "case")} of ${count(found.combinations, "combination")}`;
  return report.succeed(found, `${target}: ${counted}\n\n${table}`);
});

// A child's states in place, as a table: each row a world and the states of
// its parents on the way, then the child's own.
function statesInPlace(parsed: ParseResult, path: string, report: Reporter): number {
  let evaluated: InPlace;
  try {
    evaluated = inPlace(parsed, path);
  } catch (error) {
    return report.refuse((error as Error).message);
  }
  const type = parsed.types.find(({ name }) => name === evaluated.type) as Type;
  const parents = [...new Set(evaluated.rows.flatMap((row) => Object.keys(row.parents)))];
  const [split, own] = splitStates(type);
  return report.succeed(
    evaluated,
    compactTable(parsed, {
      name: path,
      keys: [...evaluated.dimensions, ...parents, ...split],
      states: own,
      children: [],
      rows: evaluated.rows.map((row) => ({
        profiles: row.profiles,
        keys: [
          ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
          ...parents.map((parent) => row.parents[parent] ?? NONE),
          ...split.map((state) => values(row.states[state])),
        ],
        states: own.map((state) => values(row.states[state])),
        children: [],
      })),
    }),
  );
}

// A stored data file of a record: its path as shown, and its content.
interface Stored {
  record: string;
  folder: string;
  shown: string;
  path: string;
  source: string;
}

// Every stored data file of the file's records, by convention: the JSON files
// in each record's folder, next to the file.
function storedData(parsed: ParseResult, file: string, cwd: string): Stored[] {
  const directory = resolve(cwd, dirname(file));
  const seen = new Set<string>();
  const stored: Stored[] = [];
  for (const { name } of parsed.records) {
    if (seen.has(name)) continue;
    seen.add(name);
    const folder = folderOf(name);
    for (const data of storedFiles(directory, name) ?? []) {
      const path = join(directory, folder, data);
      const shown = join(dirname(file), folder, data);
      stored.push({ record: name, folder, shown, path, source: readFileSync(path, "utf8") });
    }
  }
  return stored;
}

// Why each record stored without a context cannot be: it would be a fact
// about nothing.
function storedWithoutContext(parsed: ParseResult, file: string, cwd: string): string[] {
  const directory = resolve(cwd, dirname(file));
  return parsed.records
    .filter(({ name, context }) => !context && storedFiles(directory, name) !== undefined)
    .map(
      ({ name }) =>
        `${name} is stored in ${folderOf(name)}/, but has no context; declare "record ${name} with context"`,
    );
}

// Checks stored data against the file, reporting every problem; whether all of
// it is valid.
function checkStored(parsed: ParseResult, stored: Stored[], report: Reporter): boolean {
  let valid = true;
  for (const { record, shown, source } of stored) {
    for (const { line, column, code, path, message } of validate(parsed, record, source)) {
      report.problem({ file: shown, line, column, severity: "error", code, path, message });
      valid = false;
    }
  }
  return valid && !duplicates(stored, report);
}

// Two stored records of one record that are the same in everything but at and
// fingerprint, which say when one was recorded, not what: each repeat is
// reported, across the record's files. Whether there was one.
function duplicates(stored: Stored[], report: Reporter): boolean {
  const seen = new Map<string, { shown: string; index: number }>();
  let found = false;
  for (const { record, shown, source } of stored) {
    const root = parseJson(source).root;
    (JSON.parse(source) as Record<string, unknown>[]).forEach((entry, index) => {
      const { at: _at, fingerprint: _fingerprint, ...what } = entry;
      const key = `${record}\u0000${JSON.stringify(canonical(what))}`;
      const earlier = seen.get(key);
      if (earlier === undefined) {
        seen.set(key, { shown, index });
        return;
      }
      const element = root?.kind === "array" ? root.elements[index] : undefined;
      const located = new Diagnostics(source);
      const path = `$[${index}]`;
      const message = `the same ${record} as $[${earlier.index}] in ${earlier.shown}, apart from at and fingerprint`;
      located.report("duplicate-record", message, path, element?.span.start ?? 0);
      const { line, column } = located.items[0] as { line: number; column: number };
      report.problem({
        file: shown,
        line,
        column,
        severity: "error",
        code: "duplicate-record",
        path,
        message,
      });
      found = true;
    });
  }
  return found;
}

const validateCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args);
  if (file === undefined || rest.length > 0) {
    return misused(io, json, "give one file, whose stored records to check");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const uncontexted = storedWithoutContext(parsed, file, cwd);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const data = storedData(parsed, file, cwd);
  if (!checkStored(parsed, data, report)) return report.fail();
  const directory = resolve(cwd, dirname(file));
  const stored = parsed.records
    .filter(({ name }, index) => parsed.records.findIndex((other) => other.name === name) === index)
    .filter(({ name }) => storedFiles(directory, name) !== undefined)
    .map(({ name }) => {
      const files = data.filter(({ record }) => record === name);
      return {
        record: name,
        folder: folderOf(name),
        files: files.length,
        records: files.reduce(
          (total, { source }) => total + (JSON.parse(source) as unknown[]).length,
          0,
        ),
      };
    });
  const lines =
    stored.length === 0
      ? [`${file}: no stored records`]
      : stored.map(
          ({ record, folder, files, records }) =>
            `${file}: ${record}, ${count(records, "record")} in ${count(files, "file")} in ${folder}/`,
        );
  return report.succeed({ file, stored }, lines.map((line) => `${line}\n`).join(""));
});

const renameCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const {
    json,
    rest: [file, target, to, ...rest],
  } = options(args);
  const dot = target?.lastIndexOf(".") ?? -1;
  if (
    file === undefined ||
    target === undefined ||
    to === undefined ||
    rest.length > 0 ||
    dot < 1
  ) {
    return misused(io, json, "give a file, <Enum>.<value> and the value's new name");
  }
  const enumName = target.slice(0, dot);
  const from = target.slice(dot + 1);
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const names = new Names(parsed);
  const values = names.values(enumName) ?? [];
  const refusal =
    names.kindOf(enumName) !== "enum"
      ? names.not(enumName, "enum")
      : !values.includes(from)
        ? `${JSON.stringify(from)} is not a value of ${enumName} (${values.join(", ")})`
        : values.includes(to)
          ? `${JSON.stringify(to)} is already a value of ${enumName}`
          : !isValue(to)
            ? `${JSON.stringify(to)} is not a value: a letter or digit, then letters, digits and hyphens`
            : undefined;
  if (refusal !== undefined) return report.refuse(refusal);
  const uncontexted = storedWithoutContext(parsed, file, cwd);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const stored = storedData(parsed, file, cwd);
  if (!checkStored(parsed, stored, report)) return report.fail();
  const path = resolve(cwd, file);
  const source = renameInSource(parsed, readFileSync(path, "utf8"), enumName, from, to);
  const written = [{ shown: file, path, source }];
  let records = 0;
  for (const data of stored) {
    const renamed = renameInData(parsed, data.record, data.source, enumName, from, to);
    if (renamed.changed === 0) continue;
    records += renamed.changed;
    written.push({ shown: data.shown, path: data.path, source: renamed.source });
  }
  // The renamed file and data must check, before anything is written.
  const after = parse(source);
  const writtenData = new Map(written.map((item) => [item.path, item.source]));
  const afterStored = stored.map((data) => ({
    ...data,
    source: writtenData.get(data.path) ?? data.source,
  }));
  const left = after.diagnostics.filter(({ severity }) => severity === "error");
  for (const { line, column, severity, code, message } of left) {
    report.problem({ file, line, column, severity, code, message });
  }
  if (left.length > 0 || !checkStored(after, afterStored, report)) {
    return report.refuse("the rename would leave problems; nothing was written");
  }
  const what = `${target} to ${to} in ${written.map(({ shown }) => shown).join(", ")} (${count(records, "value")})`;
  if (dryRun) {
    return report.succeed(
      {
        dryRun: true,
        written: Object.fromEntries(written.map(({ shown, source }) => [shown, source])),
      },
      `Would rename ${what}\n`,
    );
  }
  for (const item of written) writeFileSync(item.path, item.source);
  return report.succeed(
    { file, enum: enumName, from, to, written: written.map(({ shown }) => shown), records },
    `Renamed ${what}\n`,
  );
});

const statusCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args.filter((arg) => arg !== "--missing"));
  const listMissing = args.includes("--missing");
  if (file === undefined || rest.length > 0) {
    return misused(io, json, "give one file, whose evidence to count");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const uncontexted = storedWithoutContext(parsed, file, cwd);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const data = storedData(parsed, file, cwd);
  if (!checkStored(parsed, data, report)) return report.fail();
  // Whether an entry's frame is as recorded: its fingerprint now, against
  // the one stored.
  const repository = repositoryOf(file, cwd);
  const fingerprints = new Fingerprints();
  const check: Check = ({ file: where, frame, fingerprint, tool }) => {
    const full = join(repository, where);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) return "gone";
    const now = fingerprints.of(full, frame, tool === "file" ? "file" : undefined);
    if (now === undefined) return "gone";
    return now === fingerprint ? "present" : "stale";
  };
  // By convention, a record is fingerprinted when it has a fingerprint field
  // next to a source { file, frame }.
  const fingerprinted = (name: string) => {
    const declared = parsed.records.find((candidate) => candidate.name === name);
    const source = parsed.records.find(
      ({ name: inner }) =>
        inner === declared?.fields.find(({ name: field }) => field === "source")?.type.name,
    );
    return (
      declared?.fields.some(({ name: field }) => field === "fingerprint") === true &&
      ["file", "frame"].every(
        (field) => source?.fields.some(({ name: own }) => own === field) === true,
      )
    );
  };
  // By convention, a pen-dev entry's file is a pen.dev file.
  let wrong = false;
  for (const stored of data) {
    const declared = parsed.records.find(({ name }) => name === stored.record);
    if (declared === undefined) continue;
    const entries = JSON.parse(stored.source) as Record<string, unknown>[];
    const root = parseJson(stored.source).root;
    entries.forEach((entry, index) => {
      const where = (entry.source as { file?: string } | undefined)?.file;
      if (fieldValue(declared, entry, "tool") !== "pen-dev" || where === undefined) return;
      // A file that is not there is gone, which status counts.
      const full = join(repository, where);
      if (statSync(full, { throwIfNoEntry: false }) === undefined) return;
      if (fingerprints.isPen(full)) return;
      const element = root?.kind === "array" ? root.elements[index] : undefined;
      const sourceNode =
        element?.kind === "object"
          ? element.members.find(({ key }) => key.value === "source")?.value
          : undefined;
      const fileNode =
        sourceNode?.kind === "object"
          ? sourceNode.members.find(({ key }) => key.value === "file")?.value
          : undefined;
      const located = new Diagnostics(stored.source);
      const path = `$[${index}].source.file`;
      const message = `${toolOwner(declared, entry)} records with pen-dev; ${JSON.stringify(where)} is not a pen.dev file`;
      located.report("wrong-tool", message, path, fileNode?.span.start ?? 0);
      const { line, column } = located.items[0] as { line: number; column: number };
      report.problem({
        file: stored.shown,
        line,
        column,
        severity: "error",
        code: "wrong-tool",
        path,
        message,
      });
      wrong = true;
    });
  }
  if (wrong) return report.fail();
  // Every element must be evaluable in place: a received state, provided.
  for (const path of treePaths(parsed)) {
    try {
      placement(parsed, path);
    } catch (error) {
      return report.refuse(`${path}: ${(error as Error).message}`);
    }
  }
  const records = parsed.records
    .filter(({ context }) => context)
    .map(({ name }) => ({
      ...coverage(
        parsed,
        name,
        data.filter(({ record }) => record === name).map(({ source }) => source),
        fingerprinted(name) ? check : undefined,
      ),
      fingerprinted: fingerprinted(name),
    }));
  // A combination, as its path and where it is: "<path> on <profiles>,
  // <Dimension> <value> with <parent> = <value>: <state> = <value>".
  // A combination that covers every profile is the same on all of them.
  const everyProfile = profilesOf(parsed).map(({ name }) => name);
  const describe = (path: string, combination: Combination) => {
    const covered = combination.profiles ?? [];
    const world = [
      ...(everyProfile.every((name) => covered.includes(name)) ? [] : covered),
      ...Object.entries(combination.dimensions).map(([name, value]) => `${name} ${value}`),
    ].join(", ");
    const parents = Object.entries(combination.parents)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ");
    const states = Object.entries(combination.states)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ");
    return `${path}${world === "" ? "" : ` on ${world}`}${parents === "" ? "" : ` with ${parents}`}${states === "" ? "" : `: ${states}`}`;
  };
  const blocks = records.map((coverage) => {
    const { record, combinations, present, stale, gone, paths } = coverage;
    const table = drawTable(
      ["path", "combinations", "present", "stale", "gone", "missing"],
      paths.map((path) => [
        path.path,
        String(path.combinations),
        String(path.present),
        String(path.stale.length),
        String(path.gone.length),
        String(path.missing.length),
      ]),
    );
    // Each combination that is not present, under what it is.
    const listed = (heading: string, of: "missing" | "stale" | "gone") => {
      const lines = paths.flatMap((path) =>
        path[of].map((combination) => `  ${describe(path.path, combination)}\n`),
      );
      return lines.length === 0 ? "" : `\n${heading}:\n${lines.join("")}`;
    };
    const notes = [
      ...(stale > 0 ? [`${stale} stale`] : []),
      ...(gone > 0 ? [`${gone} gone`] : []),
      ...(coverage.fingerprinted
        ? []
        : [
            `${record} has no fingerprint field next to a source { file, frame }, so staleness is not checked`,
          ]),
    ];
    const summary = `${file}: ${record} for ${present} of ${count(combinations, "combination")}${notes.map((note) => `; ${note}`).join("")}`;
    return `${summary}\n\n${table}${
      listMissing
        ? `${listed("Missing", "missing")}${listed("Stale", "stale")}${listed("Gone", "gone")}`
        : ""
    }`;
  });
  const text = blocks.length === 0 ? `${file}: no records with context\n` : blocks.join("\n");
  // In JSON, each count a number, and each combination not present listed.
  const counted = records.map(({ paths, stale, gone, ...rest }) => ({
    ...rest,
    stale,
    gone,
    missing: paths.reduce((sum, path) => sum + path.missing.length, 0),
    paths: paths.map((path) => ({
      path: path.path,
      combinations: path.combinations,
      present: path.present,
      stale: path.stale.length,
      gone: path.gone.length,
      missing: path.missing.length,
      listed: { stale: path.stale, gone: path.gone, missing: path.missing },
    })),
  }));
  return report.succeed({ file, records: counted }, text);
});

// Who records with a record's tool, in messages: the value of the field the
// tool is derived from, or the record.
function toolOwner(record: RecordDeclaration, entry: Record<string, unknown>): string {
  const on = record.fields.find(({ name }) => name === "tool")?.derived?.on.name;
  return on === undefined ? record.name : String(entry[on]);
}

// The repository a file is in: the nearest folder above it with a .git, or
// the working directory.
function repositoryOf(file: string, cwd: string): string {
  for (let at = dirname(resolve(cwd, file)); ; at = dirname(at)) {
    if (statSync(join(at, ".git"), { throwIfNoEntry: false }) !== undefined) return at;
    if (dirname(at) === at) return cwd;
  }
}

const attachCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const { json, rest } = options(args);
  // The options with a value, and the context's key=value pairs.
  const flags = new Map<string, string[]>();
  const pairs: string[] = [];
  const positional: string[] = [];
  const valued = ["--file", "--frame", "--field", "--at", "--record"];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] as string;
    // An option's value comes after a space; "--file=x" is not a context pair.
    const joined = valued.find((option) => arg.startsWith(`${option}=`));
    if (joined !== undefined) {
      return misused(
        io,
        json,
        `write "${joined} ${arg.slice(joined.length + 1)}", with a space, not "${arg}"`,
      );
    }
    if (valued.includes(arg)) {
      flags.set(arg, [...(flags.get(arg) ?? []), rest[index + 1] ?? ""]);
      index++;
    } else if (arg.includes("=")) pairs.push(arg);
    else positional.push(arg);
  }
  // Each option once, but --field once for each field, as <name>=<value>.
  for (const [option, values] of flags) {
    if (option !== "--field" && values.length > 1) {
      return misused(io, json, `give ${option} once`);
    }
  }
  const unpaired = flags.get("--field")?.find((pair) => !pair.includes("="));
  if (unpaired !== undefined) {
    return misused(io, json, `--field takes <name>=<value>, found ${JSON.stringify(unpaired)}`);
  }
  const [file, path, ...extra] = positional;
  const source = flags.get("--file")?.[0];
  const frame = flags.get("--frame")?.[0];
  if (file === undefined || path === undefined || extra.length > 0 || !source || !frame) {
    return misused(io, json, "give a file, a path, --file and --frame, and the context");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const uncontexted = storedWithoutContext(parsed, file, cwd);
  if (uncontexted.length > 0) return report.refuse(...uncontexted);
  const data = storedData(parsed, file, cwd);
  if (!checkStored(parsed, data, report)) return report.fail();
  // The record: the one given, or the only one with context.
  const named = flags.get("--record")?.[0];
  const candidates = parsed.records.filter(
    ({ context, name }) => context && (named === undefined || name === named),
  );
  const record = candidates[0];
  if (record === undefined || (named === undefined && candidates.length > 1)) {
    return report.refuse(
      named === undefined
        ? `give the record, as --record <name> (${parsed.records
            .filter(({ context }) => context)
            .map(({ name }) => name)
            .join(", ")})`
        : `${named} is not a record with context`,
    );
  }
  let place: Placement;
  try {
    place = placement(parsed, path);
  } catch (error) {
    return report.refuse((error as Error).message);
  }
  // The context's keys, and the values each can take.
  const names = new Names(parsed);
  const profiled = parsed.profiles.length > 0;
  const given = givenDimensions(parsed);
  const keys: [string, string, string[]][] = [
    ...(profiled
      ? ([["profile", "profile", profilesOf(parsed).map(({ name }) => name)]] as [
          string,
          string,
          string[],
        ][])
      : []),
    ...place.dimensions
      .filter((name) => !given.includes(name))
      .map((name) => [name, "dimension", names.values(name) ?? []] as [string, string, string[]]),
    ...place.parents.map(
      ({ key, state }) =>
        [key, "parent", names.values(state.enum.name) ?? []] as [string, string, string[]],
    ),
    ...place.target.states.map(
      ({ name, enum: of }) =>
        [name, "state", names.values(of.name) ?? []] as [string, string, string[]],
    ),
  ];
  const chosen = new Map<string, string[]>();
  for (const pair of pairs) {
    const [key, value = ""] = pair.split(/=(.*)/s);
    const entry = keys.find(([name]) => name === key);
    if (entry === undefined) {
      return report.refuse(
        `${JSON.stringify(key)} is not part of a context of ${path} (${keys.map(([name]) => name).join(", ")})`,
      );
    }
    const values = value.split("|");
    for (const one of values) {
      if (!entry[2].includes(one)) {
        const what = key === "profile" ? "a profile" : `a value of ${key}`;
        return report.refuse(`${JSON.stringify(one)} is not ${what} (${entry[2].join(", ")})`);
      }
    }
    chosen.set(key as string, values);
  }
  for (const [name] of keys) {
    if (!chosen.has(name)) {
      return report.refuse(`give ${name}, as ${name}=<value>, or several as ${name}=<a>|<b>`);
    }
  }
  // Every combination listed, kept where it exists in place.
  let combinations: Record<string, string>[] = [{}];
  for (const [name] of keys) {
    combinations = combinations.flatMap((combination) =>
      (chosen.get(name) ?? []).map((value) => ({ ...combination, [name]: value })),
    );
  }
  const rows = inPlace(parsed, path).rows;
  const contexts = combinations
    .map((combination) => ({
      path,
      ...(profiled ? { profile: combination.profile as string } : {}),
      dimensions: Object.fromEntries(
        keys
          .filter(([, kind]) => kind === "dimension")
          .map(([name]) => [name, combination[name] as string]),
      ),
      parents: Object.fromEntries(
        keys
          .filter(([, kind]) => kind === "parent")
          .map(([name]) => [name, combination[name] as string]),
      ),
      states: Object.fromEntries(
        keys
          .filter(([, kind]) => kind === "state")
          .map(([name]) => [name, combination[name] as string]),
      ),
    }))
    .filter((context) =>
      rows.some(
        (row) =>
          (context.profile === undefined || row.profiles?.includes(context.profile) === true) &&
          Object.entries(context.dimensions).every(([name, value]) => row.when[name] === value) &&
          Object.entries(context.parents).every(([name, value]) => row.parents[name] === value) &&
          Object.entries(context.states).every(([name, value]) =>
            row.states[name]?.includes(value),
          ),
      ),
    );
  if (contexts.length === 0) {
    return report.refuse(
      `no combination given exists for ${path}; dxn states ${file} ${path} lists them`,
    );
  }
  // The frame, and its fingerprint now.
  const repository = repositoryOf(file, cwd);
  const full = join(repository, source);
  if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
    return report.refuse(`${JSON.stringify(source)} does not exist in the repository`);
  }
  // The record's fields: by convention, at is when, source where the frame is
  // and fingerprint its fingerprint; a derived one is not stored; the others
  // are given with --field.
  const fields = new Map(
    (flags.get("--field") ?? []).map((pair) => pair.split(/=(.*)/s) as [string, string]),
  );
  // A field the record does not have is named before what is missing.
  for (const name of fields.keys()) {
    if (!record.fields.some((field) => field.name === name)) {
      return report.refuse(
        `${record.name} has no field ${JSON.stringify(name)} (${record.fields.map((field) => field.name).join(", ")})`,
      );
    }
  }
  if (
    !record.fields.some(({ name }) => name === "fingerprint") ||
    !record.fields.some(({ name }) => name === "source")
  ) {
    return report.refuse(
      `${record.name} has no fingerprint field next to a source { file, frame }; attach needs both`,
    );
  }
  const stamp = flags.get("--at")?.[0] ?? new Date().toISOString();
  const values: Record<string, unknown> = {};
  for (const field of record.fields) {
    // A derived field follows from another, so it is never given.
    if (field.derived !== undefined) {
      if (fields.has(field.name)) {
        return report.refuse(
          `${field.name} follows from ${field.derived.on.name}, so it is not given`,
        );
      }
      continue;
    }
    if (field.name === "source") values.source = { file: source, frame };
    else if (field.name === "fingerprint") values.fingerprint = "";
    else if (field.name === "at" && !fields.has("at")) values.at = stamp;
    else if (fields.has(field.name)) values[field.name] = fields.get(field.name);
    else return report.refuse(`give ${field.name}, as --field ${field.name}=<value>`);
  }
  // By convention, the record's tool says how its frames are fingerprinted:
  // pen-dev, a frame in a pen.dev file; file, the whole file.
  const fingerprints = new Fingerprints();
  const tool = fieldValue(record, values, "tool");
  if (tool === "pen-dev" && !fingerprints.isPen(full)) {
    return report.refuse(
      `${toolOwner(record, values)} records with pen-dev; ${JSON.stringify(source)} is not a pen.dev file`,
    );
  }
  const fingerprint = fingerprints.of(full, frame, tool === "file" ? "file" : undefined);
  if (fingerprint === undefined)
    return report.refuse(`frame ${JSON.stringify(frame)} is not in ${source}`);
  values.fingerprint = fingerprint;
  // An entry for the same combination, frame and given fields is replaced
  // where it is stored, in whichever of the record's files; a new one goes
  // into the record's folder, in a file named after the path's type.
  const folder = folderOf(record.name);
  const target = `${folderOf(place.steps[0]?.type.name ?? record.name)}.json`;
  const directory = resolve(cwd, dirname(file));
  const files = new Map<string, { shown: string; entries: Record<string, unknown>[] }>();
  for (const stored of data.filter((candidate) => candidate.record === record.name)) {
    files.set(stored.path, {
      shown: stored.shown,
      entries: JSON.parse(stored.source) as Record<string, unknown>[],
    });
  }
  // Key order does not count: an entry written by hand is the same entry.
  const alike = (a: unknown, b: unknown) =>
    JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const same = (entry: Record<string, unknown>, context: object) =>
    alike(entry.context, context) &&
    alike(entry.source, values.source) &&
    // When it was recorded does not make it another entry.
    [...fields.keys()]
      .filter((name) => name !== "at" && name !== "fingerprint")
      .every((name) => entry[name] === fields.get(name));
  const changed = new Set<string>();
  let replaced = 0;
  for (const context of contexts) {
    const entry = { context, ...values };
    const holding = [...files].find(([, { entries }]) =>
      entries.some((candidate) => same(candidate, context)),
    );
    if (holding !== undefined) {
      const [path, { entries }] = holding;
      entries[entries.findIndex((candidate) => same(candidate, context))] = entry;
      changed.add(path);
      replaced++;
      continue;
    }
    const path = join(directory, folder, target);
    const into = files.get(path) ?? { shown: join(dirname(file), folder, target), entries: [] };
    into.entries.push(entry);
    files.set(path, into);
    changed.add(path);
  }
  const writes = [...changed].map((path) => {
    const { shown, entries } = files.get(path) as { shown: string; entries: unknown[] };
    return { path, shown, written: `${JSON.stringify(entries, null, 2)}\n` };
  });
  let invalid = false;
  for (const { shown, written } of writes) {
    for (const { line, column, code, path: where, message } of validate(
      parsed,
      record.name,
      written,
    )) {
      report.problem({ file: shown, line, column, severity: "error", code, path: where, message });
      invalid = true;
    }
  }
  if (invalid) return report.fail();
  const shown = writes.map((write) => write.shown).join(", ");
  const summary = `${count(contexts.length, "record")} to ${shown}${replaced > 0 ? `, replacing ${replaced}` : ""}`;
  if (dryRun) {
    return report.succeed(
      {
        dryRun: true,
        written: Object.fromEntries(writes.map((write) => [write.shown, write.written])),
      },
      `Would attach ${summary}\n`,
    );
  }
  for (const { path, written } of writes) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, written);
  }
  return report.succeed(
    { file, record: record.name, written: shown, records: contexts.length, replaced },
    `Attached ${summary}\n`,
  );
});

// The language's commands, each at the top of dxn.
export const language: Record<string, Command> = {
  check,
  states: statesCommand,
  cases: casesCommand,
  validate: validateCommand,
  rename: renameCommand,
  status: statusCommand,
  attach: attachCommand,
};
