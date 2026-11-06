import Lean.Data.Json
import Dxn

/-!
# The specification as a program

Reads files of enumeration declarations as JSON and writes what the
specification says about each, so an implementation can be compared with it.
The input is a file holding an array of files, each an array of declarations:

    [[{"name": "Light", "values": ["off", "on"]}, {"name": "Power", "values": ["on"]}]]

The output, on stdout, is one result per file, in the same order: its
problems, as `File.check` reports them, and its values when it is accepted:

    [{"problems": [], "values": [{"enum": "Light", "name": "off"}, ...]}]
-/

open Lean Dxn

def problemJson : EnumError → Json
  | .badEnumName name => Json.mkObj [("kind", "badEnumName"), ("name", name)]
  | .empty => Json.mkObj [("kind", "empty")]
  | .badValueName value => Json.mkObj [("kind", "badValueName"), ("name", value)]
  | .duplicate value => Json.mkObj [("kind", "duplicate"), ("name", value)]

def valueJson (value : Value) : Json :=
  Json.mkObj [("enum", value.enum), ("name", value.name)]

def fileProblemJson : FileError → Json
  | .enum name error => Json.mkObj [("kind", "enum"), ("name", name), ("problem", problemJson error)]
  | .duplicateEnum name => Json.mkObj [("kind", "duplicateEnum"), ("name", name)]

/-- What the specification says about a file. Values come only from an accepted one. -/
def resultJson (f : File) : Json :=
  let problems := f.check
  let values := if problems = [] then Json.arr (f.values.map valueJson).toArray else Json.null
  Json.mkObj [("problems", Json.arr (problems.map fileProblemJson).toArray), ("values", values)]

def declOfJson (json : Json) : Except String EnumDecl := do
  let name ← json.getObjValAs? String "name"
  let values ← json.getObjValAs? (Array String) "values"
  return ⟨name, values.toList⟩

def main (args : List String) : IO UInt32 := do
  let [path] := args
    | IO.eprintln "usage: dxn-spec <declarations.json>"; return 2
  let input ← IO.FS.readFile path
  let fileOfJson (json : Json) : Except String File := do
    let decls ← json.getArr? >>= (·.mapM declOfJson)
    return ⟨decls.toList⟩
  match Json.parse input >>= fun json => json.getArr? >>= (·.mapM fileOfJson) with
  | .error message =>
    IO.eprintln s!"dxn-spec: {path}: {message}"
    return 2
  | .ok files =>
    IO.println (Json.arr (files.map resultJson)).compress
    return 0
