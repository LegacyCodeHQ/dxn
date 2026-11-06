import type { EnumDeclaration, Span, Value } from "@next/model/enumeration.js";
import { acceptEnum, checkEnum, type Enum, type EnumProblem, frozen } from "./enumeration.js";

// The file checker of lean/Dxn/File.lean. It reports the same problems, for the
// same names, in the same order; it adds where each one is written.

/** A problem with a file: one of an enumeration's own, or an enumeration name written twice. */
export type FileProblem =
  | { kind: "enum"; name: string; problem: EnumProblem }
  | { kind: "duplicateEnum"; name: string; at: Span[] };

/**
 * Every problem with a file's declarations: each declaration's own, in written order, then each
 * enumeration name written more than once, once, in the order it first appears, with every
 * declaration that has it. No problems means it is accepted.
 */
export function checkFile(declarations: readonly EnumDeclaration[]): FileProblem[] {
  const problems: FileProblem[] = [];
  for (const declaration of declarations) {
    for (const problem of checkEnum(declaration)) {
      problems.push({ kind: "enum", name: declaration.name.text, problem });
    }
  }
  const written = new Map<string, Span[]>();
  for (const { name } of declarations) {
    const spans = written.get(name.text);
    if (spans) spans.push(name.span);
    else written.set(name.text, [name.span]);
  }
  for (const [name, at] of written) {
    if (at.length > 1) problems.push({ kind: "duplicateEnum", name, at });
  }
  return problems;
}

/**
 * A file the checker accepted, as Lean's `File.Valid` holds of it. Only `acceptFile` makes one,
 * as only `acceptEnum` makes an `Enum`, and it keeps frozen copies of what it checked.
 */
export class CheckedFile {
  declare private readonly checked: true;

  private constructor(readonly enums: readonly Enum[]) {}

  /** Check a file: a checked file when it has no problems, else its problems. */
  static accept(declarations: readonly EnumDeclaration[]): AcceptedFile {
    const copies = declarations.map(frozen);
    const problems = checkFile(copies);
    if (problems.length > 0) return { file: undefined, problems };
    const enums = copies.flatMap((copy) => acceptEnum(copy).enum ?? []);
    return { file: new CheckedFile(Object.freeze(enums)), problems: [] };
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
export function acceptFile(declarations: readonly EnumDeclaration[]): AcceptedFile {
  return CheckedFile.accept(declarations);
}
