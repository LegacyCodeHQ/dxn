import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValue, Names, parse, renameInData, renameInSource } from "@legacycodehq/dxn-language";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { checkStored, loadStored } from "./stored.js";
import { usage } from "./usage.js";

export const renameCommand: Command = command(usage, (args, { io, cwd, dryRun }) => {
  const {
    json,
    rest: [file, target, to, ...rest],
  } = options(args);
  const dot = target?.lastIndexOf(".") ?? -1;
  if (
    file === undefined ||
    target === undefined ||
    to === undefined ||
    rest.length > 0 ||
    dot < 1
  ) {
    return misused(io, json, "give a file, <Enum>.<value> and the value's new name");
  }
  const enumName = target.slice(0, dot);
  const from = target.slice(dot + 1);
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const names = new Names(parsed);
  const values = names.values(enumName) ?? [];
  const refusal =
    names.kindOf(enumName) !== "enum"
      ? names.not(enumName, "enum")
      : !values.includes(from)
        ? `${JSON.stringify(from)} is not a value of ${enumName} (${values.join(", ")})`
        : values.includes(to)
          ? `${JSON.stringify(to)} is already a value of ${enumName}`
          : !isValue(to)
            ? `${JSON.stringify(to)} is not a value: a letter or digit, then letters, digits and hyphens`
            : undefined;
  if (refusal !== undefined) return report.refuse(refusal);
  const stored = loadStored(parsed, file, cwd, report);
  if (typeof stored === "number") return stored;
  const path = resolve(cwd, file);
  const source = renameInSource(parsed, readFileSync(path, "utf8"), enumName, from, to);
  const written = [{ shown: file, path, source }];
  let records = 0;
  for (const data of stored) {
    const renamed = renameInData(parsed, data.record, data.source, enumName, from, to);
    if (renamed.changed === 0) continue;
    records += renamed.changed;
    written.push({ shown: data.shown, path: data.path, source: renamed.source });
  }
  // The renamed file and data must check, before anything is written.
  const after = parse(source);
  const writtenData = new Map(written.map((item) => [item.path, item.source]));
  const afterStored = stored.map((data) => ({
    ...data,
    source: writtenData.get(data.path) ?? data.source,
  }));
  const left = after.diagnostics.filter(({ severity }) => severity === "error");
  for (const { line, column, severity, code, message } of left) {
    report.problem({ file, line, column, severity, code, message });
  }
  if (left.length > 0 || !checkStored(after, afterStored, report)) {
    return report.refuse("the rename would leave problems; nothing was written");
  }
  const what = `${target} to ${to} in ${written.map(({ shown }) => shown).join(", ")} (${count(records, "value")})`;
  if (dryRun) {
    return report.succeed(
      {
        dryRun: true,
        written: Object.fromEntries(written.map(({ shown, source }) => [shown, source])),
      },
      `Would rename ${what}\n`,
    );
  }
  for (const item of written) writeFileSync(item.path, item.source);
  return report.succeed(
    { file, enum: enumName, from, to, written: written.map(({ shown }) => shown), records },
    `Renamed ${what}\n`,
  );
});
