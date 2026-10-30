import { checkAttributeValues } from "./check.js";
import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode } from "./json.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectObject,
  keys,
  report,
  stringElements,
} from "./shape.js";
import {
  type DimensionSymbol,
  type OverrideEntry,
  type OverrideStates,
  type StateChanges,
  type StateSet,
  type TreeSymbols,
  type ValueStates,
  valueKey,
} from "./symbols.js";

// Where the file being checked sits, and where to collect its valid
// overrides for the conflict check.
export interface OverrideSource {
  file: string;
  entries: OverrideEntry[];
}

// A dimension of a combination file, with its single-dimension overrides.
export interface CombinationPart {
  name: string;
  symbol: DimensionSymbol;
  overrides?: OverrideStates;
}

// The states a type or task override starts from in one context.
interface Start {
  type: (name: string, base: Set<string>) => StateSet;
  task: (id: string, typeStates: StateSet) => StateSet;
}

const fromBase: Start = {
  type: (_, base) => ({ states: base, removed: new Set() }),
  task: (_, typeStates) => typeStates,
};

// overrides/<dimension>.json: overrides by dimension value, then by type or task.
// Returns the valid state changes, for checking verification contexts.
export function checkOverridesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimension: DimensionSymbol & { name: string },
  source: OverrideSource,
): OverrideStates {
  const changes: OverrideStates = new Map();
  const byValue = checkFileShape(root, diagnostics);
  for (const entry of byValue?.members ?? []) {
    const valuePath = childPath("$.overrides", entry.key.value);
    if (!isValue(diagnostics, dimension, entry.key, valuePath)) {
      continue;
    }
    changes.set(
      entry.key.value,
      checkValueOverrides(
        diagnostics,
        tree,
        dimension,
        entry.value,
        valuePath,
        fromBase,
        newEntry(diagnostics, source, [[dimension.name, entry.key.value]]),
      ),
    );
  }
  return changes;
}

// overrides/<a>+<b>.json: overrides nested one level per dimension, in file
// name order. Each starts from the states the single-dimension overrides leave
// for its values. Returns state changes keyed by JSON.stringify(values).
export function checkCombinationFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  parts: CombinationPart[],
  source: OverrideSource,
): Map<string, ValueStates> {
  const changes = new Map<string, ValueStates>();
  const scope = {
    scope: new Set(
      [...(parts[0]?.symbol.scope ?? [])].filter((id) =>
        parts.every((part) => part.symbol.scope.has(id)),
      ),
    ),
    scopeComplete: parts.every((part) => part.symbol.scopeComplete),
  };

  const level = (node: JsonNode, path: string, values: string[]): void => {
    if (values.length === parts.length) {
      const singles = parts.map((part, index) => part.overrides?.get(values[index] as string));
      const start: Start = {
        type: (name, base) =>
          apply(
            { states: base, removed: new Set() },
            singles.map((s) => s?.types.get(name)),
          ),
        task: (id, typeStates) =>
          apply(
            typeStates,
            singles.map((s) => s?.tasks.get(id)),
          ),
      };
      const pairs = parts.map((part, index): [string, string] => [
        part.name,
        values[index] as string,
      ]);
      changes.set(
        JSON.stringify(values),
        checkValueOverrides(
          diagnostics,
          tree,
          scope,
          node,
          path,
          start,
          newEntry(diagnostics, source, pairs),
        ),
      );
      return;
    }
    const part = parts[values.length] as CombinationPart;
    const byValue = expectObject(diagnostics, node, path);
    for (const entry of byValue?.members ?? []) {
      const valuePath = childPath(path, entry.key.value);
      if (isValue(diagnostics, part.symbol, entry.key, valuePath)) {
        level(entry.value, valuePath, [...values, entry.key.value]);
      }
    }
  };

  const byValue = checkFileShape(root, diagnostics);
  if (byValue !== undefined) {
    level(byValue, "$.overrides", []);
  }
  return changes;
}

