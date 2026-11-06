import type { Documentation, Located, ParseResult, Type } from "@language/core/ast.js";
import type { Span } from "@language/editor/definition.js";
import { read } from "@language/syntax/read.js";

interface DocumentationReference {
  from: Span;
  to: Located;
}

// Editor operations share a parsed result for a source version. Weak keys avoid
// retaining closed/replaced models; the source guard prevents stale ranges if a
// caller supplies changed text alongside the same parsed-result object.
const indexes = new WeakMap<
  ParseResult,
  { source: string; references: readonly DocumentationReference[] }
>();

// Rename follows explicit attached targets, including duplicates. Read syntax
// again because analysis keeps only the first valid duplicate description.
// Resolve by declaration position so shadowed names never share a rename.
export function documentationReferences(
  source: string,
  file: ParseResult,
): readonly DocumentationReference[] {
  const cached = indexes.get(file);
  if (cached?.source === source) return cached.references;
  const members = new Map(
    [
      ...file.enums.flatMap(({ values }) => values),
      ...file.types.flatMap(({ states }) => states),
    ].map((member) => [`${member.line}:${member.column}`, member] as const),
  );
  const references: DocumentationReference[] = [];
  const add = (
    member: Located,
    documentation: Documentation | undefined,
    kind: "value" | "state",
  ) => {
    const to = members.get(`${member.line}:${member.column}`);
    if (!to) return;
    for (const tag of documentation?.tags ?? []) {
      const target = tag.target;
      if (tag.name !== kind || target?.name !== member.name) continue;
      const { line, column, length } = target;
      references.push({ from: { line, column, length }, to });
    }
  };
  const enumeration = (declared: { values: Located[]; documentation?: Documentation }) => {
    for (const value of declared.values) add(value, declared.documentation, "value");
  };
  const type = (declared: Type) => {
    declared.enums.forEach(enumeration);
    for (const state of declared.states) add(state, state.documentation, "state");
    declared.types.forEach(type);
  };
  const syntax = read(source);
  syntax.enums.forEach(enumeration);
  syntax.types.forEach(type);
  indexes.set(file, { source, references });
  return references;
}
