import type { Enum, Located, ParseResult, Type } from "./ast.js";
import { conditionText } from "./condition.js";
import { covers, links, type Span, wordAt } from "./definition.js";
import { parse } from "./parse.js";

// What hovering over a name shows: the name's declaration as it is written,
// and the comment above it.
export interface Hover {
  from: Span;
  code: string;
  comment?: string;
}

// What the name at a line and a column of a source, both from one, is, where
// it is used: its declaration, from elsewhere in the file. Where it is
// declared, only what that line does not say: a state's enum, with its
// values; nothing for any other declaration. Nothing over a keyword, or a name
// the file does not declare.
export function hover(
  source: string,
  line: number,
  column: number,
  file: ParseResult = parse(source),
): Hover | undefined {
  const lines = source.split("\n");
  const described = describe(file, lines);
  const span = (at: Located): Span => ({
    line: at.line,
    column: at.column,
    length: wordAt(lines, at.line, at.column).length,
  });
  const link = links(source, file).find(({ from }) => covers(from, line, column));
  if (link !== undefined) {
    const found = described.get(link.to);
    return found === undefined ? undefined : { from: link.from, ...found };
  }
  const declared = [...described.keys()].find((at) => covers(span(at), line, column));
  const state = file.types
    .flatMap(({ states }) => states)
    .find((candidate) => candidate === declared);
  const of = file.enums.find(({ name }) => name === state?.enum.name);
  const found = of === undefined ? undefined : described.get(of);
  return state === undefined || found === undefined ? undefined : { from: span(state), ...found };
}

// The comment on the lines right above a line, without its "#"; none above
// line 0.
function commentAbove(lines: string[], line: number): string | undefined {
  const comment: string[] = [];
  for (let at = line - 2; at >= 0; at--) {
    const text = (lines[at] ?? "").trim();
    if (!text.startsWith("#")) break;
    comment.unshift(text.replace(/^#\s?/, ""));
  }
  return comment.length > 0 ? comment.join("\n") : undefined;
}

// Every declaration a name can be, with how it is shown.
function describe(file: ParseResult, lines: string[]): Map<Located, Omit<Hover, "from">> {
  const result = new Map<Located, Omit<Hover, "from">>();
  const add = (at: Located, code: string, line = at.line) => {
    const comment = commentAbove(lines, line);
    result.set(at, comment === undefined ? { code } : { code, comment });
  };
  const listed = (declaration: Enum, keyword: string) =>
    `${keyword} ${declaration.name} = ${declaration.values.map(({ name }) => name).join(" | ")}`;
  const enumText = (name: string) => {
    const declaration = file.enums.find((candidate) => candidate.name === name);
    return declaration === undefined ? undefined : listed(declaration, "enum");
  };
  for (const [keyword, list] of [
    ["enum", file.enums],
    ["dimension", file.dimensions],
  ] as const) {
    for (const declaration of list) {
      add(declaration, listed(declaration, keyword));
      // A value shows its enum or dimension.
      for (const value of declaration.values)
        add(value, listed(declaration, keyword), declaration.line);
    }
  }
  for (const type of file.types) describeType(type, add, enumText);
  for (const environment of file.environments) {
    add(
      environment,
      `environment ${environment.name} = ${environment.dimensions.map(({ name }) => name).join(" x ")}`,
    );
  }
  const assignments = (values: { dimension: Located; value: Located }[]) =>
    `{ ${values.map(({ dimension, value }) => `${dimension.name} = ${value.name}`).join(", ")} }`;
  for (const profile of file.profiles) {
    add(
      profile,
      `profile ${profile.name}: ${profile.environment.name} ${assignments(profile.values)}`,
    );
  }
  for (const modifier of file.modifiers) {
    const on = modifier.on.map(({ name }) => name).join(", ");
    add(modifier, `modifier ${modifier.name} on ${on} ${assignments(modifier.values)}`);
  }
  for (const record of file.records) {
    const fields = record.fields.map(({ name, type }) => `  ${name}: ${type.name}`);
    const context = record.context ? " with context" : "";
    add(record, [`record ${record.name}${context} {`, ...fields, "}"].join("\n"));
  }
  return result;
}

// A type, and what it declares: its states, actions, events and children.
function describeType(
  type: Type,
  add: (at: Located, code: string, line?: number) => void,
  enumText: (name: string) => string | undefined,
): void {
  const own = type.states.filter(({ received }) => !received);
  const received = type.states.filter(({ received: is }) => is);
  const header = [
    `type ${type.name}`,
    ...(type.needs.length > 0 ? [`needs ${type.needs.map(({ name }) => name).join(", ")}`] : []),
    ...(received.length > 0
      ? [`receives ${received.map(({ name, enum: of }) => `${name}: ${of.name}`).join(", ")}`]
      : []),
  ].join(" ");
  const body = [
    ...(type.events.length > 0
      ? [`  event ${type.events.map(({ name }) => name).join(", ")}`]
      : []),
    ...(own.length > 0
      ? [`  state ${own.map(({ name, enum: of }) => `${name}: ${of.name}`).join(", ")}`]
      : []),
    ...type.children.map(({ name, type: of }) => `  has ${name}: ${of.name}`),
    ...type.actions.map(({ name }) => `  action ${name.name}`),
  ];
  add(type, [header, ...body].join("\n"));
  for (const state of type.states) {
    const value =
      state.fixed !== undefined
        ? ` = ${state.fixed.name}`
        : state.derived !== undefined
          ? ` = when ${state.derived.dimension.name}`
          : "";
    const keyword = state.received ? "receives" : "state";
    const of = enumText(state.enum.name);
    add(
      state,
      [
        `${keyword} ${type.name}.${state.name}: ${state.enum.name}${value}`,
        ...(of === undefined ? [] : [of]),
      ].join("\n"),
      // A received state is on the type's line, whose comment is the type's.
      state.received ? 0 : state.line,
    );
  }
  for (const action of type.actions) {
    add(
      action.name,
      `action ${type.name}.${action.name.name}: ${action.state.name} ${action.from.name} -> ${action.to.name}`,
    );
  }
  for (const event of type.events) add(event, `event ${type.name}.${event.name}`);
  for (const child of type.children) {
    const when = child.when === undefined ? "" : ` only when ${conditionText(child.when)}`;
    add(child, `has ${type.name}.${child.name}: ${child.type.name}${when}`);
  }
}
