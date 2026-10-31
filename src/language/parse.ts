// A hand-written parser for the dimensions language, which grows one concept
// at a time. A file declares enums, dimensions, types, environments and
// profiles:
//
//   file        = { blank-line | enum | dimension | type | environment | profile | record }
//   enum        = "enum" name "=" value { "|" [newline] value } newline
//   dimension   = "dimension" name "=" value { "|" [newline] value } newline
//   type        = "type" name [ "needs" name { "," [newline] name } ] "{" { blank-line | states | rule } "}"
//   states      = "states" field { "," [newline] field } newline
//   field       = state-name ":" name
//   rule        = state-name "=" value "only" "when" condition newline
//   condition   = name ( "=" value | "in" "(" value { "," value } ")" )
//   environment = "environment" name "=" name { "x" [newline] name } newline
//   profile     = "profile" profile-name ":" name "{" { assignment ( "," | newline ) } "}"
//   assignment  = name "=" value
//   record      = "record" name "{" { blank-line | field-name ":" name newline } "}"
//   name        = capital letter, then letters and digits
//   value       = a letter or digit, then letters, digits and hyphens
//   comment     = "#" to the end of the line, skipped like a space
//
// A mistake is reported where it is, and reading skips to the next line that
// starts a declaration. Then check.ts checks what was read.

import type { Condition, Declaration, Enum, Located, ParseResult, Rule, State } from "./ast.js";
import { check } from "./check.js";
import { describe, located, scan, type Token, type TokenKind } from "./scan.js";

class ParseFailure extends Error {}

// How a kind of name is written: sets of possibilities are capitalized,
// single things lowercase.
const capitalized = { pattern: /^[A-Z][A-Za-z0-9]*$/, rule: "a capital letter" };
const lowercase = { pattern: /^[a-z]/, rule: "a lowercase letter" };

