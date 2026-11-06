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
  // Qualified member labels are display text, not standalone DXN syntax.
  language: "dxn" | "text";
  comment?: string;
}

// What the name at a line and a column of a source, both from one, is, where
// it is used: its declaration, from elsewhere in the file. Where it is
// declared, show attached documentation when present, and identify enum values
// and states even without documentation. Nothing over a keyword, or a name
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
    return found === undefined ? undefined : { from: { ...link.from }, ...found };
  }
  const declared = [...described.keys()].find((at) => covers(span(at), line, column));
  if (declared === undefined) return undefined;
  const found = described.get(declared);
  if (found === undefined) return undefined;
  const member =
    file.enums.some(({ values }) => values.includes(declared)) ||
    file.types.some(({ states }) => states.some((state) => state === declared));
  const documentedDeclarations: Located[] = [...file.enums, ...file.types];
  return member || (documentedDeclarations.includes(declared) && found.comment !== undefined)
    ? { from: span(declared), ...found }
    : undefined;
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

// Tags take precedence over prose, even when explicitly empty. General prose
// applies to a state only when its declaration contains exactly one state.
function documentationComment(
  documentation: Documentation | undefined,
  tag?: "value" | "state",
  target?: string,
  singleState = false,
): string | undefined {
  if (!documentation) return undefined;
  if (tag === undefined) return documentation.description || undefined;
  const detail = documentation.tags.find(
    (entry) => entry.name === tag && entry.target?.name === target,
  );
  return (
    (detail ? detail.description : singleState ? documentation.description : undefined) || undefined
  );
}

// Every declaration a name can be, with how it is shown.
function describe(file: ParseResult, lines: string[]): Map<Located, Omit<Hover, "from">> {
  const result = new Map<Located, Omit<Hover, "from">>();
  const add = (
    at: Located,
    code: string,
    comment?: string,
    language: Hover["language"] = "dxn",
  ) => {
    result.set(at, { code, language, ...(comment === undefined ? {} : { comment }) });
  };
  // Constructs outside the documentation contract keep their existing comments.
  const legacy = (at: Located, code: string) => add(at, code, commentAbove(lines, at.line));
  const listed = (declaration: Enum, keyword: string) =>
    `${keyword} ${declaration.name} = ${declaration.values.map(({ name }) => name).join(" | ")}`;
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
      // Enum values show a qualified identity and only their own tag description.
      for (const value of declaration.values)
        add(
          value,
          keyword === "enum" ? `${declaration.name}.${value.name}` : listed(declaration, keyword),
          keyword === "enum"
            ? documentationComment(declaration.documentation, "value", value.name)
            : commentAbove(lines, declaration.line),
          keyword === "enum" ? "text" : "dxn",
        );
    }
  }
  for (const type of file.types) describeType(type, add, lines);
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
  const groups = new Map<Documentation, number>();
  for (const { documentation } of type.states) {
    if (documentation) groups.set(documentation, (groups.get(documentation) ?? 0) + 1);
  }
  for (const state of type.states) {
    const value =
      state.fixed !== undefined
        ? ` = ${state.fixed.name}`
        : state.derived !== undefined
          ? ` = when ${state.derived.dimension.name}`
          : "";
    const keyword = state.received ? "receives" : "state";
    add(
      state,
      `${keyword} ${type.name}.${state.name}: ${state.enum.name}${value}`,
      documentationComment(
        state.documentation,
        "state",
        state.name,
        state.documentation !== undefined && groups.get(state.documentation) === 1,
      ),
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
