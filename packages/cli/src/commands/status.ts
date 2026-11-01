import { statSync } from "node:fs";
import { join } from "node:path";
import {
  type Check,
  type Combination,
  coverage,
  Diagnostics,
  fieldValue,
  parseJson,
  placement,
  profilesOf,
  treePaths,
} from "@legacycodehq/dxn-language";
import { Fingerprints } from "../fingerprint.js";
import { drawTable } from "../tables.js";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { loadStored, repositoryOf, toolOwner } from "./stored.js";
import { usage } from "./usage.js";

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
  const data = loadStored(parsed, file, cwd, report);
  if (typeof data === "number") return data;
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
