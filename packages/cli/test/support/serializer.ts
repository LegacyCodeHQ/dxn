import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SnapshotSerializer } from "vitest";

// Replaces the throwaway project directories tests create with <tmp>, so
// snapshots of output and diagnostics stay the same from run to run.
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const roots = [...new Set([realpathSync(tmpdir()), tmpdir()])].sort((a, b) => b.length - a.length);
const temporary = new RegExp(
  // mkdtemp's prefix (dxn-, dxn-commit-, ...) and six random characters.
  `(?:${roots.map(escapeRegExp).join("|")})/dxn(?:-[a-z]+)*-[A-Za-z0-9]{6}`,
  "g",
);

const serializer: SnapshotSerializer = {
  test: (value) => typeof value === "string" && new RegExp(temporary.source).test(value),
  serialize: (value: string, config, indentation, depth, refs, printer) =>
    printer(value.replace(temporary, "<tmp>"), config, indentation, depth, refs),
};

export default serializer;
