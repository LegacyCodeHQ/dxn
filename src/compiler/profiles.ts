import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode, ObjectNode } from "./json.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectObject,
  keys,
  report,
} from "./shape.js";
import type { DimensionSymbol } from "./symbols.js";

// The profiles that compiled, and the dimensions they cover.
export interface ProfilesSymbol {
  // Every distinct combination a profile, or a modifier on one, gives:
  // dimension -> value.
  combinations: Map<string, string>[];
  dimensions: Set<string>;
  // Whether profiles.json has no errors, so its profiles are all there.
  complete: boolean;
}

// profiles.json: the setups that exist. A profile is one combination of
// dimension values, giving one value for each dimension the profiles cover;
// profiles may share a combination. A modifier is an accessory, such as a
// keyboard with a trackpad: it is on some profiles and sets some of their
// values, which makes a profile <profile>+<modifier> for each.
export function checkProfilesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  dimensions: Map<string, { symbol: DimensionSymbol }>,
): ProfilesSymbol {
  const result: ProfilesSymbol = { combinations: [], dimensions: new Set(), complete: false };
  const before = diagnostics.items.length;
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) return result;
  const fields = keys(diagnostics, document, "$", ["$schema", "version", "profiles", "modifiers"], {
    required: ["version", "profiles"],
  });
  checkSchema(diagnostics, fields.get("$schema"));
  checkVersion(diagnostics, fields.get("version"));
  const list = fields.get("profiles");
  const profiles = list === undefined ? undefined : expectObject(diagnostics, list, "$.profiles");
  if (profiles === undefined) return result;

  // A dimension's value, checked; undefined when it is not valid.
  const checkValue = (name: JsonNode & { value: string }, given: JsonNode, path: string) => {
    const dimension = dimensions.get(name.value);
    if (dimension === undefined) {
      report(
        diagnostics,
        "undeclared-dimension",
        `dimension ${JSON.stringify(name.value)} is not declared`,
        path,
        name,
      );
      return undefined;
    }
    if (!expectName(diagnostics, given, path)) return undefined;
    if (dimension.symbol.values !== undefined && !dimension.symbol.values.has(given.value)) {
      report(
        diagnostics,
        "unknown-dimension-value",
        `${JSON.stringify(given.value)} is not a value of dimension ${JSON.stringify(name.value)}`,
        path,
        given,
      );
      return undefined;
    }
    return given.value;
  };

  const checked: { name: string; values: Map<string, string>; item: ObjectNode; path: string }[] =
    [];
  const names = new Set<string>();
  for (const { key, value } of profiles.members) {
    const path = childPath("$.profiles", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    names.add(key.value);
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
      const checkedValue = checkValue(name, given, childPath(path, name.value));
      if (checkedValue === undefined) valid = false;
      else values.set(name.value, checkedValue);
    }
    for (const name of values.keys()) result.dimensions.add(name);
    if (valid) checked.push({ name: key.value, values, item, path });
  }

  const seen = new Set<string>();
  const add = (values: Map<string, string>) => {
    const combination = JSON.stringify([...values].sort(([a], [b]) => (a < b ? -1 : 1)));
    if (!seen.has(combination)) result.combinations.push(values);
    seen.add(combination);
  };
  const complete = new Map<string, Map<string, string>>();
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
    complete.set(name, values);
    add(values);
  }

  const modifierList = fields.get("modifiers");
  const modifiers =
    modifierList === undefined ? undefined : expectObject(diagnostics, modifierList, "$.modifiers");
  for (const { key, value } of modifiers?.members ?? []) {
    const path = childPath("$.modifiers", key.value);
    if (!expectName(diagnostics, key, path)) continue;
    const item = expectObject(diagnostics, value, path);
    if (item === undefined) continue;
    const parts = keys(diagnostics, item, path, ["on", "sets"], { required: ["on", "sets"] });
    const on = parts.get("on");
    const targets: [string, JsonNode][] = [];
    if (on !== undefined && expectKind(diagnostics, on, `${path}.on`, "array")) {
      if (on.elements.length === 0) {
        report(
          diagnostics,
          "empty-values",
          "a modifier is on at least one profile",
          `${path}.on`,
          on,
        );
      }
      on.elements.forEach((element, index) => {
        const here = `${path}.on[${index}]`;
        if (!expectName(diagnostics, element, here)) return;
        if (!names.has(element.value)) {
          report(
            diagnostics,
            "unknown-profile",
            `${JSON.stringify(element.value)} is not a profile`,
            here,
            element,
          );
          return;
        }
        targets.push([element.value, element]);
      });
    }
    const setsNode = parts.get("sets");
    const sets =
      setsNode === undefined ? undefined : expectObject(diagnostics, setsNode, `${path}.sets`);
    if (sets === undefined) continue;
    if (sets.members.length === 0) {
      report(
        diagnostics,
        "empty-values",
        "a modifier sets at least one dimension's value",
        `${path}.sets`,
        sets,
      );
      continue;
    }
    const changes = new Map<string, string>();
    let valid = true;
    for (const { key: name, value: given } of sets.members) {
      const here = childPath(`${path}.sets`, name.value);
      const checkedValue = checkValue(name, given, here);
      if (checkedValue === undefined) {
        valid = false;
      } else if (!result.dimensions.has(name.value)) {
        report(
          diagnostics,
          "unprofiled-dimension",
          `profiles do not give ${JSON.stringify(name.value)}, so a modifier cannot set it`,
          here,
          name,
        );
        valid = false;
      } else {
        changes.set(name.value, checkedValue);
      }
    }
    if (!valid) continue;
    for (const [profile, element] of targets) {
      const values = complete.get(profile);
      if (values === undefined) continue;
      if ([...changes].every(([name, changed]) => values.get(name) === changed)) {
        report(
          diagnostics,
          "modifier-changes-nothing",
          `modifier ${JSON.stringify(key.value)} changes nothing on profile ${JSON.stringify(profile)}`,
          `${path}.on`,
          element,
        );
        continue;
      }
      add(new Map([...values, ...changes]));
    }
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
