// A hand-written parser for the dxn language, which grows one concept
// at a time. Its grammar is in docs/language/guide.md, under Reference.
//
// A mistake is reported where it is, and reading skips to the next line that
// starts a declaration. Then check.ts checks what was read.

import type {
  Alike,
  Assignment,
  Child,
  Condition,
  Declaration,
  Effect,
  Enum,
  Event,
  Expectation,
  Field,
  Located,
  ParseResult,
  Rule,
  State,
  Trigger,
  Type,
} from "./ast.js";
import { check } from "./check.js";
import { conditionText } from "./condition.js";
import { expectations } from "./expect.js";
import { conditionsInMatrix } from "./matrix.js";
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
    actors: [],
    expectations: [],
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
  const fail = (token: Token, expected: string): never =>
    failWith(token, `expected ${expected}, found ${describe(token)}`);
  // A syntax error that says more than what was expected.
  const failWith = (at: { line: number; column: number }, message: string): never => {
    result.diagnostics.push({
      severity: "error",
      code: "syntax-error",
      message,
      line: at.line,
      column: at.column,
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
  // A line carried on to the next, after a "|", a "," or an "and": the next
  // line, unless it starts a declaration, which an unfinished line does not
  // swallow.
  const carryOn = () => {
    const after = tokens[position + 1];
    const declaration =
      after?.kind === "word" &&
      after.column === 1 &&
      [
        "enum",
        "dimension",
        "type",
        "environment",
        "profile",
        "modifier",
        "record",
        "actor",
        "expect",
      ].includes(after.text);
    if (peek().kind === "newline" && !declaration) next();
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
        // One that starts right has other characters than a name can.
        message:
          casing === capitalized && /^[A-Z]/.test(named.name)
            ? `${kind} names are letters and digits: ${JSON.stringify(named.name)}`
            : `${kind} names start with ${casing.rule}: ${JSON.stringify(named.name)}`,
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
      carryOn();
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
      // A declaration at the start of a line ends one left open.
      if (token.kind === "end" || starts(token)) fail(token, `"}" to close ${owner}`);
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
    // A line break can come before or after any "|", and the values can start
    // on the next line, with a "|" before the first: "| xs" on each line.
    const pipeNext = () => peek().kind === "newline" && tokens[position + 1]?.kind === "|";
    if (pipeNext()) next();
    let after = '"="';
    if (peek().kind === "|") {
      next();
      after = '"|"';
    }
    declaration.values.push(word(`a value after ${after}`));
    for (;;) {
      if (pipeNext()) next();
      if (peek().kind !== "|") break;
      next();
      carryOn();
      declaration.values.push(word('a value after "|"'));
    }
    // Inside a type, the type's closing brace can end it too.
    const ends: TokenKind[] = nested ? ["newline", "end", "}"] : ["newline", "end"];
    end(ends, '"|" or the end of the line');
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
    return { state, value, when: condition("a dimension") };
  };

  // A condition, after "only when", to the end of the line: comparisons
  // joined by "and" or by "or", and both only with brackets, so the order is
  // always written.
  const condition = (subject: string): Condition => {
    const read = junction(subject, '"when"');
    if (!["newline", "}"].includes(peek().kind)) {
      fail(peek(), `"and", "or" or the end of the line after ${JSON.stringify(previous().text)}`);
    }
    return read;
  };
  // An "and" or an "or" next, on this line or at the start of the next: one
  // there is not a rule on a state of that name, which has "=" after it.
  const joining = (at: number) => {
    const token = tokens[at];
    return (
      token?.kind === "word" &&
      (token.text === "and" || token.text === "or") &&
      tokens[at + 1]?.kind !== "="
    );
  };
  const junction = (subject: string, after: string): Condition => {
    const terms = [term(subject, after)];
    const operators: Token[] = [];
    for (;;) {
      if (peek().kind === "newline" && joining(position + 1)) next();
      if (!joining(position)) break;
      const operator = next();
      operators.push(operator);
      // A line can also end with it.
      carryOn();
      terms.push(term(subject, JSON.stringify(operator.text)));
    }
    const first = operators[0];
    if (first === undefined) return terms[0] as Condition;
    const mixed = operators.findIndex(({ text }) => text !== first.text);
    if (mixed !== -1) {
      // Both ways to bracket it: what comes before the other operator, or
      // what comes after the one before it.
      const written = (from: number, to: number) =>
        terms
          .slice(from, to + 1)
          .map((each, index) =>
            index === 0
              ? conditionText(each, true)
              : `${operators[from + index - 1]?.text} ${conditionText(each, true)}`,
          )
          .join(" ");
      const other = operators[mixed] as Token;
      const last = terms.length - 1;
      failWith(
        other,
        `"and" and "or" need brackets to mix: write "(${written(0, mixed)}) ${other.text} ${written(mixed + 1, last)}" or "${written(0, mixed - 1)} ${first.text} (${written(mixed, last)})"`,
      );
    }
    return { kind: first.text as "and" | "or", terms };
  };
  const term = (subject: string, after: string): Condition => {
    if (peek().kind === "(") {
      next();
      // Inside brackets, lines can break after "(" and before ")".
      carryOn();
      const inner = junction(subject, '"("');
      if (peek().kind === "newline" && tokens[position + 1]?.kind === ")") next();
      expect(")", `")" after ${JSON.stringify(previous().text)}`);
      return inner;
    }
    return comparison(subject, after);
  };
  const comparison = (subject: string, after: string): Condition => {
    const on = word(`${subject} after ${after}`);
    return { kind: "compare", subject: on, values: compared(on) };
  };
  // What is compared: "= <value>", or "in (<value>, ...)" for several.
  const compared = (subject: Located): Located[] => {
    const operator = next();
    if (operator.kind === "=") return [word('a value after "="')];
    if (operator.kind === "word" && operator.text === "in") return valueList();
    return fail(operator, `"=" or "in" after ${JSON.stringify(subject.name)}`);
  };
  // "(<value>, ...)", after "in".
  const valueList = (): Located[] => {
    expect("(", '"(" after "in"');
    const values = [word('a value after "("')];
    while (peek().kind === ",") {
      next();
      values.push(word('a value after ","'));
    }
    expect(")", `"," or ")" after ${JSON.stringify(values.at(-1)?.name)}`);
    return values;
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

  // An event, after "on": "click <child>", "key <key>", "pointer outside", or
  // "<Dimension> = <value>" or "<Dimension> in (<value>, ...)".
  const eventOf = (): Event => {
    const token = peek();
    // The built-in words of before: what to declare and write instead.
    const old = (said: string, instead: string) => {
      failWith(token, `${JSON.stringify(said)} is not an event: ${instead}`);
    };
    const after = tokens[position + 1];
    if (token.text === "key" && after?.kind === "word") {
      const name = after.text.toLowerCase();
      old(`key ${after.text}`, `declare one, such as "event ${name}", and write "on ${name}"`);
    }
    if (token.text === "click" && after?.kind === "word") {
      let target = after.text;
      for (
        let at = position + 2;
        tokens[at]?.kind === "." && tokens[at + 1]?.kind === "word";
        at += 2
      ) {
        target += `.${tokens[at + 1]?.text}`;
      }
      old(
        `click ${target}`,
        `declare one in the child's type, such as "event activate", and write "on ${target}.activate"`,
      );
    }
    if (token.text === "pointer" && after?.text === "outside") {
      old("pointer outside", 'declare one, such as "event outside", and write "on outside"');
    }
    if (token.kind === "word" && /^[A-Z]/.test(token.text)) {
      const dimension = word("a dimension");
      return { kind: "dimension", dimension, values: compared(dimension) };
    }
    if (token.kind === "word") return { kind: "named", name: qualified("an event") };
    return fail(token, 'an event or a dimension after "on"');
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
      actions: [],
      triggers: [],
      alikes: [],
      events: [],
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
    const body = '"state", "has", "action", "on", "provides", "enum", "type", a rule or "}"';
    braces(type.name, (token) => {
      if (token.kind !== "word") fail(token, body);
      // A declaration of the file, not of a type; a rule on a state of that
      // name has "=" next.
      if (
        ["dimension", "environment", "profile", "modifier", "record", "actor", "expect"].includes(
          token.text,
        ) &&
        tokens[position + 1]?.kind !== "="
      ) {
        fail(token, body);
      }
      if (token.text === "action") {
        next();
        const named = name("action", 'an action name after "action"', lowercase);
        expect(":", `":" after ${JSON.stringify(named.name)}`);
        const state = word('a state after ":"');
        const from = word(`a value after ${JSON.stringify(state.name)}`);
        expect("->", `"->" after ${JSON.stringify(from.name)}`);
        type.actions.push({ name: named, state, from, to: word('a value after "->"') });
        end(["newline", "}"], "the end of the line");
        return;
      }
      // "event <name>, <name>"; a rule on a state named event has "=" next.
      if (token.text === "event" && tokens[position + 1]?.kind !== "=") {
        next();
        type.events.push(
          ...list(",", '"event"', (after) => name("event", `an event after ${after}`, lowercase), [
            "newline",
            "}",
          ]),
        );
        return;
      }
      if (token.text === "on") {
        next();
        const event = eventOf();
        expect(":", '":" after the event');
        // Its changes, split by commas: each an action by its name, or a
        // change in place, "<state> -> <value>".
        const effect = (after: string): Effect => {
          const named = qualified(`an action or a change after ${after}`);
          // Focus moves by an action of the child that takes it, not by a
          // word of the language's own.
          if (named.name === "focus" && peek().kind === "word") {
            // The child's whole path, "<child>.<child>…", as written.
            let target = peek().text;
            for (
              let at = position + 1;
              tokens[at]?.kind === "." && tokens[at + 1]?.kind === "word";
              at += 2
            ) {
              target += `.${tokens[at + 1]?.text}`;
            }
            failWith(
              named,
              `"focus ${target}" is not a change: move focus with an action of the child, such as ${target}.take-focus`,
            );
          }
          if (peek().kind !== "->") return { kind: "action", name: named };
          // A change is on one of the type's own states; a child's are
          // changed through its actions.
          if (named.name.includes(".")) {
            failWith(
              named,
              `a change is on one of the type's own states, not ${JSON.stringify(named.name)}; change a child through one of its actions`,
            );
          }
          next();
          return { kind: "change", state: named, to: word('a value after "->"') };
        };
        const trigger: Trigger = { ...located(token), event, does: [effect('":"')] };
        while (peek().kind === ",") {
          next();
          trigger.does.push(effect('","'));
        }
        type.triggers.push(trigger);
        if (peek().kind === "word" && peek().text === "only") {
          next();
          keyword("when", '"when" after "only"');
          trigger.when = condition("a state or a dimension");
          return;
        }
        end(["newline", "}"], '"only when" or the end of the line');
        return;
      }
      // "alike <subject> [in (...)] [when ...]"; a rule on a state named
      // alike has "=" next.
      if (token.text === "alike" && tokens[position + 1]?.kind !== "=") {
        next();
        const alike: Alike = { subject: word('a state or a dimension after "alike"') };
        if (peek().kind === "word" && peek().text === "in") {
          next();
          alike.values = valueList();
        }
        if (peek().kind === "word" && peek().text === "when") {
          next();
          alike.when = condition("a state or a dimension");
        } else {
          end(["newline", "}"], '"in", "when" or the end of the line');
        }
        type.alikes.push(alike);
        return;
      }
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
        const list: Declaration[] = token.text === "enum" ? type.enums : type.types;
        const before = list.length;
        try {
          if (token.text === "enum") valuesDeclaration("enum", type.enums);
          else typeDeclaration(type.types);
        } catch (error) {
          // It broke too, not only the type around it.
          const broken = list.length > before ? list.at(-1) : undefined;
          if (broken !== undefined) broken.broken = true;
          throw error;
        } finally {
          nested = outer;
        }
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
        carryOn();
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

  // An actor: "actor <name> records <Record>", the one record it records.
  const actorDeclaration = () => {
    next();
    const named = name("actor", 'an actor name after "actor"', lowercase);
    keyword("records", `"records" after ${JSON.stringify(named.name)}`);
    const records = word('a record after "records"');
    keep(result.actors, { ...named, records });
    if (peek().kind === ",") {
      failWith(
        peek(),
        `an actor records one record, for now: ${named.name} records ${records.name}`,
      );
    }
    end(["newline", "end"], "the end of the line");
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

  // An expectation: 'expect "<title>" { in <path> [and below]  when <key> =
  // <value>, ...  then|some <key> = <value>, ... | absent }'.
  const expectDeclaration = () => {
    next();
    const title = next();
    if (title.kind !== "string") fail(title, 'a title, in quotes, after "expect"');
    const expectation: Expectation = {
      ...located(title),
      title: title.text,
      path: located(title),
      below: false,
      when: [],
      assertion: "then",
      values: [],
    };
    keep(result.expectations, expectation);
    expect("{", '"{" after the title');
    const pairs = () => {
      const read: { key: Located; value: Located }[] = [];
      for (;;) {
        const key = qualified("a state, a dimension or profile");
        expect("=", `"=" after ${JSON.stringify(key.name)}`);
        // A path, for a child's state; a profile a modifier makes, as
        // "<profile>+<modifier>".
        const value = qualified('a value after "="');
        while (key.name === "profile" && peek().text === "+") {
          next();
          value.name += `+${word('a modifier after "+"').name}`;
        }
        read.push({ key, value });
        if (peek().kind !== ",") break;
        next();
      }
      end(["newline", "}"], '"," or the end of the line');
      return read;
    };
    let placed = false;
    let asserted = false;
    for (;;) {
      while (peek().kind === "newline") next();
      const token = peek();
      if (token.kind === "}") {
        if (!placed) fail(token, `"in" in ${JSON.stringify(title.text)}`);
        if (!asserted) fail(token, `"then", "some" or "absent" in ${JSON.stringify(title.text)}`);
        next();
        return;
      }
      if (token.kind !== "word") fail(token, '"in", "when", "then", "some", "absent" or "}"');
      next();
      if (token.text === "in") {
        expectation.path = qualified('a path after "in"');
        if (peek().kind === "word" && peek().text === "and") {
          next();
          keyword("below", '"below" after "and"');
          expectation.below = true;
        }
        end(["newline", "}"], "the end of the line");
        placed = true;
      } else if (token.text === "when") {
        expectation.when.push(...pairs());
      } else if (token.text === "on") {
        expectation.on = eventOf();
        end(["newline", "}"], "the end of the line");
      } else if (token.text === "then" || token.text === "some") {
        expectation.assertion = token.text;
        expectation.values = pairs();
        asserted = true;
      } else if (token.text === "absent") {
        expectation.assertion = "absent";
        end(["newline", "}"], "the end of the line");
        asserted = true;
      } else {
        fail(token, '"in", "when", "then", "some", "absent" or "}"');
      }
    }
  };

  const declarations: { [keyword: string]: () => void } = {
    enum: () => valuesDeclaration("enum", result.enums),
    dimension: () => valuesDeclaration("dimension", result.dimensions),
    type: () => typeDeclaration(),
    environment: environmentDeclaration,
    profile: profileDeclaration,
    modifier: modifierDeclaration,
    record: recordDeclaration,
    actor: actorDeclaration,
    expect: expectDeclaration,
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
          '"enum", "dimension", "type", "environment", "profile", "modifier", "record", "actor" or "expect"',
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
  // Conditions are checked against the combinations there really are, and
  // expectations against the tree in place: both need a file without other
  // problems.
  const clean = () => !result.diagnostics.some(({ severity }) => severity === "error");
  if (clean()) conditionsInMatrix(result);
  if (clean()) expectations(result);
  result.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return result;
}
