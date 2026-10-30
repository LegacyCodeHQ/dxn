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

const recordKeys = ["node", "context", "transition", "check", "result", "by", "at", "evidence"];
const results = new Set(["passed", "failed"]);

// verification/<root-id>.json: one record per node, exact context and check.
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
        "another record has the same node, context and check",
        path,
        element,
      );
    }
    seen.add(key);
  });
}

// Returns the record's identity (node, context, check) when all three are valid.
function checkRecord(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  inFile: Set<string>,
  rootId: string,
  item: JsonNode,
  path: string,
): string | undefined {
  const record = expectObject(diagnostics, item, path);
  if (record === undefined) {
    return undefined;
  }
  const fields = keys(diagnostics, record, path, recordKeys, {
    required: ["node", "check", "result", "by", "at"],
  });
  // A record is about a context, or about one of the node's transitions.
  const transitionNode = fields.get("transition");
  if (transitionNode !== undefined && fields.has("context")) {
    report(
      diagnostics,
      "context-and-transition",
      "a record is about a context or a transition, not both",
      path,
      record,
    );
    return undefined;
  }
  if (transitionNode === undefined && !fields.has("context")) {
    report(diagnostics, "missing-key", 'missing required key "context"', `${path}.context`, record);
  }

  const type = checkRecordNode(diagnostics, tree, inFile, fields.get("node"), `${path}.node`);
  const node = fields.get("node");
  const nodeId = type === undefined || node?.kind !== "string" ? undefined : node.value;

  let context: string | undefined;
  if (
    transitionNode !== undefined &&
    expectName(diagnostics, transitionNode, `${path}.transition`) &&
    nodeId !== undefined
  ) {
    if (!tree.transitions.get(nodeId)?.has(transitionNode.value)) {
      report(
        diagnostics,
        "unknown-transition",
        `node ${JSON.stringify(nodeId)} has no transition ${JSON.stringify(transitionNode.value)}`,
        `${path}.transition`,
        transitionNode,
      );
    } else {
      context = `transition:${transitionNode.value}`;
    }
  }
  const contextNode = fields.get("context");
  if (contextNode !== undefined) {
    const object = expectObject(diagnostics, contextNode, `${path}.context`);
    if (object !== undefined && nodeId !== undefined && type !== undefined) {
      context = checkContext(
        diagnostics,
        tree,
        dimensions,
        combinations,
        nodeId,
        type,
        lineage(tree, rootId, nodeId) ?? [nodeId],
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

  if (nodeId === undefined || context === undefined || checkName === undefined) {
    return undefined;
  }
  return JSON.stringify([nodeId, context, checkName]);
}

// Returns the node's type when the node can carry records here.
function checkRecordNode(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  inFile: Set<string>,
  item: JsonNode | undefined,
  path: string,
): string | undefined {
  if (item === undefined || !expectName(diagnostics, item, path)) {
    return undefined;
  }
  const id = JSON.stringify(item.value);
  if (!tree.ids.has(item.value)) {
    report(diagnostics, "unknown-node", `node ${id} does not exist`, path, item);
    return undefined;
  }
  if (!inFile.has(item.value)) {
    report(
      diagnostics,
      "node-outside-file",
      `node ${id} is not part of this file's root`,
      path,
      item,
    );
    return undefined;
  }
  const type = tree.nodeTypes.get(item.value);
  if (type === undefined) {
    report(
      diagnostics,
      "verification-without-type",
      `node ${id} has no type, so it has no checks`,
      path,
      item,
    );
    return undefined;
  }
  return type;
}

// Checks that the context names exactly the node's dimensions (plus state when
// the node has states) with valid values. Returns a canonical form of it.
function checkContext(
  diagnostics: Diagnostics,
  tree: TreeSymbols,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  nodeId: string,
  type: string,
  ancestry: string[],
  context: ObjectNode,
  path: string,
): string | undefined {
  const applicable = [...dimensions]
    .filter(([, { symbol }]) => symbol.scope.has(nodeId))
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
    nodeId,
  );
  // Each of the type's state groups is a context key; a plain states list is
  // one group, "state". A shared node's state is named by its id instead, as
  // its descendants and contexts name it.
  const typeGroups = tree.typeGroups.get(type) ?? new Map<string, Set<string>>();
  const own = tree.sharedTypes.has(type) ? nodeId : "state";
  const groupNames =
    typeGroups.size > 0 && own === "state"
      ? [...typeGroups.keys()]
      : states.size > 0 || removed.size > 0
        ? [own]
        : [];
  const inGroup = (group: string, value: string) =>
    group === own || tree.stateGroups.get(group)?.has(value) === true;

  // Shared ancestors on the path from the root: their states are context keys.
  const shared = ancestry.slice(0, -1).filter((id) => {
    const ancestorType = tree.nodeTypes.get(id);
    return ancestorType !== undefined && tree.sharedTypes.has(ancestorType);
  });
  for (const ancestor of shared) {
    const entry = given.get(ancestor);
    if (entry === undefined) continue;
    const valuePath = childPath(path, ancestor);
    if (!expectKind(diagnostics, entry.value, valuePath, "string")) {
      valid = false;
      continue;
    }
    const ancestorType = tree.nodeTypes.get(ancestor) as string;
    const ancestorStates = statesInContext(
      tree.types.get(ancestorType) ?? new Set<string>(),
      dimensions,
      combinations,
      applicable,
      values,
      ancestorType,
      ancestor,
    ).states;
    if (!ancestorStates.has(entry.value.value)) {
      report(
        diagnostics,
        "unknown-state",
        `${JSON.stringify(entry.value.value)} is not a state of ${JSON.stringify(ancestor)} here`,
        valuePath,
        entry.value,
      );
      valid = false;
      continue;
    }
    values.set(ancestor, entry.value.value);
  }

  const allowed = [...applicable, ...groupNames, ...shared];
  for (const { key } of context.members) {
    if (!allowed.includes(key.value)) {
      report(
        diagnostics,
        "unknown-key",
        `${JSON.stringify(key.value)} is not a dimension of this node`,
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

  for (const group of groupNames) {
    const entry = given.get(group);
    if (entry === undefined) continue;
    const statePath = childPath(path, group);
    if (!expectKind(diagnostics, entry.value, statePath, "string")) {
      valid = false;
      continue;
    }
    const value = entry.value.value;
    const name = JSON.stringify(value);
    if (states.has(value) && inGroup(group, value)) {
      values.set(group, value);
      continue;
    }
    if (removed.has(value) && inGroup(group, value)) {
      report(
        diagnostics,
        "removed-state",
        `state ${name} is removed in this context`,
        statePath,
        entry.value,
      );
    } else {
      report(
        diagnostics,
        "unknown-state",
        group === own
          ? `${name} is not a state of this node here`
          : `${name} is not in this node's ${JSON.stringify(group)} group here`,
        statePath,
        entry.value,
      );
    }
    valid = false;
  }

  if (!valid) {
    return undefined;
  }
  // "only" in any applicable dimension, on the node or a node above it on
  // the path from the root, can leave it out of this context.
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
  // An include on the path from the root may fix some of the node's groups.
  for (let index = 0; index + 1 < ancestry.length; index++) {
    const restrictions = tree.includeRestrictions
      .get(`${ancestry[index]}>${ancestry[index + 1]}`)
      ?.get(nodeId);
    for (const [group, allowed] of restrictions ?? []) {
      const value = values.get(group);
      const entry = given.get(group);
      if (value !== undefined && entry !== undefined && !allowed.has(value)) {
        report(
          diagnostics,
          "excluded-state",
          `${JSON.stringify(value)} is excluded here: the include of ${JSON.stringify(ancestry[index + 1])} allows ${[...allowed].join(", ")}`,
          childPath(path, group),
          entry.value,
        );
        return undefined;
      }
    }
  }
  const leftOut = ancestry.find((id) =>
    [...(tree.onlyWhen.get(id) ?? [])].some(([ancestor, states]) => {
      const value = values.get(ancestor);
      return value !== undefined && !states.has(value);
    }),
  );
  if (absentIn === undefined && leftOut !== undefined) {
    report(
      diagnostics,
      "absent-in-context",
      `the node does not exist here: onlyWhen on ${JSON.stringify(leftOut)} leaves it out`,
      path,
      context,
    );
    return undefined;
  }
  if (absentIn !== undefined) {
    report(
      diagnostics,
      "absent-in-context",
      `the node does not exist when ${absentIn}=${values.get(absentIn)}: "only" leaves it out`,
      path,
      context,
    );
    return undefined;
  }
  return JSON.stringify([...values].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// Applies state changes in precedence order: single-dimension type overrides,
// type combinations, then the same for node overrides, so an instance's own
// changes beat type changes and combinations beat single dimensions.
// Conflicts within a level are errors, so order within a level does not matter.
function statesInContext(
  base: Set<string>,
  dimensions: Map<string, DimensionInfo>,
  combinations: CombinationStates[],
  applicable: string[],
  values: Map<string, string>,
  type: string,
  nodeId: string,
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
    ...singles.map((override) => override?.nodes.get(nodeId)),
    ...combined.map((override) => override?.nodes.get(nodeId)),
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

// Ids from the root down to the node, through included fragments.
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
