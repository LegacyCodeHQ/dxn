import { join } from "node:path";
import type { FileDiagnostic } from "./compiler/compile.js";
import { childPath, Diagnostics } from "./compiler/diagnostic.js";
import { parseJson } from "./compiler/json.js";
import { readSource } from "./compiler/read.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
} from "./compiler/shape.js";
import { contextFilter, QueryError, subtreeContexts } from "./queries.js";
import type { Resolver } from "./resolve.js";

const file = "expectations.json";

// expectations.json: what the model should say, checked by validate once the
// project compiles. Each expectation selects contexts like `contexts` does
// (a node, optionally its whole subtree, in a root, filtered with where) and
// states how many there must be.
export function checkExpectations(project: string, resolver: Resolver): FileDiagnostic[] {
  const read = readSource(join(project, file));
  if (!read.ok) {
    return read.code === "missing-file"
      ? []
      : [
          {
            file,
            code: read.code,
            message: read.message,
            path: "$",
            line: read.line,
            column: read.column,
          },
        ];
  }
  const parsed = parseJson(read.source);
  const diagnostics = new Diagnostics(read.source);
  diagnostics.items.push(...parsed.diagnostics);
  if (parsed.root !== undefined) {
    checkFile(diagnostics, resolver, parsed.root);
  }
  return diagnostics.items.map((diagnostic) => ({ file, ...diagnostic }));
}

function checkFile(
  diagnostics: Diagnostics,
  resolver: Resolver,
  root: Parameters<typeof expectObject>[1],
): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return;
  const members = keys(diagnostics, document, "$", ["$schema", "version", "expectations"], {
    required: ["version", "expectations"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));
  const list = members.get("expectations");
  if (list === undefined || !expectKind(diagnostics, list, "$.expectations", "array")) return;

  list.elements.forEach((item, index) => {
    const path = `$.expectations[${index}]`;
    const expectation = expectObject(diagnostics, item, path);
    if (expectation === undefined) return;
    const fields = keys(
      diagnostics,
      expectation,
      path,
      ["title", "node", "subtree", "root", "where", "count"],
      { required: ["title", "node", "count"] },
    );
    let valid = true;

    const title = fields.get("title");
    if (title !== undefined && !expectNonEmptyString(diagnostics, title, `${path}.title`))
      valid = false;

    const node = fields.get("node");
    let id: string | undefined;
    if (node !== undefined && expectName(diagnostics, node, `${path}.node`)) {
      if (resolver.node(node.value) === undefined) {
        report(
          diagnostics,
          "unknown-node",
          `node ${JSON.stringify(node.value)} does not exist`,
          `${path}.node`,
          node,
        );
      } else {
        id = node.value;
      }
    }

    const subtree = fields.get("subtree");
    if (subtree !== undefined && !expectKind(diagnostics, subtree, `${path}.subtree`, "boolean"))
      valid = false;

    const rootNode = fields.get("root");
    let root: string | undefined;
    if (rootNode !== undefined && expectName(diagnostics, rootNode, `${path}.root`)) {
      if (id !== undefined && !resolver.roots(id).includes(rootNode.value)) {
        report(
          diagnostics,
          "node-outside-root",
          `node ${JSON.stringify(id)} is not in root ${JSON.stringify(rootNode.value)}`,
          `${path}.root`,
          rootNode,
        );
        valid = false;
      }
      root = rootNode.value;
    }

    const where: [string, string][] = [];
    const whereNode = fields.get("where");
    const whereObject =
      whereNode === undefined ? undefined : expectObject(diagnostics, whereNode, `${path}.where`);
    if (whereNode !== undefined && whereObject === undefined) valid = false;
    for (const { key, value } of whereObject?.members ?? []) {
      if (expectName(diagnostics, value, childPath(`${path}.where`, key.value))) {
        where.push([key.value, value.value]);
      } else {
        valid = false;
      }
    }

    const count = fields.get("count");
    let expected: number | undefined;
    if (count !== undefined && expectKind(diagnostics, count, `${path}.count`, "number")) {
      if (!Number.isInteger(count.value) || count.value < 0) {
        report(
          diagnostics,
          "invalid-count",
          "count must be a whole number, 0 or more",
          `${path}.count`,
          count,
        );
      } else {
        expected = count.value;
      }
    }

    if (!valid || id === undefined || expected === undefined || count === undefined) return;
    const contexts =
      subtree?.kind === "boolean" && subtree.value
        ? subtreeContexts(resolver, id, root).flatMap((part) => part.contexts)
        : root === undefined
          ? resolver.roots(id).flatMap((inRoot) => resolver.contexts(id, inRoot))
          : resolver.contexts(id, root);
    let keep: (context: (typeof contexts)[number]) => boolean;
    try {
      keep = contextFilter(resolver, where, contexts, root);
    } catch (error) {
      if (!(error instanceof QueryError)) throw error;
      const [name] = where.find(([candidate, value]) =>
        error.field === "name"
          ? error.message.startsWith(`"${candidate}"`)
          : error.message.startsWith(`"${value}"`),
      ) ?? [""];
      const entry = whereObject?.members.find((member) => member.key.value === name);
      const at = error.field === "name" ? entry?.key : entry?.value;
      report(
        diagnostics,
        error.field === "name" ? "unknown-name" : "unknown-value",
        error.message,
        childPath(`${path}.where`, name),
        at ?? whereNode ?? expectation,
      );
      return;
    }
    const actual = contexts.filter(keep).length;
    if (actual !== expected) {
      report(
        diagnostics,
        "expectation-failed",
        `${title?.kind === "string" ? title.value : "expectation"}: expected ${expected} context${expected === 1 ? "" : "s"}, found ${actual}`,
        `${path}.count`,
        count,
      );
    }
  });
}
