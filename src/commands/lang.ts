import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "../language/parse.js";
import { type Command, command } from "./context.js";
import { group } from "./edit.js";

const usage = `Usage: dimensions lang <subcommand>

The dimensions language, which is being designed one concept at a time: see
docs/language/design.md. So far a file declares enums, each a named set of
values; dimensions, each listing the values the environment varies by; and
types with their states, and rules for when a state's value exists:

  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark {
    states hover: Hover
    hover = hovered only when Pointer = mouse
  }

Subcommands:
  check <file>                       Parse and check a file; print what it declares
                                     as JSON, or every problem it has. Needs no
                                     project.
`;

const check: Command = command(usage, (args, { io, cwd }) => {
  const [file, ...rest] = args;
  if (file === undefined || rest.length > 0) {
    io.stderr(`dimensions: give one file to check\n\n${usage}`);
    return 2;
  }
  const path = resolve(cwd, file);
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) {
    io.stderr(`dimensions: file not found: ${JSON.stringify(file)}\n`);
    return 1;
  }
  const { enums, dimensions, types, diagnostics } = parse(readFileSync(path, "utf8"));
  if (diagnostics.length > 0) {
    const sorted = [...diagnostics].sort((a, b) => a.line - b.line || a.column - b.column);
    for (const { line, column, code, message } of sorted) {
      io.stderr(`${file}:${line}:${column}: ${code}: ${message}\n`);
    }
    return 1;
  }
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
      },
      null,
      2,
    )}\n`,
  );
  return 0;
});

export const lang: Command = group(usage, { check });
