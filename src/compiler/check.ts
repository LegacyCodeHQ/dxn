import { childPath, type Diagnostics } from "./diagnostic.js";
import type { JsonNode, ObjectNode, StringNode } from "./json.js";
import {
  checkSchema,
  checkVersion,
  expectKind,
  expectName,
  expectNonEmptyString,
  expectObject,
  keys,
  report,
  stringElements,
  uniqueStrings,
} from "./shape.js";
import { type IncludeRef, type StateSet, type TreeSymbols, valueKey } from "./symbols.js";

export function emptySymbols(): TreeSymbols {
  return {
    attributes: new Map(),
    types: new Map(),
    stateGroups: new Map(),
    typeGroups: new Map(),
    addable: new Map(),
    ids: new Map(),
    nodeTypes: new Map(),
    children: new Map(),
    parents: new Map(),
    nodeValues: new Map(),
    fragments: new Set(),
    includes: [],
    includeStates: [],
    includeRestrictions: new Map(),
    sharedTypes: new Set(),
    transitionRefs: [],
    transitions: new Map(),
    onlyWhen: new Map(),
    onlyWhenRefs: [],
    checks: new Set(),
    typeChecks: new Map(),
  };
}

// types.json: attribute declarations and types.
export function checkTypesFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return;
  }
  const members = keys(
    diagnostics,
    document,
    "$",
    ["$schema", "version", "stateGroups", "attributes", "checks", "types"],
    {
      required: ["version"],
    },
  );
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const declarations = members.get("attributes");
  if (declarations !== undefined) {
    checkDeclarations(diagnostics, symbols, declarations, "$.attributes");
  }

  const groups = members.get("stateGroups");
  if (groups !== undefined) {
    checkStateGroupDeclarations(diagnostics, symbols, groups, "$.stateGroups");
  }

  const checks = members.get("checks");
  if (checks !== undefined) {
    checkCheckDeclarations(diagnostics, symbols, checks, "$.checks");
  }

  const types = members.get("types");
  if (types !== undefined) {
    checkTypes(diagnostics, symbols, types, "$.types");
  }
}

// Each check is declared as an empty object, leaving room for settings later.
function checkCheckDeclarations(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
): void {
  const declarations = expectObject(diagnostics, item, path);
  for (const { key, value } of declarations?.members ?? []) {
    const checkPath = childPath(path, key.value);
    expectName(diagnostics, key, checkPath);
    symbols.checks.add(key.value);
    const declaration = expectObject(diagnostics, value, checkPath);
    if (declaration !== undefined) {
      keys(diagnostics, declaration, checkPath, []);
    }
  }
}

// Where a node is defined: its file, and the root or fragment of it.
interface Where {
  file: string;
  root: string;
}

// roots/<id>.json (key "root") and fragments/<id>.json (key "fragment"):
// one root, named after the file.
export function checkRootFile(
  root: JsonNode,
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  file: string,
  expectedId: string,
  key: "root" | "fragment" = "root",
): void {
  const document = expectObject(diagnostics, root, "$");
  if (document === undefined) {
    return;
  }
  const members = keys(diagnostics, document, "$", ["$schema", "version", key], {
    required: ["version", key],
  });
  checkSchema(diagnostics, members.get("$schema"));
  checkVersion(diagnostics, members.get("version"));

  const node = members.get(key);
  if (node === undefined) {
    return;
  }
  const path = `$.${key}`;
  if (node.kind === "object" && node.members.some((member) => member.key.value === "include")) {
    report(
      diagnostics,
      "include-at-root",
      `a file's root ${key} cannot be an include; include fragments from its children`,
      path,
      node,
    );
    return;
  }
  const id = checkNode(diagnostics, symbols, node, path, { file, root: expectedId });
  if (id !== undefined && id !== expectedId && node.kind === "object") {
    const idNode = node.members.find((member) => member.key.value === "id")?.value ?? node;
    report(
      diagnostics,
      "file-name-mismatch",
      `root ${key} ${JSON.stringify(id)} must be in ${key === "root" ? "roots" : "fragments"}/${id}.json`,
      `${path}.id`,
      idNode,
    );
  }
}

