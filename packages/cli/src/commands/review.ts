import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  folderOf,
  freshness,
  placement,
  repositoryOf,
  reviewPages,
  treePaths,
} from "@legacycodehq/dxn-language";
import { type Command, command } from "./context.js";
import { misused, options, Reporter, read } from "./report.js";
import { loadStored } from "./stored.js";
import { usage } from "./usage.js";

// Where a record's review pages for a file go, in the cache: under the
// repository, by its name and where it is, then the file's folder in it and
// the record's folder, as the stored records are beside the file.
export function reviewFolder(cache: string, file: string, record: string): string {
  const repository = repositoryOf(file);
  const key = `${basename(repository)}-${createHash("sha1").update(repository).digest("hex").slice(0, 8)}`;
  return join(cache, "review", key, relative(repository, dirname(file)), folderOf(record));
}

export const reviewCommand: Command = command(usage, (args, { io, cwd, cache, dryRun }) => {
  const {
    json,
    rest: [file, ...rest],
  } = options(args);
  if (file === undefined || rest.length > 0) {
    return misused(io, json, "give one file, whose evidence to review");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  const data = loadStored(parsed, file, cwd, report);
  if (typeof data === "number") return data;
  for (const path of treePaths(parsed)) {
    try {
      placement(parsed, path);
    } catch (error) {
      return report.refuse(`${path}: ${(error as Error).message}`);
    }
  }
  const full = resolve(cwd, file);
  const check = freshness(repositoryOf(full, cwd));
  const written: string[] = [];
  const records = parsed.records.filter(
    ({ context, fields }) => context && fields.some(({ type }) => type.name === "PenNode"),
  );
  for (const { name } of records) {
    const folder = reviewFolder(cache, full, name);
    const sources = data.filter(({ record }) => record === name).map(({ source }) => source);
    // A picture, by its node's id, beside the page.
    const picture = (id: string) =>
      existsSync(join(folder, "pictures", `${id}.png`)) ? `pictures/${id}.png` : undefined;
    for (const { root, markdown } of reviewPages(parsed, name, sources, check, picture, file)) {
      const page = join(folder, `${folderOf(root)}.md`);
      if (dryRun) io.stdout(`Would write ${page}\n`);
      else {
        mkdirSync(folder, { recursive: true });
        writeFileSync(page, markdown);
      }
      written.push(page);
    }
  }
  return report.succeed(
    { file, written },
    dryRun ? "" : written.map((page) => `Wrote ${page}\n`).join(""),
  );
});
