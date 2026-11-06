// One row per active redesign package, including unexecuted code.
// Missing packages are an error, so a new workspace cannot silently disappear.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const javascript = read("coverage/javascript/coverage-summary.json");
const native = read("coverage/zed/coverage.json");
const { workspaces } = read("package.json");
const metrics = ["lines", "functions", "branches", "statements"];
const rows = {};

function summarize(files) {
  return Object.fromEntries(
    metrics.map((metric) => {
      let total = 0;
      let covered = 0;
      for (const file of files) {
        total += file[metric]?.total ?? 0;
        covered += file[metric]?.covered ?? 0;
      }
      return [metric, { total, covered, pct: total === 0 ? null : (100 * covered) / total }];
    }),
  );
}

// The retained prototype library is not part of this worktree's runtime or test suite.
for (const workspace of workspaces.filter((path) => path !== "packages/language")) {
  const prefix = `${join(root, workspace)}/`;
  const files = Object.entries(javascript)
    .filter(([path]) => path.startsWith(prefix))
    .map(([, summary]) => summary);
  if (files.length === 0) throw new Error(`coverage: no files reported for ${workspace}`);
  rows[workspace] = { files: files.length, ...summarize(files) };
}

const rustFiles = native.data
  .flatMap(({ files }) => files)
  .filter(({ filename }) => filename.startsWith(`${join(root, "packages/zed/src")}/`));
if (rustFiles.length === 0) throw new Error("coverage: no files reported for packages/zed");
const rustSummaries = rustFiles.map(({ summary }) =>
  Object.fromEntries(
    metrics.map((metric) => [
      metric,
      { total: summary[metric]?.count ?? 0, covered: summary[metric]?.covered ?? 0 },
    ]),
  ),
);
rows["packages/zed"] = { files: rustFiles.length, ...summarize(rustSummaries) };

console.log("\nPackage coverage (%):");
console.log("Package".padEnd(28) + metrics.map((metric) => metric.padStart(12)).join(""));
for (const [name, summary] of Object.entries(rows)) {
  console.log(
    name.padEnd(28) +
      metrics.map((metric) => (summary[metric].pct?.toFixed(2) ?? "n/a").padStart(12)).join(""),
  );
}
writeFileSync(join(root, "coverage/workspace-summary.json"), `${JSON.stringify(rows, null, 2)}\n`);
