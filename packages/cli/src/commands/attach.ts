import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  among,
  folderOf,
  givenDimensions,
  inPlace,
  Names,
  type Placement,
  placement,
  profilesOf,
  type RecordDeclaration,
  validate,
} from "@legacycodehq/dxn-language";
import { canonical, Fingerprints } from "../fingerprint.js";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { loadStored, repositoryOf } from "./stored.js";
import { usage } from "./usage.js";

export const attachCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const { json, rest } = options(args);
  // The options with a value, and the context's key=value pairs.
  const flags = new Map<string, string[]>();
  const pairs: string[] = [];
  const positional: string[] = [];
  const valued = ["--actor", "--data"];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] as string;
    // An option's value comes after a space; "--actor=x" is not a context pair.
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
  for (const [option, values] of flags) {
    if (values.length > 1) return misused(io, json, `give ${option} once`);
  }
  const [file, path, ...extra] = positional;
  const actorName = flags.get("--actor")?.[0];
  const written = flags.get("--data")?.[0];
  if (file === undefined || path === undefined || extra.length > 0 || !actorName || !written) {
    return misused(io, json, "give a file, a path, --actor, --data and the context");
  }
  // The record's data, as JSON: an object, of the record's fields.
  let supplied: Record<string, unknown>;
  try {
    supplied = JSON.parse(written);
  } catch {
    return misused(
      io,
      json,
      `--data takes the record's fields as JSON, found ${JSON.stringify(written)}`,
    );
  }
  if (typeof supplied !== "object" || supplied === null || Array.isArray(supplied)) {
    return misused(io, json, "--data takes the record's fields as a JSON object");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const data = loadStored(parsed, file, cwd, report);
  if (typeof data === "number") return data;
  // The actor, and the record it records.
  const actor = parsed.actors.find(({ name }) => name === actorName);
  if (actor === undefined) {
    return report.refuse(
      `${JSON.stringify(actorName)} is not an actor${among(
        actorName,
        parsed.actors.map(({ name }) => name),
        "the file declares none",
      )}`,
    );
  }
  const record = parsed.records.find(
    ({ name }) => name === actor.records.name,
  ) as RecordDeclaration;
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
  // The record's fields, as given; each PenNode's fingerprint is taken now,
  // of its node or, without one, its frame.
  const repository = repositoryOf(file, cwd);
  const fingerprints = new Fingerprints();
  const values: Record<string, unknown> = { ...supplied };
  for (const field of record.fields.filter(({ type }) => type.name === "PenNode")) {
    const at = supplied[field.name] as
      | { file?: unknown; frame?: unknown; node?: unknown }
      | undefined;
    if (typeof at !== "object" || at === null) continue;
    const { file: where, frame, node } = at;
    if (typeof where !== "string" || typeof frame !== "string") continue;
    const full = join(repository, where);
    if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
      return report.refuse(`${JSON.stringify(where)} does not exist in the repository`);
    }
    const pen = fingerprints.isPen(full);
    if (pen && fingerprints.of(full, frame) === undefined) {
      return report.refuse(`frame ${JSON.stringify(frame)} is not in ${where}`);
    }
    if (pen && typeof node === "string" && !fingerprints.holds(full, frame, node)) {
      return report.refuse(`node ${JSON.stringify(node)} is not in frame ${frame} of ${where}`);
    }
    const id = typeof node === "string" ? node : frame;
    values[field.name] = { ...at, fingerprint: fingerprints.of(full, id) };
  }
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
  // A PenNode's fingerprint does not make it another entry: it is what the
  // node shows now, which a new recording takes.
  const pens = record.fields.filter(({ type }) => type.name === "PenNode").map(({ name }) => name);
  const unprinted = (entry: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(entry).map(([name, value]) => {
        if (!pens.includes(name) || typeof value !== "object" || value === null)
          return [name, value];
        const { fingerprint: _fingerprint, ...rest } = value as Record<string, unknown>;
        return [name, rest];
      }),
    );
  const same = (entry: Record<string, unknown>, context: object) =>
    alike(unprinted(entry), unprinted({ context, actor: actor.name, ...values }));
  const changed = new Set<string>();
  let replaced = 0;
  for (const context of contexts) {
    const entry = { context, actor: actor.name, ...values };
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
    {
      file,
      actor: actor.name,
      record: record.name,
      written: shown,
      records: contexts.length,
      replaced,
    },
    `Attached ${summary}\n`,
  );
});
