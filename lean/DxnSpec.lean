import Lean.Data.Json
import Dxn

/-!
# The specification as a program

Reads enumeration declarations as JSON and writes what the specification says
about each, so an implementation can be compared with it. The input is a file
holding an array of declarations:

    [{"name": "Light", "values": ["off", "on"]}]

The output, on stdout, is one result per declaration, in the same order: its
problems, as `check` reports them, and its values when it is accepted:

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

/-- What the specification says about a declaration. Values come only from an accepted one. -/
def resultJson (d : EnumDecl) : Json :=
  let values :=
    if h : check d = [] then
      let e : Enum := ⟨d, (check_eq_nil_iff d).mp h⟩
      Json.arr (e.values.map valueJson).toArray
    else Json.null
  Json.mkObj [("problems", Json.arr ((check d).map problemJson).toArray), ("values", values)]

def declOfJson (json : Json) : Except String EnumDecl := do
  let name ← json.getObjValAs? String "name"
  let values ← json.getObjValAs? (Array String) "values"
  return ⟨name, values.toList⟩

def main (args : List String) : IO UInt32 := do
  let [path] := args
    | IO.eprintln "usage: dxn-spec <declarations.json>"; return 2
  let input ← IO.FS.readFile path
  match Json.parse input >>= fun json => json.getArr? >>= (·.mapM declOfJson) with
  | .error message =>
    IO.eprintln s!"dxn-spec: {path}: {message}"
    return 2
  | .ok decls =>
    IO.println (Json.arr (decls.map resultJson)).compress
    return 0
