import Dxn.Enumeration

namespace DxnTest.Enumeration

open Dxn

def light : EnumDecl := ⟨"Light", ["off", "on"]⟩

-- Distinct names are accepted: no problems.
#guard check light = []

-- No names: no empty enumeration.
#guard check ⟨"Light", []⟩ = [.empty]

-- A name written twice is rejected, and the error names it.
#guard check ⟨"Light", ["on", "off", "on"]⟩ = [.duplicate "on"]

-- Every repeated name is reported, each once, in the order it first appears.
#guard check ⟨"Light", ["on", "off", "on", "dim", "off", "on"]⟩ =
  [.duplicate "on", .duplicate "off"]

-- The checker accepts exactly the valid declarations.
example (d : EnumDecl) : check d = [] ↔ Valid d := check_eq_nil_iff d

-- It reports a duplicate exactly for each name written more than once.
example (d : EnumDecl) (v : Name) : .duplicate v ∈ check d ↔ 2 ≤ d.values.count v :=
  duplicate_mem_check d v

-- It reports an empty declaration exactly when there are no names.
example (d : EnumDecl) : .empty ∈ check d ↔ d.values = [] := empty_mem_check d

-- It reports no problem twice.
example (d : EnumDecl) : (check d).Nodup := nodup_check d

def lightEnum : Enum := ⟨light, by decide⟩

def powerEnum : Enum := ⟨⟨"Power", ["off", "on"]⟩, by decide⟩

-- Each value is tagged with its enumeration's name.
#guard lightEnum.values = [⟨"Light", "off"⟩, ⟨"Light", "on"⟩]

-- Light's off is not Power's off.
example : (⟨"Light", "off"⟩ : Value) ≠ ⟨"Power", "off"⟩ := by decide

-- Light and Power share no value, though they have the same names.
#guard lightEnum.values.all fun v => !powerEnum.values.contains v

-- Enumerations with different names share no value.
example (e f : Enum) (h : e.decl.name ≠ f.decl.name) (v : Value) :
    v ∈ e.values → v ∉ f.values :=
  Enum.values_disjoint h v

-- One element per name.
example : card lightEnum.Elem = 2 := rfl

-- Every accepted declaration has as many elements as names.
example (e : Enum) : card e.Elem = e.decl.values.length := Enum.card_elem e

-- Order means nothing: the same names in another order declare the same enumeration.
example : Same light ⟨"Light", ["on", "off"]⟩ := same_of_perm rfl (by decide)

-- Reordering keeps a declaration valid.
example (d e : EnumDecl) (h : d.values.Perm e.values) : Valid d → Valid e := valid_of_perm h

-- Enumerations with different names are different, even with the same values.
example : ¬ Same light ⟨"Power", ["off", "on"]⟩ := fun h => absurd h.1 (by decide)

end DxnTest.Enumeration
