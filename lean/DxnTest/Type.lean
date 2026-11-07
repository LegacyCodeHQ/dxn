import Dxn.Type

namespace DxnTest.Type

open Dxn

def enums : List Name := ["Kind", "State"]

-- A type varying over enumerations the file has: no problems.
#guard checkType enums ⟨"Button", ["Kind", "State"]⟩ = []

-- A type that varies over nothing is allowed.
#guard checkType enums ⟨"Logo", []⟩ = []

-- T1: the type name follows the naming rules.
#guard checkType enums ⟨"button", ["Kind"]⟩ = [.badTypeName "button"]

-- T2: every listed enumeration exists, each reported once.
#guard checkType enums ⟨"Button", ["Size", "Kind", "Size"]⟩ =
  [.noSuchEnum "Size", .duplicateVaries "Size"]

-- T3: no enumeration is listed twice.
#guard checkType enums ⟨"Button", ["Kind", "State", "Kind"]⟩ = [.duplicateVaries "Kind"]

-- Every problem at once, in the order of the rules.
#guard checkType enums ⟨"button", ["Size", "Kind", "Kind"]⟩ =
  [.badTypeName "button", .noSuchEnum "Size", .duplicateVaries "Kind"]

#guard [TypeError.badTypeName "b", .noSuchEnum "S", .duplicateVaries "K"].map TypeError.ruleId =
  ["T1", "T2", "T3"]

-- The checker accepts exactly the valid types.
example (es : List Name) (t : TypeDecl) : checkType es t = [] ↔ t.Valid es :=
  checkType_eq_nil_iff es t

-- Each problem is reported exactly when its rule is broken.
example (es : List Name) (t : TypeDecl) (n : Name) :
    .badTypeName n ∈ checkType es t ↔ n = t.name ∧ isEnumName t.name = false :=
  badTypeName_mem_checkType es t n
example (es : List Name) (t : TypeDecl) (n : Name) :
    .noSuchEnum n ∈ checkType es t ↔ n ∈ t.varies ∧ n ∉ es :=
  noSuchEnum_mem_checkType es t n
example (es : List Name) (t : TypeDecl) (n : Name) :
    .duplicateVaries n ∈ checkType es t ↔ 2 ≤ t.varies.count n :=
  duplicateVaries_mem_checkType es t n

-- Combinations in written order, the first factor changing slowest.
#guard product [["primary", "secondary"], ["normal", "disabled"]] =
  [["primary", "normal"], ["primary", "disabled"], ["secondary", "normal"],
    ["secondary", "disabled"]]

-- No factors: one combination, the empty one.
#guard product ([] : List (List Name)) = [[]]

-- A factor with nothing in it: no combinations.
#guard product [["primary"], ([] : List Name)] = []

-- The number of combinations is the product of the sizes.
example (l : List (List Name)) : (product l).length = (l.map List.length).foldr (· * ·) 1 :=
  length_product l

-- A factor with nothing in it leaves no combinations.
example (l : List (List Name)) (h : [] ∈ l) : product l = [] := product_eq_nil_of_nil_mem h

-- With no repeats in any factor, no combination is listed twice.
example (l : List (List Name)) (h : ∀ xs ∈ l, xs.Nodup) : (product l).Nodup := nodup_product h

end DxnTest.Type
