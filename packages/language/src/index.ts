// The dxn language as a library: what the dxn command and other tools need to
// read a .dxn file, check it, evaluate it and check stored data against it.

// Reading a .dxn file into declarations.
export type {
  Diagnostic,
  Located,
  ParseResult,
  RecordDeclaration,
  Type,
} from "@language/core/ast.js";
// Whether a binding fixes its child's state to one of its values.
export { fixes } from "@language/core/ast.js";
// Diagnostics in stored data, by JSON path.
export { Diagnostics } from "@language/core/diagnostic.js";
// How a problem or a refusal is written, with what it mentions quoted.
export { type Mentioned, message, Words, words } from "@language/core/message.js";
// Renaming an enum's value in a .dxn file and in its stored records.
export { isValue } from "@language/core/naming.js";
// The words dxn and an editor say a count of evidence in.
export {
  apartShort,
  type EvidenceCount,
  evidenceColumns,
  evidenceHeadings,
  evidenceLabel,
  evidenceShort,
  isDrawn,
  type OutdatedAt,
  outdatedAction,
  outdatedFact,
  outdatedItem,
  outdatedSummary,
  outdatedWhy,
  type Ratio,
  ratio,
  sayRatio,
  storedRecords,
  type Usage,
} from "@language/core/vocabulary.js";
// Stored records that repeat others, apart from their fingerprints.
export { type Duplicate, duplicates, type StoredSource } from "@language/data/duplicates.js";
// The JSON reader stored data is read with.
export { parseJson } from "@language/data/json.js";
// What fits where a cursor is, for editors.
export { type Completion, type CompletionKind, completions } from "@language/editor/complete.js";
// Where a name in a source is declared, and where it is used, for editors.
export { definition, usages } from "@language/editor/definition.js";
// What a name is, as its declaration is written, for editors.
export { type Hover, hover } from "@language/editor/hover.js";
// Renaming a declaration where it is used, and in stored records, for editors.
export {
  declarationNamed,
  type Edit,
  type Renamed,
  renameAt,
  renameable,
  type StoredFile,
} from "@language/editor/rename-at.js";
// What each name in a file is, for editors to colour it by.
export { type Token, tokens } from "@language/editor/semantic.js";
// The outline of a file, for editors.
export { type DocumentSymbol, symbols } from "@language/editor/symbols.js";
// What a type, or a child in place, has that can be told apart.
export { type Cases, cases } from "@language/evaluation/cases.js";
// What a type's states are in each combination, and what a tree of types
// is in place.
export {
  type InPlace,
  inPlace,
  type Placement,
  type Presence,
  placement,
  states,
} from "@language/evaluation/evaluate.js";
// How many combinations of each element stored records are about.
export {
  type Check,
  type Combination,
  coverage,
  describe,
  type Judged,
  judge,
  type Outdated,
  type Progress,
  progress,
  treePaths,
  treePlaces,
} from "@language/evaluation/status.js";
// Which stored records dxn and an editor count, when some have errors, and
// what both say of those they do not.
export {
  apartCount,
  apartLabel,
  countable,
  elementOf,
  type SetApart,
} from "@language/evidence/apart.js";
// What a node of a design file shows, and whether stored evidence still
// points at what it recorded.
export {
  canonical,
  drawings,
  Fingerprints,
  freshness,
  repositoryOf,
} from "@language/evidence/fingerprint.js";
export { renameInData, renameInSource } from "@language/evidence/rename.js";
// Pages to review each tree's evidence by, with the pictures of what was
// recorded.
export { type ReviewOptions, type ReviewPage, reviewPages } from "@language/evidence/review.js";
// Records stored as JSON beside a .dxn file.
export {
  checkStored,
  folderOf,
  type StoredProblem,
  storedBeside,
  storedFiles,
  type Unrecorded,
  withoutContext,
} from "@language/evidence/store.js";
export { type Drawn, validate } from "@language/evidence/validate.js";
// What a rule's or a child's condition compares.
export { subjects } from "@language/model/condition.js";
export { among, Names } from "@language/model/names.js";
export { givenDimensions, profilesOf } from "@language/model/profiles.js";
// The declared has structure, independent of evaluated combinations.
export { printTypeTrees, type TypeTree, typeTrees } from "@language/model/tree.js";
// The one way a file is written, for dxn fmt and editors.
export { format } from "@language/syntax/format.js";
export { parse } from "@language/syntax/parse.js";
// The lines of a source, however each ends, as the parser reads them.
export { sourceLines } from "@language/syntax/scan.js";
