import type { Diagnostics } from "./diagnostic.js";
import type { JsonNode } from "./json.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectObject,
  keys,
  report,
  stringElements,
  uniqueStrings,
} from "./shape.js";
import type { DimensionSymbol, TreeSymbols } from "./symbols.js";

// dimensions/<name>.json: the dimension's values and the tasks it applies to.
export function checkDimensionFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
): DimensionSymbol {
  const dimension: DimensionSymbol = {
    values: undefined,
    scope: new Set(),
    scopeComplete: false,
  };
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return dimension;
  }
  const fields = keys(
    diagnostics,
    document,
    "$",
    ["$schema", "version", "values", "default", "appliesTo"],
    {
      required: ["version", "values", "appliesTo"],
    },
  );
  checkSchema(diagnostics, fields.get("$schema"));
  checkVersion(diagnostics, fields.get("version"));

  const values = fields.get("values");
  if (values !== undefined && expectKind(diagnostics, values, "$.values", "array")) {
    if (values.elements.length === 0) {
      report(
        diagnostics,
        "empty-values",
        "a dimension must declare at least one value",
        "$.values",
        values,
      );
    } else {
      dimension.values = uniqueStrings(diagnostics, values, "$.values", "duplicate-value");
    }
  }

  const fallback = fields.get("default");
  if (fallback !== undefined && expectName(diagnostics, fallback, "$.default")) {
    if (dimension.values !== undefined && !dimension.values.has(fallback.value)) {
      report(
        diagnostics,
        "unknown-dimension-value",
        `default ${JSON.stringify(fallback.value)} is not one of the values`,
        "$.default",
        fallback,
      );
    } else {
      dimension.default = fallback.value;
    }
  }

  const appliesTo = fields.get("appliesTo");
  if (appliesTo !== undefined && expectKind(diagnostics, appliesTo, "$.appliesTo", "array")) {
    const before = diagnostics.items.length;
    if (appliesTo.elements.length === 0) {
      report(
        diagnostics,
        "empty-applies-to",
        "a dimension must apply to at least one task",
        "$.appliesTo",
        appliesTo,
      );
    }
    for (const [id, idPath] of stringElements(
      diagnostics,
      appliesTo,
      "$.appliesTo",
      "duplicate-task",
    )) {
      if (!tree.ids.has(id.value)) {
        report(
          diagnostics,
          "unknown-task",
          `task ${JSON.stringify(id.value)} does not exist`,
          idPath,
          id,
        );
        continue;
      }
      addSubtree(tree, id.value, dimension.scope);
    }
    // A duplicate entry does not shrink the scope; any other problem does.
    dimension.scopeComplete = diagnostics.items
      .slice(before)
      .every(({ code }) => code === "duplicate-task");
  }
  return dimension;
}

function addSubtree(tree: TreeSymbols, id: string, scope: Set<string>): void {
  if (scope.has(id)) {
    return;
  }
  scope.add(id);
  for (const child of tree.children.get(id) ?? []) {
    addSubtree(tree, child, scope);
  }
}
