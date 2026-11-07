import Dxn.Type

/-!
# Files

A file holds declarations, in written order: enumerations and types. The
checker reports each declaration's own problems, in written order, then each
name written more than once (F1), across both kinds. A type is checked against
the file's enumerations. A valid file's declarations have pairwise different
names, so no two enumerations share a value, and each type's combinations are
the product of its enumerations' values.
-/

namespace Dxn

-- #region file
/-- A declaration: an enumeration or a type. -/
inductive Decl where
  | enum (d : EnumDecl)
  | type (t : TypeDecl)
  deriving Repr, DecidableEq

/-- A declaration's name. -/
def Decl.name : Decl → Name
  | .enum d => d.name
  | .type t => t.name

/-- A file as written: its declarations, in written order. -/
structure File where
  decls : List Decl
  deriving Repr, DecidableEq
-- #endregion file

/-- The enumeration a declaration is, if it is one. -/
def Decl.enum? : Decl → Option EnumDecl
  | .enum d => some d
  | .type _ => none

/-- The type a declaration is, if it is one. -/
def Decl.type? : Decl → Option TypeDecl
  | .enum _ => none
  | .type t => some t

/-- The names of a file's declarations, in written order. -/
def File.names (f : File) : List Name :=
  f.decls.map Decl.name

/-- A file's enumerations, in written order. -/
def File.enums (f : File) : List EnumDecl :=
  f.decls.filterMap Decl.enum?

/-- A file's types, in written order. -/
def File.types (f : File) : List TypeDecl :=
  f.decls.filterMap Decl.type?

/-- The names of a file's enumerations, in written order. -/
def File.enumNames (f : File) : List Name :=
  f.enums.map (·.name)

theorem File.mem_enums {f : File} {d : EnumDecl} : d ∈ f.enums ↔ Decl.enum d ∈ f.decls := by
  simp only [File.enums, List.mem_filterMap]
  constructor
  · rintro ⟨x, hx, h⟩
    cases x <;> simp_all [Decl.enum?]
  · exact fun h => ⟨_, h, rfl⟩

theorem File.mem_types {f : File} {t : TypeDecl} : t ∈ f.types ↔ Decl.type t ∈ f.decls := by
  simp only [File.types, List.mem_filterMap]
  constructor
  · rintro ⟨x, hx, h⟩
    cases x <;> simp_all [Decl.type?]
  · exact fun h => ⟨_, h, rfl⟩

/-- Every enumeration name is one of the file's names. -/
theorem File.enumNames_subset {f : File} {n : Name} (h : n ∈ f.enumNames) : n ∈ f.names := by
  obtain ⟨d, hd, rfl⟩ := List.mem_map.mp h
  exact List.mem_map.mpr ⟨_, File.mem_enums.mp hd, rfl⟩

theorem File.enumNames_sublist (f : File) : f.enumNames.Sublist f.names := by
  unfold File.enumNames File.enums File.names
  induction f.decls with
  | nil => simp
  | cons x xs ih =>
    cases x with
    | enum d => simpa [Decl.enum?, Decl.name] using ih
    | type t =>
      rw [List.filterMap_cons_none rfl]
      simpa [Decl.name] using ih.cons _

-- #region errors
/-- Why the checker rejects a file, in the order the checker reports them. -/
inductive FileError where
  /-- A problem with the enumeration of this name. -/
  | enum (name : Name) (error : EnumError)
  /-- A problem with the type of this name. -/
  | type (name : Name) (error : TypeError)
  /-- The name is written more than once, by declarations of any kind. -/
  | duplicateName (name : Name)
  deriving Repr, DecidableEq

/-- A declaration's problems keep their rule IDs; a name written twice breaks F1. -/
def FileError.ruleId : FileError → String
  | .enum _ error => error.ruleId
  | .type _ error => error.ruleId
  | .duplicateName _ => "F1"
-- #endregion errors

-- #region check
/-- A declaration's own problems; a type is checked against the file's enumeration names. -/
def Decl.check (enums : List Name) : Decl → List FileError
  | .enum d => (Dxn.check d).map (.enum d.name)
  | .type t => (checkType enums t).map (.type t.name)

