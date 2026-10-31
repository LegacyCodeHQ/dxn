import { childPath, type Diagnostics, type JsonNode } from "@legacycodehq/dxn-language";
import { sources } from "./fingerprint.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
} from "./shape.js";

// What an actor records: evidence of one kind, such as a design, and the
// checks whose results it may record.
export interface ActorSymbol {
  evidence?: string;
  source?: string;
  checks: Set<string>;
}

// actors.json: the roles that do work against the model, each declaring what
// it records. Returns the actors it declares, by name.
export function checkActorsFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  checks: Set<string>,
): Map<string, ActorSymbol> {
  const result = new Map<string, ActorSymbol>();
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return result;
  const fields = keys(diagnostics, document, "$", ["$schema", "version", "actors"], {
    required: ["version", "actors"],
  });
  checkSchema(diagnostics, fields.get("$schema"));
  checkVersion(diagnostics, fields.get("version"));
  const list = fields.get("actors");
  const actors = list === undefined ? undefined : expectObject(diagnostics, list, "$.actors");
  if (actors === undefined) return result;
  for (const { key, value } of actors.members) {
    const path = childPath("$.actors", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    const symbol: ActorSymbol = { checks: new Set() };
    result.set(key.value, symbol);
    const actor = expectObject(diagnostics, value, path);
    if (actor === undefined) continue;
    const parts = keys(diagnostics, actor, path, ["evidence", "source", "checks"]);
    const source = parts.get("source");
    if (source !== undefined && expectName(diagnostics, source, `${path}.source`)) {
      if (!sources.includes(source.value)) {
        report(
          diagnostics,
          "unknown-source",
          `${JSON.stringify(source.value)} is not a source (${sources.join(", ")})`,
          `${path}.source`,
          source,
        );
      } else if (!parts.has("evidence")) {
        report(
          diagnostics,
          "source-without-evidence",
          `actor ${JSON.stringify(key.value)} declares a source but records no evidence`,
          `${path}.source`,
          source,
        );
      } else {
        symbol.source = source.value;
      }
    }
    const evidence = parts.get("evidence");
    if (evidence !== undefined && expectNonEmptyString(diagnostics, evidence, `${path}.evidence`)) {
      symbol.evidence = evidence.kind === "string" ? evidence.value : undefined;
    }
    const recorded = parts.get("checks");
    if (recorded === undefined || !expectKind(diagnostics, recorded, `${path}.checks`, "array")) {
      continue;
    }
    recorded.elements.forEach((element, index) => {
      const here = `${path}.checks[${index}]`;
      if (!expectName(diagnostics, element, here)) return;
      if (!checks.has(element.value)) {
        report(
          diagnostics,
          "undeclared-check",
          `check ${JSON.stringify(element.value)} is not declared`,
          here,
          element,
        );
        return;
      }
      symbol.checks.add(element.value);
    });
  }
  return result;
}
