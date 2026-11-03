import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { createPathsMatcher, parseTsconfig } from "get-tsconfig";
import { allowed, layerOf } from "./rules.mjs";

const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const shown = (root, path) => relative(root, path).split(sep).join("/");

function filesUnder(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return filesUnder(path);
      return sourceExtension.test(entry.name) ? [path] : [];
    });
}

// Walk syntax, including type-only imports, rather than matching source text.
function imports(source, file) {
  const found = [];
  const ast = parse(source, {
    sourceType: "module",
    sourceFilename: file,
    plugins: /\.[jt]sx$/.test(file) ? ["typescript", "jsx"] : ["typescript"],
    createImportExpressions: true,
    attachComment: false,
  });
  const add = (node, at) => {
    const specifier =
      node?.type === "StringLiteral"
        ? node.value
        : node?.type === "TemplateLiteral" && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : undefined;
    found.push({ specifier, line: at.loc.start.line, column: at.loc.start.column + 1 });
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      node.source
    ) {
      add(node.source, node);
    } else if (node.type === "ImportExpression") add(node.source, node);
    else if (node.type === "TSImportType") add(node.argument, node);
    else if (node.type === "TSExternalModuleReference") add(node.expression, node);
    else if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require"
    ) {
      add(node.arguments[0], node);
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        !["loc", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key)
      )
        walk(value);
    }
  };
  walk(ast.program);
  return found;
}

function sourcePath(candidate) {
  const substituted = candidate.replace(/\.([cm]?)jsx?$/, ".$1ts");
  for (const path of [substituted, candidate, `${candidate}.ts`, join(candidate, "index.ts")]) {
    if (existsSync(path) && statSync(path).isFile()) return realpathSync(path);
  }
  return undefined;
}

export function checkProject(directory) {
  const root = realpathSync(directory);
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const configPath = join(root, "tsconfig.json");
  const matchPaths = createPathsMatcher({ path: configPath, config: parseTsconfig(configPath) });
  const workspaces = read("package.json").workspaces.map((path) => ({
    path,
    name: read(`${path}/package.json`).name,
  }));
  const files = readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name }) => filesUnder(join(root, "packages", name, "src")))
    .sort();
  const problems = [];
  for (const file of files) {
    const path = shown(root, file);
    const from = layerOf(path);
    if (!from) {
      problems.push(`${path}: unclassified source; declare its dependency rules`);
      continue;
    }
    let dependencies;
    try {
      dependencies = imports(readFileSync(file, "utf8"), path);
    } catch (error) {
      problems.push(`${path}: cannot parse dependencies: ${error.message}`);
      continue;
    }
    for (const { specifier, line, column } of dependencies) {
      const report = (message) => problems.push(`${path}:${line}:${column}: ${message}`);
      if (specifier === undefined) {
        report("use a literal module specifier so dependency boundaries can be checked");
        continue;
      }
      const workspace = workspaces.find(
        ({ name }) => specifier === name || specifier.startsWith(`${name}/`),
      );
      const owner = path.split("/")[1];
      const foreign = workspace && workspace.path !== `packages/${owner}`;
      if (foreign) {
        if (
          ["cli", "language-server"].includes(owner) &&
          workspace.path === "packages/language" &&
          specifier === workspace.name
        )
          continue;
        report(`use an allowed public package API; cannot depend on ${JSON.stringify(specifier)}`);
        continue;
      }
      const candidates = workspace
        ? [join(root, workspace.path, "src/index.ts")]
        : specifier.startsWith("file:")
          ? [fileURLToPath(specifier)]
          : specifier.startsWith(".") || isAbsolute(specifier)
            ? [resolve(dirname(file), specifier)]
            : (matchPaths?.(specifier) ?? []);
      // External packages and Node builtins do not belong to these layers.
      if (candidates.length === 0) continue;
      const target = candidates.map(sourcePath).find(Boolean);
      if (!target) {
        report(`cannot resolve ${JSON.stringify(specifier)} to a source file`);
        continue;
      }
      const toPath = shown(root, target);
      const to = layerOf(toPath);
      if (toPath.split("/")[1] !== owner) {
        report(`use the public package name instead of ${JSON.stringify(specifier)} (${toPath})`);
      } else if (!to || !allowed[from].includes(to)) {
        report(`${from} cannot depend on ${to ?? "non-source code"} (${toPath})`);
      }
    }
  }
  return { files: files.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { files, problems } = checkProject(resolve(import.meta.dirname, "../.."));
    for (const problem of problems) console.error(`boundaries: ${problem}`);
    if (problems.length) process.exitCode = 1;
    else console.log(`boundaries: ${files} source files respect the dependency rules`);
  } catch (error) {
    console.error(`boundaries: ${error.message}`);
    process.exitCode = 1;
  }
}
