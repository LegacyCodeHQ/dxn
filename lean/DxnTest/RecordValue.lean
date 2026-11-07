import Dxn.RecordValue

namespace DxnTest.RecordValue

open Dxn

def review : File :=
  ⟨[.enum ⟨"Verdict", ["approved", "changes"]⟩, .enum ⟨"Severity", ["minor", "major"]⟩,
    .enum ⟨"Area", ["layout", "colour"]⟩,
    .record ⟨"Finding", [("severity", "Severity"), ("area", "Area")], []⟩,
    .record ⟨"Review", [("verdict", "Verdict"), ("finding", "Finding")], []⟩]⟩

def approvedMajorColour : FieldValue :=
  .record [("verdict", .enum ⟨"Verdict", "approved"⟩),
    ("finding", .record [("severity", .enum ⟨"Severity", "major"⟩),
      ("area", .enum ⟨"Area", "colour"⟩)])]

-- A record's values: every way to give each field a value, nested records included.
#guard (review.recordValues "Finding").length = 4
#guard (review.recordValues "Review").length = 8
#guard approvedMajorColour ∈ review.recordValues "Review"

-- A field is read by its name.
#guard approvedMajorColour.get "verdict" = some (.enum ⟨"Verdict", "approved"⟩)
#guard (approvedMajorColour.get "finding").bind (·.get "area") = some (.enum ⟨"Area", "colour"⟩)
#guard approvedMajorColour.get "urgent" = none

-- Two values that differ in one field, however deep, are different.
#guard approvedMajorColour ≠
  .record [("verdict", .enum ⟨"Verdict", "approved"⟩),
    ("finding", .record [("severity", .enum ⟨"Severity", "minor"⟩),
      ("area", .enum ⟨"Area", "colour"⟩)])]

-- No value of a record is listed twice.
#guard (review.recordValues "Review").Nodup

def design : File :=
  ⟨[.enum ⟨"Fidelity", ["sketch", "final"]⟩, .enum ⟨"Verdict", ["approved", "changes"]⟩,
    .record ⟨"Design", [("fidelity", "Fidelity")], [[("verdict", "Verdict"), ("snapshot", "Design")]]⟩]⟩

-- A record's values are its own fields' only: a check is not part of them.
#guard design.check = []
#guard design.recordValues "Design" =
  [.record [("fidelity", .enum ⟨"Fidelity", "sketch"⟩)], .record [("fidelity", .enum ⟨"Fidelity", "final"⟩)]]

-- A check's values: every way to give each field of its block a value, by name.
#guard (design.checkValues [("verdict", "Verdict"), ("snapshot", "Design")]).length = 4
#guard .record [("verdict", .enum ⟨"Verdict", "changes"⟩),
    ("snapshot", .record [("fidelity", .enum ⟨"Fidelity", "final"⟩)])] ∈
  design.checkValues [("verdict", "Verdict"), ("snapshot", "Design")]

-- An empty `check` block has one value: the empty record.
#guard design.checkValues [] = [.record []]
example (f : File) : f.checkValues [] = [.record []] := File.checkValues_nil f

-- The number of a check's values is the product of its fields' numbers of values.
example (f : File) (block : List (Name × Name)) :
    (f.checkValues block).length =
      (block.map fun field => (f.recordValues field.2).length).foldr (· * ·) 1 :=
  File.length_checkValues f block

-- The number of a record's values is the product of its fields' numbers of values.
example (f : File) (k : Nat) (r : RecordDecl) (hr : f.records.find? (·.name == r.name) = some r) :
    (f.valuesWithin (k + 1) r.name).length =
      (r.fieldTypes.map fun t => (f.valuesWithin k t).length).foldr (· * ·) 1 :=
  File.length_valuesWithin_record hr

-- Two values of a record are equal exactly when every field is.
example (keys : List Name) (hk : keys.Nodup) (vs ws : List FieldValue)
    (hv : vs.length = keys.length) (hw : ws.length = keys.length) :
    FieldValue.record (keys.zip vs) = .record (keys.zip ws) ↔
      ∀ key ∈ keys, (FieldValue.record (keys.zip vs)).get key =
        (FieldValue.record (keys.zip ws)).get key :=
  FieldValue.record_eq_iff_get hk hv hw

end DxnTest.RecordValue
