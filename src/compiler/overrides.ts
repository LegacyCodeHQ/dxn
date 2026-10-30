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
import type {
  DimensionSymbol,
  OverrideStates,
  StateChanges,
  StateSet,
  TreeSymbols,
} from "./symbols.js";

// overrides/<dimension>.json: overrides by dimension value, then by type or task.
// Returns the valid state changes, for checking verification contexts.
export function checkOverridesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimension: DimensionSymbol,
): OverrideStates {
  const changes: OverrideStates = new Map();
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return changes;
  }
  const members = keys(diagnostics, document, "$", ["$schema", "version", "overrides"], {
    required: ["version", "overrides"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const overridesNode = members.get("overrides");
  const byValue =
    overridesNode === undefined
      ? undefined
      : expectObject(diagnostics, overridesNode, "$.overrides");
  for (const entry of byValue?.members ?? []) {
    const valuePath = childPath("$.overrides", entry.key.value);
    if (dimension.values !== undefined && !dimension.values.has(entry.key.value)) {
      report(
        diagnostics,
        "unknown-dimension-value",
        `${JSON.stringify(entry.key.value)} is not a value of this dimension`,
        valuePath,
        entry.key,
      );
      continue;
    }
    changes.set(
      entry.key.value,
      checkValueOverrides(diagnostics, tree, dimension, entry.value, valuePath),
    );
  }
  return changes;
}

// Overrides for one dimension value: type overrides first, so task overrides
// start from the states their type has in this context.
function checkValueOverrides(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimension: DimensionSymbol,
  node: JsonNode,
  path: string,
): { types: Map<string, StateChanges>; tasks: Map<string, StateChanges> } {
  const changes = {
    types: new Map<string, StateChanges>(),
    tasks: new Map<string, StateChanges>(),
  };
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
    const result = checkOverride(diagnostics, tree, value, typePath, {
      states,
      removed: new Set(),
    });
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
        typeStates.get(type) ?? { states, removed: new Set() },
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
      if (start.removed.has(state.value)) {
        report(
          diagnostics,
          "removed-state",
          `state ${JSON.stringify(state.value)} is already removed in this context`,
          statePath,
          state,
        );
      } else if (!start.states.has(state.value)) {
        report(
          diagnostics,
          "unknown-state",
          `${JSON.stringify(state.value)} is not a state of this type`,
          statePath,
          state,
        );
      } else {
        result.states.delete(state.value);
        result.removed.add(state.value);
        changes.remove.add(state.value);
      }
    }
    for (const [state, statePath] of listElements(diagnostics, lists.get("add"), path, "add")) {
      if (result.states.has(state.value)) {
        report(
          diagnostics,
          "duplicate-state",
          `state ${JSON.stringify(state.value)} already exists`,
          statePath,
          state,
        );
      } else if (result.removed.has(state.value) && !start.removed.has(state.value)) {
        report(
          diagnostics,
          "conflicting-state",
          `state ${JSON.stringify(state.value)} is both removed and added`,
          statePath,
          state,
        );
      } else {
        result.states.add(state.value);
        result.removed.delete(state.value);
        changes.add.add(state.value);
      }
    }
  }

  const attributes = members.get("customAttributes");
  if (attributes !== undefined) {
    checkAttributeValues(diagnostics, tree, attributes, `${path}.customAttributes`, result);
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
