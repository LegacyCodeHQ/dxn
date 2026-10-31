// A hand-written parser for the dxn language, which grows one concept
// at a time. A file declares enums, dimensions, types, environments and
// profiles:
//
//   file        = { blank-line | enum | dimension | type | environment | profile | modifier | record }
//   enum        = "enum" name "=" value { "|" [newline] value } newline
//   dimension   = "dimension" name "=" value { "|" [newline] value } newline
//   type        = "type" name [ "needs" name { "," [newline] name } ] [ "receives" field { "," [newline] field } ]
//                 "{" { blank-line | state | rule | enum | type | has | provides } "}"
//   provides    = "provides" state-name newline
//   has         = "has" child-name ":" name { "." name } [ bindings ] [ "only" "when" condition ] newline
//   bindings    = "{" { state-name "=" state-name ( "," | newline ) } "}"
//   state       = "state" field { "," [newline] field } newline
//               | "state" field "=" "when" name "{" { blank-line | branch } "}" newline
//               | "state" field "=" value newline
//   branch      = value { "," value } "->" value newline
//   field       = state-name ":" name { "." name }
//   rule        = state-name "=" value "only" "when" condition newline
//   condition   = name ( "=" value | "in" "(" value { "," value } ")" )
//   environment = "environment" name "=" name { "x" [newline] name } newline
//   profile     = "profile" profile-name ":" name "{" { assignment ( "," | newline ) } "}"
//   modifier    = "modifier" modifier-name "on" profile-name { "," [newline] profile-name } "{" { assignment ( "," | newline ) } "}"
//   assignment  = name "=" value
//   record      = "record" name [ "with" "context" ] "{" { blank-line | field } "}"
//   field       = field-name ":" name { "." name } [ "=" "when" field-name "{" { blank-line | branch } "}" ] newline
//   name        = capital letter, then letters and digits
//   value       = a letter or digit, then letters, digits and hyphens
//   comment     = "#" to the end of the line, skipped like a space
//
// A mistake is reported where it is, and reading skips to the next line that
// starts a declaration. Then check.ts checks what was read.

