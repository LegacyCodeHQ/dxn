import { childPath, type Diagnostics } from "./diagnostic.js";
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
import type { DimensionSymbols, TreeSymbols } from "./symbols.js";

export function checkDimensions(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
): DimensionSymbols {
  const dimensions: DimensionSymbols = new Map();
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return dimensions;
  }
  const members = keys(diagnostics, document, "$", ["$schema", "version", "dimensions"], {
    required: ["version", "dimensions"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const declarationsNode = members.get("dimensions");
  const declarations =
    declarationsNode === undefined
      ? undefined
      : expectObject(diagnostics, declarationsNode, "$.dimensions");
  for (const { key, value } of declarations?.members ?? []) {
    const path = childPath("$.dimensions", key.value);
    expectName(diagnostics, key, path);
    const dimension = { values: undefined as Set<string> | undefined, scope: new Set<string>() };
    dimensions.set(key.value, dimension);
    const declaration = expectObject(diagnostics, value, path);
    if (declaration === undefined) {
      continue;
    }
    const fields = keys(diagnostics, declaration, path, ["values", "appliesTo"], {
      required: ["values", "appliesTo"],
    });

    const values = fields.get("values");
    if (values !== undefined && expectKind(diagnostics, values, `${path}.values`, "array")) {
      if (values.elements.length === 0) {
        report(
          diagnostics,
          "empty-values",
          "a dimension must declare at least one value",
          `${path}.values`,
          values,
        );
      } else {
        dimension.values = uniqueStrings(diagnostics, values, `${path}.values`, "duplicate-value");
      }
    }

    const appliesTo = fields.get("appliesTo");
    if (
      appliesTo !== undefined &&
      expectKind(diagnostics, appliesTo, `${path}.appliesTo`, "array")
    ) {
      if (appliesTo.elements.length === 0) {
        report(
          diagnostics,
          "empty-applies-to",
          "a dimension must apply to at least one task",
          `${path}.appliesTo`,
          appliesTo,
        );
      }
      for (const [id, idPath] of stringElements(
        diagnostics,
        appliesTo,
        `${path}.appliesTo`,
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
    }
  }
  return dimensions;
}

function addSubtree(tree: TreeSymbols, id: string, scope: Set<string>): void {
  scope.add(id);
  for (const child of tree.children.get(id) ?? []) {
    addSubtree(tree, child, scope);
  }
}
