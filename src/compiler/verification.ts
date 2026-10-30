import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode, ObjectNode } from "./json.js";
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
import type {
  CombinationStates,
  DimensionSymbol,
  OverrideStates,
  StateChanges,
  TreeSymbols,
} from "./symbols.js";

export interface DimensionInfo {
  symbol: DimensionSymbol;
  // Undefined when the dimension has no override file.
  overrides?: OverrideStates;
}

const recordKeys = ["task", "context", "check", "result", "by", "at", "evidence"];
const results = new Set(["passed", "failed"]);

// verification/<root-id>.json: one record per task, exact context and check.
export function checkVerificationFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  rootId: string,
): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return;
  }
  const members = keys(diagnostics, document, "$", ["$schema", "version", "records"], {
    required: ["version", "records"],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const records = members.get("records");
  if (records === undefined || !expectKind(diagnostics, records, "$.records", "array")) {
    return;
  }
  const inFile = subtree(tree, rootId);
  const seen = new Set<string>();
  records.elements.forEach((element, index) => {
    const path = `$.records[${index}]`;
    const key = checkRecord(
      diagnostics,
      tree,
      dimensions,
      combinations,
      inFile,
      rootId,
      element,
      path,
    );
    if (key === undefined) {
      return;
    }
    if (seen.has(key)) {
      report(
        diagnostics,
        "duplicate-record",
        "another record has the same task, context and check",
        path,
        element,
      );
    }
    seen.add(key);
  });
}

// Returns the record's identity (task, context, check) when all three are valid.
function checkRecord(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  inFile: Set<string>,
  rootId: string,
  node: JsonNode,
  path: string,
): string | undefined {
  const record = expectObject(diagnostics, node, path);
  if (record === undefined) {
    return undefined;
  }
  const fields = keys(diagnostics, record, path, recordKeys, {
    required: recordKeys.filter((key) => key !== "evidence"),
  });

  const type = checkRecordTask(diagnostics, tree, inFile, fields.get("task"), `${path}.task`);
  const task = fields.get("task");
  const taskId = type === undefined || task?.kind !== "string" ? undefined : task.value;

  const contextNode = fields.get("context");
  let context: string | undefined;
  if (contextNode !== undefined) {
    const object = expectObject(diagnostics, contextNode, `${path}.context`);
    if (object !== undefined && taskId !== undefined && type !== undefined) {
      context = checkContext(
        diagnostics,
        tree,
        dimensions,
        combinations,
        taskId,
        type,
        lineage(tree, rootId, taskId) ?? [taskId],
        object,
        `${path}.context`,
      );
    }
  }

  const check = fields.get("check");
  let checkName: string | undefined;
  if (check !== undefined && expectName(diagnostics, check, `${path}.check`)) {
    if (!tree.checks.has(check.value)) {
      report(
        diagnostics,
        "undeclared-check",
        `check ${JSON.stringify(check.value)} is not declared`,
        `${path}.check`,
        check,
      );
    } else if (type !== undefined && !tree.typeChecks.get(type)?.has(check.value)) {
      report(
        diagnostics,
        "check-not-required",
        `type ${JSON.stringify(type)} does not require check ${JSON.stringify(check.value)}`,
        `${path}.check`,
        check,
      );
    } else {
      checkName = check.value;
    }
  }

  const result = fields.get("result");
  if (result !== undefined && expectKind(diagnostics, result, `${path}.result`, "string")) {
    if (!results.has(result.value)) {
      report(
        diagnostics,
        "unknown-result",
        `result must be "passed" or "failed", not ${JSON.stringify(result.value)}`,
        `${path}.result`,
        result,
      );
    }
  }

  const by = fields.get("by");
  if (by !== undefined) {
    expectNonEmptyString(diagnostics, by, `${path}.by`);
  }

  const at = fields.get("at");
  if (at !== undefined && expectKind(diagnostics, at, `${path}.at`, "string")) {
    if (!isTimestamp(at.value)) {
      report(
        diagnostics,
        "invalid-timestamp",
        "must be an ISO 8601 date and time with a time zone, e.g. 2026-10-30T19:20:00Z",
        `${path}.at`,
        at,
      );
    }
  }

  const evidence = fields.get("evidence");
  if (evidence !== undefined) {
    expectNonEmptyString(diagnostics, evidence, `${path}.evidence`);
  }

  if (taskId === undefined || context === undefined || checkName === undefined) {
    return undefined;
  }
  return JSON.stringify([taskId, context, checkName]);
}

// Returns the task's type when the task can carry records here.
function checkRecordTask(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  inFile: Set<string>,
  node: JsonNode | undefined,
  path: string,
): string | undefined {
  if (node === undefined || !expectName(diagnostics, node, path)) {
    return undefined;
  }
  const id = JSON.stringify(node.value);
  if (!tree.ids.has(node.value)) {
    report(diagnostics, "unknown-task", `task ${id} does not exist`, path, node);
    return undefined;
  }
  if (!inFile.has(node.value)) {
    report(
      diagnostics,
      "task-outside-file",
      `task ${id} is not part of this file's root task`,
      path,
      node,
    );
    return undefined;
  }
  const type = tree.taskTypes.get(node.value);
  if (type === undefined) {
    report(
      diagnostics,
      "verification-without-type",
      `task ${id} has no type, so it has no checks`,
      path,
      node,
    );
    return undefined;
  }
  return type;
}

// Checks that the context names exactly the task's dimensions (plus state when
// the task has states) with valid values. Returns a canonical form of it.
function checkContext(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  taskId: string,
  type: string,
  ancestry: string[],
  context: ObjectNode,
  path: string,
): string | undefined {
  const applicable = [...dimensions]
    .filter(([, { symbol }]) => symbol.scope.has(taskId))
    .map(([name]) => name)
    .sort();
  const base = tree.types.get(type) ?? new Set<string>();
  const given = new Map(context.members.map(({ key, value }) => [key.value, { key, value }]));

  // Values for each applicable dimension, then the states in that context.
  let valid = true;
  const values = new Map<string, string>();
  for (const name of applicable) {
    const entry = given.get(name);
    if (entry === undefined) {
      const fallback = dimensions.get(name)?.symbol.default;
      if (fallback !== undefined) {
        values.set(name, fallback);
      }
      continue;
    }
    const valuePath = childPath(path, name);
    if (!expectKind(diagnostics, entry.value, valuePath, "string")) {
      valid = false;
      continue;
    }
    const declared = dimensions.get(name)?.symbol.values;
    if (declared !== undefined && !declared.has(entry.value.value)) {
      report(
        diagnostics,
        "unknown-dimension-value",
        `${JSON.stringify(entry.value.value)} is not a value of dimension ${JSON.stringify(name)}`,
        valuePath,
        entry.value,
      );
      valid = false;
      continue;
    }
    values.set(name, entry.value.value);
  }
  const { states, removed } = statesInContext(
    base,
    dimensions,
    combinations,
    applicable,
    values,
    type,
    taskId,
  );
  const hasStates = base.size > 0 || states.size > 0 || removed.size > 0;

  const allowed = hasStates ? [...applicable, "state"] : applicable;
  for (const { key } of context.members) {
    if (!allowed.includes(key.value)) {
      report(
        diagnostics,
        "unknown-key",
        `${JSON.stringify(key.value)} is not a dimension of this task`,
        childPath(path, key.value),
        key,
      );
      valid = false;
    }
  }
  for (const name of allowed) {
    if (!given.has(name) && !values.has(name)) {
      report(
        diagnostics,
        "missing-key",
        `missing required key ${JSON.stringify(name)}`,
        childPath(path, name),
        context,
      );
      valid = false;
    }
  }

  const state = given.get("state");
  if (hasStates && state !== undefined) {
    const statePath = childPath(path, "state");
    if (!expectKind(diagnostics, state.value, statePath, "string")) {
      valid = false;
    } else if (!states.has(state.value.value)) {
      const name = JSON.stringify(state.value.value);
      if (removed.has(state.value.value)) {
        report(
          diagnostics,
          "removed-state",
          `state ${name} is removed in this context`,
          statePath,
          state.value,
        );
      } else {
        report(
          diagnostics,
          "unknown-state",
          `${name} is not a state of this task here`,
          statePath,
          state.value,
        );
      }
      valid = false;
    } else {
      values.set("state", state.value.value);
    }
  }

  if (!valid) {
    return undefined;
  }
  // "only" in any applicable dimension, on the task or a task above it on
  // the path from the page, can leave it out of this context.
  const absentIn = applicable.find((name) => {
    const value = values.get(name);
    const only = dimensions.get(name)?.symbol.only;
    return (
      value !== undefined &&
      ancestry.some((id) => {
        const allowed = only?.get(id);
        return allowed !== undefined && !allowed.has(value);
      })
    );
  });
  if (absentIn !== undefined) {
    report(
      diagnostics,
      "absent-in-context",
      `the task does not exist when ${absentIn}=${values.get(absentIn)}: "only" leaves it out`,
      path,
      context,
    );
    return undefined;
  }
  return JSON.stringify([...values].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// Applies state changes in precedence order: single-dimension type overrides,
// type combinations, then the same for task overrides, so an instance's own
// changes beat type changes and combinations beat single dimensions.
// Conflicts within a level are errors, so order within a level does not matter.
function statesInContext(
  base: Set<string>,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  applicable: string[],
  values: Map<string, string>,
  type: string,
  taskId: string,
): { states: Set<string>; removed: Set<string> } {
  const singles = applicable.map((name) => {
    const value = values.get(name);
    return value === undefined ? undefined : dimensions.get(name)?.overrides?.get(value);
  });
  const combined = combinations
    .filter(({ dimensions: names }) => names.every((name) => applicable.includes(name)))
    .sort((a, b) => a.dimensions.length - b.dimensions.length)
    .map(({ dimensions: names, changes }) => {
      const combo = names.map((name) => values.get(name));
      return combo.includes(undefined) ? undefined : changes.get(JSON.stringify(combo));
    });
  const states = new Set(base);
  const removed = new Set<string>();
  const levels: (StateChanges | undefined)[] = [
    ...singles.map((override) => override?.types.get(type)),
    ...combined.map((override) => override?.types.get(type)),
    ...singles.map((override) => override?.tasks.get(taskId)),
    ...combined.map((override) => override?.tasks.get(taskId)),
  ];
  for (const changes of levels) {
    for (const state of changes?.remove ?? []) {
      states.delete(state);
      removed.add(state);
    }
    for (const state of changes?.add ?? []) {
      states.add(state);
      removed.delete(state);
    }
  }
  return { states, removed };
}

// Ids from the page down to the task, through included components.
function lineage(
  tree: TreeSymbols,
  from: string,
  to: string,
  seen = new Set<string>(),
): string[] | undefined {
  if (from === to) {
    return [to];
  }
  if (seen.has(from)) {
    return undefined;
  }
  seen.add(from);
  for (const child of tree.children.get(from) ?? []) {
    const rest = lineage(tree, child, to, seen);
    if (rest !== undefined) {
      return [from, ...rest];
    }
  }
  return undefined;
}

function subtree(tree: TreeSymbols, id: string, into = new Set<string>()): Set<string> {
  if (into.has(id)) {
    return into;
  }
  into.add(id);
  for (const child of tree.children.get(id) ?? []) {
    subtree(tree, child, into);
  }
  return into;
}

const timestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

// ISO 8601 date and time with a time zone, with every field in range.
function isTimestamp(text: string): boolean {
  const match = timestamp.exec(text);
  if (match === null) {
    return false;
  }
  const [year, month, day, hour, minute, second = 0, offsetHour = 0, offsetMinute = 0] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    (hour ?? 0) <= 23 &&
    (minute ?? 0) <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}