import type {
  Assignment,
  Child,
  Condition,
  Declaration,
  Enum,
  Field,
  Located,
  ParseResult,
  Rule,
  State,
  Type,
} from "./ast.js";
import { check } from "./check.js";
import { describe, located, scan, type Token, type TokenKind } from "./scan.js";
import { scope } from "./scope.js";

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
    modifiers: [],
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
  // A declaration inside a type is kept in it, and does not stand for the
  // type when it breaks.
  let nested = false;
  const keep = <T extends Declaration>(list: T[], declaration: T): T => {
    list.push(declaration);
    if (!nested) current = declaration;
    return declaration;
  };
  // A name, or a name inside a type: "<Name>.<Name>...".
  const qualified = (expected: string): Located => {
    const first = word(expected);
    let text = first.name;
    while (peek().kind === ".") {
      next();
      text += `.${word('a name after "."').name}`;
    }
    return { ...first, name: text };
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
    return { ...named, enum: qualified('an enum name after ":"') };
  };

  // A rule: "<state> = <value> only when <Dimension> = <value>", or with
  // "in (<value>, ...)" for several values.
  const rule = (): Rule => {
    const state = word("a state name");
    expect("=", `"=" after ${JSON.stringify(state.name)}`);
    const value = word('a value after "="');
    keyword("only", `"only" after ${JSON.stringify(value.name)}`);
    keyword("when", '"when" after "only"');
    const { on, values } = condition("a dimension");
    const when: Condition = { dimension: on, values };
    return { state, value, when };
  };

  // A condition, after "only when": "<name> = <value>", or with
  // "in (<value>, ...)" for several values, to the end of the line.
  const condition = (subject: string) => {
    const on = word(`${subject} after "when"`);
    const values: Located[] = [];
    const operator = next();
    const conditionValue = (after: string) => word(`a value after ${after}`);
    if (operator.kind === "=") {
      values.push(conditionValue('"="'));
    } else if (operator.kind === "word" && operator.text === "in") {
      expect("(", '"(" after "in"');
      values.push(conditionValue('"("'));
      for (;;) {
        const token = next();
        if (token.kind === ")") break;
        if (token.kind !== ",") {
          fail(token, `"," or ")" after ${JSON.stringify(values.at(-1)?.name)}`);
        }
        values.push(conditionValue('","'));
      }
    } else {
      fail(operator, `"=" or "in" after ${JSON.stringify(on.name)}`);
    }
    if (!["newline", "}"].includes(peek().kind)) {
      fail(peek(), "the end of the line after the condition");
    }
    return { on, values };
  };

  // "when <subject> { <value>, ... -> <value> ... }", after the "=" of a
  // derived state or field, to the end of its line.
  const whenBlock = (owner: string, subject: "dimension" | "field") => {
    keyword("when", '"when" after "="');
    const on = word(`a ${subject} after "when"`);
    expect("{", `"{" after ${JSON.stringify(on.name)}`);
    const branches = branchList(owner, subject);
    end(["newline", "}"], "the end of the line");
    return { on, branches };
  };

  // A when's branches, after its "{", to its "}": "<value>, ... -> <value>",
  // split by commas or lines.
  const branchList = (owner: string, subject = "state") => {
    const branches: { values: Located[]; result: Located }[] = [];
    for (;;) {
      while (peek().kind === "newline") next();
      if (peek().kind === "}") {
        next();
        return branches;
      }
      if (peek().kind === "end") fail(peek(), `"}" to close the when of ${owner}`);
      const values = [word(`a value of the ${subject}`)];
      while (peek().kind === ",") {
        next();
        values.push(word('a value after ","'));
      }
      end(["->"], '"," or "->"');
      next();
      branches.push({ values, result: word('a value after "->"') });
      if (peek().kind === ",") next();
      else end(["newline", "}"], '",", the end of the line or "}"');
    }
  };

  // A child: "has <name>: <Type>", then "{ <state> = <state>, ... }" for the
  // child's states the type sets, and "only when <condition>" when it is not
  // always there.
  const child = (): Child => {
    const named = name("child", "a child name", lowercase);
    expect(":", `":" after ${JSON.stringify(named.name)}`);
    const placed: Child = { ...named, type: qualified('a type after ":"') };
    if (peek().kind === "{") {
      next();
      const bindings: NonNullable<Child["bindings"]> = [];
      braces(`the bindings of ${named.name}`, () => {
        const state = word('a state of the child or "}"');
        expect("=", `"=" after ${JSON.stringify(state.name)}`);
        if (
          peek().kind === "word" &&
          peek().text === "when" &&
          tokens[position + 2]?.kind === "{"
        ) {
          next();
          const from = word('a state after "when"');
          next();
          bindings.push({ state, from, map: branchList(state.name) });
        } else {
          bindings.push({ state, from: word('a state after "="') });
        }
        if (peek().kind === ",") next();
        else end(["newline", "}"], '",", the end of the line or "}"');
      });
      placed.bindings = bindings;
    }
    if (peek().kind === "word" && peek().text === "only") {
      next();
      keyword("when", '"when" after "only"');
      placed.when = condition("a state or a dimension");
    } else {
      end(["newline", "}"], '"only when" or the end of the line');
    }
    return placed;
  };

  // A type: "type <Name> needs <Dimension>, ... { state <field>, ... <rule> ... }",
  // with as many state lines as it needs.
  const typeDeclaration = (into: Type[] = result.types) => {
    next();
    const named = name("type", 'a type name after "type"', capitalized);
    const type = keep(into, {
      ...named,
      needs: [],
      states: [],
      rules: [],
      enums: [],
      types: [],
      children: [],
      provides: [],
    });
    const after = peek();
    if (after.kind === "word" && after.text === "needs") {
      next();
      const dimension = (after: string) => word(`a dimension after ${after}`);
      type.needs.push(...list(",", '"needs"', dimension, ["{", "word"], '"{"'));
      // Only "receives" may follow the needs, before the braces.
      if (peek().kind === "word" && peek().text !== "receives") {
        fail(peek(), `"," or "{" after ${JSON.stringify(previous().text)}`);
      }
    }
    const receiving = peek();
    if (receiving.kind === "word" && receiving.text === "receives") {
      next();
      const received = () => ({ ...field(), received: true as const });
      type.states.push(...list(",", '"receives"', received, ["{"], '"{"'));
    }
    expect("{", '"{" after the type name');
    braces(type.name, (token) => {
      if (token.kind !== "word") fail(token, '"state", a rule or "}"');
      if (token.text === "provides") {
        next();
        type.provides.push(word('a state after "provides"'));
        end(["newline", "}"], "the end of the line");
        return;
      }
      if (token.text === "has") {
        next();
        type.children.push(child());
        return;
      }
      // An enum or a type inside it.
      if (token.text === "enum" || token.text === "type") {
        const outer = nested;
        nested = true;
        if (token.text === "enum") valuesDeclaration("enum", type.enums);
        else typeDeclaration(type.types);
        nested = outer;
        return;
      }
      // "states hover: Hover" is the old keyword; a rule on a state named
      // states has "=" next instead.
      if (token.text === "states" && tokens[position + 2]?.kind === ":") fail(token, '"state"');
      if (token.text !== "state") {
        type.rules.push(rule());
        return;
      }
      next();
      const first = field();
      if (peek().kind === "=") {
        next();
        const after = peek();
        if (after.kind === "word" && after.text !== "when" && tokens[position + 1]?.kind !== "{") {
          // A fixed state: "= <value>".
          first.fixed = word('a value or "when" after "="');
          end(["newline", "}"], "the end of the line");
        } else {
          const { on, branches } = whenBlock(first.name, "dimension");
          first.derived = { dimension: on, branches };
        }
        type.states.push(first);
        return;
      }
      type.states.push(first);
      while (peek().kind === ",") {
        next();
        if (peek().kind === "newline") next();
        type.states.push(field());
      }
      if (peek().kind === "=") {
        fail(
          peek(),
          `"," or the end of the line after ${JSON.stringify(previous().text)} (a state with when has a line of its own)`,
        );
      }
      end(["newline", "}"], '"," or the end of the line');
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
    assignments(profile.name, profile.values);
  };

  // "{ <Dimension> = <value>, ... }": a value for each dimension, split by
  // commas or lines.
  const assignments = (owner: string, into: Assignment[]) => {
    braces(owner, () => {
      const dimension = word('a dimension or "}"');
      expect("=", `"=" after ${JSON.stringify(dimension.name)}`);
      into.push({ dimension, value: word('a value after "="') });
      if (peek().kind === ",") next();
      else end(["newline", "}"], '",", the end of the line or "}"');
    });
  };

  // A modifier: "modifier <name> on <profile>, ... { <Dimension> = <value>, ... }".
  const modifierDeclaration = () => {
    next();
    const named = name("modifier", 'a modifier name after "modifier"', lowercase);
    const modifier = keep(result.modifiers, { ...named, on: [], values: [] });
    keyword("on", `"on" after ${JSON.stringify(named.name)}`);
    const profile = (after: string) => word(`a profile after ${after}`);
    modifier.on.push(...list(",", '"on"', profile, ["{"], '"{"'));
    expect("{", '"{" after the profiles');
    assignments(modifier.name, modifier.values);
  };

  // A record: "record <Name> [with context] { <field>: <Type> ... }", a field
  // a line.
  const recordDeclaration = () => {
    next();
    const named = name("record", 'a record name after "record"', capitalized);
    const record = keep(result.records, { ...named, context: false, fields: [] });
    const after = peek();
    if (after.kind === "word" && after.text === "with") {
      next();
      keyword("context", '"context" after "with"');
      record.context = true;
    }
    expect("{", '"{" after the record name');
    braces(record.name, () => {
      const field = name("field", "a field name", lowercase);
      expect(":", `":" after ${JSON.stringify(field.name)}`);
      const declared: Field = { ...field, type: qualified('a type after ":"') };
      if (peek().kind === "=") {
        next();
        declared.derived = whenBlock(field.name, "field");
      }
      record.fields.push(declared);
      end(["newline", "}"], "the end of the line");
    });
  };

  const declarations: { [keyword: string]: () => void } = {
    enum: () => valuesDeclaration("enum", result.enums),
    dimension: () => valuesDeclaration("dimension", result.dimensions),
    type: () => typeDeclaration(),
    environment: environmentDeclaration,
    profile: profileDeclaration,
    modifier: modifierDeclaration,
    record: recordDeclaration,
  };
  // A line that starts a declaration, at the start of the line: one inside a
  // type is indented.
  const starts = (token: Token) =>
    token.kind === "word" &&
    Object.hasOwn(declarations, token.text) &&
    token.column === 1 &&
    tokens[position - 1]?.kind === "newline";
  while (peek().kind !== "end") {
    const token = peek();
    if (token.kind === "newline") {
      next();
      continue;
    }
    current = undefined;
    nested = false;
    try {
      const declaration = token.kind === "word" ? declarations[token.text] : undefined;
      if (declaration === undefined) {
        fail(
          token,
          '"enum", "dimension", "type", "environment", "profile", "modifier" or "record"',
        );
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
  scope(result);
  check(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result;
}
