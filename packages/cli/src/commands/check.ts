import { type Command, command } from "@cli/commands/support/context.js";
import { count, misused, options, Reporter, read } from "@cli/commands/support/report.js";
import { usage } from "@cli/commands/support/usage.js";
import { among, type Type, words } from "@legacycodehq/dxn-language";

// What a file declares, without positions and lengths, which are for
// diagnostics and editors: each located name becomes just its name.
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value !== "object" || value === null) return value;
  const { line, column, length, scope, short, ...rest } = value as Record<string, unknown>;
  const fields = Object.keys(rest);
  if (line !== undefined && fields.length === 1 && fields[0] === "name") return rest.name;
  return Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, plain(item)]));
}

// A type, with its nested enums and types, and its children, only when it
// has any.
function nestedOnly(type: Type): unknown {
  const { enums, types, children, unions, provides, actions, triggers, alikes, events, ...rest } =
    type;
  return {
    ...rest,
    ...(events.length > 0 ? { events } : {}),
    ...(alikes.length > 0 ? { alikes } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(triggers.length > 0 ? { triggers } : {}),
    ...(enums.length > 0 ? { enums } : {}),
    ...(types.length > 0 ? { types: types.map(nestedOnly) } : {}),
    ...(children.length > 0 ? { children } : {}),
    ...(unions.length > 0 ? { unions } : {}),
    ...(provides.length > 0 ? { provides } : {}),
  };
}

export const checkCommand: Command = command(usage, (args, { io, cwd }) => {
  const { json, rest: given } = options(args);
  // --expect <title> runs only the expectation with that title.
  // A title is taken as the file writes it, too: in its quotes.
  const flag = given.indexOf("--expect");
  const title = flag === -1 ? undefined : given[flag + 1]?.replace(/^"(.*)"$/, "$1");
  const [file, ...rest] =
    flag === -1 ? given : given.filter((_, at) => at !== flag && at !== flag + 1);
  if (file === undefined || rest.length > 0 || (flag !== -1 && title === undefined)) {
    return misused(io, json, "give one file to check, and with `--expect`, an expectation's title");
  }
  const report = new Reporter(io, json, file);
  // With --expect, the other expectations' failures are not reported.
  const parsed = read(file, cwd, report, (diagnostic, { expectations }) => {
    if (title === undefined || !diagnostic.code.startsWith("expectation-")) return true;
    const chosen = expectations.find((expectation) => expectation.title === title);
    return chosen !== undefined && chosen.line === diagnostic.line;
  });
  if (typeof parsed === "number") return parsed;
  if (title !== undefined) {
    const titles = parsed.expectations.map((expectation) => JSON.stringify(expectation.title));
    if (!titles.includes(JSON.stringify(title))) {
      return report.refuse(
        `no expectation is titled ${JSON.stringify(title)}${among(JSON.stringify(title), titles, "the file has none", JSON.stringify(title).length, words).text}`,
      );
    }
    return report.succeed({ file, expectation: title, holds: true }, `${file}: ${title} holds\n`);
  }
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
