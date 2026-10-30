import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode } from "./json.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
  uniqueStrings,
} from "./shape.js";
import type { StateSet, TreeSymbols } from "./symbols.js";

export function check(root: JsonNode, diagnostics: Diagnostics): TreeSymbols {
  const symbols: TreeSymbols = {
    attributes: new Map(),
    types: new Map(),
    ids: new Map(),
    taskTypes: new Map(),
    children: new Map(),
  };
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return symbols;
  }
  const members = keys(
    diagnostics,
    document,
    "$",
    ["$schema", "version", "customAttributes", "types", "tasks"],
    { required: ["version", "tasks"] },
  );

  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const declarations = members.get("customAttributes");
  if (declarations !== undefined) {
    checkDeclarations(diagnostics, symbols, declarations, "$.customAttributes");
  }

  const types = members.get("types");
  if (types !== undefined) {
    checkTypes(diagnostics, symbols, types, "$.types");
  }

  const tasks = members.get("tasks");
  if (tasks !== undefined) {
    checkTaskList(diagnostics, symbols, tasks, "$.tasks");
  }
  return symbols;
}

function checkDeclarations(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  node: JsonNode,
  path: string,
): void {
  const declarations = expectObject(diagnostics, node, path);
  if (declarations === undefined) {
    return;
  }
  for (const { key, value } of declarations.members) {
    const declarationPath = childPath(path, key.value);
    expectName(diagnostics, key, declarationPath);
    symbols.attributes.set(key.value, undefined);
    const declaration = expectObject(diagnostics, value, declarationPath);
    if (declaration === undefined) {
      continue;
    }
    const values = keys(diagnostics, declaration, declarationPath, ["values"], {
      required: ["values"],
    }).get("values");
    if (values === undefined) {
      continue;
    }
    const valuesPath = `${declarationPath}.values`;
    if (!expectKind(diagnostics, values, valuesPath, "array")) {
      continue;
    }
    if (values.elements.length === 0) {
      report(
        diagnostics,
        "empty-values",
        "an attribute must declare at least one value",
        valuesPath,
        values,
      );
      continue;
    }
    symbols.attributes.set(
      key.value,
      uniqueStrings(diagnostics, values, valuesPath, "duplicate-value"),
    );
  }
}

function checkTypes(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  node: JsonNode,
  path: string,
): void {
  const types = expectObject(diagnostics, node, path);
  if (types === undefined) {
    return;
  }
  // Record every type before checking any attribute values, so tasks can
  // refer to a type whichever order the file lists them in.
  const bodies: [string, Set<string>, JsonNode | undefined][] = [];
  for (const { key, value } of types.members) {
    const typePath = childPath(path, key.value);
    expectName(diagnostics, key, typePath);
    const states = new Set<string>();
    symbols.types.set(key.value, states);
    const type = expectObject(diagnostics, value, typePath);
    if (type === undefined) {
      continue;
    }
    const members = keys(diagnostics, type, typePath, ["states", "customAttributes"]);
    const stateList = members.get("states");
    if (
      stateList !== undefined &&
      expectKind(diagnostics, stateList, `${typePath}.states`, "array")
    ) {
      for (const state of uniqueStrings(
        diagnostics,
        stateList,
        `${typePath}.states`,
        "duplicate-state",
      )) {
        states.add(state);
      }
    }
    bodies.push([typePath, states, members.get("customAttributes")]);
  }
  for (const [typePath, states, attributes] of bodies) {
    if (attributes !== undefined) {
      checkAttributeValues(diagnostics, symbols, attributes, `${typePath}.customAttributes`, {
        states,
        removed: new Set(),
      });
    }
  }
}