/--
Check a file: each declaration's own problems, in written order, then each name written more than
once, once, in the order it first appears. No problems means it is accepted.
-/
def File.check (f : File) : List FileError :=
  f.decls.flatMap (Decl.check f.enumNames) ++ (duplicates f.names).map .duplicateName
-- #endregion check

-- #region valid
/-- A file is valid when every declaration is, and no two have the same name. -/
structure File.Valid (f : File) : Prop where
  enums : ∀ d ∈ f.enums, Dxn.Valid d
  types : ∀ t ∈ f.types, t.Valid f.enumNames
  nodup : f.names.Nodup
-- #endregion valid

theorem File.valid_iff (f : File) :
    f.Valid ↔
      (∀ d ∈ f.enums, Dxn.Valid d) ∧ (∀ t ∈ f.types, t.Valid f.enumNames) ∧ f.names.Nodup :=
  ⟨fun ⟨a, b, c⟩ => ⟨a, b, c⟩, fun ⟨a, b, c⟩ => ⟨a, b, c⟩⟩

instance File.decidableValid (f : File) : Decidable f.Valid :=
  decidable_of_iff _ (File.valid_iff f).symm

/-- A declaration has no problems exactly when it is valid. -/
theorem Decl.check_eq_nil_iff (enums : List Name) (x : Decl) :
    x.check enums = [] ↔
      (∀ d, x = .enum d → Dxn.Valid d) ∧ (∀ t, x = .type t → t.Valid enums) := by
  cases x with
  | enum d => simp [Decl.check, Dxn.check_eq_nil_iff]
  | type t => simp [Decl.check, checkType_eq_nil_iff]

/-- The checker accepts exactly the valid files. -/
theorem File.check_eq_nil_iff (f : File) : f.check = [] ↔ f.Valid := by
  rw [File.valid_iff, ← duplicates_eq_nil_iff]
  simp only [File.check, List.append_eq_nil_iff, List.flatMap_eq_nil_iff, List.map_eq_nil_iff,
    Decl.check_eq_nil_iff, File.mem_enums, File.mem_types]
  constructor
  · rintro ⟨h, hd⟩
    exact ⟨fun d hd' => (h _ hd').1 d rfl, fun t ht => (h _ ht).2 t rfl, hd⟩
  · rintro ⟨he, ht, hd⟩
    refine ⟨fun x hx => ⟨?_, ?_⟩, hd⟩
    · rintro d rfl; exact he d hx
    · rintro t rfl; exact ht t hx

theorem Decl.duplicateName_not_mem_check (enums : List Name) (x : Decl) (n : Name) :
    .duplicateName n ∉ x.check enums := by
  cases x <;> simp [Decl.check]

/-- The checker reports a name written twice exactly when it is. -/
theorem File.duplicateName_mem_check (f : File) (n : Name) :
    .duplicateName n ∈ f.check ↔ 2 ≤ f.names.count n := by
  simp [File.check, mem_duplicates, Decl.duplicateName_not_mem_check]

/-- The checker reports an enumeration's problem exactly when that enumeration has it. -/
theorem File.enum_mem_check (f : File) (n : Name) (e : EnumError) :
    .enum n e ∈ f.check ↔ ∃ d ∈ f.enums, d.name = n ∧ e ∈ Dxn.check d := by
  simp only [File.check, List.mem_append, List.mem_flatMap, List.mem_map, File.mem_enums]
  constructor
  · rintro (⟨x, hx, hm⟩ | ⟨_, _, heq⟩)
    · cases x with
      | enum d =>
        simp only [Decl.check, List.mem_map, FileError.enum.injEq] at hm
        obtain ⟨e', he', rfl, rfl⟩ := hm
        exact ⟨d, hx, rfl, he'⟩
      | type t => simp [Decl.check] at hm
    · cases heq
  · rintro ⟨d, hd, rfl, he⟩
    exact .inl ⟨_, hd, by simp [Decl.check, he]⟩