// { "include": "<fragment>" }: recorded now, resolved once every file is read.
function checkInclude(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: ObjectNode,
  path: string,
  where: Where,
  parent: string | undefined,
): void {
  const members = keys(diagnostics, item, path, ["include", "states"], { required: ["include"] });
  const fragment = members.get("include");
  if (fragment === undefined || !expectName(diagnostics, fragment, `${path}.include`)) {
    return;
  }
  const include: IncludeRef = {
    fragment,
    path: `${path}.include`,
    diagnostics,
    parent,
    root: where.root,
  };
  symbols.includes.push(include);

  // states: node -> group -> values, checked once the fragment is known.
  const states = members.get("states");
  const byNode =
    states === undefined ? undefined : expectObject(diagnostics, states, `${path}.states`);
  for (const { key: node, value } of byNode?.members ?? []) {
    const nodePath = childPath(`${path}.states`, node.value);
    const byGroup = expectObject(diagnostics, value, nodePath);
    for (const { key: group, value: list } of byGroup?.members ?? []) {
      const groupPath = childPath(nodePath, group.value);
      if (!expectKind(diagnostics, list, groupPath, "array")) continue;
      if (list.elements.length === 0) {
        report(diagnostics, "empty-values", "list at least one value", groupPath, list);
        continue;
      }
      symbols.includeStates.push({
        include,
        node,
        nodePath,
        group,
        groupPath,
        values: stringElements(diagnostics, list, groupPath, "duplicate-value"),
      });
    }
  }
}

function checkDeclarations(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
): void {
  const declarations = expectObject(diagnostics, item, path);
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
  item: JsonNode,
  path: string,
): void {
  const types = expectObject(diagnostics, item, path);
  if (types === undefined) {
    return;
  }
  // Record every type before checking any attribute values, so nodes can
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
    const members = keys(diagnostics, type, typePath, [
      "states",
      "stateGroups",
      "shared",
      "checks",
      "attributes",
    ]);
    const checkList = members.get("checks");
    if (
      checkList !== undefined &&
      expectKind(diagnostics, checkList, `${typePath}.checks`, "array")
    ) {
      const required = new Set<string>();
      for (const [check, checkPath] of stringElements(
        diagnostics,
        checkList,
        `${typePath}.checks`,
        "duplicate-check",
      )) {
        if (!symbols.checks.has(check.value)) {
          report(
            diagnostics,
            "undeclared-check",
            `check ${JSON.stringify(check.value)} is not declared`,
            checkPath,
            check,
          );
          continue;
        }
        required.add(check.value);
      }
      symbols.typeChecks.set(key.value, required);
    }
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
    const groupsNode = members.get("stateGroups");
    const groups = new Map<string, Set<string>>();
    if (groupsNode !== undefined && stateList !== undefined) {
      report(
        diagnostics,
        "states-and-groups",
        "use either states or stateGroups, not both",
        `${typePath}.stateGroups`,
        groupsNode,
      );
    } else if (groupsNode !== undefined) {
      checkTypeGroups(diagnostics, symbols, groupsNode, `${typePath}.stateGroups`, groups);
      for (const values of groups.values()) {
        for (const value of values) states.add(value);
      }
      symbols.addable.set(
        key.value,
        new Set([...groups.keys()].flatMap((group) => [...(symbols.stateGroups.get(group) ?? [])])),
      );
    } else if (states.size > 0) {
      groups.set("state", states);
    }
    symbols.typeGroups.set(key.value, groups);
    const shared = members.get("shared");
    if (shared !== undefined && expectKind(diagnostics, shared, `${typePath}.shared`, "boolean")) {
      if (shared.value && states.size === 0) {
        report(
          diagnostics,
          "shared-without-states",
          "a shared type needs states for its instances' subtrees to vary with",
          `${typePath}.shared`,
          shared,
        );
      } else if (shared.value && groups.size > 1) {
        report(
          diagnostics,
          "shared-with-several-groups",
          "a shared type's state is named by its node id, so it can use only one state group",
          `${typePath}.shared`,
          shared,
        );
      } else if (shared.value) {
        symbols.sharedTypes.add(key.value);
      }
    }
    bodies.push([typePath, states, members.get("attributes")]);
  }
  for (const [typePath, states, attributes] of bodies) {
    if (attributes !== undefined) {
      checkAttributeValues(diagnostics, symbols, attributes, `${typePath}.attributes`, {
        states,
        removed: new Set(),
      });
    }
  }
}

// Checks a attributes block. accept is called for each valid value.
export function checkAttributeValues(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
  { states, removed }: StateSet,
  accept?: (attribute: string, state: string, value: StringNode, path: string) => void,
): void {
  const attributes = expectObject(diagnostics, item, path);
  if (attributes === undefined) {
    return;
  }
  for (const { key, value } of attributes.members) {
    const attributePath = childPath(path, key.value);
    if (!symbols.attributes.has(key.value)) {
      report(
        diagnostics,
        "undeclared-attribute",
        `attribute ${JSON.stringify(key.value)} is not declared`,
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
        continue;
      }
      accept?.(key.value, entry.key.value, entry.value, statePath);
    }
  }
}

