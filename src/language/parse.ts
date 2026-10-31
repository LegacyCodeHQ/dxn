// A hand-written parser for the dimensions language. It grows one concept at
// a time; so far a file declares enums, dimensions and types:
//
//   file   = { blank-line | enum | dimension | type }
//   dimension = "dimension" name "=" value { "|" [newline] value } newline
//   enum   = "enum" name "=" value { "|" [newline] value } newline
//   type   = "type" name "{" { blank-line | states | rule } "}"
//   environment = "environment" name "=" name { "×" [newline] name } newline
//   profile = "profile" profile-name ":" name "{" { assignment ( "," | newline ) } "}"
//   assignment = name "=" value
//   rule   = state-name "=" value "only" "when" condition newline
//   condition = name ( "=" value | "in" "(" value { "," value } ")" )
//   states = "states" field { "," [newline] field } newline
//   field  = state-name ":" name
//   name   = capital letter, then letters and digits
//   value  = a letter or digit, then letters, digits and hyphens
//
// Every name and value keeps its line and column, so later checks can point
// at it.

export interface Located {
  name: string;
  line: number;
  column: number;
}

export interface Enum extends Located {
  values: Located[];
}

// A state of a type: its name, and the enum its values come from.
export interface State extends Located {
  enum: string;
  enumLine: number;
  enumColumn: number;
}

// A condition on a dimension: it has one of these values.
export interface Condition {
  dimension: string;
  line: number;
  column: number;
  values: Located[];
}

// A rule: the state's value exists only when the condition holds.
export interface Rule extends Located {
  state: string;
  value: string;
  valueLine: number;
  valueColumn: number;
  when: Condition;
}

export interface Type extends Located {
  states: State[];
  rules: Rule[];
}

// An environment: a product of dimensions, whose instances are profiles.
export interface Environment extends Located {
  dimensions: Located[];
}

// One dimension's value in a profile.
export interface Assignment {
  dimension: string;
  value: string;
  line: number;
  column: number;
  valueLine: number;
  valueColumn: number;
}

// A profile: an instance of an environment, giving each of its dimensions a
// value.
export interface Profile extends Located {
  environment: string;
  environmentLine: number;
  environmentColumn: number;
  values: Assignment[];
}

// A dimension: what the environment varies by, with its own values. Its
// values cascade down the tree, which an enum's do not.
export type Dimension = Enum;

export interface Diagnostic {
  code: string;
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  enums: Enum[];
  dimensions: Dimension[];
  types: Type[];
  environments: Environment[];
  profiles: Profile[];
  diagnostics: Diagnostic[];
}

type TokenKind =
  | "word"
  | "="
  | "|"
  | "{"
  | "}"
  | ":"
  | ","
  | "("
  | ")"
  | "×"
  | "newline"
  | "end"
  | "other";

interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  column: number;
}

const wordStart = /[A-Za-z0-9]/;
const wordPart = /[A-Za-z0-9-]/;

// Splits the source into words, "=", "|", newlines and anything else, one
// character at a time for the rest, skipping spaces and tabs.
function scan(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let column = 1;
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === " " || char === "\t" || char === "\r") {
      index += 1;
      column += 1;
      continue;
    }
    if (char === "\n") {
      tokens.push({ kind: "newline", text: "\n", line, column });
      index += 1;
      line += 1;
      column = 1;
      continue;
    }
    if (wordStart.test(char)) {
      let end = index + 1;
      while (end < source.length && wordPart.test(source[end] as string)) end += 1;
      const text = source.slice(index, end);
      tokens.push({ kind: "word", text, line, column });
      column += text.length;
      index = end;
      continue;
    }
    const kind: TokenKind =
      char === "*" ? "×" : "=|{}:,()×".includes(char) ? (char as TokenKind) : "other";
    tokens.push({ kind, text: char, line, column });
    index += 1;
    column += 1;
  }
  tokens.push({ kind: "end", text: "", line, column });
  return tokens;
}

