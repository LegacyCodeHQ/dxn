import type { Type } from "@legacycodehq/dxn-language";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { usage } from "./usage.js";

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

export const checkCommand: Command = command(usage, (args, { io, cwd }) => {
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
