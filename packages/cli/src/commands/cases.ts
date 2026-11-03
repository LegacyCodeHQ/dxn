import { type Command, command } from "@cli/commands/support/context.js";
import {
  assignments,
  count,
  misused,
  options,
  Reporter,
  read,
} from "@cli/commands/support/report.js";
import { drawTable, NONE } from "@cli/commands/support/tables.js";
import { usage } from "@cli/commands/support/usage.js";
import { type Cases, cases } from "@legacycodehq/dxn-language";

// The cases of a type, or of a child in place, as a table: each case by the
// values that tell it apart, and, where a case covers several combinations,
// what it covers: its profiles, or, without profiles, each combination, by
// the values the case does not show. With --combinations, every combination,
// as if nothing were alike.
export const casesCommand: Command = command(usage, (args, { io, cwd }) => {
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
          assignments(
            found.subjects.flatMap((name): [string, string][] => {
              const value = combination.dimensions[name] ?? combination.states[name];
              return value !== undefined && each.values[name] !== value ? [[name, value]] : [];
            }),
          ),
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
