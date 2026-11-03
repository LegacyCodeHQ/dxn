import { resolve } from "node:path";
import { type Command, command } from "@cli/commands/support/context.js";
import { misused, options, Reporter, read } from "@cli/commands/support/report.js";
import { loadStoredToCount } from "@cli/commands/support/stored.js";
import { drawTable } from "@cli/commands/support/tables.js";
import { usage } from "@cli/commands/support/usage.js";
import {
  apartLabel,
  countable,
  coverage,
  describe,
  evidenceColumns,
  evidenceHeadings,
  evidenceLabel,
  freshness,
  message,
  outdatedItem,
  outdatedSummary,
  placement,
  repositoryOf,
  treePaths,
  words,
} from "@legacycodehq/dxn-language";

export const statusCommand: Command = command(usage, (args, { io, cwd }) => {
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
  // The stored records that check are counted; those with errors are set
  // apart, said in the count, and fail it, as an editor counts them.
  const loaded = loadStoredToCount(parsed, file, cwd, report);
  if (typeof loaded === "number") return loaded;
  const { sources: data, apart, stopped } = countable(parsed, loaded.stored, loaded.problems);
  // Whether what an entry's PenNode points at is as recorded.
  const check = freshness(repositoryOf(resolve(cwd, file), cwd));
  // A record is checked for staleness when it has a PenNode.
  const fingerprinted = (name: string) =>
    parsed.records
      .find((candidate) => candidate.name === name)
      ?.fields.some(({ type }) => type.name === "PenNode") === true;
  // Every element must be evaluable in place: a received state, provided.
  for (const path of treePaths(parsed)) {
    try {
      placement(parsed, path);
    } catch (error) {
      return report.refuse(message`${path}: ${words((error as Error).message)}`);
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
  const blocks = records.map((coverage) => {
    const { record, combinations, recorded, stale, gone, paths } = coverage;
    const table = drawTable(
      evidenceColumns(),
      paths.map((path) => [
        path.path,
        String(path.combinations),
        String(path.recorded),
        String(path.stale.length),
        String(path.gone.length),
        String(path.missing.length),
      ]),
    );
    // Each combination that is not recorded, under what it is.
    const listed = (heading: string, of: "missing" | "stale" | "gone") => {
      const lines = paths.flatMap((path) =>
        path[of].map((combination) => `  ${describe(parsed, path.path, combination)}\n`),
      );
      return lines.length === 0 ? "" : `\n${heading}:\n${lines.join("")}`;
    };
    // Each record made before its element gained a state or a dimension: how
    // many, what to do, and each with its element and what was added since.
    const old = paths.flatMap((path) =>
      path.outdated.map((each) => ({ ...each, path: path.path })),
    );
    const outdatedList =
      old.length === 0
        ? ""
        : `\n${evidenceHeadings.outdated}: ${outdatedSummary(old)}\n${old.map((each) => `  ${outdatedItem(each)}\n`).join("")}`;
    // The count, in the words an editor's hint has it in.
    const counted = evidenceLabel({
      record,
      recorded,
      combinations,
      stale,
      gone,
      outdated: paths.flatMap((path) =>
        path.outdated.map((each) => ({ ...each, path: path.path })),
      ),
    });
    const notes = coverage.fingerprinted
      ? []
      : [`${record} has no PenNode, so staleness is not checked`];
    // The stored records not counted for their errors, in the words an
    // editor's hint has them in: after the count, or instead of it, where
    // none of the record's can be counted.
    const those = [
      ...apart.filter((group) => group.record === record).flatMap(({ problems }) => problems),
      ...(stopped.get(record) ?? []),
    ];
    const aside =
      those.length === 0 ? undefined : apartLabel(parsed, record, those, loaded.stored).label;
    if (stopped.has(record)) return `${file}: ${aside}\n`;
    const said =
      aside === undefined ? counted : `${counted} · ${aside.slice(`${record}: `.length)}`;
    const summary = `${file}: ${said}${notes.map((note) => `; ${note}`).join("")}`;
    return `${summary}\n\n${table}${
      listMissing
        ? `${listed(evidenceHeadings.missing, "missing")}${listed(evidenceHeadings.stale, "stale")}${listed(evidenceHeadings.gone, "gone")}${outdatedList}`
        : ""
    }`;
  });
  const text = blocks.length === 0 ? `${file}: no records an actor records\n` : blocks.join("\n");
  // In JSON, each count a number, and each combination not recorded listed.
  const counted = records.map(({ paths, stale, gone, ...rest }) => ({
    ...rest,
    stale,
    gone,
    missing: paths.reduce((sum, path) => sum + path.missing.length, 0),
    paths: paths.map((path) => ({
      path: path.path,
      combinations: path.combinations,
      recorded: path.recorded,
      stale: path.stale.length,
      gone: path.gone.length,
      missing: path.missing.length,
      outdated: path.outdated.length,
      listed: {
        stale: path.stale,
        gone: path.gone,
        missing: path.missing,
        outdated: path.outdated.map(({ says, added }) => ({ says, added })),
      },
    })),
  }));
  return report.finish({ file, records: counted }, text);
});
