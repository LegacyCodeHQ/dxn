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

-- A file's values, in written order, each tagged with its enumeration.
#guard file.values =
  [⟨"Light", "off"⟩, ⟨"Light", "on"⟩, ⟨"Power", "off"⟩, ⟨"Power", "on"⟩]

-- In a valid file, no two enumerations share a value.
example (f : File) (h : f.Valid) : f.values.Nodup := File.nodup_values h

end DxnTest.File
