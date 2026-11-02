import { childPath, type Diagnostic, Diagnostics } from "./diagnostic.js";
import { message } from "./message.js";

interface Span {
  start: number;
  end: number;
}

export interface ObjectNode {
  kind: "object";
  members: Member[];
  span: Span;
}

interface Member {
  key: StringNode;
  value: JsonNode;
}

export interface ArrayNode {
  kind: "array";
  elements: JsonNode[];
  span: Span;
}

export interface StringNode {
  kind: "string";
  value: string;
  span: Span;
}

interface NumberNode {
  kind: "number";
  value: number;
  span: Span;
}

interface BooleanNode {
  kind: "boolean";
  value: boolean;
  span: Span;
}

interface NullNode {
  kind: "null";
  span: Span;
}

export type JsonNode = ObjectNode | ArrayNode | StringNode | NumberNode | BooleanNode | NullNode;

export interface ParseResult {
  root?: JsonNode;
  diagnostics: Diagnostic[];
}

class SyntaxFailure extends Error {}

const escapes: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

// Deeper input is reported rather than parsed, so recursion here and in the
// checkers cannot overflow the stack. 512 levels allows about 256 nested nodes.
const maxDepth = 512;

const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

// RFC 8259 JSON, parsed by hand so every node keeps its source span and
// duplicate keys are reported instead of silently overwritten.
export function parseJson(source: string): ParseResult {
  const diagnostics = new Diagnostics(source);
  let pos = 0;
  let depth = 0;

  function fail(code: string, message: string, offset: number): never {
    diagnostics.error(code, message, "$", offset);
    throw new SyntaxFailure(message);
  }

  function unexpected(): never {
    if (pos >= source.length) {
      fail("unexpected-end", "unexpected end of input", pos);
    }
    fail("unexpected-token", message`unexpected ${source[pos]}`, pos);
  }

  function skipWhitespace(): void {
    while (pos < source.length && " \t\n\r".includes(source[pos] as string)) {
      pos++;
    }
  }

  function expect(char: string): void {
    skipWhitespace();
    if (source[pos] !== char) {
      unexpected();
    }
    pos++;
  }

  function parseValue(path: string): JsonNode {
    skipWhitespace();
    const char = source[pos];
    if (char === "{") return parseObject(path);
    if (char === "[") return parseArray(path);
    if (char === '"') return checkSurrogates(parseString(), path);
    if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) return parseNumber();
    for (const [word, item] of literals) {
      if (source.startsWith(word, pos)) {
        const start = pos;
        pos += word.length;
        return { ...item, span: { start, end: pos } } as JsonNode;
      }
    }
    return unexpected();
  }

  function enter(): void {
    depth++;
    if (depth > maxDepth) {
      fail("too-deep", `nesting is deeper than ${maxDepth} levels`, pos);
    }
  }

  function parseObject(path: string): ObjectNode {
    enter();
    const start = pos;
    pos++;
    const members: Member[] = [];
    const seen = new Set<string>();
    skipWhitespace();
    if (source[pos] === "}") {
      pos++;
      depth--;
      return { kind: "object", members, span: { start, end: pos } };
    }
    for (;;) {
      skipWhitespace();
      if (source[pos] !== '"') {
        unexpected();
      }
      const key = parseString();
      const memberPath = childPath(path, key.value);
      checkSurrogates(key, memberPath);
      if (seen.has(key.value)) {
        diagnostics.error(
          "duplicate-key",
          message`duplicate key ${key.value}`,
          memberPath,
          key.span.start,
        );
      }
      seen.add(key.value);
      expect(":");
      members.push({ key, value: parseValue(memberPath) });
      skipWhitespace();
      if (source[pos] === ",") {
        pos++;
        continue;
      }
      if (source[pos] === "}") {
        pos++;
        depth--;
        return { kind: "object", members, span: { start, end: pos } };
      }
      unexpected();
    }
  }

  function parseArray(path: string): ArrayNode {
    enter();
    const start = pos;
    pos++;
    const elements: JsonNode[] = [];
    skipWhitespace();
    if (source[pos] === "]") {
      pos++;
      depth--;
      return { kind: "array", elements, span: { start, end: pos } };
    }
    for (;;) {
      elements.push(parseValue(`${path}[${elements.length}]`));
      skipWhitespace();
      if (source[pos] === ",") {
        pos++;
        continue;
      }
      if (source[pos] === "]") {
        pos++;
        depth--;
        return { kind: "array", elements, span: { start, end: pos } };
      }
      unexpected();
    }
  }

  function parseString(): StringNode {
    const start = pos;
    pos++;
    let value = "";
    for (;;) {
      const char = source[pos];
      if (char === undefined) {
        fail("unterminated-string", "unterminated string", start);
      }
      if (char === '"') {
        pos++;
        return { kind: "string", value, span: { start, end: pos } };
      }
      if (char < " ") {
        fail("invalid-character", "control character in string", pos);
      }
      if (char !== "\\") {
        value += char;
        pos++;
        continue;
      }
      const escaped = source[pos + 1];
      if (escaped === "u") {
        const hex = source.slice(pos + 2, pos + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          fail("invalid-escape", "invalid unicode escape", pos);
        }
        value += String.fromCharCode(Number.parseInt(hex, 16));
        pos += 6;
        continue;
      }
      const decoded = escaped === undefined ? undefined : escapes[escaped];
      if (decoded === undefined) {
        fail("invalid-escape", "invalid escape sequence", pos);
      }
      value += decoded;
      pos += 2;
    }
  }

  // Escapes such as "\\ud800" can decode to a lone surrogate, which is not text.
  function checkSurrogates(item: StringNode, path: string): StringNode {
    if (unpairedSurrogate.test(item.value)) {
      diagnostics.error(
        "invalid-surrogate",
        "string contains an unpaired surrogate",
        path,
        item.span.start,
      );
    }
    return item;
  }

  function parseNumber(): NumberNode {
    const start = pos;
    numberPattern.lastIndex = pos;
    const match = numberPattern.exec(source);
    if (match === null) {
      fail("invalid-number", "invalid number", pos);
    }
    pos += match[0].length;
    return { kind: "number", value: Number(match[0]), span: { start, end: pos } };
  }

  if (source.startsWith("\uFEFF")) {
    diagnostics.error(
      "byte-order-mark",
      "file starts with a byte order mark; save it as UTF-8 without a BOM",
      "$",
      0,
    );
    pos = 1;
  }

  try {
    const root = parseValue("$");
    skipWhitespace();
    if (pos < source.length) {
      fail("trailing-content", "unexpected content after the root value", pos);
    }
    return { root, diagnostics: diagnostics.items };
  } catch (error) {
    if (error instanceof SyntaxFailure) {
      return { diagnostics: diagnostics.items };
    }
    throw error;
  }
}

const literals: [string, Omit<BooleanNode, "span"> | Omit<NullNode, "span">][] = [
  ["true", { kind: "boolean", value: true }],
  ["false", { kind: "boolean", value: false }],
  ["null", { kind: "null" }],
];
