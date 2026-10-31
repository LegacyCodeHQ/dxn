// A hand-written parser for the dimensions language, which grows one concept
// at a time. A file declares enums, dimensions, types, environments and
// profiles:
//
//   file        = { blank-line | enum | dimension | type | environment | profile }
//   enum        = "enum" name "=" value { "|" [newline] value } newline
//   dimension   = "dimension" name "=" value { "|" [newline] value } newline
//   type        = "type" name "{" { blank-line | states | rule } "}"
//   states      = "states" field { "," [newline] field } newline
//   field       = state-name ":" name
//   rule        = state-name "=" value "only" "when" condition newline
//   condition   = name ( "=" value | "in" "(" value { "," value } ")" )
//   environment = "environment" name "=" name { "×" [newline] name } newline
//   profile     = "profile" profile-name ":" name "{" { assignment ( "," | newline ) } "}"
//   assignment  = name "=" value
//   name        = capital letter, then letters and digits
//   value       = a letter or digit, then letters, digits and hyphens
//
// A mistake is reported where it is, and reading skips to the next line that
// starts a declaration. Then check.ts checks what was read.

import type { Condition, Declaration, Enum, Located, ParseResult, Rule, State } from "./ast.js";
import { check } from "./check.js";
import { describe, located, scan, type Token } from "./scan.js";

class ParseFailure extends Error {}

