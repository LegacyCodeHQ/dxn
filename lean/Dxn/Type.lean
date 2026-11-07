import Dxn.Enumeration

/-!
# Types

A type is something that varies: it lists the enumerations it varies over, in
written order. The checker reports a type name that breaks the naming rules
(T1), each listed enumeration the file does not have (T2), and each
enumeration listed twice (T3).

A type's combinations are the Cartesian product of its enumerations' values:
one value of each, in written order, with the first enumeration changing
slowest. A type that varies over nothing has one combination.
-/

namespace Dxn

-- #region type
/-- A type as written: its name, and the enumerations it varies over, in written order. -/
structure TypeDecl where
  name : Name
  varies : List Name
  deriving Repr, DecidableEq
-- #endregion type

-- #region errors
/-- Why the checker rejects a type, in the order the checker reports them. -/
inductive TypeError where
  /-- The type's name breaks the naming rules. -/
  | badTypeName (name : Name)
  /-- No enumeration in the file has this name. -/
  | noSuchEnum (name : Name)
  /-- The enumeration is listed more than once. -/
  | duplicateVaries (name : Name)
  deriving Repr, DecidableEq

/-- The stable notebook rule ID belonging to this problem. -/
def TypeError.ruleId : TypeError → String
  | .badTypeName _ => "T1"
  | .noSuchEnum _ => "T2"
  | .duplicateVaries _ => "T3"
-- #endregion errors

-- #region check
/--
Check a type against the names of the file's enumerations: every problem with it, each once. A
bad type name comes first, then each missing enumeration and then each enumeration listed twice,
in the order they are first written.
-/
def checkType (enums : List Name) (t : TypeDecl) : List TypeError :=
  (if isEnumName t.name then [] else [.badTypeName t.name]) ++
  (t.varies.eraseDups.filter (fun n => n ∉ enums)).map .noSuchEnum ++
  (duplicates t.varies).map .duplicateVaries
-- #endregion check

-- #region valid
/-- A type is valid when its name follows the naming rules, and it lists only enumerations the
file has, none twice. -/
structure TypeDecl.Valid (enums : List Name) (t : TypeDecl) : Prop where
  name : isEnumName t.name
  known : ∀ n ∈ t.varies, n ∈ enums
  nodup : t.varies.Nodup
-- #endregion valid

theorem TypeDecl.valid_iff (enums : List Name) (t : TypeDecl) :
    t.Valid enums ↔ isEnumName t.name ∧ (∀ n ∈ t.varies, n ∈ enums) ∧ t.varies.Nodup :=
  ⟨fun ⟨a, b, c⟩ => ⟨a, b, c⟩, fun ⟨a, b, c⟩ => ⟨a, b, c⟩⟩

instance TypeDecl.decidableValid (enums : List Name) (t : TypeDecl) : Decidable (t.Valid enums) :=
  decidable_of_iff _ (TypeDecl.valid_iff enums t).symm

/-- The checker accepts exactly the valid types. -/
theorem checkType_eq_nil_iff (enums : List Name) (t : TypeDecl) :
    checkType enums t = [] ↔ t.Valid enums := by
  rw [TypeDecl.valid_iff, ← duplicates_eq_nil_iff]
  unfold checkType
  by_cases hn : isEnumName t.name <;>
    simp [hn, List.filter_eq_nil_iff, List.mem_eraseDups]

/-- T1 is reported exactly when the type name breaks the naming rules. -/
theorem badTypeName_mem_checkType (enums : List Name) (t : TypeDecl) (n : Name) :
    .badTypeName n ∈ checkType enums t ↔ n = t.name ∧ isEnumName t.name = false := by
  unfold checkType
  by_cases hn : isEnumName t.name
  · simp [hn]
  · simp only [hn, Bool.false_eq_true, ↓reduceIte, List.cons_append, List.mem_cons,
      TypeError.badTypeName.injEq, List.mem_append, List.mem_map, reduceCtorEq, and_false,
      exists_false, or_false, and_true]
    simp

/-- T2 is reported exactly for each listed name that is not an enumeration of the file. -/
theorem noSuchEnum_mem_checkType (enums : List Name) (t : TypeDecl) (n : Name) :
    .noSuchEnum n ∈ checkType enums t ↔ n ∈ t.varies ∧ n ∉ enums := by
  unfold checkType
  by_cases hn : isEnumName t.name <;> simp [hn, List.mem_filter, List.mem_eraseDups]

/-- T3 is reported exactly for each enumeration listed more than once. -/
theorem duplicateVaries_mem_checkType (enums : List Name) (t : TypeDecl) (n : Name) :
    .duplicateVaries n ∈ checkType enums t ↔ 2 ≤ t.varies.count n := by
  unfold checkType
  by_cases hn : isEnumName t.name <;> simp [hn, mem_duplicates]

/-! ## Combinations -/

-- #region product
/-- The Cartesian product of lists: every way to pick one element of each, in written order,
with the first list changing slowest. -/
def product {α : Type} : List (List α) → List (List α)
  | [] => [[]]
  | xs :: rest => xs.flatMap fun x => (product rest).map (x :: ·)
-- #endregion product

/-- The number of combinations is the product of the sizes. -/
theorem length_product {α : Type} (l : List (List α)) :
    (product l).length = (l.map List.length).foldr (· * ·) 1 := by
  induction l with
  | nil => rfl
  | cons xs rest ih =>
    simp only [product, List.length_flatMap, List.length_map, ih, List.map_cons, List.foldr_cons]
    induction xs with
    | nil => simp
    | cons _ _ ihx => simp [ihx, Nat.succ_mul, Nat.add_comm]

/-- A factor with nothing in it leaves no combinations. -/
theorem product_eq_nil_of_nil_mem {α : Type} {l : List (List α)} (h : [] ∈ l) :
    product l = [] := by
  induction l with
  | nil => cases h
  | cons xs rest ih =>
    rcases List.mem_cons.mp h with rfl | hr
    · rfl
    · simp [product, ih hr]

/-- With no repeats in any factor, no combination is listed twice. -/
theorem nodup_product {α : Type} {l : List (List α)} (h : ∀ xs ∈ l, xs.Nodup) :
    (product l).Nodup := by
  induction l with
  | nil => simp [product]
  | cons xs rest ih =>
    have hrest := ih fun ys hy => h ys (List.mem_cons_of_mem _ hy)
    unfold product List.Nodup
    rw [List.pairwise_flatMap]
    refine ⟨fun x _ => ?_, ?_⟩
    · exact hrest.map _ fun _ _ hne heq => hne (List.cons.inj heq).2
    · refine (h xs List.mem_cons_self).imp fun hxy a ha b hb heq => hxy ?_
      simp only [List.mem_map] at ha hb
      obtain ⟨_, _, rfl⟩ := ha
      obtain ⟨_, _, rfl⟩ := hb
      exact (List.cons.inj heq).1

end Dxn
