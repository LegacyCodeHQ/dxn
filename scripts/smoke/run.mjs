// Run every command a package under packages/* declares in its "bin", once,
// with --version, so a built command that cannot start fails the smoke test.
// The commands are found from the package.json files, not listed by hand.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const commands = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => join("packages", name))
  .filter((folder) => existsSync(join(folder, "package.json")))
  .flatMap((folder) => {
    const { name, bin } = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
    if (bin === undefined) return [];
    // "bin" is a path, named after the package, or a map of names to paths.
    const paths = typeof bin === "string" ? [bin] : Object.values(bin);
    return paths.map((path) => ({ name, path: join(folder, path) }));
  });

if (commands.length === 0) {
  console.error("smoke: no package under packages/ declares a bin");
  process.exit(1);
}
for (const { name, path } of commands) {
  console.log(`node ${path} --version  # ${name}`);
  execFileSync("node", [path, "--version"], { stdio: "inherit" });
}
