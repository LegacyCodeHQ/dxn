import type { Documentation, Enum, Located, ParseResult, Type } from "@language/core/ast.js";
import { covers, links, type Span } from "@language/editor/definition.js";
import { conditionText } from "@language/model/condition.js";
import { parse } from "@language/syntax/parse.js";
import { sourceLines } from "@language/syntax/scan.js";

// What hovering over a name shows: the name's declaration as it is written,
// and its attached documentation.
export interface Hover {
  from: Span;
  code: string;
  comment?: string;
}

// What the name at a line and a column of a source, both from one, is, where
// it is used: its declaration, from elsewhere in the file. Where it is
// declared, show attached documentation when present, and a state's enum
// with its values even without documentation. Nothing over a keyword, or a name
// the file does not declare.
export function hover(
  source: string,
  line: number,
  column: number,
  file: ParseResult = parse(source),
): Hover | undefined {
  const lines = sourceLines(source);
  const described = describe(file, lines);
  const span = (at: Located): Span => ({
    line: at.line,
    column: at.column,
    length: at.length,
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
  if (state === undefined) {
    if (declared === undefined) return undefined;
    const documentedDeclarations: Located[] = [
      ...file.enums,
      ...file.types,
      ...file.enums.flatMap(({ values }) => values),
    ];
    const found = described.get(declared);
    return !documentedDeclarations.includes(declared) || found?.comment === undefined
      ? undefined
      : { from: span(declared), ...found };
  }
  const of = file.enums.find(({ name }) => name === state.enum.name);
  const found = of === undefined ? undefined : described.get(of);
  const own = described.get(state);
  if (found === undefined) {
    return own?.comment === undefined ? undefined : { from: span(state), ...own };
  }
  const comment = own?.comment ?? found.comment;
  return { from: span(state), code: found.code, ...(comment ? { comment } : {}) };
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

// Declaration prose applies to its members; only the matching value/state
// tag contributes a member description. Analysis already keeps the first valid
// duplicate, and filtering by kind/target prevents invalid tags from leaking.
function documentationComment(
  documentation: Documentation | undefined,
  tag?: "value" | "state",
  target?: string,
): string | undefined {
  if (!documentation) return undefined;
  const detail =
    tag === undefined
      ? undefined
      : documentation.tags.find((entry) => entry.name === tag && entry.target?.name === target)
          ?.description;
  return [documentation.description, detail].filter(Boolean).join("\n\n") || undefined;
}

// Every declaration a name can be, with how it is shown.
function describe(file: ParseResult, lines: string[]): Map<Located, Omit<Hover, "from">> {
  const result = new Map<Located, Omit<Hover, "from">>();
  const add = (at: Located, code: string, comment?: string) => {
    result.set(at, comment === undefined ? { code } : { code, comment });
  };
  // Constructs outside the documentation contract keep their existing comments.
  const legacy = (at: Located, code: string) => add(at, code, commentAbove(lines, at.line));
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
      add(
        declaration,
        listed(declaration, keyword),
        keyword === "enum"
          ? documentationComment(declaration.documentation)
          : commentAbove(lines, declaration.line),
      );
      // A value shows its enum or dimension, with only its own tag description.
      for (const value of declaration.values)
        add(
          value,
          listed(declaration, keyword),
          keyword === "enum"
            ? documentationComment(declaration.documentation, "value", value.name)
            : commentAbove(lines, declaration.line),
        );
    }
  }
  for (const type of file.types) describeType(type, add, enumText, lines);
  for (const environment of file.environments) {
    legacy(
      environment,
      `environment ${environment.name} = ${environment.dimensions.map(({ name }) => name).join(" x ")}`,
    );
  }
  const assignments = (values: { dimension: Located; value: Located }[]) =>
    `{ ${values.map(({ dimension, value }) => `${dimension.name} = ${value.name}`).join(", ")} }`;
  for (const profile of file.profiles) {
    legacy(
      profile,
      `profile ${profile.name}: ${profile.environment.name} ${assignments(profile.values)}`,
    );
  }
  for (const modifier of file.modifiers) {
    const on = modifier.on.map(({ name }) => name).join(", ");
    legacy(modifier, `modifier ${modifier.name} on ${on} ${assignments(modifier.values)}`);
  }
  for (const record of file.records) {
    const fields = record.fields.map(({ name, type }) => `  ${name}: ${type.name}`);
    // Who records it, which is what gives it a context.
    const by = file.actors
      .filter((actor) => actor.records.name === record.name)
      .map((actor) => `actor ${actor.name} records ${record.name}`);
    legacy(record, [...by, `record ${record.name} {`, ...fields, "}"].join("\n"));
  }
  return result;
}

// A type, and what it declares: its states, actions, events and children.
function describeType(
  type: Type,
  add: (at: Located, code: string, comment?: string) => void,
  enumText: (name: string) => string | undefined,
  lines: string[],
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
    ...type.children
      .filter(({ member }) => member === undefined)
      .map(({ name, type: of, list }) => `  has ${name}: ${list ? `[${of.name}]` : of.name}`),
    // A list of several, as written: its members, each with its own only when.
    ...type.unions.flatMap(({ name, members }) => [
      `  has ${name}: [`,
      ...members.map(({ short, type: of, when }) => {
        const only = when === undefined ? "" : ` only when ${conditionText(when)}`;
        return `    ${short}: ${of.name}${only}`;
      }),
      "  ]",
    ]),
    ...type.actions.map(({ name }) => `  action ${name.name}`),
  ];
  add(type, [header, ...body].join("\n"), documentationComment(type.documentation));
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
      documentationComment(state.documentation, "state", state.name),
    );
  }
  for (const action of type.actions) {
    add(
      action.name,
      `action ${type.name}.${action.name.name}: ${action.state.name} ${action.from.name} -> ${action.to.name}`,
      commentAbove(lines, action.name.line),
    );
  }
  for (const event of type.events)
    add(event, `event ${type.name}.${event.name}`, commentAbove(lines, event.line));
  for (const child of type.children) {
    const when = child.when === undefined ? "" : ` only when ${conditionText(child.when)}`;
    const of = child.list ? `[${child.type.name}]` : child.type.name;
    add(child, `has ${type.name}.${child.name}: ${of}${when}`, commentAbove(lines, child.line));
  }
}