function checkNodeList(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
  where: Where,
  parent: string | undefined,
): string[] {
  if (!expectKind(diagnostics, item, path, "array")) {
    return [];
  }
  const ids: string[] = [];
  item.elements.forEach((element, index) => {
    const elementPath = `${path}[${index}]`;
    if (
      element.kind === "object" &&
      element.members.some((member) => member.key.value === "include")
    ) {
      checkInclude(diagnostics, symbols, element, elementPath, where, parent);
      return;
    }
    const id = checkNode(diagnostics, symbols, element, elementPath, where);
    if (id !== undefined) {
      ids.push(id);
    }
  });
  return ids;
}

// Returns the node's id when it is valid and unique.
function checkNode(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
  where: Where,
): string | undefined {
  const node = expectObject(diagnostics, item, path);
  if (node === undefined) {
    return undefined;
  }
  const members = keys(
    diagnostics,
    node,
    path,
    ["id", "title", "type", "onlyWhen", "transitions", "children", "attributes"],
    { required: ["id", "title"] },
  );

  let nodeId: string | undefined;
  const id = members.get("id");
  if (id !== undefined && expectName(diagnostics, id, `${path}.id`)) {
    const first = symbols.ids.get(id.value);
    if (first !== undefined) {
      report(
        diagnostics,
        "duplicate-id",
        `node id ${JSON.stringify(id.value)} is already used at ${first}`,
        `${path}.id`,
        id,
      );
    } else {
      symbols.ids.set(id.value, `${where.file} ${path}`);
      nodeId = id.value;
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
    } else if (nodeId !== undefined) {
      symbols.nodeTypes.set(nodeId, type.value);
    }
  }

  const attributes = members.get("attributes");
  if (attributes !== undefined) {
    if (type === undefined) {
      const key = node.members.find((member) => member.key.value === "attributes")?.key;
      report(
        diagnostics,
        "attributes-without-type",
        "attributes on a node require the node to have a type",
        `${path}.attributes`,
        key ?? attributes,
      );
    } else if (states !== undefined) {
      const own = new Set<string>();
      checkAttributeValues(
        diagnostics,
        symbols,
        attributes,
        `${path}.attributes`,
        { states, removed: new Set() },
        (attribute, state) => own.add(valueKey(attribute, state)),
      );
      if (nodeId !== undefined) {
        symbols.nodeValues.set(nodeId, own);
      }
    }
  }

  const transitions = members.get("transitions");
  if (transitions !== undefined && nodeId !== undefined) {
    symbols.transitionRefs.push({
      node: nodeId,
      item: transitions,
      path: `${path}.transitions`,
      diagnostics,
    });
  }

  const onlyWhen = members.get("onlyWhen");
  if (onlyWhen !== undefined) {
    checkOnlyWhenShape(diagnostics, symbols, onlyWhen, `${path}.onlyWhen`, nodeId);
  }

  const children = members.get("children");
  const childIds =
    children === undefined
      ? []
      : checkNodeList(diagnostics, symbols, children, `${path}.children`, where, nodeId);
  if (nodeId !== undefined) {
    symbols.children.set(nodeId, childIds);
    for (const child of childIds) {
      symbols.parents.set(child, nodeId);
    }
  }
  return nodeId;
}

// onlyWhen: ancestor id -> non-empty list of its states. The ancestors are
// checked by resolveOnlyWhen once the whole file is read.
function checkOnlyWhenShape(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
  node: string | undefined,
): void {
  const object = expectObject(diagnostics, item, path);
  for (const { key, value } of object?.members ?? []) {
    const entryPath = childPath(path, key.value);
    if (!expectKind(diagnostics, value, entryPath, "array")) {
      continue;
    }
    if (value.elements.length === 0) {
      report(diagnostics, "empty-only", "list at least one state", entryPath, value);
      continue;
    }
    const states = stringElements(diagnostics, value, entryPath, "duplicate-state");
    if (node !== undefined) {
      symbols.onlyWhenRefs.push({ node, ancestor: key, path: entryPath, states, diagnostics });
    }
  }
}