/-- The checker reports a type's problem exactly when that type has it. -/
theorem File.type_mem_check (f : File) (n : Name) (e : TypeError) :
    .type n e ∈ f.check ↔ ∃ t ∈ f.types, t.name = n ∧ e ∈ checkType f.enumNames t := by
  simp only [File.check, List.mem_append, List.mem_flatMap, List.mem_map, File.mem_types]
  constructor
  · rintro (⟨x, hx, hm⟩ | ⟨_, _, heq⟩)
    · cases x with
      | enum d => simp [Decl.check] at hm
      | type t =>
        simp only [Decl.check, List.mem_map, FileError.type.injEq] at hm
        obtain ⟨e', he', rfl, rfl⟩ := hm
        exact ⟨t, hx, rfl, he'⟩
    · cases heq
  · rintro ⟨t, ht, rfl, he⟩
    exact .inl ⟨_, ht, by simp [Decl.check, he]⟩

/-! ## The order of reported problems -/

/-- A problem's place in the order: a declaration's own problems, then F1. -/
def FileError.rank : FileError → Nat
  | .enum _ _ => 0
  | .type _ _ => 0
  | .duplicateName _ => 1

/-- The declarations' own problems, in the order they are reported. -/
def declProblemsOf (errors : List FileError) : List FileError :=
  errors.filter fun
    | .duplicateName _ => false
    | _ => true

/-- The names reported under F1, in the order they are reported. -/
def duplicateNamesOf (errors : List FileError) : List Name :=
  errors.filterMap fun
    | .duplicateName n => some n
    | _ => none

theorem Decl.rank_of_mem_check {enums : List Name} {x : Decl} {e : FileError}
    (h : e ∈ x.check enums) : e.rank = 0 := by
  cases x <;> simp only [Decl.check, List.mem_map] at h <;> obtain ⟨_, _, rfl⟩ := h <;> rfl

/-- A declaration's own problems come before every name written twice. -/
theorem File.check_sorted (f : File) : f.check.Pairwise (fun a b => a.rank ≤ b.rank) := by
  unfold File.check
  rw [List.pairwise_append]
  refine ⟨?_, ?_, ?_⟩
  · rw [List.pairwise_flatMap]
    refine ⟨fun x _ => ?_, List.pairwise_of_forall fun x y a ha b hb => ?_⟩
    · exact List.pairwise_of_forall_mem_list fun a ha b hb => by
        rw [Decl.rank_of_mem_check ha, Decl.rank_of_mem_check hb]; exact Nat.le_refl _
    · rw [Decl.rank_of_mem_check ha, Decl.rank_of_mem_check hb]; exact Nat.le_refl _
  · exact List.pairwise_of_forall_mem_list fun a ha b hb => by
      simp only [List.mem_map] at ha hb
      obtain ⟨_, _, rfl⟩ := ha
      obtain ⟨_, _, rfl⟩ := hb
      exact Nat.le_refl _
  · intro a ha b _
    obtain ⟨x, _, hx⟩ := List.mem_flatMap.mp ha
    rw [Decl.rank_of_mem_check hx]
    exact Nat.zero_le _

/-- The declarations' own problems are each declaration's, in the order they are written. -/
theorem File.declProblemsOf_check (f : File) :
    declProblemsOf f.check = f.decls.flatMap (Decl.check f.enumNames) := by
  unfold declProblemsOf File.check
  rw [List.filter_append]
  have hdrop : (List.map FileError.duplicateName (duplicates f.names)).filter
      (fun | .duplicateName _ => false | _ => true) = [] :=
    List.filter_eq_nil_iff.mpr fun e he => by
      obtain ⟨_, _, rfl⟩ := List.mem_map.mp he
      simp
  have hkeep : (f.decls.flatMap (Decl.check f.enumNames)).filter
      (fun | .duplicateName _ => false | _ => true) = f.decls.flatMap (Decl.check f.enumNames) :=
    List.filter_eq_self.mpr fun e he => by
      obtain ⟨x, _, hx⟩ := List.mem_flatMap.mp he
      cases x <;> simp only [Decl.check, List.mem_map] at hx <;> obtain ⟨_, _, rfl⟩ := hx <;> rfl
  rw [hdrop, hkeep, List.append_nil]

