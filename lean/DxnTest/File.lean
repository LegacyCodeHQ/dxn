import Dxn.File

namespace DxnTest.File

open Dxn

def file : File := ⟨[⟨"Light", ["off", "on"]⟩, ⟨"Power", ["off", "on"]⟩]⟩

-- Enumerations with different names: no problems.
#guard file.check = []

-- A file with no enumerations has no problems.
#guard (⟨[]⟩ : File).check = []

-- Two enumerations with the same name are a problem, reported once.
#guard (⟨[⟨"Light", ["off", "on"]⟩, ⟨"Light", ["dim"]⟩]⟩ : File).check = [.duplicateEnum "Light"]

-- Each enumeration's own problems come first, in written order, then names written twice.
#guard (⟨[⟨"light", []⟩, ⟨"Power", ["on", "on"]⟩, ⟨"light", ["dim"]⟩]⟩ : File).check =
  [.enum "light" (.badEnumName "light"), .enum "light" .empty, .enum "Power" (.duplicate "on"),
    .enum "light" (.badEnumName "light"), .duplicateEnum "light"]

-- The checker accepts exactly the valid files.
example (f : File) : f.check = [] ↔ f.Valid := File.check_eq_nil_iff f

-- It reports a name written twice exactly when it is.
example (f : File) (n : Name) : .duplicateEnum n ∈ f.check ↔ 2 ≤ f.names.count n :=
  File.duplicateEnum_mem_check f n

-- It reports an enumeration's problem exactly when that enumeration has it.
example (f : File) (n : Name) (e : EnumError) :
    .enum n e ∈ f.check ↔ ∃ d ∈ f.decls, d.name = n ∧ e ∈ check d :=
  File.enum_mem_check f n e

-- An enumeration's own problems come before every name written twice.
example (f : File) : f.check.Pairwise (fun a b => a.rank ≤ b.rank) := File.check_sorted f

-- The enumerations' own problems are each declaration's, in the order the declarations are written.
example (f : File) :
    enumProblemsOf f.check = f.decls.flatMap (fun d => (check d).map (.enum d.name)) :=
  File.enumProblemsOf_check f

-- Names written twice come in the order they are first written.
example (f : File) : List.Sublist (duplicateEnumsOf f.check) f.names.eraseDups :=
  File.duplicateEnumsOf_check_sublist f

-- A file's values, in written order, each tagged with its enumeration.
#guard file.values =
  [⟨"Light", "off"⟩, ⟨"Light", "on"⟩, ⟨"Power", "off"⟩, ⟨"Power", "on"⟩]

-- In a valid file, no two enumerations share a value.
example (f : File) (h : f.Valid) : f.values.Nodup := File.nodup_values h

#guard (FileError.enum "Light" (.badValueName "Off")).ruleId = "E3"
#guard (FileError.duplicateEnum "Light").ruleId = "F1"

end DxnTest.File
