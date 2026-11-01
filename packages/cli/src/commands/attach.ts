import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  fieldValue,
  folderOf,
  givenDimensions,
  inPlace,
  Names,
  type Placement,
  placement,
  profilesOf,
  validate,
} from "@legacycodehq/dxn-language";
import { canonical, Fingerprints } from "../fingerprint.js";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { loadStored, repositoryOf, toolOwner } from "./stored.js";
import { usage } from "./usage.js";

export const attachCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const { json, rest } = options(args);
  // The options with a value, and the context's key=value pairs.
  const flags = new Map<string, string[]>();
  const pairs: string[] = [];
  const positional: string[] = [];
  const valued = ["--file", "--frame", "--field", "--at", "--record"];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] as string;
    // An option's value comes after a space; "--file=x" is not a context pair.
    const joined = valued.find((option) => arg.startsWith(`${option}=`));
    if (joined !== undefined) {
      return misused(
        io,
        json,
        `write "${joined} ${arg.slice(joined.length + 1)}", with a space, not "${arg}"`,
      );
    }
    if (valued.includes(arg)) {
      flags.set(arg, [...(flags.get(arg) ?? []), rest[index + 1] ?? ""]);
      index++;
    } else if (arg.includes("=")) pairs.push(arg);
    else positional.push(arg);
  }
  // Each option once, but --field once for each field, as <name>=<value>.
  for (const [option, values] of flags) {
    if (option !== "--field" && values.length > 1) {
      return misused(io, json, `give ${option} once`);
    }
  }
  const unpaired = flags.get("--field")?.find((pair) => !pair.includes("="));
  if (unpaired !== undefined) {
    return misused(io, json, `--field takes <name>=<value>, found ${JSON.stringify(unpaired)}`);
  }
  const [file, path, ...extra] = positional;
  const source = flags.get("--file")?.[0];
  const frame = flags.get("--frame")?.[0];
  if (file === undefined || path === undefined || extra.length > 0 || !source || !frame) {
    return misused(io, json, "give a file, a path, --file and --frame, and the context");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const data = loadStored(parsed, file, cwd, report);
  if (typeof data === "number") return data;
  // The record: the one given, or the only one an actor records.
  const named = flags.get("--record")?.[0];
  const candidates = parsed.records.filter(
    ({ context, name }) => context && (named === undefined || name === named),
  );
  const record = candidates[0];
  if (record === undefined || (named === undefined && candidates.length > 1)) {
    return report.refuse(
      named === undefined
        ? `give the record, as --record <name> (${parsed.records
            .filter(({ context }) => context)
            .map(({ name }) => name)
            .join(", ")})`
        : `${named} is not a record an actor records`,
    );
  }
  let place: Placement;
  try {
    place = placement(parsed, path);
  } catch (error) {
    return report.refuse((error as Error).message);
  }
  // The context's keys, and the values each can take.
  const names = new Names(parsed);
  const profiled = parsed.profiles.length > 0;
  const given = givenDimensions(parsed);
  const keys: {
    name: string;
    kind: "profile" | "dimension" | "parent" | "state";
    values: string[];
  }[] = [
    ...(profiled
      ? [
          {
            name: "profile",
            kind: "profile" as const,
            values: profilesOf(parsed).map(({ name }) => name),
          },
        ]
      : []),
    ...place.dimensions
      .filter((name) => !given.includes(name))
      .map((name) => ({ name, kind: "dimension" as const, values: names.values(name) ?? [] })),
    ...place.parents.map(({ key, state }) => ({
      name: key,
      kind: "parent" as const,
      values: names.values(state.enum.name) ?? [],
    })),
    ...place.target.states.map(({ name, enum: of }) => ({
      name,
      kind: "state" as const,
      values: names.values(of.name) ?? [],
    })),
  ];
  const chosen = new Map<string, string[]>();
  for (const pair of pairs) {
    const [key, value = ""] = pair.split(/=(.*)/s);
    const entry = keys.find(({ name }) => name === key);
    if (entry === undefined) {
      return report.refuse(
        `${JSON.stringify(key)} is not part of a context of ${path} (${keys.map(({ name }) => name).join(", ")})`,
      );
    }
    const values = value.split("|");
    for (const one of values) {
      if (!entry.values.includes(one)) {
        const what = key === "profile" ? "a profile" : `a value of ${key}`;
        return report.refuse(`${JSON.stringify(one)} is not ${what} (${entry.values.join(", ")})`);
      }
    }
    chosen.set(key as string, values);
  }
  for (const { name } of keys) {
    if (!chosen.has(name)) {
      return report.refuse(`give ${name}, as ${name}=<value>, or several as ${name}=<a>|<b>`);
    }
  }
  // Every combination listed, kept where it exists in place.
  let combinations: Record<string, string>[] = [{}];
  for (const { name } of keys) {
    combinations = combinations.flatMap((combination) =>
      (chosen.get(name) ?? []).map((value) => ({ ...combination, [name]: value })),
    );
  }
  // A combination's values of the keys of one kind, by name.
  const valuesOf = (kind: (typeof keys)[number]["kind"], combination: Record<string, string>) =>
    Object.fromEntries(
      keys
        .filter((key) => key.kind === kind)
        .map(({ name }) => [name, combination[name] as string]),
    );
  const rows = inPlace(parsed, path).rows;
  const contexts = combinations
    .map((combination) => ({
      path,
      ...(profiled ? { profile: combination.profile as string } : {}),
      dimensions: valuesOf("dimension", combination),
      parents: valuesOf("parent", combination),
      states: valuesOf("state", combination),
    }))
    .filter((context) =>
      rows.some(
        (row) =>
          (context.profile === undefined || row.profiles?.includes(context.profile) === true) &&
          Object.entries(context.dimensions).every(([name, value]) => row.when[name] === value) &&
          Object.entries(context.parents).every(([name, value]) => row.parents[name] === value) &&
          Object.entries(context.states).every(([name, value]) =>
            row.states[name]?.includes(value),
          ),
      ),
    );
  if (contexts.length === 0) {
    return report.refuse(
      `no combination given exists for ${path}; dxn states ${file} ${path} lists them`,
    );
  }
  // The frame, and its fingerprint now.
  const repository = repositoryOf(file, cwd);
  const full = join(repository, source);
  if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
    return report.refuse(`${JSON.stringify(source)} does not exist in the repository`);
  }
  // The record's fields: by convention, at is when, source where the frame is
  // and fingerprint its fingerprint; a derived one is not stored; the others
  // are given with --field.
  const fields = new Map(
    (flags.get("--field") ?? []).map((pair) => pair.split(/=(.*)/s) as [string, string]),
  );
  // A field the record does not have is named before what is missing.
  for (const name of fields.keys()) {
    if (!record.fields.some((field) => field.name === name)) {
      return report.refuse(
        `${record.name} has no field ${JSON.stringify(name)} (${record.fields.map((field) => field.name).join(", ")})`,
      );
    }
  }
  if (
    !record.fields.some(({ name }) => name === "fingerprint") ||
    !record.fields.some(({ name }) => name === "source")
  ) {
    return report.refuse(
      `${record.name} has no fingerprint field next to a source { file, frame }; attach needs both`,
    );
  }
  const stamp = flags.get("--at")?.[0] ?? new Date().toISOString();
  const values: Record<string, unknown> = {};
  for (const field of record.fields) {
    // A derived field follows from another, so it is never given.
    if (field.derived !== undefined) {
      if (fields.has(field.name)) {
        return report.refuse(
          `${field.name} follows from ${field.derived.on.name}, so it is not given`,
        );
      }
      continue;
    }
    if (field.name === "source") values.source = { file: source, frame };
    else if (field.name === "fingerprint") values.fingerprint = "";
    else if (field.name === "at" && !fields.has("at")) values.at = stamp;
    else if (fields.has(field.name)) values[field.name] = fields.get(field.name);
    else return report.refuse(`give ${field.name}, as --field ${field.name}=<value>`);
  }
  // By convention, the record's tool says how its frames are fingerprinted:
  // pen-dev, a frame in a pen.dev file; file, the whole file.
  const fingerprints = new Fingerprints();
  const tool = fieldValue(record, values, "tool");
  if (tool === "pen-dev" && !fingerprints.isPen(full)) {
    return report.refuse(
      `${toolOwner(record, values)} records with pen-dev; ${JSON.stringify(source)} is not a pen.dev file`,
    );
  }
  const fingerprint = fingerprints.of(full, frame, tool === "file" ? "file" : undefined);
  if (fingerprint === undefined)
    return report.refuse(`frame ${JSON.stringify(frame)} is not in ${source}`);
  values.fingerprint = fingerprint;
  // An entry for the same combination, frame and given fields is replaced
  // where it is stored, in whichever of the record's files; a new one goes
  // into the record's folder, in a file named after the path's type.
  const folder = folderOf(record.name);
  const target = `${folderOf(place.steps[0]?.type.name ?? record.name)}.json`;
  const directory = resolve(cwd, dirname(file));
  const files = new Map<string, { shown: string; entries: Record<string, unknown>[] }>();
  for (const stored of data.filter((candidate) => candidate.record === record.name)) {
    files.set(stored.path, {
      shown: stored.shown,
      entries: JSON.parse(stored.source) as Record<string, unknown>[],
    });
  }
  // Key order does not count: an entry written by hand is the same entry.
  const alike = (a: unknown, b: unknown) =>
    JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const same = (entry: Record<string, unknown>, context: object) =>
    alike(entry.context, context) &&
    alike(entry.source, values.source) &&
    // When it was recorded does not make it another entry.
    [...fields.keys()]
      .filter((name) => name !== "at" && name !== "fingerprint")
      .every((name) => entry[name] === fields.get(name));
  const changed = new Set<string>();
  let replaced = 0;
  for (const context of contexts) {
    const entry = { context, ...values };
    const holding = [...files].find(([, { entries }]) =>
      entries.some((candidate) => same(candidate, context)),
    );
    if (holding !== undefined) {
      const [path, { entries }] = holding;
      entries[entries.findIndex((candidate) => same(candidate, context))] = entry;
      changed.add(path);
      replaced++;
      continue;
    }
    const path = join(directory, folder, target);
    const into = files.get(path) ?? { shown: join(dirname(file), folder, target), entries: [] };
    into.entries.push(entry);
    files.set(path, into);
    changed.add(path);
  }
  const writes = [...changed].map((path) => {
    const { shown, entries } = files.get(path) as { shown: string; entries: unknown[] };
    return { path, shown, written: `${JSON.stringify(entries, null, 2)}\n` };
  });
  let invalid = false;
  for (const { shown, written } of writes) {
    for (const { line, column, code, path: where, message } of validate(
      parsed,
      record.name,
      written,
    )) {
      report.problem({ file: shown, line, column, severity: "error", code, path: where, message });
      invalid = true;
    }
  }
  if (invalid) return report.fail();
  const shown = writes.map((write) => write.shown).join(", ");
  const summary = `${count(contexts.length, "record")} to ${shown}${replaced > 0 ? `, replacing ${replaced}` : ""}`;
  if (dryRun) {
    return report.succeed(
      {
        dryRun: true,
        written: Object.fromEntries(writes.map((write) => [write.shown, write.written])),
      },
      `Would attach ${summary}\n`,
    );
  }
  for (const { path, written } of writes) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, written);
  }
  return report.succeed(
    { file, record: record.name, written: shown, records: contexts.length, replaced },
    `Attached ${summary}\n`,
  );
});
