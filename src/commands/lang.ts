import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ParseResult } from "../language/ast.js";
import { states as evaluateStates } from "../language/evaluate.js";
import { parse } from "../language/parse.js";
import { drawTable, NONE } from "../tables.js";
import { type Command, type Context, command } from "./context.js";
import { group } from "./edit.js";

const usage = `Usage: dimensions lang <subcommand>

The dimensions language, which is being designed one concept at a time: see
docs/language/design.md. So far a file declares enums, each a named set of
values; dimensions, each listing the values the environment varies by;
types with the dimensions they need, their states, and rules for when a
state's value exists; environments, each a product of dimensions; and
profiles, each an instance of an environment:

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
    io.stderr(`dimensions: file not found: ${JSON.stringify(file)}\n`);
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
    io.stderr(`dimensions: give one file to check\n\n${usage}`);
    return 2;
  }
  const parsed = read(file, cwd, io);
  if (typeof parsed === "number") return parsed;
  const { enums, dimensions, types, environments, profiles } = parsed;
  const output = {
    file,
    ...(plain({ enums, dimensions, types, environments }) as object),
    profiles: profiles.map(({ values, ...profile }) => ({
      ...(plain(profile) as object),
      values: Object.fromEntries(
        values.map(({ dimension, value }) => [dimension.name, value.name]),
      ),
    })),
  };
  io.stdout(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
});

const statesCommand: Command = command(usage, (args, { io, cwd }) => {
  const table = args.includes("--table");
  const [file, typeName, ...rest] = args.filter((arg) => arg !== "--table");
  if (file === undefined || typeName === undefined || rest.length > 0) {
    io.stderr(`dimensions: give a file and a type\n\n${usage}`);
    return 2;
  }
  const parsed = read(file, cwd, io);
  if (typeof parsed === "number") return parsed;
  if (!parsed.types.some(({ name }) => name === typeName)) {
    io.stderr(
      `dimensions: no type ${JSON.stringify(typeName)} in ${file} (${parsed.types.map(({ name }) => name).join(", ")})\n`,
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

export const lang: Command = group(usage, { check, states: statesCommand });