export function parse(source: string): ParseResult {
  const tokens = scan(source);
  const result: ParseResult = {
    enums: [],
    dimensions: [],
    types: [],
    environments: [],
    profiles: [],
    records: [],
    diagnostics: [],
  };
  let position = 0;
  const peek = () => tokens[position] as Token;
  // The current token, moving past it; the end of the file is never passed.
  const next = () => {
    const token = tokens[position] as Token;
    if (token.kind !== "end") position += 1;
    return token;
  };
  const previous = () => tokens[position - 1] as Token;
  const fail = (token: Token, expected: string): never => {
    result.diagnostics.push({
      severity: "error",
      code: "syntax-error",
      message: `expected ${expected}, found ${describe(token)}`,
      line: token.line,
      column: token.column,
    });
    throw new ParseFailure();
  };

  // The next token, which must be of this kind.
  const expect = (kind: TokenKind, expected: string): Token => {
    const token = next();
    if (token.kind !== kind) fail(token, expected);
    return token;
  };
  const word = (expected: string): Located => located(expect("word", expected));
  const keyword = (text: string, expected: string) => {
    const token = next();
    if (token.kind !== "word" || token.text !== text) fail(token, expected);
  };
  // The token after the last one read must be one of these.
  const end = (kinds: TokenKind[], expected: string) => {
    if (!kinds.includes(peek().kind))
      fail(peek(), `${expected} after ${JSON.stringify(previous().text)}`);
  };

  // A name of a kind, written as names of that kind are.
  const name = (kind: string, expected: string, casing: typeof capitalized): Located => {
    const named = word(expected);
    if (!casing.pattern.test(named.name)) {
      result.diagnostics.push({
        severity: "error",
        code: `${kind}-name`,
        message: `${kind} names start with ${casing.rule}: ${JSON.stringify(named.name)}`,
        line: named.line,
        column: named.column,
      });
    }
    return named;
  };

  // Items split by a separator, a token or a word, which may end a line; the
  // first follows what was read before it. The list ends at one of the ends:
  // by default, the end of the line.
  const list = <T>(
    separator: TokenKind | "x",
    first: string,
    item: (after: string) => T,
    ends: TokenKind[],
    ending = "the end of the line",
  ): T[] => {
    const items = [item(first)];
    const separates = (token: Token) =>
      token.kind === separator || (token.kind === "word" && token.text === separator);
    while (separates(peek())) {
      next();
      if (peek().kind === "newline") next();
      items.push(item(`"${separator}"`));
    }
    end(ends, `"${separator}" or ${ending}`);
    return items;
  };

  // The entries inside braces, each read from its first token, to the
  // closing brace; blank lines between them are skipped.
  const braces = (owner: string, entry: (token: Token) => void) => {
    for (;;) {
      while (peek().kind === "newline") next();
      const token = peek();
      if (token.kind === "}") {
        next();
        return;
      }
      if (token.kind === "end") fail(token, `"}" to close ${owner}`);
      entry(token);
    }
  };

  // The declaration being read, kept as soon as it has a name.
  let current: Declaration | undefined;
  const keep = <T extends Declaration>(list: T[], declaration: T): T => {
    list.push(declaration);
    current = declaration;
    return declaration;
  };

  // An enum or a dimension: "<keyword> <Name> = <value> | <value> ...". The
  // two differ only in what their values do later: a dimension's cascade down
  // the tree.
  const valuesDeclaration = (keyword: "enum" | "dimension", declarations: Enum[]) => {
    next();
    const named = name(keyword, `a ${keyword} name after "${keyword}"`, capitalized);
    const declaration = keep(declarations, { ...named, values: [] });
    expect("=", `"=" after the ${keyword} name`);
    declaration.values.push(
      ...list("|", '"="', (after) => word(`a value after ${after}`), ["newline", "end"]),
    );
  };

  // A state field: "<state>: <Enum>".
  const field = (): State => {
    const named = name("state", "a state name", lowercase);
    expect(":", `":" after ${JSON.stringify(named.name)}`);
    return { ...named, enum: word('an enum name after ":"') };
  };

  // A rule: "<state> = <value> only when <Dimension> = <value>", or with
  // "in (<value>, ...)" for several values.
  const rule = (): Rule => {
    const state = word("a state name");
    expect("=", `"=" after ${JSON.stringify(state.name)}`);
    const value = word('a value after "="');
    keyword("only", `"only" after ${JSON.stringify(value.name)}`);
    keyword("when", '"when" after "only"');
    const when: Condition = { dimension: word('a dimension after "when"'), values: [] };
    const operator = next();
    const conditionValue = (after: string) => word(`a value after ${after}`);
    if (operator.kind === "=") {
      when.values.push(conditionValue('"="'));
    } else if (operator.kind === "word" && operator.text === "in") {
      expect("(", '"(" after "in"');
      when.values.push(conditionValue('"("'));
      for (;;) {
        const token = next();
        if (token.kind === ")") break;
        if (token.kind !== ",") {
          fail(token, `"," or ")" after ${JSON.stringify(when.values.at(-1)?.name)}`);
        }
        when.values.push(conditionValue('","'));
      }
    } else {
      fail(operator, `"=" or "in" after ${JSON.stringify(when.dimension.name)}`);
    }
    if (!["newline", "}"].includes(peek().kind)) {
      fail(peek(), "the end of the line after the condition");
    }
    return { state, value, when };
  };

  // A type: "type <Name> needs <Dimension>, ... { states <field>, ... <rule> ... }".
  const typeDeclaration = () => {
    next();
    const named = name("type", 'a type name after "type"', capitalized);
    const type = keep(result.types, { ...named, needs: [], states: [], rules: [] });
    const after = peek();
    if (after.kind === "word" && after.text === "needs") {
      next();
      const dimension = (after: string) => word(`a dimension after ${after}`);
      type.needs.push(...list(",", '"needs"', dimension, ["{"], '"{"'));
    }
    expect("{", '"{" after the type name');
    let listed = false;
    braces(type.name, (token) => {
      if (token.kind !== "word") fail(token, '"states", a rule or "}"');
      if (token.text !== "states") {
        type.rules.push(rule());
        return;
      }
      next();
      if (listed) {
        result.diagnostics.push({
          severity: "error",
          code: "states-twice",
          message: `${type.name} lists its states twice; put them on one states line`,
          line: token.line,
          column: token.column,
        });
      }
      listed = true;
      type.states.push(...list(",", '"states"', field, ["newline", "}"]));
    });
  };

  // An environment: "environment <Name> = <Dimension> x <Dimension> ...". The
  // x is a word, but dimension names are capitalized, so it is never one.
  const environmentDeclaration = () => {
    next();
    const named = name("environment", 'an environment name after "environment"', capitalized);
    const environment = keep(result.environments, { ...named, dimensions: [] });
    expect("=", '"=" after the environment name');
    environment.dimensions.push(
      ...list("x", '"="', (after) => word(`a dimension after ${after}`), ["newline", "end"]),
    );
  };

  // A profile: "profile <name>: <Environment> { <Dimension> = <value>, ... }".
  const profileDeclaration = () => {
    next();
    const named = name("profile", 'a profile name after "profile"', lowercase);
    expect(":", `":" after ${JSON.stringify(named.name)}`);
    const environment = word('an environment name after ":"');
    const profile = keep(result.profiles, { ...named, environment, values: [] });
    expect("{", '"{" after the environment name');
    braces(profile.name, () => {
      const dimension = word('a dimension or "}"');
      expect("=", `"=" after ${JSON.stringify(dimension.name)}`);
      profile.values.push({ dimension, value: word('a value after "="') });
      if (peek().kind === ",") next();
      else end(["newline", "}"], '",", the end of the line or "}"');
    });
  };

  // A record: "record <Name> { <field>: <Type> ... }", a field a line.
  const recordDeclaration = () => {
    next();
    const named = name("record", 'a record name after "record"', capitalized);
    const record = keep(result.records, { ...named, fields: [] });
    expect("{", '"{" after the record name');
    braces(record.name, () => {
      const field = name("field", "a field name", lowercase);
      expect(":", `":" after ${JSON.stringify(field.name)}`);
      record.fields.push({ ...field, type: word('a type after ":"') });
      end(["newline", "}"], "the end of the line");
    });
  };

  const declarations: { [keyword: string]: () => void } = {
    enum: () => valuesDeclaration("enum", result.enums),
    dimension: () => valuesDeclaration("dimension", result.dimensions),
    type: typeDeclaration,
    environment: environmentDeclaration,
    profile: profileDeclaration,
    record: recordDeclaration,
  };
  // A line that starts a declaration.
  const starts = (token: Token) =>
    token.kind === "word" &&
    Object.hasOwn(declarations, token.text) &&
    tokens[position - 1]?.kind === "newline";
  while (peek().kind !== "end") {
    const token = peek();
    if (token.kind === "newline") {
      next();
      continue;
    }
    current = undefined;
    try {
      const declaration = token.kind === "word" ? declarations[token.text] : undefined;
      if (declaration === undefined) {
        fail(token, '"enum", "dimension", "type", "environment", "profile" or "record"');
      }
      declaration?.();
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      // Set by the declaration as it reads, which TypeScript does not see here.
      const kept = current as Declaration | undefined;
      if (kept !== undefined) kept.broken = true;
      // Skip to the next line that starts a declaration and carry on, so one
      // mistake does not hide others, nor cause more.
      while (peek().kind !== "end" && !starts(peek())) next();
    }
  }
  check(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result;
}
