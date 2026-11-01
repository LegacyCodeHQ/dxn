// Fail when a TypeScript package, one with a tsconfig.build.json under
// packages/*, is not referenced from the root tsconfig.build.json, so
// `make build` cannot leave a package out. Packages without TypeScript are
// not built by tsc, and are left alone.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";

const root = "tsconfig.build.json";
// The root config is JSON with comments: drop them before reading it.
const text = readFileSync(root, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const referenced = new Set(
  (JSON.parse(text).references ?? []).map(({ path }) => {
    const target = normalize(path);
    return target.endsWith(".json") ? target : join(target, "tsconfig.json");
  }),
);

const missing = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => join("packages", name, "tsconfig.build.json"))
  .filter((config) => existsSync(config) && !referenced.has(normalize(config)));

for (const config of missing) {
  const name = config.split("/")[1];
  console.error(
    `references: packages/${name} has a tsconfig.build.json, but ${root} does not reference it; add { "path": "${config}" } to its "references"`,
  );
}
if (missing.length > 0) process.exit(1);
console.log(`references: ${root} references every TypeScript package`);
