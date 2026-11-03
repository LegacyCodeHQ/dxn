import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type Command, command } from "@cli/commands/support/context.js";
import { count, misused, options, Reporter, read } from "@cli/commands/support/report.js";
import { loadStored } from "@cli/commands/support/stored.js";
import { usage } from "@cli/commands/support/usage.js";
import {
  declarationNamed,
  drawings,
  message,
  renameAt,
  repositoryOf,
  words,
} from "@legacycodehq/dxn-language";

// Renames a declaration, by its name as dxn writes it or by its place in the
// file, where the file uses it and where stored records name it: refused
// unless the file and the stored records still check afterwards.
export const renameCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const { json, rest } = options(args);
  // "<file>:<line>:<column> <new>", or "<file> <name> <new>".
  const place = rest.length === 2 ? rest[0]?.match(/^(.+):(\d+):(\d+)$/) : undefined;
  const [file, target, to] =
    place !== undefined && place !== null
      ? [place[1], undefined, rest[1]]
      : rest.length === 3
        ? [rest[0], rest[1], rest[2]]
        : [];
  if (file === undefined || to === undefined) {
    return misused(
      io,
      json,
      "give a file, a name and its new name, or a file's line and column and the new name",
    );
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const path = resolve(cwd, file);
  const source = readFileSync(path, "utf8");
  const at =
    target === undefined
      ? { line: Number(place?.[2]), column: Number(place?.[3]) }
      : declarationNamed(source, target);
  if ("refusal" in at) return report.refuse(at.refusal);
  const stored = loadStored(parsed, file, cwd, report);
  if (typeof stored === "number") return stored;
  const drawn = drawings(repositoryOf(path));
  const renamed = renameAt(source, at.line, at.column, to, stored, parsed, drawn);
  if ("refusal" in renamed) {
    if (renamed.problems === undefined && renamed.stored === undefined) {
      return report.refuse(renamed.refusal);
    }
    for (const { line, column, severity, code, message } of renamed.problems ?? []) {
      report.problem({ file, line, column, severity, code, message });
    }
    for (const problem of renamed.stored ?? []) {
      const { line, column, code, path: where, message } = problem;
      report.problem({
        file: relative(cwd, problem.file),
        line,
        column,
        severity: "error",
        code,
        path: where,
        message,
      });
    }
    return report.refuse("the rename would leave problems; nothing was written");
  }
  const shown = (data: string) => relative(cwd, data);
  const written = [
    { shown: file, path, source: renamed.source },
    ...renamed.data.map((data) => ({
      shown: shown(data.path),
      path: data.path,
      source: data.source,
    })),
  ];
  // A record's stored records move to the folder named after its new name.
  const directory = dirname(path);
  const move =
    renamed.folder !== undefined &&
    renamed.folder.from !== renamed.folder.to &&
    statSync(join(directory, renamed.folder.from), { throwIfNoEntry: false })?.isDirectory() ===
      true
      ? renamed.folder
      : undefined;
  if (move !== undefined && statSync(join(directory, move.to), { throwIfNoEntry: false })) {
    return report.refuse(
      message`${words(move.to)}/ is already next to ${words(file)}; ${renamed.name}'s stored records cannot move there`,
    );
  }
  const records = renamed.data.reduce((sum, data) => sum + data.changed, 0);
  const files = written.map((item) => item.shown).join(", ");
  const what = `${renamed.kind} ${renamed.name} to ${to} in ${files}${
    move !== undefined
      ? `, and moved ${move.from}/ to ${move.to}/`
      : records > 0
        ? ` (${count(records, "change")} in stored records)`
        : ""
  }`;
  if (dryRun) {
    return report.succeed(
      {
        dryRun: true,
        written: Object.fromEntries(written.map((item) => [item.shown, item.source])),
        ...(move === undefined ? {} : { moved: move }),
      },
      `Would rename ${what}\n`,
    );
  }
  for (const item of written) writeFileSync(item.path, item.source);
  if (move !== undefined) renameSync(join(directory, move.from), join(directory, move.to));
  return report.succeed(
    {
      file,
      kind: renamed.kind,
      name: renamed.name,
      to,
      written: written.map((item) => item.shown),
      records,
      ...(move === undefined ? {} : { moved: move }),
    },
    `Renamed ${what}\n`,
  );
});
