// The dxn language as a library: what the dxn command and other tools need to
// read a .dxn file, check it, evaluate it and check stored data against it.

// Reading a .dxn file into declarations.
export type { Diagnostic, ParseResult, RecordDeclaration, Type } from "./ast.js";
// What a type, or a child in place, has that can be told apart.
export { type Cases, cases } from "./cases.js";
// What fits where a cursor is, for editors.
export { type Completion, type CompletionKind, completions } from "./complete.js";
// What a rule's or a child's condition compares.
export { subjects } from "./condition.js";
// Where a name in a source is declared, and where it is used, for editors.
export { definition, usages } from "./definition.js";
// A field's value in a stored record, derived or as stored.
export { fieldValue } from "./derive.js";
// Diagnostics in stored data, by JSON path.
export { Diagnostics } from "./diagnostic.js";
// Stored records that repeat others, apart from their fingerprints.
export { type Duplicate, duplicates, type StoredSource } from "./duplicates.js";
// What a type's states are in each combination, and what a tree of types
// is in place.
export {
  type InPlace,
  inPlace,
  type Placement,
  type Presence,
  placement,
  states,
} from "./evaluate.js";
// What a node of a design file shows, and whether stored evidence still
// points at what it recorded.
export { canonical, Fingerprints, freshness, repositoryOf } from "./fingerprint.js";
// The one way a file is written, for dxn fmt and editors.
export { format } from "./format.js";
// What a name is, as its declaration is written, for editors.
export { type Hover, hover } from "./hover.js";
// The JSON reader stored data is read with.
export { parseJson } from "./json.js";
export { among, Names } from "./names.js";
export { parse } from "./parse.js";
export { givenDimensions, profilesOf } from "./profiles.js";
// Renaming an enum's value in a .dxn file and in its stored records.
export { isValue, renameInData, renameInSource } from "./rename.js";
// Renaming a declaration where it is used, and in stored records, for editors.
export {
  declarationNamed,
  type Edit,
  type Renamed,
  renameAt,
  renameable,
  type StoredFile,
} from "./rename-at.js";
// What each name in a file is, for editors to colour it by.
export { type Token, tokens } from "./semantic.js";
// How many combinations of each element stored records are about.
export {
  type Check,
  type Combination,
  coverage,
  describe,
  type Progress,
  progress,
  treePaths,
} from "./status.js";
// Records stored as JSON beside a .dxn file.
export { folderOf, storedFiles } from "./store.js";
// The outline of a file, for editors.
export { type DocumentSymbol, symbols } from "./symbols.js";
export { validate } from "./validate.js";
