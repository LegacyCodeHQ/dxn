import { childPath, type Diagnostics } from "./diagnostic.js";
import type { ArrayNode, JsonNode, ObjectNode, StringNode } from "./json.js";

// Shape checks shared by every file the compiler reads.

const describe: Record<JsonNode["kind"], string> = {
  object: "an object",
  array: "an array",
  string: "a string",
  number: "a number",
  boolean: "a boolean",
  null: "null",
};

export function report(
  diagnostics: Diagnostics,
  code: string,
  message: string,
  path: string,
  item: { span: { start: number } },
): void {
  diagnostics.report(code, message, path, item.span.start);
}

export function expectKind<K extends JsonNode["kind"]>(
  diagnostics: Diagnostics,
  item: JsonNode,
  path: string,
  kind: K,
): item is Extract<JsonNode, { kind: K }> {
  if (item.kind === kind) {
    return true;
  }
  report(
    diagnostics,
    "wrong-type",
    `expected ${describe[kind]}, found ${describe[item.kind]}`,
    path,
    item,
  );
  return false;
}

export function expectObject(
  diagnostics: Diagnostics,
  item: JsonNode,
  path: string,
): ObjectNode | undefined {
  return expectKind(diagnostics, item, path, "object") ? item : undefined;
}

// A string with at least one non-whitespace character, such as a title.
export function expectNonEmptyString(
  diagnostics: Diagnostics,
  item: JsonNode,
  path: string,
): item is StringNode {
  if (!expectKind(diagnostics, item, path, "string")) {
    return false;
  }
  if (item.value.trim() === "") {
    report(diagnostics, "empty-string", "must not be empty or blank", path, item);
    return false;
  }
  if (hasControlCharacter(item.value)) {
    report(diagnostics, "control-character", "must not contain control characters", path, item);
    return false;
  }
  return true;
}

// C0 and C1 control characters, including tab and newline.
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

// Whether text is a valid name, for names that come from file names.
export function isName(text: string): boolean {
  return text !== "" && text.trim() === text && !hasControlCharacter(text);
}

// A name (id, type, state, attribute, dimension or value): non-blank and
// without surrounding whitespace, so "a" and "a " cannot both exist.
export function expectName(
  diagnostics: Diagnostics,
  item: JsonNode,
  path: string,
): item is StringNode {
  if (!expectNonEmptyString(diagnostics, item, path)) {
    return false;
  }
  if (item.value.trim() !== item.value) {
    report(
      diagnostics,
      "surrounding-whitespace",
      "must not start or end with whitespace",
      path,
      item,
    );
    return false;
  }
  return true;
}

// Reports unknown and missing keys, and returns the members by key.
export function keys(
  diagnostics: Diagnostics,
  item: ObjectNode,
  path: string,
  allowed: string[],
  options: { required?: string[] } = {},
): Map<string, JsonNode> {
  const members = new Map<string, JsonNode>();
  for (const { key, value } of item.members) {
    if (allowed.includes(key.value)) {
      members.set(key.value, value);
    } else {
      report(
        diagnostics,
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
        diagnostics,
        "missing-key",
        `missing required key ${JSON.stringify(name)}`,
        childPath(path, name),
        item,
      );
    }
  }
  return members;
}

// Non-empty, unique string elements with their paths; reports the rest.
export function stringElements(
  diagnostics: Diagnostics,
  item: ArrayNode,
  path: string,
  duplicateCode: string,
): [StringNode, string][] {
  const seen = new Set<string>();
  const elements: [StringNode, string][] = [];
  item.elements.forEach((element, index) => {
    const elementPath = `${path}[${index}]`;
    if (!expectName(diagnostics, element, elementPath)) {
      return;
    }
    if (seen.has(element.value)) {
      report(
        diagnostics,
        duplicateCode,
        `duplicate ${JSON.stringify(element.value)}`,
        elementPath,
        element,
      );
      return;
    }
    seen.add(element.value);
    elements.push([element, elementPath]);
  });
  return elements;
}

export function uniqueStrings(
  diagnostics: Diagnostics,
  item: ArrayNode,
  path: string,
  duplicateCode: string,
): Set<string> {
  return new Set(
    stringElements(diagnostics, item, path, duplicateCode).map(([element]) => element.value),
  );
}

// Checks the optional $schema member that points editors at a JSON schema.
export function checkSchema(diagnostics: Diagnostics, schema: JsonNode | undefined): void {
  if (schema !== undefined) {
    expectKind(diagnostics, schema, "$.$schema", "string");
  }
}

// Checks the version member every file carries.
export function checkVersion(diagnostics: Diagnostics, version: JsonNode | undefined): void {
  if (version !== undefined && expectKind(diagnostics, version, "$.version", "number")) {
    if (version.value !== 1) {
      report(
        diagnostics,
        "unsupported-version",
        `unsupported version ${version.value}`,
        "$.version",
        version,
      );
    }
  }
}
