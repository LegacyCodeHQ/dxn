import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ParseResult } from "../language/ast.js";
import { states as evaluateStates } from "../language/evaluate.js";
import { Names } from "../language/names.js";
import { parse } from "../language/parse.js";
import { isValue, renameInData, renameInSource } from "../language/rename.js";
import { folderOf, storedFiles } from "../language/store.js";
import { validate } from "../language/validate.js";
import { drawTable, NONE } from "../tables.js";
import { type Command, type Context, command } from "./context.js";
import { group } from "./edit.js";

const usage = `Usage: dxn lang <subcommand>

dxn, the language of design and dimensions, which grows one concept at a
time: see docs/language/guide.md. A .dxn file declares enums, each a named
set of values; dimensions, each listing the values the environment varies
by; types with the dimensions they need, their states, and rules for when
a state's value exists; environments, each a product of dimensions;
profiles, each an instance of an environment; and records, each a named
group of typed fields. A # starts a comment, to the end of the line:

  # The wordmark's hover only exists with a mouse.
  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark needs Pointer {
    states hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile laptop: Device { Pointer = mouse }

Subcommands:
  check <file>                       Parse and check a file; print what it declares
                                     as JSON, or every problem it has. Warnings
                                     are printed, but do not fail. Needs no
                                     project.
  states <file> <type> [--table]     Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions it needs,
                                     as JSON, or a Markdown table with --table
  validate <file>                    Check the stored records: each record's data is
                                     every JSON file in a folder named after it in
                                     kebab-case, next to the file, each a list of
                                     records with every field given, each of its
                                     type, and no others. Print what it checked, or
                                     every problem with its line, column and path
  rename <file> <Enum>.<value> <new> Rename an enum's value in the file and in every
                                     stored record, once both check; with --dry-run,
                                     print what it would write
`;

// What a file declares, without positions, which are for diagnostics: each
// located name becomes just its name.
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value !== "object" || value === null) return value;
  const { line, column, ...rest } = value as Record<string, unknown>;
  const fields = Object.keys(rest);
  if (line !== undefined && fields.length === 1 && fields[0] === "name") return rest.name;
  return Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, plain(item)]));
}

// Reads and parses a file; on a problem, reports it and gives the exit code.
function read(file: string, cwd: string, io: Context["io"]): ParseResult | number {
  const path = resolve(cwd, file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    io.stderr(`dxn: file not found: ${JSON.stringify(file)}\n`);
    return 1;
  }
  const parsed = parse(readFileSync(path, "utf8"));
  for (const { line, column, severity, code, message } of parsed.diagnostics) {
    const warning = severity === "warning" ? "warning: " : "";
    io.stderr(`${file}:${line}:${column}: ${warning}${code}: ${message}\n`);
  }
  return parsed.diagnostics.some(({ severity }) => severity === "error") ? 1 : parsed;
}

