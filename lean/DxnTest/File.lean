import Dxn.File

namespace DxnTest.File

open Dxn

def file : File := ⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Power", ["off", "on"]⟩]⟩

-- Declarations with different names: no problems.
#guard file.check = []

-- A file with no declarations has no problems.
#guard (⟨[]⟩ : File).check = []

-- Two enumerations with the same name are a problem, reported once.
#guard (⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Light", ["dim"]⟩]⟩ : File).check =
  [.duplicateName "Light"]

-- F1 covers every kind of declaration: an enumeration and a type may not share a name.
#guard (⟨[.enum ⟨"Button", ["primary"]⟩, .type ⟨"Button", ["Button"]⟩]⟩ : File).check =
  [.duplicateName "Button"]

-- Each declaration's own problems come first, in written order, then names written twice.
#guard (⟨[.enum ⟨"light", []⟩, .type ⟨"button", ["Size"]⟩, .enum ⟨"Power", ["on", "on"]⟩,
    .enum ⟨"light", ["dim"]⟩]⟩ : File).check =
  [.enum "light" (.badEnumName "light"), .enum "light" .empty,
    .type "button" (.badTypeName "button"), .type "button" (.noSuchEnum "Size"),
    .enum "Power" (.duplicate "on"), .enum "light" (.badEnumName "light"),
    .duplicateName "light"]

-- A type may vary over an enumeration declared after it.
#guard (⟨[.type ⟨"Button", ["Kind"]⟩, .enum ⟨"Kind", ["primary"]⟩]⟩ : File).check = []

-- A type varies over enumerations only: a type's name breaks T2.
#guard (⟨[.type ⟨"Button", []⟩, .type ⟨"Menu", ["Button"]⟩]⟩ : File).check =
  [.type "Menu" (.noSuchEnum "Button")]

-- The checker accepts exactly the valid files.
example (f : File) : f.check = [] ↔ f.Valid := File.check_eq_nil_iff f

-- It reports a name written twice exactly when it is.
example (f : File) (n : Name) : .duplicateName n ∈ f.check ↔ 2 ≤ f.names.count n :=
  File.duplicateName_mem_check f n

-- It reports an enumeration's problem exactly when that enumeration has it.
example (f : File) (n : Name) (e : EnumError) :
    .enum n e ∈ f.check ↔ ∃ d ∈ f.enums, d.name = n ∧ e ∈ check d :=
  File.enum_mem_check f n e

-- It reports a type's problem exactly when that type has it.
example (f : File) (n : Name) (e : TypeError) :
    .type n e ∈ f.check ↔ ∃ t ∈ f.types, t.name = n ∧ e ∈ checkType f.enumNames t :=
  File.type_mem_check f n e

-- Each declaration's own problems come before every name written twice.
example (f : File) : f.check.Pairwise (fun a b => a.rank ≤ b.rank) := File.check_sorted f

-- The declarations' own problems are each declaration's, in the order they are written.
example (f : File) :
    declProblemsOf f.check = f.decls.flatMap (Decl.check f) :=
  File.declProblemsOf_check f

-- Names written twice come in the order they are first written.
example (f : File) : List.Sublist (duplicateNamesOf f.check) f.names.eraseDups :=
  File.duplicateNamesOf_check_sublist f

-- A file's values, in written order, each tagged with its enumeration.
#guard file.values =
  [⟨"Light", "off"⟩, ⟨"Light", "on"⟩, ⟨"Power", "off"⟩, ⟨"Power", "on"⟩]

-- In a valid file, no two enumerations share a value.
example (f : File) (h : f.Valid) : f.values.Nodup := File.nodup_values h

def button : File :=
  ⟨[.enum ⟨"Kind", ["primary", "secondary"]⟩, .enum ⟨"State", ["normal", "disabled"]⟩,
    .type ⟨"Button", ["Kind", "State"]⟩, .type ⟨"Logo", []⟩]⟩

#guard button.check = []

-- A type's combinations, in written order, the first enumeration changing slowest.
#guard button.combinations ⟨"Button", ["Kind", "State"]⟩ =
  [[⟨"Kind", "primary"⟩, ⟨"State", "normal"⟩], [⟨"Kind", "primary"⟩, ⟨"State", "disabled"⟩],
    [⟨"Kind", "secondary"⟩, ⟨"State", "normal"⟩],
    [⟨"Kind", "secondary"⟩, ⟨"State", "disabled"⟩]]

