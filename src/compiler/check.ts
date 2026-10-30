import { childPath, type Diagnostics } from "./diagnostic.js";
import type { ArrayNode, JsonNode, ObjectNode, StringNode } from "./json.js";

interface Context {
  diagnostics: Diagnostics;
  // Declared custom attribute name -> allowed values (undefined when the
  // declaration itself is invalid, so its uses are not checked again).
  attributes: Map<string, Set<string> | undefined>;
  // Type name -> its states.
  types: Map<string, Set<string>>;
  // Task id -> path of its first occurrence.
  ids: Map<string, string>;
}

const describe: Record<JsonNode["kind"], string> = {
  object: "an object",
  array: "an array",
  string: "a string",
  number: "a number",
  boolean: "a boolean",
  null: "null",
};

export function check(root: JsonNode, diagnostics: Diagnostics): void {
  const context: Context = { diagnostics, attributes: new Map(), types: new Map(), ids: new Map() };
  const document = expectObject(context, root, "$");
  if (document === undefined) {
    return;
  }
  const members = keys(
    context,
    document,
    "$",
    ["$schema", "version", "customAttributes", "types", "tasks"],
    { required: ["version", "tasks"] },
  );

  const schema = members.get("$schema");
  if (schema !== undefined) {
    expectKind(context, schema, "$.$schema", "string");
  }

  const version = members.get("version");
  if (version !== undefined && expectKind(context, version, "$.version", "number")) {
    if (version.value !== 1) {
      report(
        context,
        "unsupported-version",
        `unsupported version ${version.value}`,
        "$.version",
        version,
      );
    }
  }

  const declarations = members.get("customAttributes");
  if (declarations !== undefined) {
    checkDeclarations(context, declarations, "$.customAttributes");
  }

  const types = members.get("types");
  if (types !== undefined) {
    checkTypes(context, types, "$.types");
  }

  const tasks = members.get("tasks");
  if (tasks !== undefined) {
    checkTaskList(context, tasks, "$.tasks");
  }
}

function checkDeclarations(context: Context, node: JsonNode, path: string): void {
  const declarations = expectObject(context, node, path);
  if (declarations === undefined) {
    return;
  }
  for (const { key, value } of declarations.members) {
    const declarationPath = childPath(path, key.value);
    context.attributes.set(key.value, undefined);
    const declaration = expectObject(context, value, declarationPath);
    if (declaration === undefined) {
      continue;
    }
    const values = keys(context, declaration, declarationPath, ["values"], {
      required: ["values"],
    }).get("values");
    if (values === undefined) {
      continue;
    }
    const valuesPath = `${declarationPath}.values`;
    if (!expectKind(context, values, valuesPath, "array")) {
      continue;
    }
    if (values.elements.length === 0) {
      report(
        context,
        "empty-values",
        "an attribute must declare at least one value",
        valuesPath,
        values,
      );
      continue;
    }
    context.attributes.set(
      key.value,
      uniqueStrings(context, values, valuesPath, "duplicate-value"),
    );
  }
}