const check: Command = command(usage, (args, { io, cwd }) => {
  const [file, ...rest] = args;
  if (file === undefined || rest.length > 0) {
    io.stderr(`dxn: give one file to check\n\n${usage}`);
    return 2;
  }
  const parsed = read(file, cwd, io);
  if (typeof parsed === "number") return parsed;
  const { enums, dimensions, types, environments, profiles, records } = parsed;
  const output = {
    file,
    ...(plain({ enums, dimensions, types, environments }) as object),
    profiles: profiles.map(({ values, ...profile }) => ({
      ...(plain(profile) as object),
      values: Object.fromEntries(
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ),
    })),
    records: plain(records),
  };
  io.stdout(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
});

const statesCommand: Command = command(usage, (args, { io, cwd }) => {
  const table = args.includes("--table");
  const [file, typeName, ...rest] = args.filter((arg) => arg !== "--table");
  if (file === undefined || typeName === undefined || rest.length > 0) {
    io.stderr(`dxn: give a file and a type\n\n${usage}`);
    return 2;
  }
  const parsed = read(file, cwd, io);
  if (typeof parsed === "number") return parsed;
  if (!parsed.types.some(({ name }) => name === typeName)) {
    io.stderr(
      `dxn: no type ${JSON.stringify(typeName)} in ${file} (${parsed.types.map(({ name }) => name).join(", ")})\n`,
    );
    return 1;
  }
  const evaluated = evaluateStates(parsed, typeName);
  if (!table) {
    io.stdout(`${JSON.stringify(evaluated, null, 2)}\n`);
    return 0;
  }
  const stateType = parsed.types.find(({ name }) => name === typeName);
  const valuesOf = (name: string) =>
    parsed.enums.find((declaration) => declaration.name === name)?.values.map((v) => v.name) ?? [];
  const columns = (stateType?.states ?? []).flatMap((state) =>
    valuesOf(state.enum.name).map((value) => [state.name, value] as const),
  );
  const profiled = evaluated.rows.some((row) => row.profile !== undefined);
  io.stdout(
    drawTable(
      [
        ...(profiled ? ["profile"] : []),
        ...evaluated.dimensions,
        ...columns.map(([state, value]) => `${state}: ${value}`),
      ],
      evaluated.rows.map((row) => [
        ...(profiled ? [row.profile ?? NONE] : []),
        ...evaluated.dimensions.map((dimension) => row.when[dimension] ?? NONE),
        ...columns.map(([state, value]) => (row.states[state]?.includes(value) ? "✓" : NONE)),
      ]),
    ),
  );
  return 0;
});

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

// Reports each record stored without a context, which would be a fact about
// nothing; whether there is one.
function storedWithoutContext(
  parsed: ParseResult,
  file: string,
  cwd: string,
  io: Context["io"],
): boolean {
  const directory = resolve(cwd, dirname(file));
  let found = false;
  for (const { name, context } of parsed.records) {
    if (context || storedFiles(directory, name) === undefined) continue;
    io.stderr(
      `dxn: ${name} is stored in ${folderOf(name)}/, but has no context; declare "record ${name} with context"\n`,
    );
    found = true;
  }
  return found;
}

// Checks stored data against the file, reporting every problem; whether all of
// it is valid.
function checkStored(parsed: ParseResult, stored: Stored[], io: Context["io"]): boolean {
  let valid = true;
  for (const { record, shown, source } of stored) {
    for (const { line, column, code, path, message } of validate(parsed, record, source)) {
      io.stderr(`${shown}:${line}:${column}: ${code}: ${path}: ${message}\n`);
      valid = false;
    }
  }
  return valid;
}

const validateCommand: Command = command(usage, (args, { io, cwd }) => {
  const [file, ...rest] = args;
  if (file === undefined || rest.length > 0) {
    io.stderr(`dxn: give one file, whose stored records to check\n\n${usage}`);
    return 2;
  }
  const parsed = read(file, cwd, io);
  if (typeof parsed === "number") return parsed;
  if (storedWithoutContext(parsed, file, cwd, io)) return 1;
  const data = storedData(parsed, file, cwd);
  if (!checkStored(parsed, data, io)) return 1;
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
  io.stdout(`${JSON.stringify({ file, stored })}\n`);
  return 0;
});

const renameCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const [file, target, to, ...rest] = args;
  const dot = target?.indexOf(".") ?? -1;
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
  const parsed = read(file, cwd, io);
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
  if (refusal !== undefined) {
    io.stderr(`dxn: ${refusal}\n`);
    return 1;
  }
  if (storedWithoutContext(parsed, file, cwd, io)) return 1;
  const stored = storedData(parsed, file, cwd);
  if (!checkStored(parsed, stored, io)) return 1;
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
    !checkStored(after, afterStored, io)
  ) {
    io.stderr("dxn: the rename would leave problems; nothing was written\n");
    return 1;
  }
  if (dryRun) {
    io.stdout(
      `${JSON.stringify({
        dryRun: true,
        written: Object.fromEntries(written.map(({ shown, source }) => [shown, source])),
      })}\n`,
    );
    return 0;
  }
  for (const item of written) writeFileSync(item.path, item.source);
  io.stdout(
    `${JSON.stringify({
      file,
      enum: enumName,
      from,
      to,
      written: written.map(({ shown }) => shown),
      records,
    })}\n`,
  );
  return 0;
});

export const lang: Command = group(usage, {
  check,
  states: statesCommand,
  validate: validateCommand,
  rename: renameCommand,
});
