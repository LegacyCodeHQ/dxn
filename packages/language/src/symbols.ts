import type { Located, ParseResult, Type } from "./ast.js";
import type { Span } from "./definition.js";
import { parse } from "./parse.js";
import { sourceLines } from "./scan.js";

// A declaration in a file's outline: its name and kind, the text it spans,
// from its first line to its closing brace or the end of its line, where its
// name is, and what it declares inside it.
export interface DocumentSymbol {
  name: string;
  kind: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  at: Span;
  children: DocumentSymbol[];
}

// The outline of a source: its declarations, in the order they are written;
// inside a type, its states, events, children, actions, and the enums and
// types it declares; inside a record, its fields; and its expectations, by
// their titles; and who records what, by each actor's name. A file that does not parse to its end is outlined as far as it
// is read.
export function symbols(source: string, file: ParseResult = parse(source)): DocumentSymbol[] {
  const lines = sourceLines(source);
  const symbol = (
    at: Located,
    kind: string,
    name: string,
    children: DocumentSymbol[] = [],
    // A name among several on its line starts where it is; any other
    // declaration, where its line does.
    own = false,
  ): DocumentSymbol => {
    const text = lines[at.line - 1] ?? "";
    const length = kind === "expectation" ? name.length + 2 : name.length;
    const column = own ? at.column : text.length - text.trimStart().length + 1;
    return {
      name,
      kind,
      start: { line: at.line, column },
      end: own ? fieldEnd(text, at.line, at.column) : endOf(lines, at.line, at.column),
      at: { line: at.line, column: at.column, length },
      children: ordered(children),
    };
  };
  const ofType = (type: Type): DocumentSymbol =>
    symbol(type, "type", type.short ?? type.name, [
      ...type.states.map((state) => symbol(state, "state", state.name, [], true)),
      ...type.events.map((event) => symbol(event, "event", event.name, [], true)),
      ...type.children
        .filter(({ member }) => member === undefined)
        .map((child) => symbol(child, "child", child.name)),
      // A list of several, to its "]", its members inside it.
      ...type.unions.map((union) => {
        const members = union.members.map((member) =>
          symbol(member, "child", member.short ?? member.name),
        );
        const list = symbol(union, "child", union.name, members);
        const close =
          (lines.slice(union.line).findIndex((text) => text.trim().startsWith("]")) ?? 0) +
          union.line +
          1;
        // A Windows line's \r is its end, not a character on it.
        const text = (lines[close - 1] ?? "").replace(/\r$/, "");
        return { ...list, end: { line: close, column: text.length + 1 } };
      }),
      ...type.actions.map((action) => symbol(action.name, "action", action.name.name)),
      ...file.enums
        .filter(({ scope }) => scope === type.name)
        .map((declaration) => symbol(declaration, "enum", declaration.short ?? declaration.name)),
      ...file.types.filter(({ scope }) => scope === type.name).map(ofType),
    ]);
  return ordered([
    ...file.enums
      .filter(({ scope }) => scope === undefined)
      .map((each) => symbol(each, "enum", each.name)),
    ...file.dimensions.map((each) => symbol(each, "dimension", each.name)),
    ...file.types.filter(({ scope }) => scope === undefined).map(ofType),
    ...file.environments.map((each) => symbol(each, "environment", each.name)),
    ...file.profiles.map((each) => symbol(each, "profile", each.name)),
    ...file.modifiers.map((each) => symbol(each, "modifier", each.name)),
    ...file.records.map((record) =>
      symbol(
        record,
        "record",
        record.name,
        record.fields.map((field) => symbol(field, "field", field.name)),
      ),
    ),
    ...file.actors.map((each) => symbol(each, "actor", each.name)),
    ...file.expectations.map((each) => symbol(each, "expectation", each.title)),
  ]);
}

// Where a name among several on its line ends, with what follows it: before
// the next comma, or brace, or the end of the line.
function fieldEnd(text: string, line: number, column: number): { line: number; column: number } {
  const rest = text.slice(column - 1);
  const stop = rest.search(/[,{]/);
  const field = stop === -1 ? rest : rest.slice(0, stop);
  return { line, column: column + field.trimEnd().length };
}

const ordered = (list: DocumentSymbol[]) =>
  [...list].sort((a, b) => a.at.line - b.at.line || a.at.column - b.at.column);

// Where a declaration whose name is at a line and a column ends: after the
// brace that closes the one it opens on that line, or at the end of its line.
function endOf(lines: string[], line: number, column: number): { line: number; column: number } {
  const text = (row: number) =>
    (lines[row] ?? "")
      .replace(/"[^"]*"/g, (quoted) => " ".repeat(quoted.length))
      .replace(/#.*$/, "");
  const first = text(line - 1);
  const open = first.indexOf("{", column - 1);
  if (open === -1) return { line, column: first.trimEnd().length + 1 };
  let depth = 0;
  for (let row = line - 1; row < lines.length; row++) {
    const content = text(row);
    for (let at = row === line - 1 ? open : 0; at < content.length; at++) {
      if (content[at] === "{") depth++;
      if (content[at] === "}" && --depth === 0) return { line: row + 1, column: at + 2 };
    }
  }
  const last = lines.length;
  return { line: last, column: (lines[last - 1] ?? "").length + 1 };
}
