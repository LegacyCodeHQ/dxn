import { statSync } from "node:fs";
import { join } from "node:path";
import {
  type Check,
  type Combination,
  coverage,
  placement,
  profilesOf,
  treePaths,
} from "@legacycodehq/dxn-language";
import { Fingerprints } from "../fingerprint.js";
import { drawTable } from "../tables.js";
import { type Command, command } from "./context.js";
import { assignments, count, misused, options, Reporter, read } from "./report.js";
import { loadStored, repositoryOf } from "./stored.js";
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
  // Whether what an entry's PenNode points at is as recorded: its
  // fingerprint now, of its node or, without one, its frame, against the one
  // stored. A frame that no longer holds its node is gone.
  const repository = repositoryOf(file, cwd);
  const fingerprints = new Fingerprints();
  const check: Check = ({ file: where, frame, node, fingerprint }) => {
    const full = join(repository, where);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) return "gone";
    if (node !== undefined && fingerprints.isPen(full) && !fingerprints.holds(full, frame, node)) {
      return "gone";
    }
    const now = fingerprints.of(full, node ?? frame);
    if (now === undefined) return "gone";
    return now === fingerprint ? "present" : "stale";
  };
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
    const parents = assignments(Object.entries(combination.parents));
    const states = assignments(Object.entries(combination.states));
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
      ...(coverage.fingerprinted ? [] : [`${record} has no PenNode, so staleness is not checked`]),
    ];
    const summary = `${file}: ${record} for ${present} of ${count(combinations, "combination")}${notes.map((note) => `; ${note}`).join("")}`;
    return `${summary}\n\n${table}${
      listMissing
        ? `${listed("Missing", "missing")}${listed("Stale", "stale")}${listed("Gone", "gone")}`
        : ""
    }`;
  });
  const text = blocks.length === 0 ? `${file}: no records an actor records\n` : blocks.join("\n");
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
