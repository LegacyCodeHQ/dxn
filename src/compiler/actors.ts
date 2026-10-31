import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode } from "./json.js";
import { checkSchema, checkVersion, expectName, expectObject, keys } from "./shape.js";

// actors.json: the roles that do work against the model. An actor is a name
// for now; its declaration has no keys yet.
export function checkActorsFile(root: JsonNode, diagnostics: Diagnostics): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return;
  const fields = keys(diagnostics, document, "$", ["$schema", "version", "actors"], {
    required: ["version", "actors"],
  });
  checkSchema(diagnostics, fields.get("$schema"));
  checkVersion(diagnostics, fields.get("version"));
  const list = fields.get("actors");
  const actors = list === undefined ? undefined : expectObject(diagnostics, list, "$.actors");
  if (actors === undefined) return;
  for (const { key, value } of actors.members) {
    const path = childPath("$.actors", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    const actor = expectObject(diagnostics, value, path);
    if (actor !== undefined) keys(diagnostics, actor, path, []);
  }
}
