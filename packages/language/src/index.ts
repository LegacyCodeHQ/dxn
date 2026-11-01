// The dxn language as a library: what the dxn command and other tools need to
// read a .dxn file, check it, evaluate it and check stored data against it.

// Reading a .dxn file into declarations.
export type { ParseResult, RecordDeclaration, Type } from "./ast.js";
// What a type, or a child in place, has that can be told apart.
export { type Cases, cases } from "./cases.js";
// What a rule's or a child's condition compares.
export { subjects } from "./condition.js";
// What a tree of types is in place, and how its records are derived.
export { fieldValue } from "./derive.js";
// Diagnostics in stored data, by JSON path.
export { Diagnostics } from "./diagnostic.js";
export {
  type InPlace,
  inPlace,
  type Placement,
  type Presence,
  placement,
  states,
} from "./evaluate.js";
// The JSON reader stored data is read with.
export { parseJson } from "./json.js";
export { Names } from "./names.js";
export { parse } from "./parse.js";
export { environmentOf, profilesOf } from "./profiles.js";
// Records stored as JSON beside a .dxn file.
export { isValue, renameInData, renameInSource } from "./rename.js";
export { type Check, type Combination, coverage, treePaths } from "./status.js";
export { folderOf, storedFiles } from "./store.js";
export { validate } from "./validate.js";
