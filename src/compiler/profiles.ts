import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode, ObjectNode } from "./json.js";
import { checkSchema, checkVersion, expectName, expectObject, keys, report } from "./shape.js";
import type { DimensionSymbol } from "./symbols.js";

// The profiles that compiled, and the dimensions they cover.
export interface ProfilesSymbol {
  // Every distinct combination some profile lists: dimension -> value.
  combinations: Map<string, string>[];
  dimensions: Set<string>;
  // Whether profiles.json has no errors, so its profiles are all there.
  complete: boolean;
}

// profiles.json: the setups that exist. A profile is one combination of
// dimension values, or a list of them for a setup that can be in several, such
// as a tablet in either orientation. Every combination gives one value for
// each dimension the profiles cover. Profiles may share a combination, but a
// profile lists each of its combinations once.
export function checkProfilesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): ProfilesSymbol {
  const result: ProfilesSymbol = { combinations: [], dimensions: new Set(), complete: false };
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

  const checked: {
    name: string;
    values: Map<string, string>;
    item: ObjectNode;
    path: string;
  }[] = [];
  for (const { key, value } of profiles.members) {
    const path = childPath("$.profiles", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    // One combination, or a list of them.
    const items: [JsonNode, string][] =
      value.kind === "array"
        ? value.elements.map((element, index) => [element, `${path}[${index}]`])
        : [[value, path]];
    if (value.kind === "array" && value.elements.length === 0) {
      report(diagnostics, "empty-values", "a profile lists at least one combination", path, value);
      continue;
    }
    for (const [element, here] of items) {
      const item = expectObject(diagnostics, element, here);
      if (item === undefined) continue;
      if (item.members.length === 0) {
        report(
          diagnostics,
          "empty-values",
          "a profile names at least one dimension and its value",
          here,
          item,
        );
        continue;
      }
      const values = new Map<string, string>();
      let valid = true;
      for (const { key: name, value: given } of item.members) {
        const valuePath = childPath(here, name.value);
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
      if (valid) checked.push({ name: key.value, values, item, path: here });
    }
  }

  const seen = new Set<string>();
  const listed = new Set<string>();
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
    if (listed.has(JSON.stringify([name, combination]))) {
      report(
        diagnostics,
        "duplicate-profile",
        `profile ${JSON.stringify(name)} lists the same combination twice`,
        path,
        item,
      );
      continue;
    }
    listed.add(JSON.stringify([name, combination]));
    if (!seen.has(combination)) result.combinations.push(values);
    seen.add(combination);
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
  return profiles.combinations.some((profile) =>
    covered.every((dimension) => profile.get(dimension) === values(dimension)),
  );
}
