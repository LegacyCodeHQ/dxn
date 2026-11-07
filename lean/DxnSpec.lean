import Lean.Data.Json
import Dxn

/-!
# The specification as a program

Reads files of enumeration declarations as JSON and writes what the
specification says about each, so an implementation can be compared with it.
The input is a file holding an array of cases, each a file's declarations and,
optionally, an enumeration to rename in it:

    [{"declarations": [{"name": "Light", "values": ["off", "on"]}],
      "rename": {"from": "Light", "to": "Lamp"}}]

The output, on stdout, is one result per case, in the same order: the file's
problems, as `File.check` reports them, its values when it is accepted, and,
for a rename, every reason it is refused or the renamed declarations:

    [{"problems": [], "values": [{"enum": "Light", "name": "off"}, ...],
      "rename": {"refusals": [], "declarations": [{"name": "Lamp", ...}]}}]
-/

open Lean Dxn

def problemJson (error : EnumError) : Json :=
  match error with
  | .badEnumName name => Json.mkObj [("rule", error.ruleId), ("kind", "badEnumName"), ("name", name)]
  | .empty => Json.mkObj [("rule", error.ruleId), ("kind", "empty")]
  | .badValueName value => Json.mkObj [("rule", error.ruleId), ("kind", "badValueName"), ("name", value)]
  | .duplicate value => Json.mkObj [("rule", error.ruleId), ("kind", "duplicate"), ("name", value)]

def valueJson (value : Value) : Json :=
  Json.mkObj [("enum", value.enum), ("name", value.name)]

def fileProblemJson (problem : FileError) : Json :=
  match problem with
  | .enum name error => Json.mkObj [("rule", problem.ruleId), ("kind", "enum"), ("name", name), ("problem", problemJson error)]
  | .duplicateEnum name => Json.mkObj [("rule", problem.ruleId), ("kind", "duplicateEnum"), ("name", name)]

def renameErrorJson (error : RenameError) : Json :=
  match error with
  | .fileHasProblems => Json.mkObj [("rule", error.ruleId), ("kind", "fileHasProblems")]
  | .badEnumName name => Json.mkObj [("rule", error.ruleId), ("kind", "badEnumName"), ("name", name)]
  | .noSuchEnum name => Json.mkObj [("rule", error.ruleId), ("kind", "noSuchEnum"), ("name", name)]
  | .enumExists name => Json.mkObj [("rule", error.ruleId), ("kind", "enumExists"), ("name", name)]

def declJson (d : EnumDecl) : Json :=
  Json.mkObj [("name", d.name), ("values", Json.arr (d.values.map Json.str).toArray)]

/-- What the specification says about a rename: why it is refused, or what it gives. -/
def renameJson (f : File) (old new : Dxn.Name) : Json :=
  match renameEnum f old new with
  | .ok g =>
    Json.mkObj [("refusals", Json.arr #[]), ("declarations", Json.arr (g.decls.map declJson).toArray)]
  | .error errors =>
    Json.mkObj [("refusals", Json.arr (errors.map renameErrorJson).toArray), ("declarations", Json.null)]

/-- What the specification says about a file, and a rename in it. Values come only from an
accepted file. -/
def resultJson (f : File) (rename : Option (Dxn.Name × Dxn.Name)) : Json :=
  let problems := f.check
  let values := if problems = [] then Json.arr (f.values.map valueJson).toArray else Json.null
  let fields := [("problems", Json.arr (problems.map fileProblemJson).toArray), ("values", values)]
  Json.mkObj (match rename with
    | some (old, new) => fields ++ [("rename", renameJson f old new)]
    | none => fields)

def declOfJson (json : Json) : Except String EnumDecl := do
  let name ← json.getObjValAs? String "name"
  let values ← json.getObjValAs? (Array String) "values"
  return ⟨name, values.toList⟩

def main (args : List String) : IO UInt32 := do
  let [path] := args
    | IO.eprintln "usage: dxn-spec <declarations.json>"; return 2
  let input ← IO.FS.readFile path
  let caseOfJson (json : Json) : Except String (File × Option (Dxn.Name × Dxn.Name)) := do
    let decls ← json.getObjVal? "declarations" >>= (·.getArr?) >>= (·.mapM declOfJson)
    let rename ← match json.getObjVal? "rename" with
    | .ok r => do
        let old ← r.getObjValAs? String "from"
        let new ← r.getObjValAs? String "to"
        pure (some (old, new))
    | .error _ => pure none
    return (⟨decls.toList⟩, rename)
  match Json.parse input >>= fun json => json.getArr? >>= (·.mapM caseOfJson) with
  | .error message =>
    IO.eprintln s!"dxn-spec: {path}: {message}"
    return 2
  | .ok cases =>
    IO.println (Json.arr (cases.map fun (f, rename) => resultJson f rename)).compress
    return 0
