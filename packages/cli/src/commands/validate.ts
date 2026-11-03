import { dirname, resolve } from "node:path";
import { folderOf, storedFiles, storedRecords } from "@legacycodehq/dxn-language";
import { type Command, command } from "./context.js";
import { count, misused, options, Reporter, read } from "./report.js";
import { loadStored } from "./stored.js";
import { usage } from "./usage.js";

export const validateCommand: Command = command(usage, (args, { io, cwd }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args);
  if (file === undefined || rest.length > 0) {
    return misused(io, json, "give one file, whose stored records to check");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const data = loadStored(parsed, file, cwd, report);
  if (typeof data === "number") return data;
  const directory = resolve(cwd, dirname(file));
  const stored = parsed.records
    .filter(({ name }, index) => parsed.records.findIndex((other) => other.name === name) === index)
    .filter(({ name }) => storedFiles(directory, name) !== undefined)
    .map(({ name }) => {
      const files = data.filter(({ record }) => record === name);
      return {
        record: name,
        folder: folderOf(name),
        files: files.length,
        records: files.reduce(
          (total, { source }) => total + (JSON.parse(source) as unknown[]).length,
          0,
        ),
      };
    });
  const lines =
    stored.length === 0
      ? [`${file}: no stored records`]
      : stored.map(
          ({ record, folder, files, records }) =>
            `${file}: ${record}, ${storedRecords(records)} in ${count(files, "file")} in ${folder}/`,
        );
  return report.succeed({ file, stored }, lines.map((line) => `${line}\n`).join(""));
});