/-- Names written twice come in the order they are first written. -/
theorem File.duplicateNamesOf_check_sublist (f : File) :
    List.Sublist (duplicateNamesOf f.check) f.names.eraseDups := by
  have hnone : (f.decls.flatMap (Decl.check f.enumNames)).filterMap
      (fun | .duplicateName n => some n | _ => none) = [] :=
    List.filterMap_eq_nil_iff.mpr fun e he => by
      obtain ⟨x, _, hx⟩ := List.mem_flatMap.mp he
      cases x <;> simp only [Decl.check, List.mem_map] at hx <;> obtain ⟨_, _, rfl⟩ := hx <;> rfl
  have : duplicateNamesOf f.check = duplicates f.names := by
    unfold duplicateNamesOf File.check
    rw [List.filterMap_append, hnone, List.nil_append, List.filterMap_map]
    exact List.filterMap_some
  rw [this]
  exact List.filter_sublist

-- #region values
/-- A declaration's values, in written order, each tagged with its enumeration's name. -/
def EnumDecl.tagged (d : EnumDecl) : List Value :=
  d.values.map (Value.mk d.name)

/-- A file's values, in written order, each tagged with its enumeration's name. -/
def File.values (f : File) : List Value :=
  f.enums.flatMap EnumDecl.tagged
-- #endregion values

/-- In a valid file, no two enumerations share a value, and none has a value twice. -/
theorem File.nodup_values {f : File} (h : f.Valid) : f.values.Nodup := by
  unfold File.values List.Nodup
  rw [List.pairwise_flatMap]
  refine ⟨fun d hd => ?_, ?_⟩
  · exact (h.enums d hd).nodup.map _ fun _ _ hne heq => hne (Value.mk.inj heq).2
  · have hn : (f.enums.map (·.name)).Nodup := (f.enumNames_sublist).nodup h.nodup
    refine (List.pairwise_map.mp hn).imp fun hne x hx y hy heq => hne ?_
    simp only [EnumDecl.tagged, List.mem_map] at hx hy
    obtain ⟨_, _, rfl⟩ := hx
    obtain ⟨_, _, rfl⟩ := hy
    exact (Value.mk.inj heq).1

/-! ## Combinations -/

-- #region combinations
/-- The values of the file's enumeration of this name, tagged; none if there is no such. -/
def File.enumValues (f : File) (n : Name) : List Value :=
  match f.enums.find? (·.name == n) with
  | some d => d.tagged
  | none => []

/-- A type's combinations: one value of each enumeration it varies over, in written order, the
first enumeration changing slowest. -/
def File.combinations (f : File) (t : TypeDecl) : List (List Value) :=
  product (t.varies.map f.enumValues)
-- #endregion combinations

/-- The number of combinations is the product of the enumerations' sizes. -/
theorem File.length_combinations (f : File) (t : TypeDecl) :
    (f.combinations t).length = (t.varies.map fun n => (f.enumValues n).length).foldr (· * ·) 1 := by
  simp [File.combinations, length_product, List.map_map, Function.comp_def]

/-- In a valid file, no enumeration's values repeat. -/
theorem File.nodup_enumValues {f : File} (h : f.Valid) (n : Name) : (f.enumValues n).Nodup := by
  unfold File.enumValues
  split
  · rename_i d hd
    exact (h.enums d (List.mem_of_find?_eq_some hd)).nodup.map _
      fun _ _ hne heq => hne (Value.mk.inj heq).2
  · exact List.nodup_nil

/-- In a valid file, no combination is listed twice. -/
theorem File.nodup_combinations {f : File} (t : TypeDecl) (h : f.Valid) :
    (f.combinations t).Nodup :=
  nodup_product fun xs hxs => by
    obtain ⟨n, _, rfl⟩ := List.mem_map.mp hxs
    exact File.nodup_enumValues h n

end Dxn