-- A type that varies over nothing has one combination.
#guard button.combinations ⟨"Logo", []⟩ = [[]]

-- The number of combinations is the product of the enumerations' sizes.
example (f : File) (t : TypeDecl) :
    (f.combinations t).length = (t.varies.map fun n => (f.enumValues n).length).foldr (· * ·) 1 :=
  File.length_combinations f t

-- In a valid file, no combination is listed twice.
example (f : File) (t : TypeDecl) (h : f.Valid) : (f.combinations t).Nodup :=
  File.nodup_combinations t h

def review : File :=
  ⟨[.enum ⟨"Verdict", ["approved", "changes"]⟩, .enum ⟨"Severity", ["minor", "major"]⟩,
    .enum ⟨"Area", ["layout", "colour"]⟩,
    .record ⟨"Finding", [("severity", "Severity"), ("area", "Area")], []⟩,
    .record ⟨"Review", [("verdict", "Verdict"), ("finding", "Finding")], []⟩]⟩

-- Records whose fields are the file's enumerations and records: no problems.
#guard review.check = []

-- A record may name a record or enumeration declared after it.
#guard (⟨[.record ⟨"Review", [("verdict", "Verdict")], []⟩, .enum ⟨"Verdict", ["approved"]⟩]⟩ :
  File).check = []

-- R6: a record may not contain itself.
#guard (⟨[.enum ⟨"Verdict", ["approved"]⟩,
    .record ⟨"Review", [("verdict", "Verdict"), ("reply", "Review")], []⟩]⟩ : File).check =
  [.record "Review" .containsItself]

-- R6: nor through other records; each record on the cycle is reported.
#guard (⟨[.record ⟨"Note", [("review", "Review")], []⟩, .record ⟨"Review", [("note", "Note")], []⟩]⟩ :
  File).check = [.record "Note" .containsItself, .record "Review" .containsItself]

-- R6 does not follow check fields: a check may hold a value of the record it checks.
#guard (⟨[.enum ⟨"Fidelity", ["sketch", "final"]⟩,
    .record ⟨"Design", [("fidelity", "Fidelity")], [[("snapshot", "Design")]]⟩]⟩ : File).check = []

-- A record's problems in a file: R1 to R5, C1 to C4, then R6.
#guard (⟨[.record ⟨"Review", [("reply", "Review")], [[], []]⟩]⟩ : File).check =
  [.record "Review" .duplicateCheck, .record "Review" .containsItself]

-- C4: a check field's type is an enumeration or a record, never a type.
#guard (⟨[.enum ⟨"Fidelity", ["final"]⟩, .type ⟨"Button", []⟩,
    .record ⟨"Design", [("fidelity", "Fidelity")], [[("of", "Button")]]⟩]⟩ : File).check =
  [.record "Design" (.noSuchCheckFieldType "Button")]

-- R5: a field's type is an enumeration or a record, never a type.
#guard (⟨[.type ⟨"Button", []⟩, .record ⟨"Shot", [("of", "Button")], []⟩]⟩ : File).check =
  [.record "Shot" (.noSuchFieldType "Button")]

-- F1 covers records too.
#guard (⟨[.enum ⟨"Verdict", ["approved"]⟩, .enum ⟨"Urgency", ["low"]⟩,
    .record ⟨"Verdict", [("urgent", "Urgency")], []⟩]⟩ : File).check = [.duplicateName "Verdict"]

-- It reports a record's problem exactly when that record has it.
example (f : File) (n : Name) (e : RecordError) :
    .record n e ∈ f.check ↔ ∃ r ∈ f.records, r.name = n ∧ e ∈ f.checkRecordIn r :=
  File.record_mem_check f n e

#guard (FileError.record "Review" .containsItself).ruleId = "R6"
#guard (FileError.enum "Light" (.badValueName "Off")).ruleId = "E3"
#guard (FileError.type "Button" (.noSuchEnum "Size")).ruleId = "T2"
#guard (FileError.duplicateName "Light").ruleId = "F1"

end DxnTest.File
