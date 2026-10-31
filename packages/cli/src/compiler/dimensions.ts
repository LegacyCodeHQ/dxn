import type { Diagnostics, JsonNode } from "@legacycodehq/dxn-language";
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

// dimensions/<name>.json: the dimension's values and the nodes it applies to.
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
      required: ["version", "values"],
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
        "list at least one node, or leave appliesTo out until the dimension applies to one",
        "$.appliesTo",
        appliesTo,
      );
    }
    for (const [id, idPath] of stringElements(
      diagnostics,
      appliesTo,
      "$.appliesTo",
      "duplicate-node",
    )) {
      if (!tree.ids.has(id.value)) {
        report(
          diagnostics,
          "unknown-node",
          `node ${JSON.stringify(id.value)} does not exist`,
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
      .every(({ code }) => code === "duplicate-node");
  } else if (appliesTo === undefined) {
    // Declared before the nodes it will apply to: it applies to nothing yet.
    dimension.scopeComplete = true;
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