// Applies state changes from several dimensions. A state one adds and another
// removes is contested: it is left out of both sets.
function apply(start: StateSet, changes: (StateChanges | undefined)[]): StateSet {
  const added = new Set(changes.flatMap((change) => [...(change?.add ?? [])]));
  const removedNow = new Set(changes.flatMap((change) => [...(change?.remove ?? [])]));
  const contested = new Set([...added].filter((state) => removedNow.has(state)));
  const result: StateSet = {
    states: new Set(start.states),
    removed: new Set(start.removed),
    contested: new Set([...(start.contested ?? []), ...contested]),
  };
  for (const state of removedNow) {
    result.states.delete(state);
    if (!contested.has(state)) result.removed.add(state);
  }
  for (const state of added) {
    if (contested.has(state)) {
      result.removed.delete(state);
      continue;
    }
    result.states.add(state);
    result.removed.delete(state);
  }
  return result;
}

function checkFileShape(root: JsonNode, diagnostics: Diagnostics) {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return undefined;
  }
  const members = keys(diagnostics, document, "$", ["$schema", "version", "overrides"], {
    required: ["version", "overrides"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));
  const overrides = members.get("overrides");
  return overrides === undefined ? undefined : expectObject(diagnostics, overrides, "$.overrides");
}

function isValue(
  diagnostics: Diagnostics,
  dimension: DimensionSymbol,
  key: { value: string; span: { start: number } },
  path: string,
): boolean {
  if (dimension.values !== undefined && !dimension.values.has(key.value)) {
    report(
      diagnostics,
      "unknown-dimension-value",
      `${JSON.stringify(key.value)} is not a value of this dimension`,
      path,
      key,
    );
    return false;
  }
  return true;
}

function newEntry(
  diagnostics: Diagnostics,
  source: OverrideSource,
  dimensions: [string, string][],
): (kind: OverrideEntry["kind"], target: string) => OverrideEntry {
  return (kind, target) => {
    const created: OverrideEntry = {
      dimensions,
      file: source.file,
      diagnostics,
      kind,
      target,
      values: new Map(),
      added: new Map(),
      removed: new Map(),
    };
    source.entries.push(created);
    return created;
  };
}

// Overrides for one context: type overrides first, so task overrides start
// from the states their type has there.
function checkValueOverrides(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimension: { scope: Set<string>; scopeComplete: boolean },
  node: JsonNode,
  path: string,
  start: Start,
  entryFor: (kind: OverrideEntry["kind"], target: string) => OverrideEntry,
): ValueStates {
  const changes: ValueStates = { types: new Map(), tasks: new Map() };
  const targets = expectObject(diagnostics, node, path);
  if (targets === undefined) {
    return changes;
  }
  const members = keys(diagnostics, targets, path, ["types", "tasks"]);

  const typeStates = new Map<string, StateSet>();
  const typesNode = members.get("types");
  const types =
    typesNode === undefined ? undefined : expectObject(diagnostics, typesNode, `${path}.types`);
  for (const { key, value } of types?.members ?? []) {
    const typePath = childPath(`${path}.types`, key.value);
    const states = tree.types.get(key.value);
    if (states === undefined) {
      report(
        diagnostics,
        "undefined-type",
        `type ${JSON.stringify(key.value)} is not defined`,
        typePath,
        key,
      );
      continue;
    }
    const result = checkOverride(
      diagnostics,
      tree,
      value,
      typePath,
      start.type(key.value, states),
      entryFor("types", key.value),
    );
    typeStates.set(key.value, result.states);
    changes.types.set(key.value, result.changes);
  }

  const tasksNode = members.get("tasks");
  const tasks =
    tasksNode === undefined ? undefined : expectObject(diagnostics, tasksNode, `${path}.tasks`);
  for (const { key, value } of tasks?.members ?? []) {
    const taskPath = childPath(`${path}.tasks`, key.value);
    const id = JSON.stringify(key.value);
    if (!tree.ids.has(key.value)) {
      report(diagnostics, "unknown-task", `task ${id} does not exist`, taskPath, key);
      continue;
    }
    if (!dimension.scope.has(key.value)) {
      if (!dimension.scopeComplete) {
        // appliesTo already has an error; this task may be meant to be in scope.
        continue;
      }
      report(
        diagnostics,
        "task-out-of-scope",
        `task ${id} is not in this dimension's appliesTo`,
        taskPath,
        key,
      );
      continue;
    }
    const type = tree.taskTypes.get(key.value);
    const states = type === undefined ? undefined : tree.types.get(type);
    if (type === undefined || states === undefined) {
      report(
        diagnostics,
        "override-without-type",
        `task ${id} has no type to override`,
        taskPath,
        key,
      );
      continue;
    }
    changes.tasks.set(
      key.value,
      checkOverride(
        diagnostics,
        tree,
        value,
        taskPath,
        start.task(key.value, typeStates.get(type) ?? start.type(type, states)),
        entryFor("tasks", key.value),
      ).changes,
    );
  }
  return changes;
}

