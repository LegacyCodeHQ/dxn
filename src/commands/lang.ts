import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Fingerprints } from "../compiler/fingerprint.js";
import type { ParseResult, Type } from "../language/ast.js";
import {
  states as evaluateStates,
  type InPlace,
  inPlace,
  type Placement,
  type Presence,
  placement,
} from "../language/evaluate.js";
import { Names } from "../language/names.js";
import { parse } from "../language/parse.js";
import { profilesOf } from "../language/profiles.js";
import { isValue, renameInData, renameInSource } from "../language/rename.js";
import { type Check, type Combination, coverage } from "../language/status.js";
import { folderOf, storedFiles } from "../language/store.js";
import { validate } from "../language/validate.js";
import { drawTable, NONE } from "../tables.js";
import { type Command, type Context, command } from "./context.js";
import { group } from "./edit.js";

const usage = `Usage: dxn lang <subcommand>

dxn, the language of design and dimensions, which grows one concept at a
time: see docs/language/guide.md. A .dxn file declares enums, each a named
set of values; dimensions, each listing the values the environment varies
by; types with the dimensions they need, their states, rules for when a
state's value exists, a when for a state the world decides, and the
children they have; environments, each a product of dimensions; profiles,
each an instance of an environment; modifiers, accessories that change
some profiles; and records, each a named group of typed fields. A # starts
a comment, to the end of the line:

  # The wordmark's hover only exists with a mouse.
  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark needs Pointer {
    state hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile laptop: Device { Pointer = mouse }

Subcommands:
  check <file>                       Parse and check a file; say what it declares,
                                     or report every problem it has. Warnings
                                     are printed, but do not fail. Needs no
                                     project.
  states <file> <type>               Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions it needs,
                                     as a Markdown table; or a child in place,
                                     given its path from a type, such as
                                     Toolbar.menu.toggle: where it is inside its
                                     parents, with the states they give it
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
                                     say what it would write

Options:
  --json                             Print one JSON document, for tools: the result
                                     and any warnings as "problems"; on a failure,
                                     the file and its problems; on a refusal,
                                     {"error": "<message>"}
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
  const { enums, types, children, ...rest } = type;
  return {
    ...rest,
    ...(enums.length > 0 ? { enums } : {}),
    ...(types.length > 0 ? { types: types.map(nestedOnly) } : {}),
    ...(children.length > 0 ? { children } : {}),
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
    if (this.json) this.io.stdout(`${JSON.stringify({ error: messages.join("; ") }, null, 2)}\n`);
    else for (const message of messages) this.io.stderr(`dxn: ${message}\n`);
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
    io.stderr(`dxn: give one file to check\n\n${usage}`);
    return 2;
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const { enums, dimensions, types, environments, profiles, modifiers, records } = parsed;
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
    io.stderr(`dxn: give a file and a type\n\n${usage}`);
    return 2;
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
  const stateType = parsed.types.find(({ name }) => name === typeName);
  const valuesOf = (name: string) =>
    parsed.enums.find((declaration) => declaration.name === name)?.values.map((v) => v.name) ?? [];
  const columns = (stateType?.states ?? []).flatMap((state) =>
    valuesOf(state.enum.name).map((value) => [state.name, value] as const),
  );
  const profiled = evaluated.rows.some((row) => row.profiles !== undefined);
  const children = stateType?.children.map(({ name }) => name) ?? [];
  // Where a child is: there, not there, or for which values of a state.
  const presence = (value: Presence | undefined) => {
    if (value === undefined || value === false) return NONE;
    if (value === true) return "✓";
    return Object.entries(value)
      .map(([state, values]) =>
        values.length === 1 ? `${state} = ${values[0]}` : `${state} in (${values.join(", ")})`,
      )
      .join(", ");
  };
  return report.succeed(
    evaluated,
    drawTable(
      [
        ...(profiled ? ["profiles"] : []),
        ...evaluated.dimensions,
        ...columns.map(([state, value]) => `${state}: ${value}`),
        ...children.map((child) => `has ${child}`),
      ],
      evaluated.rows.map((row) => [
        ...(profiled ? [row.profiles?.join(", ") ?? NONE] : []),
        ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
        ...columns.map(([state, value]) => (row.states[state]?.includes(value) ? "✓" : NONE)),
        ...children.map((child) => presence(row.children?.[child])),
      ]),
    ),
  );
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
  const type = parsed.types.find(({ name }) => name === evaluated.type);
  const valuesOf = (name: string) =>
    parsed.enums.find((declaration) => declaration.name === name)?.values.map((v) => v.name) ?? [];
  const columns = (type?.states ?? []).flatMap((state) =>
    valuesOf(state.enum.name).map((value) => [state.name, value] as const),
  );
  const parents = [...new Set(evaluated.rows.flatMap((row) => Object.keys(row.parents)))];
  const profiled = evaluated.rows.some((row) => row.profiles !== undefined);
  return report.succeed(
    evaluated,
    drawTable(
      [
        ...(profiled ? ["profiles"] : []),
        ...evaluated.dimensions,
        ...parents,
        ...columns.map(([state, value]) => `${state}: ${value}`),
      ],
      evaluated.rows.map((row) => [
        ...(profiled ? [row.profiles?.join(", ") ?? NONE] : []),
        ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
        ...parents.map((parent) => row.parents[parent] ?? NONE),
        ...columns.map(([state, value]) => (row.states[state]?.includes(value) ? "✓" : NONE)),
      ]),
    ),
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
  return valid;
}

const validateCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args);
  if (file === undefined || rest.length > 0) {
    io.stderr(`dxn: give one file, whose stored records to check\n\n${usage}`);
    return 2;
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
    io.stderr(`dxn: give a file, <Enum>.<value> and the value's new name\n\n${usage}`);
    return 2;
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
  if (
    after.diagnostics.some(({ severity }) => severity === "error") ||
    !checkStored(after, afterStored, report)
  ) {
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
    io.stderr(`dxn: give one file, whose evidence to count\n\n${usage}`);
    return 2;
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
  const check: Check = ({ file: where, frame, fingerprint }) => {
    const full = join(repository, where);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) return "gone";
    const now = fingerprints.of(full, frame);
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
  const describe = (path: string, combination: Combination) => {
    const world = [
      ...(combination.profiles ?? []),
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
  return report.succeed({ file, records }, text);
});

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
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] as string;
    if (["--file", "--frame", "--field", "--at", "--record"].includes(arg)) {
      flags.set(arg, [...(flags.get(arg) ?? []), rest[index + 1] ?? ""]);
      index++;
    } else if (arg.includes("=")) pairs.push(arg);
    else positional.push(arg);
  }
  const [file, path, ...extra] = positional;
  const source = flags.get("--file")?.[0];
  const frame = flags.get("--frame")?.[0];
  if (file === undefined || path === undefined || extra.length > 0 || !source || !frame) {
    io.stderr(`dxn: give a file, a path, --file and --frame, and the context\n\n${usage}`);
    return 2;
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
  const environment = parsed.environments.find(
    ({ name }) => name === parsed.profiles[0]?.environment.name,
  );
  const given = profiled ? (environment?.dimensions.map(({ name }) => name) ?? []) : [];
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
      `no combination given exists for ${path}; dxn lang states ${file} ${path} lists them`,
    );
  }
  // The frame, and its fingerprint now.
  const repository = repositoryOf(file, cwd);
  const full = join(repository, source);
  if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
    return report.refuse(`${JSON.stringify(source)} does not exist in the repository`);
  }
  const fingerprint = new Fingerprints().of(full, frame);
  if (fingerprint === undefined)
    return report.refuse(`frame ${JSON.stringify(frame)} is not in ${source}`);
  // The record's fields: by convention, at is when, source where the frame is
  // and fingerprint its fingerprint; the others are given with --field.
  const fields = new Map(
    (flags.get("--field") ?? []).map((pair) => pair.split(/=(.*)/s) as [string, string]),
  );
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
    if (field.name === "source") values.source = { file: source, frame };
    else if (field.name === "fingerprint") values.fingerprint = fingerprint;
    else if (field.name === "at" && !fields.has("at")) values.at = stamp;
    else if (fields.has(field.name)) values[field.name] = fields.get(field.name);
    else return report.refuse(`give ${field.name}, as --field ${field.name}=<value>`);
  }
  for (const name of fields.keys()) {
    if (!record.fields.some((field) => field.name === name)) {
      return report.refuse(
        `${record.name} has no field ${JSON.stringify(name)} (${record.fields.map((field) => field.name).join(", ")})`,
      );
    }
  }
  // Into the record's folder, in a file named after the path's type; an
  // entry for the same combination, frame and given fields is replaced.
  const folder = folderOf(record.name);
  const target = `${folderOf(place.steps[0]?.type.name ?? record.name)}.json`;
  const at = join(resolve(cwd, dirname(file)), folder, target);
  const shown = join(dirname(file), folder, target);
  const existing = data.find((stored) => stored.path === at);
  const entries =
    existing === undefined ? [] : (JSON.parse(existing.source) as Record<string, unknown>[]);
  const same = (entry: Record<string, unknown>, context: object) =>
    JSON.stringify(entry.context) === JSON.stringify(context) &&
    JSON.stringify(entry.source) === JSON.stringify(values.source) &&
    [...fields.keys()].every((name) => entry[name] === fields.get(name));
  let replaced = 0;
  for (const context of contexts) {
    const entry = { context, ...values };
    const index = entries.findIndex((candidate) => same(candidate, context));
    if (index === -1) entries.push(entry);
    else {
      entries[index] = entry;
      replaced++;
    }
  }
  const written = `${JSON.stringify(entries, null, 2)}\n`;
  const problems = validate(parsed, record.name, written);
  if (problems.length > 0) {
    for (const { line, column, code, path: where, message } of problems) {
      report.problem({ file: shown, line, column, severity: "error", code, path: where, message });
    }
    return report.fail();
  }
  const summary = `${count(contexts.length, "record")} to ${shown}${replaced > 0 ? `, replacing ${replaced}` : ""}`;
  if (dryRun) {
    return report.succeed(
      { dryRun: true, written: { [shown]: written } },
      `Would attach ${summary}\n`,
    );
  }
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, written);
  return report.succeed(
    { file, record: record.name, written: shown, records: contexts.length, replaced },
    `Attached ${summary}\n`,
  );
});

export const lang: Command = group(usage, {
  check,
  states: statesCommand,
  validate: validateCommand,
  rename: renameCommand,
  status: statusCommand,
  attach: attachCommand,
});