// Checks that each onlyWhen names an ancestor in the same file whose type is
// shared, and states of that type.
export function resolveOnlyWhen(symbols: TreeSymbols): void {
  for (const ref of symbols.onlyWhenRefs) {
    const name = JSON.stringify(ref.ancestor.value);
    let ancestor = symbols.parents.get(ref.node);
    while (ancestor !== undefined && ancestor !== ref.ancestor.value) {
      ancestor = symbols.parents.get(ancestor);
    }
    if (ancestor === undefined) {
      report(
        ref.diagnostics,
        "not-an-ancestor",
        `${name} is not an ancestor of this node in its file`,
        ref.path,
        ref.ancestor,
      );
      continue;
    }
    const type = symbols.nodeTypes.get(ancestor);
    if (type === undefined || !symbols.sharedTypes.has(type)) {
      report(
        ref.diagnostics,
        "ancestor-not-shared",
        `${name} needs a shared type for its subtree to depend on its state`,
        ref.path,
        ref.ancestor,
      );
      continue;
    }
    const states = symbols.types.get(type) ?? new Set<string>();
    const allowed = new Set<string>();
    for (const [state, statePath] of ref.states) {
      if (!states.has(state.value)) {
        report(
          ref.diagnostics,
          "unknown-state",
          `${JSON.stringify(state.value)} is not a state of ${name}`,
          statePath,
          state,
        );
        continue;
      }
      allowed.add(state.value);
    }
    const byAncestor = symbols.onlyWhen.get(ref.node) ?? new Map<string, Set<string>>();
    byAncestor.set(ancestor, allowed);
    symbols.onlyWhen.set(ref.node, byAncestor);
  }
}

// stateGroups in types.json: group name -> its values.
function checkStateGroupDeclarations(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
): void {
  const declarations = expectObject(diagnostics, item, path);
  for (const { key, value } of declarations?.members ?? []) {
    const groupPath = childPath(path, key.value);
    if (!expectName(diagnostics, key, groupPath)) {
      continue;
    }
    if (key.value === "state") {
      report(
        diagnostics,
        "reserved-name",
        'a state group cannot be named "state": that is the key for a plain states list',
        groupPath,
        key,
      );
      continue;
    }
    symbols.stateGroups.set(key.value, undefined);
    if (!expectKind(diagnostics, value, groupPath, "array")) {
      continue;
    }
    if (value.elements.length === 0) {
      report(
        diagnostics,
        "empty-values",
        "a state group needs at least one value",
        groupPath,
        value,
      );
      continue;
    }
    symbols.stateGroups.set(
      key.value,
      uniqueStrings(diagnostics, value, groupPath, "duplicate-value"),
    );
  }
}

// A type's stateGroups: names of whole groups, or group -> the values it uses.
function checkTypeGroups(
  diagnostics: Diagnostics,
  symbols: TreeSymbols,
  item: JsonNode,
  path: string,
  groups: Map<string, Set<string>>,
): void {
  const owner = new Map<string, string>();
  const use = (
    group: string,
    values: Set<string>,
    at: { span: { start: number } },
    atPath: string,
  ) => {
    const clash = [...values].find((value) => owner.has(value));
    if (clash !== undefined) {
      report(
        diagnostics,
        "ambiguous-state",
        `${JSON.stringify(clash)} is in both ${JSON.stringify(owner.get(clash))} and ${JSON.stringify(group)}; a type's groups cannot share a value`,
        atPath,
        at,
      );
      return;
    }
    for (const value of values) owner.set(value, group);
    groups.set(group, values);
  };
  const declared = (name: StringNode, namePath: string): Set<string> | undefined => {
    if (!symbols.stateGroups.has(name.value)) {
      report(
        diagnostics,
        "undeclared-state-group",
        `state group ${JSON.stringify(name.value)} is not declared`,
        namePath,
        name,
      );
      return undefined;
    }
    return symbols.stateGroups.get(name.value);
  };

  if (item.kind === "array") {
    for (const [name, namePath] of stringElements(
      diagnostics,
      item,
      path,
      "duplicate-state-group",
    )) {
      const values = declared(name, namePath);
      if (values !== undefined) use(name.value, new Set(values), name, namePath);
    }
    return;
  }
  if (item.kind !== "object") {
    report(
      diagnostics,
      "wrong-type",
      "expected a list of state groups, or an object of groups and their values",
      path,
      item,
    );
    return;
  }
  for (const { key, value } of item.members) {
    const groupPath = childPath(path, key.value);
    const all = declared(key, groupPath);
    if (!expectKind(diagnostics, value, groupPath, "array")) {
      continue;
    }
    if (value.elements.length === 0) {
      report(diagnostics, "empty-values", "use at least one value of the group", groupPath, value);
      continue;
    }
    const chosen = new Set<string>();
    for (const [state, statePath] of stringElements(
      diagnostics,
      value,
      groupPath,
      "duplicate-state",
    )) {
      if (all !== undefined && !all.has(state.value)) {
        report(
          diagnostics,
          "unknown-state",
          `${JSON.stringify(state.value)} is not a value of state group ${JSON.stringify(key.value)}`,
          statePath,
          state,
        );
        continue;
      }
      chosen.add(state.value);
    }
    if (all !== undefined) use(key.value, chosen, key, groupPath);
  }
}