// How a token reads in a message: its text quoted, or what it stands for.
function describe(token: Token): string {
  if (token.kind === "newline") return "the end of the line";
  if (token.kind === "end") return "the end of the file";
  return JSON.stringify(token.text);
}

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

  // A value: a word that is not followed by anything but separators.
  const value = (after: string): Located => {
    const token = next();
    if (token.kind !== "word") fail(token, `a value after ${after}`);
    return { name: token.text, line: token.line, column: token.column };
  };

  // An enum or a dimension: the keyword, a capitalized name, "=" and its
  // values. The two differ only in what their values do later: a dimension's
  // cascade down the tree.
  const valuesDeclaration = (keyword: "enum" | "dimension"): Enum => {
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
    const equals = next();
    if (equals.kind !== "=") fail(equals, `"=" after the ${keyword} name`);
    const values = [value('"="')];
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
    return { ...name, values };
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
    return {
      name: nameToken.text,
      enum: enumToken.text,
      line: nameToken.line,
      column: nameToken.column,
      enumLine: enumToken.line,
      enumColumn: enumToken.column,
    };
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
    const condition: Condition = {
      dimension: dimensionToken.text,
      line: dimensionToken.line,
      column: dimensionToken.column,
      values: [],
    };
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
    return {
      name: stateToken.text,
      line: stateToken.line,
      column: stateToken.column,
      state: stateToken.text,
      value: valueToken.text,
      valueLine: valueToken.line,
      valueColumn: valueToken.column,
      when: condition,
    };
  };

  // An environment: "environment <Name> = <Dimension> × <Dimension> ...".
  const environmentDeclaration = (): Environment => {
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
    const equals = next();
    if (equals.kind !== "=") fail(equals, '"=" after the environment name');
    const part = (after: string): Located => {
      const token = next();
      if (token.kind !== "word") fail(token, `a dimension after ${after}`);
      return { name: token.text, line: token.line, column: token.column };
    };
    const dimensions = [part('"="')];
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
    return { name: nameToken.text, line: nameToken.line, column: nameToken.column, dimensions };
  };

  // A profile: "profile <name>: <Environment> { <Dimension> = <value>, ... }". A
  // mistake inside skips to the closing brace.
  const profileDeclaration = (): Profile => {
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
    const profile: Profile = {
      name: nameToken.text,
      line: nameToken.line,
      column: nameToken.column,
      environment: typeToken.text,
      environmentLine: typeToken.line,
      environmentColumn: typeToken.column,
      values: [],
    };
    try {
      const open = next();
      if (open.kind !== "{") fail(open, '"{" after the environment name');
      for (;;) {
        skipNewlines();
        const token = peek();
        if (token.kind === "}") {
          next();
          return profile;
        }
        if (token.kind === "end") fail(token, `"}" to close ${profile.name}`);
        const dimensionToken = next();
        if (dimensionToken.kind !== "word") fail(dimensionToken, 'a dimension or "}"');
        const equals = next();
        if (equals.kind !== "=") fail(equals, `"=" after ${JSON.stringify(dimensionToken.text)}`);
        const valueToken = next();
        if (valueToken.kind !== "word") fail(valueToken, 'a value after "="');
        profile.values.push({
          dimension: dimensionToken.text,
          value: valueToken.text,
          line: dimensionToken.line,
          column: dimensionToken.column,
          valueLine: valueToken.line,
          valueColumn: valueToken.column,
        });
        const after = peek();
        if (after.kind === ",") {
          next();
          continue;
        }
        if (after.kind !== "newline" && after.kind !== "}") {
          fail(after, `",", the end of the line or "}" after ${JSON.stringify(valueToken.text)}`);
        }
      }
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      // A profile that does not parse is not checked further: skip to its
      // closing brace and leave it out.
      while (peek().kind !== "}" && peek().kind !== "end") next();
      if (peek().kind === "}") next();
      throw error;
    }
  };

  // A type: its name, then its states inside braces. A mistake inside skips
  // to the closing brace, so the rest of the file is still read.
  const typeDeclaration = (): Type => {
    next(); // "type"
    const nameToken = next();
    if (nameToken.kind !== "word") fail(nameToken, 'a type name after "type"');
    const type: Type = {
      name: nameToken.text,
      line: nameToken.line,
      column: nameToken.column,
      states: [],
      rules: [],
    };
    if (!/^[A-Z][A-Za-z0-9]*$/.test(type.name)) {
      report(
        "type-name",
        `type names start with a capital letter: ${JSON.stringify(type.name)}`,
        type,
      );
    }
    try {
      const open = next();
      if (open.kind !== "{") fail(open, '"{" after the type name');
      let listed = false;
      for (;;) {
        skipNewlines();
        const token = peek();
        if (token.kind === "}") {
          next();
          return type;
        }
        if (token.kind === "end") fail(token, `"}" to close ${type.name}`);
        if (token.kind === "word" && token.text !== "states") {
          type.rules.push(rule());
          continue;
        }
        if (token.kind !== "word") fail(token, '"states", a rule or "}"');
        next();
        if (listed) {
          report(
            "states-twice",
            `${type.name} lists its states twice; put them on one states line`,
            { name: token.text, line: token.line, column: token.column },
          );
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
          fail(after, `"," or the end of the line after ${JSON.stringify(last.enum)}`);
        }
      }
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      while (peek().kind !== "}" && peek().kind !== "end") next();
      if (peek().kind === "}") next();
      return type;
    }
  };

  while (peek().kind !== "end") {
    const token = peek();
    if (token.kind === "newline") {
      next();
      continue;
    }
    if (token.kind === "word" && token.text === "profile") {
      try {
        result.profiles.push(profileDeclaration());
      } catch (error) {
        if (!(error instanceof ParseFailure)) throw error;
        while (peek().kind !== "newline" && peek().kind !== "end") next();
      }
      continue;
    }
    if (token.kind === "word" && token.text === "type") {
      try {
        result.types.push(typeDeclaration());
      } catch (error) {
        if (!(error instanceof ParseFailure)) throw error;
        while (peek().kind !== "newline" && peek().kind !== "end") next();
      }
      continue;
    }
    try {
      if (token.kind === "word" && token.text === "environment") {
        result.environments.push(environmentDeclaration());
        continue;
      }
      if (token.kind === "word" && token.text === "dimension") {
        result.dimensions.push(valuesDeclaration("dimension"));
        continue;
      }
      if (token.kind !== "word" || token.text !== "enum") {
        fail(token, '"enum", "dimension", "type", "environment" or "profile"');
      }
      result.enums.push(valuesDeclaration("enum"));
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      // Skip to the next line and carry on, so one mistake does not hide others.
      while (peek().kind !== "newline" && peek().kind !== "end") next();
    }
  }
  check(result);
  return result;
}

