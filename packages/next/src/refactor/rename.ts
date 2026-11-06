import { acceptFile, type CheckedFile, type FileProblem } from "@next/check/file.js";
import { isEnumName } from "@next/check/names.js";
import type { Span } from "@next/model/enumeration.js";
import { parse, type SyntaxProblem } from "@next/syntax/parse.js";

// Renaming an enumeration, as lean/Dxn/Rename.lean specifies. It refuses for
// the same reasons, in the same order, and changes only the enumeration's name;
// it adds the text edit and where each reason is.

/** Why a rename is refused, in the order they are reported. */
export type RenameRefusal =
  | { kind: "fileHasProblems"; problems: readonly (SyntaxProblem | FileProblem)[] }
  | { kind: "badEnumName"; name: string }
  | { kind: "noSuchEnum"; name: string; names: string[] }
  | { kind: "enumExists"; name: string; at: Span };

/** Replace the text at `span` with `text`. */
export interface Edit {
  readonly span: Span;
  readonly text: string;
}

/** A rename done, with its edits, the new text and the new file; or every reason it is refused. */
export type Renamed =
  | { source: string; edits: Edit[]; file: CheckedFile; refusals: [] }
  | { source: undefined; edits: []; file: undefined; refusals: RenameRefusal[] };

const refused = (refusals: RenameRefusal[]): Renamed => ({
  source: undefined,
  edits: [],
  file: undefined,
  refusals,
});

/** Apply edits that do not overlap to a text. */
function applied(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const { span, text: replacement } of [...edits].sort(
    (a, b) => b.span.start - a.span.start,
  )) {
    text = text.slice(0, span.start) + replacement + text.slice(span.end);
  }
  return text;
}

/**
 * Rename the enumeration `from` to `to` in a source, or say every reason it is refused: the file
 * has problems, the new name breaks the naming rules, no enumeration has the old name, or another
 * enumeration already has the new name. Renaming to the same name changes nothing.
 */
export function renameEnum(source: string, from: string, to: string): Renamed {
  const parsed = parse(source);
  if (parsed.problems.length > 0)
    return refused([{ kind: "fileHasProblems", problems: parsed.problems }]);
  const accepted = acceptFile(parsed.declarations);
  if (!accepted.file) return refused([{ kind: "fileHasProblems", problems: accepted.problems }]);

  const declarations = parsed.declarations;
  const names = declarations.map(({ name }) => name.text);
  const refusals: RenameRefusal[] = [];
  if (!isEnumName(to)) refusals.push({ kind: "badEnumName", name: to });
  if (!names.includes(from)) refusals.push({ kind: "noSuchEnum", name: from, names });
  const taken = to === from ? undefined : declarations.find(({ name }) => name.text === to);
  if (taken) refusals.push({ kind: "enumExists", name: to, at: taken.name.span });
  if (refusals.length > 0) return refused(refusals);

  const edits =
    to === from
      ? []
      : declarations
          .filter(({ name }) => name.text === from)
          .map(({ name }) => ({ span: name.span, text: to }));
  const renamed = applied(source, edits);
  // The specification proves a rename keeps a file valid; a file that is not is a bug here.
  const file = acceptFile(parse(renamed).declarations).file;
  if (!file) throw new Error(`renaming ${from} to ${to} gave a file with problems`);
  return { source: renamed, edits, file, refusals: [] };
}
