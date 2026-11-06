import Dxn.Name

namespace DxnTest.Name

open Dxn

-- An enumeration name is a capital letter, then letters and digits.
#guard ["Light", "UIState", "HOVER", "Light2", "L"].all isEnumName
#guard !(["light", "2Light", "Li-ght", "Li_ght", "", "Lïght", "Éclair"].any isEnumName)

-- A value name is lowercase letters and digits, with single hyphens only between them.
#guard ["off", "no-keyboard", "19px", "2", "700", "a-1"].all isValueName
#guard !(["Off", "a-", "-a", "a--b", "-", "", "no_keyboard", "ön"].any isValueName)

-- The rules, as their plain descriptions, hold for every name.
example (n : Name) : isEnumName n = true ↔
    ∃ c cs, n.toList = c :: cs ∧ c.isUpper ∧ ∀ c ∈ cs, c.isAlpha ∨ c.isDigit :=
  isEnumName_iff n

example (n : Name) : isValueName n = true ↔
    n.toList ≠ [] ∧
    (∀ c ∈ n.toList, c.isLower ∨ c.isDigit ∨ c = '-') ∧
    n.toList.head? ≠ some '-' ∧
    n.toList.getLast? ≠ some '-' ∧
    ∀ p ∈ n.toList.zip n.toList.tail, ¬(p.1 = '-' ∧ p.2 = '-') :=
  isValueName_iff n

-- Names are ASCII.
example (n : Name) (h : isEnumName n) : ∀ c ∈ n.toList, c.toNat < 128 := ascii_of_isEnumName h
example (n : Name) (h : isValueName n) : ∀ c ∈ n.toList, c.toNat < 128 :=
  ascii_of_isValueName h

end DxnTest.Name