// Checks across declarations, scope by scope: the file holds enum, type and
// dimension names, each once; an enum holds each value once; a type holds each state
// once, and each state's values come from a declared enum.
function check(result: ParseResult): void {
  const push = (code: string, message: string, at: { line: number; column: number }) =>
    result.diagnostics.push({ code, message, line: at.line, column: at.column });
  const declarations = [
    ...result.enums,
    ...result.dimensions,
    ...result.types,
    ...result.environments,
    ...result.profiles,
  ].sort((a, b) => a.line - b.line || a.column - b.column);
  const declared = new Map<string, Located>();
  for (const declaration of declarations) {
    const earlier = declared.get(declaration.name);
    if (earlier !== undefined) {
      push(
        "duplicate-name",
        `${declaration.name} is already declared at line ${earlier.line}`,
        declaration,
      );
    } else {
      declared.set(declaration.name, declaration);
    }
  }
  for (const declaration of [...result.enums, ...result.dimensions]) {
    const seen = new Set<string>();
    for (const item of declaration.values) {
      if (seen.has(item.name)) {
        push(
          "duplicate-value",
          `${JSON.stringify(item.name)} appears twice in ${declaration.name}`,
          item,
        );
      }
      seen.add(item.name);
    }
  }
  const enumNames = result.enums.map(({ name }) => name);
  const typeNames = new Set(result.types.map(({ name }) => name));
  const dimensionNames = new Set(result.dimensions.map(({ name }) => name));
  const valuesOf = (name: string) =>
    [...result.enums, ...result.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map((item) => item.name);
  // Where a state or dimension names the enum its values come from.
  const checkEnum = (name: string, at: { line: number; column: number }) => {
    if (enumNames.includes(name)) return;
    push(
      "unknown-enum",
      typeNames.has(name)
        ? `${name} is a type, not an enum`
        : dimensionNames.has(name)
          ? `${name} is a dimension, not an enum`
          : `${name} is not an enum (${enumNames.join(", ")})`,
      at,
    );
  };
  for (const type of result.types) {
    const seen = new Set<string>();
    for (const state of type.states) {
      if (seen.has(state.name)) {
        push("duplicate-state", `${state.name} is already a state of ${type.name}`, state);
      }
      seen.add(state.name);
      checkEnum(state.enum, { line: state.enumLine, column: state.enumColumn });
    }
  }
  // Rules: a state of the type and one of its values, a dimension and its
  // values, and one condition for each state value.
  for (const type of result.types) {
    const stateNames = type.states.map(({ name }) => name);
    const conditioned = new Map<string, Rule>();
    for (const rule of type.rules) {
      const state = type.states.find(({ name }) => name === rule.state);
      if (state === undefined) {
        push(
          "unknown-state",
          `${rule.state} is not a state of ${type.name} (${stateNames.join(", ")})`,
          rule,
        );
      } else {
        const values = valuesOf(state.enum);
        if (values !== undefined && !values.includes(rule.value)) {
          push(
            "unknown-value",
            `${JSON.stringify(rule.value)} is not a value of ${rule.state} (${values.join(", ")})`,
            { line: rule.valueLine, column: rule.valueColumn },
          );
        }
      }
      const key = `${rule.state}=${rule.value}`;
      const earlier = conditioned.get(key);
      if (earlier !== undefined) {
        push(
          "duplicate-rule",
          `${rule.state} = ${rule.value} already has a condition at line ${earlier.line}`,
          rule,
        );
      } else {
        conditioned.set(key, rule);
      }
      const { when } = rule;
      if (!dimensionNames.has(when.dimension)) {
        push(
          "unknown-dimension",
          enumNames.includes(when.dimension)
            ? `${when.dimension} is an enum, not a dimension`
            : `${when.dimension} is not a dimension (${[...dimensionNames].join(", ")})`,
          when,
        );
        continue;
      }
      const allowed = valuesOf(when.dimension) ?? [];
      const seen = new Set<string>();
      for (const item of when.values) {
        if (!allowed.includes(item.name)) {
          push(
            "unknown-value",
            `${JSON.stringify(item.name)} is not a value of ${when.dimension} (${allowed.join(", ")})`,
            item,
          );
        } else if (seen.has(item.name)) {
          push(
            "duplicate-value",
            `${JSON.stringify(item.name)} appears twice in the condition`,
            item,
          );
        }
        seen.add(item.name);
      }
    }
  }
  // An environment's dimensions: declared dimensions, each once.
  const describeDimension = (name: string) =>
    enumNames.includes(name)
      ? `${name} is an enum, not a dimension`
      : `${name} is not a dimension (${[...dimensionNames].join(", ")})`;
  for (const environment of result.environments) {
    const seen = new Set<string>();
    for (const dimension of environment.dimensions) {
      if (!dimensionNames.has(dimension.name)) {
        push("unknown-dimension", describeDimension(dimension.name), dimension);
      } else if (seen.has(dimension.name)) {
        push(
          "duplicate-dimension",
          `${dimension.name} is already part of ${environment.name}`,
          dimension,
        );
      }
      seen.add(dimension.name);
    }
  }
  // Profiles: instances of a declared environment, all of the same one, each
  // giving every dimension of it once, with one of its values.
  const article = (name: string) => (/^[AEIOU]/.test(name) ? "an" : "a");
  const first = result.profiles[0];
  for (const profile of result.profiles) {
    const at = { line: profile.environmentLine, column: profile.environmentColumn };
    const named = profile.environment;
    const type = result.environments.find(({ name }) => name === named);
    if (type === undefined) {
      push(
        "unknown-environment",
        dimensionNames.has(named)
          ? `${named} is a dimension, not an environment`
          : enumNames.includes(named)
            ? `${named} is an enum, not an environment`
            : typeNames.has(named)
              ? `${named} is a type, not an environment`
              : `${named} is not an environment (${result.environments.map(({ name }) => name).join(", ")})`,
        at,
      );
      continue;
    }
    if (first !== undefined && first !== profile && first.environment !== named) {
      push(
        "mixed-profiles",
        `${profile.name} is ${article(named)} ${named}, but ${first.name} is ${article(first.environment)} ${first.environment}; all profiles share one environment`,
        profile,
      );
    }
    const required = type.dimensions.map(({ name }) => name);
    const given = new Set<string>();
    for (const assignment of profile.values) {
      const at = { line: assignment.line, column: assignment.column };
      if (!required.includes(assignment.dimension)) {
        push(
          "unknown-dimension",
          `${assignment.dimension} is not a dimension of ${type.name} (${required.join(", ")})`,
          at,
        );
        continue;
      }
      if (given.has(assignment.dimension)) {
        push(
          "duplicate-dimension",
          `${assignment.dimension} is already given in ${profile.name}`,
          at,
        );
        continue;
      }
      given.add(assignment.dimension);
      const allowed = valuesOf(assignment.dimension) ?? [];
      if (!allowed.includes(assignment.value)) {
        push(
          "unknown-value",
          `${JSON.stringify(assignment.value)} is not a value of ${assignment.dimension} (${allowed.join(", ")})`,
          { line: assignment.valueLine, column: assignment.valueColumn },
        );
      }
    }
    const missing = required.filter((name) => !given.has(name));
    if (missing.length > 0) {
      push(
        "incomplete-profile",
        `${profile.name} does not give ${missing.join(", ")}, which ${type.name} requires`,
        profile,
      );
    }
  }
}