export function parse(source: string): ParseResult {
  const tokens = scan(source);
  const result: ParseResult = {
    enums: [],
    dimensions: [],
    types: [],
    environments: [],
    profiles: [],
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
  const fail = (token: Token, expected: string): never => {
    result.diagnostics.push({
      code: "syntax-error",
      message: `expected ${expected}, found ${describe(token)}`,
      line: token.line,
      column: token.column,
    });
    throw new ParseFailure();
  };
  const report = (code: string, message: string, at: Located) => {
    result.diagnostics.push({ code, message, line: at.line, column: at.column });
  };
  // The declaration being read, kept as soon as it has a name.
  let current: Declaration | undefined;
  const keep = <T extends Declaration>(list: T[], declaration: T): T => {
    list.push(declaration);
    current = declaration;
    return declaration;
  };

  // A value: a word that is not followed by anything but separators.
  const value = (after: string): Located => {
    const token = next();
    if (token.kind !== "word") fail(token, `a value after ${after}`);
    return { name: token.text, line: token.line, column: token.column };
  };

  // An enum or a dimension: the keyword, a capitalized name, "=" and its
  // values. The two differ only in what their values do later: a dimension's
  // cascade down the tree.
  const valuesDeclaration = (keyword: "enum" | "dimension", list: Enum[]): void => {
    next(); // the keyword
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, `a ${keyword} name after "${keyword}"`);
    const name: Located = { name: nameToken.text, line: nameToken.line, column: nameToken.column };
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name.name)) {
      report(
        `${keyword}-name`,
        `${keyword} names start with a capital letter: ${JSON.stringify(name.name)}`,
        name,
      );
    }
    const { values } = keep(list, { ...name, values: [] });
    const equals = next();
    if (equals.kind !== "=") fail(equals, `"=" after the ${keyword} name`);
    values.push(value('"="'));
    for (;;) {
      const token = peek();
      if (token.kind === "|") {
        next();
        if (peek().kind === "newline") next();
        values.push(value('"|"'));
        continue;
      }
      if (token.kind === "newline" || token.kind === "end") break;
      const last = values[values.length - 1] as Located;
      fail(token, `"|" or the end of the line after ${JSON.stringify(last.name)}`);
    }
  };

  const skipNewlines = () => {
    while (peek().kind === "newline") next();
  };

  // A state field: its name, ":" and the enum its values come from.
  const field = (): State => {
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, "a state name");
    if (!/^[a-z]/.test(nameToken.text)) {
      report(
        "state-name",
        `state names start with a lowercase letter: ${JSON.stringify(nameToken.text)}`,
        { name: nameToken.text, line: nameToken.line, column: nameToken.column },
      );
    }
    const colon = next();
    if (colon.kind !== ":") fail(colon, `":" after ${JSON.stringify(nameToken.text)}`);
    const enumToken = next();
    if (enumToken.kind !== "word") fail(enumToken, 'an enum name after ":"');
    return { ...located(nameToken), enum: located(enumToken) };
  };

  // A rule: "<state> = <value> only when <condition>".
  const rule = (): Rule => {
    const stateToken = next();
    const equals = next();
    if (equals.kind !== "=") fail(equals, `"=" after ${JSON.stringify(stateToken.text)}`);
    const valueToken = next();
    if (valueToken.kind !== "word") fail(valueToken, 'a value after "="');
    const only = next();
    if (only.kind !== "word" || only.text !== "only") {
      fail(only, `"only" after ${JSON.stringify(valueToken.text)}`);
    }
    const when = next();
    if (when.kind !== "word" || when.text !== "when") fail(when, '"when" after "only"');
    const dimensionToken = next();
    if (dimensionToken.kind !== "word") fail(dimensionToken, 'a dimension after "when"');
    const condition: Condition = { dimension: located(dimensionToken), values: [] };
    const operator = next();
    const conditionValue = (after: string): Located => {
      const token = next();
      if (token.kind !== "word") fail(token, `a value after ${after}`);
      return { name: token.text, line: token.line, column: token.column };
    };
    if (operator.kind === "=") {
      condition.values.push(conditionValue('"="'));
    } else if (operator.kind === "word" && operator.text === "in") {
      const open = next();
      if (open.kind !== "(") fail(open, '"(" after "in"');
      condition.values.push(conditionValue('"("'));
      for (;;) {
        const token = next();
        if (token.kind === ")") break;
        const last = condition.values[condition.values.length - 1] as Located;
        if (token.kind !== ",") fail(token, `"," or ")" after ${JSON.stringify(last.name)}`);
        condition.values.push(conditionValue('","'));
      }
    } else {
      fail(operator, `"=" or "in" after ${JSON.stringify(dimensionToken.text)}`);
    }
    const after = peek();
    if (after.kind !== "newline" && after.kind !== "}") {
      fail(after, "the end of the line after the condition");
    }
    return { state: located(stateToken), value: located(valueToken), when: condition };
  };

  // An environment: "environment <Name> = <Dimension> × <Dimension> ...".
  const environmentDeclaration = (): void => {
    next(); // "environment"
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, 'an environment name after "environment"');
    if (!/^[A-Z][A-Za-z0-9]*$/.test(nameToken.text)) {
      report(
        "environment-name",
        `environment names start with a capital letter: ${JSON.stringify(nameToken.text)}`,
        { name: nameToken.text, line: nameToken.line, column: nameToken.column },
      );
    }
    const { dimensions } = keep(result.environments, {
      name: nameToken.text,
      line: nameToken.line,
      column: nameToken.column,
      dimensions: [],
    });
    const equals = next();
    if (equals.kind !== "=") fail(equals, '"=" after the environment name');
    const part = (after: string): Located => {
      const token = next();
      if (token.kind !== "word") fail(token, `a dimension after ${after}`);
      return { name: token.text, line: token.line, column: token.column };
    };
    dimensions.push(part('"="'));
    for (;;) {
      const token = peek();
      if (token.kind === "×") {
        next();
        if (peek().kind === "newline") next();
        dimensions.push(part('"×"'));
        continue;
      }
      if (token.kind === "newline" || token.kind === "end") break;
      const last = dimensions[dimensions.length - 1] as Located;
      fail(token, `"×" or the end of the line after ${JSON.stringify(last.name)}`);
    }
  };

  // A profile: "profile <name>: <Environment> { <Dimension> = <value>, ... }".
  const profileDeclaration = (): void => {
    next(); // "profile"
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, 'a profile name after "profile"');
    if (!/^[a-z]/.test(nameToken.text)) {
      report(
        "profile-name",
        `profile names start with a lowercase letter: ${JSON.stringify(nameToken.text)}`,
        { name: nameToken.text, line: nameToken.line, column: nameToken.column },
      );
    }
    const colon = next();
    if (colon.kind !== ":") fail(colon, `":" after ${JSON.stringify(nameToken.text)}`);
    const typeToken = next();
    if (typeToken.kind !== "word") fail(typeToken, 'an environment name after ":"');
    const profile = keep(result.profiles, {
      name: nameToken.text,
      line: nameToken.line,
      column: nameToken.column,
      environment: located(typeToken),
      values: [],
    });
    const open = next();
    if (open.kind !== "{") fail(open, '"{" after the environment name');
    for (;;) {
      skipNewlines();
      const token = peek();
      if (token.kind === "}") {
        next();
        return;
      }
      if (token.kind === "end") fail(token, `"}" to close ${profile.name}`);
      const dimensionToken = next();
      if (dimensionToken.kind !== "word") fail(dimensionToken, 'a dimension or "}"');
      const equals = next();
      if (equals.kind !== "=") fail(equals, `"=" after ${JSON.stringify(dimensionToken.text)}`);
      const valueToken = next();
      if (valueToken.kind !== "word") fail(valueToken, 'a value after "="');
      profile.values.push({ dimension: located(dimensionToken), value: located(valueToken) });
      const after = peek();
      if (after.kind === ",") {
        next();
        continue;
      }
      if (after.kind !== "newline" && after.kind !== "}") {
        fail(after, `",", the end of the line or "}" after ${JSON.stringify(valueToken.text)}`);
      }
    }
  };

  // A type: its name, then its states and rules inside braces.
  const typeDeclaration = (): void => {
    next(); // "type"
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, 'a type name after "type"');
    const type = keep(result.types, {
      name: nameToken.text,
      line: nameToken.line,
      column: nameToken.column,
      states: [],
      rules: [],
    });
    if (!/^[A-Z][A-Za-z0-9]*$/.test(type.name)) {
      report(
        "type-name",
        `type names start with a capital letter: ${JSON.stringify(type.name)}`,
        type,
      );
    }
    const open = next();
    if (open.kind !== "{") fail(open, '"{" after the type name');
    let listed = false;
    for (;;) {
      skipNewlines();
      const token = peek();
      if (token.kind === "}") {
        next();
        return;
      }
      if (token.kind === "end") fail(token, `"}" to close ${type.name}`);
      if (token.kind === "word" && token.text !== "states") {
        type.rules.push(rule());
        continue;
      }
      if (token.kind !== "word") fail(token, '"states", a rule or "}"');
      next();
      if (listed) {
        report("states-twice", `${type.name} lists its states twice; put them on one states line`, {
          name: token.text,
          line: token.line,
          column: token.column,
        });
      }
      listed = true;
      type.states.push(field());
      while (peek().kind === ",") {
        next();
        if (peek().kind === "newline") next();
        type.states.push(field());
      }
      const after = peek();
      if (after.kind !== "newline" && after.kind !== "}") {
        const last = type.states[type.states.length - 1] as State;
        fail(after, `"," or the end of the line after ${JSON.stringify(last.enum.name)}`);
      }
    }
  };

  const declarations: Record<string, () => void> = {
    enum: () => valuesDeclaration("enum", result.enums),
    dimension: () => valuesDeclaration("dimension", result.dimensions),
    type: typeDeclaration,
    environment: environmentDeclaration,
    profile: profileDeclaration,
  };
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
        fail(token, '"enum", "dimension", "type", "environment" or "profile"');
      }
      declaration?.();
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      // Set by the declaration as it reads, which TypeScript does not see here.
      const kept = current as Declaration | undefined;
      if (kept !== undefined) kept.broken = true;
      // Skip to the next line that starts a declaration and carry on, so one
      // mistake does not hide others, nor cause more.
      const starts = (token: Token) =>
        token.kind === "word" &&
        Object.hasOwn(declarations, token.text) &&
        tokens[position - 1]?.kind === "newline";
      while (peek().kind !== "end" && !starts(peek())) next();
    }
  }
  check(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result;
}
