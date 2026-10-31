import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { states as evaluateStates } from "../language/evaluate.js";
import { type ParseResult, parse } from "../language/parse.js";
import { drawTable, NONE } from "../tables.js";
import { type Command, type Context, command } from "./context.js";
import { group } from "./edit.js";

const usage = `Usage: dimensions lang <subcommand>

The dimensions language, which is being designed one concept at a time: see
docs/language/design.md. So far a file declares enums, each a named set of
values; dimensions, each listing the values the environment varies by;
types with their states, and rules for when a state's value exists;
environments, each a product of dimensions; and profiles, each an instance
of an environment:

  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark {
    states hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile laptop: Device { Pointer = mouse }

Subcommands:
  check <file>                       Parse and check a file; print what it declares
                                     as JSON, or every problem it has. Needs no
                                     project.
  states <file> <type> [--table]     Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions its rules use,
                                     as JSON, or a Markdown table with --table
`;

// Reads and parses a file; on a problem, reports it and gives the exit code.
function read(file: string, cwd: string, io: Context["io"]): ParseResult | number {
  const path = resolve(cwd, file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    io.stderr(`dimensions: file not found: ${JSON.stringify(file)}\n`);
    return 1;
  }
  const parsed = parse(readFileSync(path, "utf8"));
  if (parsed.diagnostics.length > 0) {
    for (const { line, column, code, message } of parsed.diagnostics) {
      io.stderr(`${file}:${line}:${column}: ${code}: ${message}\n`);
    }
    return 1;
  }
  return parsed;
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
  io.stdout(
    `${JSON.stringify(
      {
        file,
        enums: enums.map(({ name, values }) => ({
          name,
          values: values.map((value) => value.name),
        })),
        dimensions: dimensions.map(({ name, values }) => ({
          name,
          values: values.map((value) => value.name),
        })),
        types: types.map(({ name, states, rules }) => ({
          name,
          states: states.map((state) => ({ name: state.name, enum: state.enum })),
          rules: rules.map(({ state, value, when }) => ({
            state,
            value,
            when: { dimension: when.dimension, values: when.values.map((item) => item.name) },
          })),
        })),
        environments: environments.map(({ name, dimensions: parts }) => ({
          name,
          dimensions: parts.map((part) => part.name),
        })),
        profiles: profiles.map(({ name, environment, values }) => ({
          name,
          environment,
          values: Object.fromEntries(values.map(({ dimension, value }) => [dimension, value])),
        })),
      },
      null,
      2,
    )}\n`,
  );
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
    valuesOf(state.enum).map((value) => [state.name, value] as const),
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