export function checkAttributeValues(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  node: JsonNode,
  path: string,
  { states, removed }: StateSet,
): void {
  const attributes = expectObject(diagnostics, node, path);
  if (attributes === undefined) {
    return;
  }
  for (const { key, value } of attributes.members) {
    const attributePath = childPath(path, key.value);
    if (!symbols.attributes.has(key.value)) {
      report(
        diagnostics,
        "undeclared-attribute",
        `custom attribute ${JSON.stringify(key.value)} is not declared`,
        attributePath,
        key,
      );
      continue;
    }
    const allowed = symbols.attributes.get(key.value);
    const byState = expectObject(diagnostics, value, attributePath);
    if (byState === undefined) {
      continue;
    }
    for (const entry of byState.members) {
      const statePath = childPath(attributePath, entry.key.value);
      if (removed.has(entry.key.value)) {
        report(
          diagnostics,
          "removed-state",
          `state ${JSON.stringify(entry.key.value)} is removed in this context`,
          statePath,
          entry.key,
        );
        continue;
      }
      if (!states.has(entry.key.value)) {
        report(
          diagnostics,
          "unknown-state",
          `${JSON.stringify(entry.key.value)} is not a state of this type`,
          statePath,
          entry.key,
        );
        continue;
      }
      if (!expectKind(diagnostics, entry.value, statePath, "string")) {
        continue;
      }
      if (allowed !== undefined && !allowed.has(entry.value.value)) {
        report(
          diagnostics,
          "unknown-value",
          `${JSON.stringify(entry.value.value)} is not a declared value of ${JSON.stringify(key.value)}`,
          statePath,
          entry.value,
        );
      }
    }
  }
}

function checkTaskList(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  node: JsonNode,
  path: string,
): string[] {
  if (!expectKind(diagnostics, node, path, "array")) {
    return [];
  }
  const ids: string[] = [];
  node.elements.forEach((element, index) => {
    const id = checkTask(diagnostics, symbols, element, `${path}[${index}]`);
    if (id !== undefined) {
      ids.push(id);
    }
  });
  return ids;
}

// Returns the task's id when it is valid and unique.
function checkTask(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  node: JsonNode,
  path: string,
): string | undefined {
  const task = expectObject(diagnostics, node, path);
  if (task === undefined) {
    return undefined;
  }
  const members = keys(
    diagnostics,
    task,
    path,
    ["id", "title", "type", "children", "customAttributes"],
    { required: ["id", "title"] },
  );

  let taskId: string | undefined;
  const id = members.get("id");
  if (id !== undefined && expectName(diagnostics, id, `${path}.id`)) {
    const first = symbols.ids.get(id.value);
    if (first !== undefined) {
      report(
        diagnostics,
        "duplicate-id",
        `task id ${JSON.stringify(id.value)} is already used at ${first}`,
        `${path}.id`,
        id,
      );
    } else {
      symbols.ids.set(id.value, path);
      taskId = id.value;
    }
  }

  const title = members.get("title");
  if (title !== undefined) {
    expectNonEmptyString(diagnostics, title, `${path}.title`);
  }

  const type = members.get("type");
  let states: Set<string> | undefined;
  if (type !== undefined && expectKind(diagnostics, type, `${path}.type`, "string")) {
    states = symbols.types.get(type.value);
    if (states === undefined) {
      report(
        diagnostics,
        "undefined-type",
        `type ${JSON.stringify(type.value)} is not defined`,
        `${path}.type`,
        type,
      );
    } else if (taskId !== undefined) {
      symbols.taskTypes.set(taskId, type.value);
    }
  }

  const attributes = members.get("customAttributes");
  if (attributes !== undefined) {
    if (type === undefined) {
      const key = task.members.find((member) => member.key.value === "customAttributes")?.key;
      report(
        diagnostics,
        "attributes-without-type",
        "customAttributes on a task require the task to have a type",
        `${path}.customAttributes`,
        key ?? attributes,
      );
    } else if (states !== undefined) {
      checkAttributeValues(diagnostics, symbols, attributes, `${path}.customAttributes`, {
        states,
        removed: new Set(),
      });
    }
  }

  const children = members.get("children");
  const childIds =
    children === undefined ? [] : checkTaskList(diagnostics, symbols, children, `${path}.children`);
  if (taskId !== undefined) {
    symbols.children.set(taskId, childIds);
  }
  return taskId;
}
