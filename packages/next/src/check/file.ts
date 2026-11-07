import type { Span, Value } from "@next/model/enumeration.js";
import type { FieldValue, RecordDeclaration } from "@next/model/record.js";
import { fileRules } from "@next/model/rules.js";
import {
  type Declaration,
  isEnumeration,
  isRecord,
  isType,
  type TypeDeclaration,
} from "@next/model/type.js";
import { acceptEnum, checkEnum, type Enum, type EnumProblem, frozen } from "./enumeration.js";
import { product } from "./product.js";
import { checkRecord, frozenRecord, type RecordProblem, recordCycle } from "./record.js";
import { checkType, frozenType, type TypeProblem } from "./type.js";

// The file checker of lean/Dxn/File.lean. It reports the same problems, for the
// same names, in the same order; it adds where each one is written.

/** A problem with a file: a declaration's own problem, or a name written twice. */
export type FileProblem =
  | { kind: "enum"; rule: EnumProblem["rule"]; name: string; problem: EnumProblem }
  | { kind: "type"; rule: TypeProblem["rule"]; name: string; problem: TypeProblem }
  | { kind: "record"; rule: RecordProblem["rule"]; name: string; problem: RecordProblem }
  | { kind: "duplicateName"; rule: typeof fileRules.duplicateName; name: string; at: Span[] };

/**
 * Every problem with a file's declarations: each declaration's own, in written order, then each
 * declaration name written more than once, once, in the order it first appears, with every
 * declaration that has it. No problems means it is accepted.
 */
export function checkFile(declarations: readonly Declaration[]): FileProblem[] {
  const problems: FileProblem[] = [];
  const enums = new Set(declarations.filter(isEnumeration).map((d) => d.name.text));
  const records = declarations.filter(isRecord);
  const recordNames = new Set(records.map((r) => r.name.text));
  for (const declaration of declarations) {
    if (isRecord(declaration)) {
      const own = checkRecord(enums, recordNames, declaration);
      const cycle = recordCycle(records, declaration.name.text);
      if (cycle) own.push({ kind: "containsItself", rule: "R6", ...cycle });
      for (const problem of own)
        problems.push({ kind: "record", rule: problem.rule, name: declaration.name.text, problem });
    } else if (isType(declaration)) {
      for (const problem of checkType(enums, declaration)) {
        problems.push({ kind: "type", rule: problem.rule, name: declaration.name.text, problem });
      }
    } else {
      for (const problem of checkEnum(declaration)) {
        problems.push({ kind: "enum", rule: problem.rule, name: declaration.name.text, problem });
      }
    }
  }
  const written = new Map<string, Span[]>();
  for (const { name } of declarations) {
    const spans = written.get(name.text);
    if (spans) spans.push(name.span);
    else written.set(name.text, [name.span]);
  }
  for (const [name, at] of written) {
    if (at.length > 1)
      problems.push({ kind: "duplicateName", rule: fileRules.duplicateName, name, at });
  }
  return problems;
}

/**
 * A file the checker accepted, as Lean's `File.Valid` holds of it. Only `acceptFile` makes one,
 * as only `acceptEnum` makes an `Enum`, and it keeps frozen copies of what it checked.
 */
export class CheckedFile {
  declare private readonly checked: true;

  private constructor(
    readonly enums: readonly Enum[],
    readonly types: readonly TypeDeclaration[],
    readonly records: readonly RecordDeclaration[],
  ) {}

  /** Check a file: a checked file when it has no problems, else its problems. */
  static accept(declarations: readonly Declaration[]): AcceptedFile {
    const copies = declarations.map((d) =>
      isType(d) ? frozenType(d) : isRecord(d) ? frozenRecord(d) : frozen(d),
    );
    const problems = checkFile(copies);
    if (problems.length > 0) return { file: undefined, problems };
    const enums = copies.filter(isEnumeration).flatMap((copy) => acceptEnum(copy).enum ?? []);
    return {
      file: new CheckedFile(
        Object.freeze(enums),
        Object.freeze(copies.filter(isType)),
        Object.freeze(copies.filter(isRecord)),
      ),
      problems: [],
    };
  }

  /** Count without enumerating; rows are generated only when the caller asks for them. */
  get products() {
    const values = new Map(this.enums.map((e) => [e.declaration.name.text, e.values]));
    return this.types.map((t) => {
      const factors = t.varies.map((n) => values.get(n.text) ?? []);
      return {
        type: t.name.text,
        span: t.name.span,
        varies: t.varies.map((n) => n.text),
        count: factors.reduce((size, factor) => size * BigInt(factor.length), 1n),
        rows: () => product(factors),
      };
    });
  }

  /** The Cartesian product for each type, in written order, first factor changing slowest. */
  get combinations(): { type: string; combinations: Value[][] }[] {
    return this.products.map((p) => ({ type: p.type, combinations: [...p.rows()] }));
  }

  /** Enumerate finite nested record values on explicit demand, retaining enum identity. */
  recordValues(name: string): FieldValue[] {
    const memo = new Map<string, FieldValue[]>();
    const values = (n: string): FieldValue[] => {
      const saved = memo.get(n);
      if (saved) return saved;
      const record = this.records.find((r) => r.name.text === n);
      const result: FieldValue[] = record
        ? [...product(record.fields.map((f) => values(f.type.text)))].map((row) => ({
            kind: "record",
            fields: Object.fromEntries(
              record.fields.map((f, i) => [f.name.text, row[i]]),
            ) as Record<string, FieldValue>,
          }))
        : (this.enums.find((e) => e.declaration.name.text === n)?.values ?? []).map((value) => ({
            kind: "enum",
            value,
          }));
      memo.set(n, result);
      return result;
    };
    return values(name);
  }

  /** Its values, in written order, each tagged with its enumeration's name. */
  get values(): Value[] {
    return this.enums.flatMap((e) => e.values);
  }
}

/** What checking a file gives: a checked file, or the problems that stop it being one. */
export type AcceptedFile =
  | { file: CheckedFile; problems: [] }
  | { file: undefined; problems: FileProblem[] };

/** Check a file: a checked file when it has no problems, else its problems. */
export function acceptFile(declarations: readonly Declaration[]): AcceptedFile {
  return CheckedFile.accept(declarations);
}
