// Stage an isolated development extension with a real local grammar commit.
// No repository history, global tools or editor settings are changed.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const output = join(root, ".dxn-dev");
const grammar = join(output, "grammar");
const extension = join(output, "zed");
mkdirSync(grammar, { recursive: true });
for (const path of ["grammar.js", "tree-sitter.json", "src"]) {
  rmSync(join(grammar, "packages/tree-sitter-dxn", path), { recursive: true, force: true });
  cpSync(
    join(root, "packages/tree-sitter-dxn", path),
    join(grammar, "packages/tree-sitter-dxn", path),
    { recursive: true },
  );
}
const git = (...args) => execFileSync("git", args, { cwd: grammar, encoding: "utf8" }).trim();
git("init", "--quiet");
git("add", "-A", "packages");
if (git("status", "--porcelain"))
  git(
    "-c",
    "user.name=DXN development",
    "-c",
    "user.email=development@localhost",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "snapshot local redesign grammar",
  );
const commit = git("rev-parse", "HEAD");
mkdirSync(extension, { recursive: true });
for (const path of ["src", "languages", "Cargo.toml", "Cargo.lock", "LICENSE"]) {
  cpSync(join(root, "packages/zed", path), join(extension, path), { recursive: true });
}
const manifest = readFileSync(join(root, "packages/zed/extension.toml"), "utf8");
writeFileSync(
  join(extension, "extension.toml"),
  `${manifest}\n[grammars.dxn]\nrepository = ${JSON.stringify(pathToFileURL(grammar).href)}\ncommit = ${JSON.stringify(commit)}\npath = "packages/tree-sitter-dxn"\n`,
);
console.log(`Development extension: ${extension}`);
console.log(`Local grammar: ${commit}`);
