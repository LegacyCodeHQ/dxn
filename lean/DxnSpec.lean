import Lean.Data.Json
import Dxn

/-!
# The specification as a program

Reads files of declarations as JSON and writes what the specification says
about each, so an implementation can be compared with it. The input is a file
holding an array of cases, each a file's declarations and, optionally, a
declaration to rename in it. A declaration is an enumeration, a type when its
`kind` is `type`, or a record when its `kind` is `record`, with fields such as
`{"name": "verdict", "type": "Verdict"}`:

    [{"declarations": [{"name": "Light", "values": ["off", "on"]},
                       {"kind": "type", "name": "Lamp", "varies": ["Light"]}],
      "rename": {"from": "Light", "to": "Glow"}}]

The output, on stdout, is one result per case, in the same order: the file's
problems, as `File.check` reports them; when it is accepted, its values and
each type's combinations; and, for a rename, every reason it is refused or the
renamed declarations:

    [{"problems": [], "values": [{"enum": "Light", "name": "off"}, ...],
      "combinations": [{"type": "Lamp", "combinations": [[{"enum": "Light", ...}], ...]}],
      "rename": {"refusals": [], "declarations": [{"name": "Glow", ...}, ...]}}]
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

def typeProblemJson (error : TypeError) : Json :=
  match error with
  | .badTypeName name => Json.mkObj [("rule", error.ruleId), ("kind", "badTypeName"), ("name", name)]
  | .noSuchEnum name => Json.mkObj [("rule", error.ruleId), ("kind", "noSuchEnum"), ("name", name)]
  | .duplicateVaries name =>
    Json.mkObj [("rule", error.ruleId), ("kind", "duplicateVaries"), ("name", name)]

def recordProblemJson (error : RecordError) : Json :=
  let named (kind name : String) := Json.mkObj [("rule", error.ruleId), ("kind", kind), ("name", name)]
  match error with
  | .badRecordName name => named "badRecordName" name
  | .noFields => Json.mkObj [("rule", error.ruleId), ("kind", "noFields")]
  | .badFieldName name => named "badFieldName" name
  | .duplicateField name => named "duplicateField" name
  | .noSuchFieldType name => named "noSuchFieldType" name
  | .containsItself => Json.mkObj [("rule", error.ruleId), ("kind", "containsItself")]

def fileProblemJson (problem : FileError) : Json :=
  match problem with
  | .enum name error =>
    Json.mkObj [("rule", problem.ruleId), ("kind", "enum"), ("name", name), ("problem", problemJson error)]
  | .type name error =>
    Json.mkObj [("rule", problem.ruleId), ("kind", "type"), ("name", name),
      ("problem", typeProblemJson error)]
  | .record name error =>
    Json.mkObj [("rule", problem.ruleId), ("kind", "record"), ("name", name),
      ("problem", recordProblemJson error)]
  | .duplicateName name => Json.mkObj [("rule", problem.ruleId), ("kind", "duplicateName"), ("name", name)]

def renameErrorJson (error : RenameError) : Json :=
  match error with
  | .fileHasProblems => Json.mkObj [("rule", error.ruleId), ("kind", "fileHasProblems")]
  | .badName name => Json.mkObj [("rule", error.ruleId), ("kind", "badName"), ("name", name)]
  | .noSuchName name => Json.mkObj [("rule", error.ruleId), ("kind", "noSuchName"), ("name", name)]
  | .nameExists name => Json.mkObj [("rule", error.ruleId), ("kind", "nameExists"), ("name", name)]

def declJson : Decl → Json
  | .enum d => Json.mkObj [("name", d.name), ("values", Json.arr (d.values.map Json.str).toArray)]
  | .type t =>
    Json.mkObj [("kind", "type"), ("name", t.name), ("varies", Json.arr (t.varies.map Json.str).toArray)]
  | .record r =>
    Json.mkObj [("kind", "record"), ("name", r.name),
      ("fields", Json.arr (r.fields.map fun (n, t) => Json.mkObj [("name", n), ("type", t)]).toArray)]

def combinationsJson (f : File) (t : TypeDecl) : Json :=
  Json.mkObj [("type", t.name),
    ("combinations", Json.arr ((f.combinations t).map fun c => Json.arr (c.map valueJson).toArray).toArray)]

/-- What the specification says about a rename: why it is refused, or what it gives. -/
def renameJson (f : File) (old new : Dxn.Name) : Json :=
  match renameDecl f old new with
  | .ok g =>
    Json.mkObj [("refusals", Json.arr #[]), ("declarations", Json.arr (g.decls.map declJson).toArray)]
  | .error errors =>
    Json.mkObj [("refusals", Json.arr (errors.map renameErrorJson).toArray), ("declarations", Json.null)]

/-- What the specification says about a file, and a rename in it. Values come only from an
accepted file. -/
def resultJson (f : File) (rename : Option (Dxn.Name × Dxn.Name)) : Json :=
  let problems := f.check
  let values := if problems = [] then Json.arr (f.values.map valueJson).toArray else Json.null
  let combinations :=
    if problems = [] then Json.arr (f.types.map (combinationsJson f)).toArray else Json.null
  let fields := [("problems", Json.arr (problems.map fileProblemJson).toArray), ("values", values),
    ("combinations", combinations)]
  Json.mkObj (match rename with
    | some (old, new) => fields ++ [("rename", renameJson f old new)]
    | none => fields)

def declOfJson (json : Json) : Except String Decl := do
  let name ← json.getObjValAs? String "name"
  match json.getObjValAs? String "kind" with
  | .ok "type" =>
    let varies ← json.getObjValAs? (Array String) "varies"
    return .type ⟨name, varies.toList⟩
  | .ok "record" =>
    let fields ← json.getObjVal? "fields" >>= (·.getArr?) >>= (·.mapM fun field => do
      return ((← field.getObjValAs? String "name"), (← field.getObjValAs? String "type")))
    return .record ⟨name, fields.toList⟩
  | _ =>
    let values ← json.getObjValAs? (Array String) "values"
    return .enum ⟨name, values.toList⟩

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
