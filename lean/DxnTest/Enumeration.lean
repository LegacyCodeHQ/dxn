import Dxn.Enumeration

namespace DxnTest.Enumeration

open Dxn

def light : EnumDecl := ⟨"Light", ["off", "on"]⟩

-- Distinct names are accepted.
#guard check light = none

-- No names: no empty enumeration.
#guard check ⟨"Light", []⟩ = some .empty

-- A name written twice is rejected, and the error names it.
#guard check ⟨"Light", ["on", "off", "on"]⟩ = some (.duplicate "on")

-- The checker accepts exactly the valid declarations.
example (d : EnumDecl) : check d = none ↔ Valid d := check_eq_none_iff d

def lightEnum : Enum := ⟨light, by decide⟩

-- One element per name.
example : card lightEnum.Value = 2 := rfl

-- Every accepted declaration has as many elements as names.
example (e : Enum) : card e.Value = e.decl.values.length := Enum.card_value e

-- Order means nothing: the same names in another order declare the same enumeration.
example : Same light ⟨"Light", ["on", "off"]⟩ := same_of_perm rfl (by decide)

-- Reordering keeps a declaration valid.
example (d e : EnumDecl) (h : d.values.Perm e.values) : Valid d → Valid e := valid_of_perm h

-- Enumerations with different names are different, even with the same values.
example : ¬ Same light ⟨"Power", ["off", "on"]⟩ := fun h => absurd h.1 (by decide)

end DxnTest.Enumeration