function checkTypes(context: Context, node: JsonNode, path: string): void {
  const types = expectObject(context, node, path);
  if (types === undefined) {
    return;
  }
  // Record every type before checking any attribute values, so tasks can
  // refer to a type whichever order the file lists them in.
  const bodies: [string, Set<string>, JsonNode | undefined][] = [];
  for (const { key, value } of types.members) {
    const typePath = childPath(path, key.value);
    const states = new Set<string>();
    context.types.set(key.value, states);
    const type = expectObject(context, value, typePath);
    if (type === undefined) {
      continue;
    }
    const members = keys(context, type, typePath, ["states", "customAttributes"]);
    const stateList = members.get("states");
    if (stateList !== undefined && expectKind(context, stateList, `${typePath}.states`, "array")) {
      for (const state of uniqueStrings(
        context,
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
      checkAttributeValues(context, attributes, `${typePath}.customAttributes`, states);
    }
  }
}

function checkAttributeValues(
  context: Context,
  node: JsonNode,
  path: string,
  states: Set<string>,
): void {
  const attributes = expectObject(context, node, path);
  if (attributes === undefined) {
    return;
  }
  for (const { key, value } of attributes.members) {
    const attributePath = childPath(path, key.value);
    if (!context.attributes.has(key.value)) {
      report(
        context,
        "undeclared-attribute",
        `custom attribute ${JSON.stringify(key.value)} is not declared`,
        attributePath,
        key,
      );
      continue;
    }
    const allowed = context.attributes.get(key.value);
    const byState = expectObject(context, value, attributePath);
    if (byState === undefined) {
      continue;
    }
    for (const entry of byState.members) {
      const statePath = childPath(attributePath, entry.key.value);
      if (!states.has(entry.key.value)) {
        report(
          context,
          "unknown-state",
          `${JSON.stringify(entry.key.value)} is not a state of this type`,
          statePath,
          entry.key,
        );
        continue;
      }
      if (!expectKind(context, entry.value, statePath, "string")) {
        continue;
      }
      if (allowed !== undefined && !allowed.has(entry.value.value)) {
        report(
          context,
          "unknown-value",
          `${JSON.stringify(entry.value.value)} is not a declared value of ${JSON.stringify(key.value)}`,
          statePath,
          entry.value,
        );
      }
    }
  }
}

function checkTaskList(context: Context, node: JsonNode, path: string): void {
  if (!expectKind(context, node, path, "array")) {
    return;
  }
  node.elements.forEach((element, index) => {
    checkTask(context, element, `${path}[${index}]`);
  });
}

function checkTask(context: Context, node: JsonNode, path: string): void {
  const task = expectObject(context, node, path);
  if (task === undefined) {
    return;
  }
  const members = keys(
    context,
    task,
    path,
    ["id", "title", "type", "children", "customAttributes"],
    {
      required: ["id", "title"],
    },
  );

  const id = members.get("id");
  if (id !== undefined && expectNonEmptyString(context, id, `${path}.id`)) {
    const first = context.ids.get(id.value);
    if (first !== undefined) {
      report(
        context,
        "duplicate-id",
        `task id ${JSON.stringify(id.value)} is already used at ${first}`,
        `${path}.id`,
        id,
      );
    } else {
      context.ids.set(id.value, path);
    }
  }

  const title = members.get("title");
  if (title !== undefined) {
    expectNonEmptyString(context, title, `${path}.title`);
  }

  const type = members.get("type");
  let states: Set<string> | undefined;
  if (type !== undefined && expectKind(context, type, `${path}.type`, "string")) {
    states = context.types.get(type.value);
    if (states === undefined) {
      report(
        context,
        "undefined-type",
        `type ${JSON.stringify(type.value)} is not defined`,
        `${path}.type`,
        type,
      );
    }
  }

  const attributes = members.get("customAttributes");
  if (attributes !== undefined) {
    if (type === undefined) {
      const key = task.members.find((member) => member.key.value === "customAttributes")?.key;
      report(
        context,
        "attributes-without-type",
        "customAttributes on a task require the task to have a type",
        `${path}.customAttributes`,
        key ?? attributes,
      );
    } else if (states !== undefined) {
      checkAttributeValues(context, attributes, `${path}.customAttributes`, states);
    }
  }

  const children = members.get("children");
  if (children !== undefined) {
    checkTaskList(context, children, `${path}.children`);
  }
}

// Reports unknown and missing keys, and returns the members by key.
function keys(
  context: Context,
  node: ObjectNode,
  path: string,
  allowed: string[],
  options: { required?: string[] } = {},
): Map<string, JsonNode> {
  const members = new Map<string, JsonNode>();
  for (const { key, value } of node.members) {
    if (allowed.includes(key.value)) {
      members.set(key.value, value);
    } else {
      report(
        context,
        "unknown-key",
        `unknown key ${JSON.stringify(key.value)}`,
        childPath(path, key.value),
        key,
      );
    }
  }
  for (const name of options.required ?? []) {
    if (!members.has(name)) {
      report(
        context,
        "missing-key",
        `missing required key ${JSON.stringify(name)}`,
        childPath(path, name),
        node,
      );
    }
  }
  return members;
}

function uniqueStrings(
  context: Context,
  node: ArrayNode,
  path: string,
  duplicateCode: string,
): Set<string> {
  const seen = new Set<string>();
  node.elements.forEach((element, index) => {
    const elementPath = `${path}[${index}]`;
    if (!expectNonEmptyString(context, element, elementPath)) {
      return;
    }
    if (seen.has(element.value)) {
      report(
        context,
        duplicateCode,
        `duplicate ${JSON.stringify(element.value)}`,
        elementPath,
        element,
      );
      return;
    }
    seen.add(element.value);
  });
  return seen;
}

function expectNonEmptyString(context: Context, node: JsonNode, path: string): node is StringNode {
  if (!expectKind(context, node, path, "string")) {
    return false;
  }
  if (node.value === "") {
    report(context, "empty-string", "must not be empty", path, node);
    return false;
  }
  return true;
}

function expectObject(context: Context, node: JsonNode, path: string): ObjectNode | undefined {
  return expectKind(context, node, path, "object") ? node : undefined;
}

function expectKind<K extends JsonNode["kind"]>(
  context: Context,
  node: JsonNode,
  path: string,
  kind: K,
): node is Extract<JsonNode, { kind: K }> {
  if (node.kind === kind) {
    return true;
  }
  report(
    context,
    "wrong-type",
    `expected ${describe[kind]}, found ${describe[node.kind]}`,
    path,
    node,
  );
  return false;
}

function report(
  context: Context,
  code: string,
  message: string,
  path: string,
  node: { span: { start: number } },
): void {
  context.diagnostics.report(code, message, path, node.span.start);
}