// Checks one override against the states it starts from, and returns the
// states in effect after it along with the changes it made.
function checkOverride(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  node: JsonNode,
  path: string,
  start: StateSet,
  entry: OverrideEntry,
): { states: StateSet; changes: StateChanges } {
  const result: StateSet = { states: new Set(start.states), removed: new Set(start.removed) };
  const changes: StateChanges = { add: new Set(), remove: new Set() };
  const override = expectObject(diagnostics, node, path);
  if (override === undefined) {
    return { states: result, changes };
  }
  const members = keys(diagnostics, override, path, ["states", "customAttributes"]);

  const statesNode = members.get("states");
  const stateLists =
    statesNode === undefined ? undefined : expectObject(diagnostics, statesNode, `${path}.states`);
  if (stateLists !== undefined) {
    const lists = keys(diagnostics, stateLists, `${path}.states`, ["remove", "add"]);
    for (const [state, statePath] of listElements(
      diagnostics,
      lists.get("remove"),
      path,
      "remove",
    )) {
      if (start.contested?.has(state.value)) {
        // Settling a state the single-dimension overrides disagree on.
      } else if (start.removed.has(state.value)) {
        report(
          diagnostics,
          "removed-state",
          `state ${JSON.stringify(state.value)} is already removed in this context`,
          statePath,
          state,
        );
        continue;
      } else if (!start.states.has(state.value)) {
        report(
          diagnostics,
          "unknown-state",
          `${JSON.stringify(state.value)} is not a state of this type`,
          statePath,
          state,
        );
        continue;
      }
      result.states.delete(state.value);
      result.removed.add(state.value);
      changes.remove.add(state.value);
      entry.removed.set(state.value, { node: state, path: statePath });
    }
    for (const [state, statePath] of listElements(diagnostics, lists.get("add"), path, "add")) {
      if (start.contested?.has(state.value) && !changes.remove.has(state.value)) {
        // Settling a state the single-dimension overrides disagree on.
      } else if (result.states.has(state.value)) {
        report(
          diagnostics,
          "duplicate-state",
          `state ${JSON.stringify(state.value)} already exists`,
          statePath,
          state,
        );
        continue;
      } else if (result.removed.has(state.value) && !start.removed.has(state.value)) {
        report(
          diagnostics,
          "conflicting-state",
          `state ${JSON.stringify(state.value)} is both removed and added`,
          statePath,
          state,
        );
        continue;
      }
      result.states.add(state.value);
      result.removed.delete(state.value);
      changes.add.add(state.value);
      entry.added.set(state.value, { node: state, path: statePath });
    }
  }

  const attributes = members.get("customAttributes");
  if (attributes !== undefined) {
    checkAttributeValues(
      diagnostics,
      tree,
      attributes,
      `${path}.customAttributes`,
      result,
      (attribute, state, value, valuePath) =>
        entry.values.set(valueKey(attribute, state), {
          value: value.value,
          node: value,
          path: valuePath,
        }),
    );
  }
  return { states: result, changes };
}

function listElements(
  diagnostics: Diagnostics,
  node: JsonNode | undefined,
  path: string,
  name: "add" | "remove",
) {
  const listPath = `${path}.states.${name}`;
  if (node === undefined || !expectKind(diagnostics, node, listPath, "array")) {
    return [];
  }
  return stringElements(diagnostics, node, listPath, "duplicate-state");
}
