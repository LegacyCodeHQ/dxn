import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode, ObjectNode } from "./json.js";
import { checkSchema, checkVersion, expectName, expectObject, keys, report } from "./shape.js";
import type { DimensionSymbol } from "./symbols.js";

// The profiles that compiled, and the dimensions they cover.
export interface ProfilesSymbol {
  // Profile name -> dimension -> value.
  profiles: Map<string, Map<string, string>>;
  dimensions: Set<string>;
  // Whether profiles.json has no errors, so its profiles are all there.
  complete: boolean;
}

// profiles.json: the combinations of dimension values that exist. Each
// profile gives one value for each dimension the profiles cover, and no two
// profiles give the same combination.
export function checkProfilesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): ProfilesSymbol {
  const result: ProfilesSymbol = { profiles: new Map(), dimensions: new Set(), complete: false };
  const before = diagnostics.items.length;
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return result;
  const fields = keys(diagnostics, document, "$", ["$schema", "version", "profiles"], {
    required: ["version", "profiles"],
  });
  checkSchema(diagnostics, fields.get("$schema"));
  checkVersion(diagnostics, fields.get("version"));
  const list = fields.get("profiles");
  const profiles = list === undefined ? undefined : expectObject(diagnostics, list, "$.profiles");
  if (profiles === undefined) return result;

  const checked: { name: string; values: Map<string, string>; item: ObjectNode; path: string }[] =
    [];
  for (const { key, value } of profiles.members) {
    const path = childPath("$.profiles", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    const item = expectObject(diagnostics, value, path);
    if (item === undefined) continue;
    if (item.members.length === 0) {
      report(
        diagnostics,
        "empty-values",
        "a profile names at least one dimension and its value",
        path,
        item,
      );
      continue;
    }
    const values = new Map<string, string>();
    let valid = true;
    for (const { key: name, value: given } of item.members) {
      const valuePath = childPath(path, name.value);
      const dimension = dimensions.get(name.value);
      if (dimension === undefined) {
        report(
          diagnostics,
          "undeclared-dimension",
          `dimension ${JSON.stringify(name.value)} is not declared`,
          valuePath,
          name,
        );
        valid = false;
        continue;
      }
      if (!expectName(diagnostics, given, valuePath)) {
        valid = false;
        continue;
      }
      if (dimension.symbol.values !== undefined && !dimension.symbol.values.has(given.value)) {
        report(
          diagnostics,
          "unknown-dimension-value",
          `${JSON.stringify(given.value)} is not a value of dimension ${JSON.stringify(name.value)}`,
          valuePath,
          given,
        );
        valid = false;
        continue;
      }
      values.set(name.value, given.value);
    }
    for (const name of values.keys()) result.dimensions.add(name);
    if (valid) checked.push({ name: key.value, values, item, path });
  }

  const seen = new Map<string, string>();
  for (const { name, values, item, path } of checked) {
    const missing = [...result.dimensions].filter((dimension) => !values.has(dimension));
    if (missing.length > 0) {
      report(
        diagnostics,
        "incomplete-profile",
        `profile ${JSON.stringify(name)} does not give ${missing.join(", ")}, which other profiles give`,
        path,
        item,
      );
      continue;
    }
    const combination = JSON.stringify([...values].sort(([a], [b]) => (a < b ? -1 : 1)));
    const first = seen.get(combination);
    if (first !== undefined) {
      report(
        diagnostics,
        "duplicate-profile",
        `profile ${JSON.stringify(name)} is the same combination as ${JSON.stringify(first)}`,
        path,
        item,
      );
      continue;
    }
    seen.set(combination, name);
    result.profiles.set(name, values);
  }
  result.complete = diagnostics.items.length === before;
  return result;
}

// Whether some profile has these values for every dimension the profiles
// cover that the context names; a context naming none of them fits.
export function fitsProfile(
  profiles: ProfilesSymbol,
  values: (dimension: string) => string | undefined,
  dimensions: string[],
): boolean {
  const covered = dimensions.filter((dimension) => profiles.dimensions.has(dimension));
  if (covered.length === 0) return true;
  return [...profiles.profiles.values()].some((profile) =>
    covered.every((dimension) => profile.get(dimension) === values(dimension)),
  );
}
