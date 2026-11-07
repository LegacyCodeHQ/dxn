import Dxn.Type
import Dxn.Record

/-!
# Files

A file holds declarations, in written order: enumerations, types and records.
The checker reports each declaration's own problems, in written order, then
each name written more than once (F1), across every kind. A type is checked
against the file's enumerations, and a record against its enumerations and
records, including whether it contains itself (R6). A valid file's declarations
have pairwise different names, so no two enumerations share a value, and each
type's combinations are the product of its enumerations' values.
-/

namespace Dxn

-- #region file
/-- A declaration: an enumeration, a type or a record. -/
inductive Decl where
  | enum (d : EnumDecl)
  | type (t : TypeDecl)
  | record (r : RecordDecl)
  deriving Repr, DecidableEq

/-- A declaration's name. -/
def Decl.name : Decl → Name
  | .enum d => d.name
  | .type t => t.name
  | .record r => r.name

/-- A file as written: its declarations, in written order. -/
structure File where
  decls : List Decl
  deriving Repr, DecidableEq
-- #endregion file

/-- The enumeration a declaration is, if it is one. -/
def Decl.enum? : Decl → Option EnumDecl
  | .enum d => some d
  | _ => none

/-- The type a declaration is, if it is one. -/
def Decl.type? : Decl → Option TypeDecl
  | .type t => some t
  | _ => none

/-- The record a declaration is, if it is one. -/
def Decl.record? : Decl → Option RecordDecl
  | .record r => some r
  | _ => none

/-- The names of a file's declarations, in written order. -/
def File.names (f : File) : List Name :=
  f.decls.map Decl.name

/-- A file's enumerations, in written order. -/
def File.enums (f : File) : List EnumDecl :=
  f.decls.filterMap Decl.enum?

/-- A file's types, in written order. -/
def File.types (f : File) : List TypeDecl :=
  f.decls.filterMap Decl.type?

/-- A file's records, in written order. -/
def File.records (f : File) : List RecordDecl :=
  f.decls.filterMap Decl.record?

/-- The names of a file's enumerations, in written order. -/
def File.enumNames (f : File) : List Name :=
  f.enums.map (·.name)

/-- The names of a file's records, in written order. -/
def File.recordNames (f : File) : List Name :=
  f.records.map (·.name)

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

theorem File.mem_records {f : File} {r : RecordDecl} :
    r ∈ f.records ↔ Decl.record r ∈ f.decls := by
  simp only [File.records, List.mem_filterMap]
  constructor
  · rintro ⟨x, hx, h⟩
    cases x <;> simp_all [Decl.record?]
  · exact fun h => ⟨_, h, rfl⟩

/-- Every record name is one of the file's names. -/
theorem File.recordNames_subset {f : File} {n : Name} (h : n ∈ f.recordNames) : n ∈ f.names := by
  obtain ⟨r, hr, rfl⟩ := List.mem_map.mp h
  exact List.mem_map.mpr ⟨_, File.mem_records.mp hr, rfl⟩

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
    | record r =>
      rw [List.filterMap_cons_none rfl]
      simpa [Decl.name] using ih.cons _

-- #region errors
/-- Why the checker rejects a file, in the order the checker reports them. -/
inductive FileError where
  /-- A problem with the enumeration of this name. -/
  | enum (name : Name) (error : EnumError)
  /-- A problem with the type of this name. -/
  | type (name : Name) (error : TypeError)
  /-- A problem with the record of this name. -/
  | record (name : Name) (error : RecordError)
  /-- The name is written more than once, by declarations of any kind. -/
  | duplicateName (name : Name)
  deriving Repr, DecidableEq

/-- A declaration's problems keep their rule IDs; a name written twice breaks F1. -/
def FileError.ruleId : FileError → String
  | .enum _ error => error.ruleId
  | .type _ error => error.ruleId
  | .record _ error => error.ruleId
  | .duplicateName _ => "F1"
-- #endregion errors

-- #region contains
/-- The records a record's fields name, in written order: where its fields lead. -/
def File.fieldRecords (f : File) (n : Name) : List Name :=
  match f.records.find? (·.name == n) with
  | some r => r.fieldTypes.filter (· ∈ f.recordNames)
  | none => []

/-- Whether record `b` can be reached from record `a` along fields, in at most `k` steps and at
least one. -/
def File.reachesWithin (f : File) : Nat → Name → Name → Bool
  | 0, _, _ => false
  | k + 1, a, b => (f.fieldRecords a).any fun c => c == b || f.reachesWithin k c b

/-- R6: a record contains itself when its fields lead back to it, directly or through other
records. A way back visits each record at most once before it returns, so as many steps as there
are records suffice. -/
def File.containsItself (f : File) (n : Name) : Bool :=
  f.reachesWithin f.records.length n n
-- #endregion contains

-- #region check
/-- A record's own problems in its file: R1 to R5, then R6. -/
def File.checkRecordIn (f : File) (r : RecordDecl) : List RecordError :=
  checkRecord f.enumNames f.recordNames r ++
    (if f.containsItself r.name then [.containsItself] else [])

/-- A declaration's own problems in its file: a type is checked against the file's enumerations,
and a record against its enumerations and records. -/
def Decl.check (f : File) : Decl → List FileError
  | .enum d => (Dxn.check d).map (.enum d.name)
  | .type t => (checkType f.enumNames t).map (.type t.name)
  | .record r => (f.checkRecordIn r).map (.record r.name)

/--
Check a file: each declaration's own problems, in written order, then each name written more than
once, once, in the order it first appears. No problems means it is accepted.
-/
def File.check (f : File) : List FileError :=
  f.decls.flatMap (Decl.check f) ++ (duplicates f.names).map .duplicateName
-- #endregion check

-- #region valid
/-- A file is valid when every declaration is, and no two have the same name. -/
structure File.Valid (f : File) : Prop where
  enums : ∀ d ∈ f.enums, Dxn.Valid d
  types : ∀ t ∈ f.types, t.Valid f.enumNames
  records : ∀ r ∈ f.records, r.Valid f.enumNames f.recordNames ∧ f.containsItself r.name = false
  nodup : f.names.Nodup
-- #endregion valid

theorem File.valid_iff (f : File) :
    f.Valid ↔
      (∀ d ∈ f.enums, Dxn.Valid d) ∧ (∀ t ∈ f.types, t.Valid f.enumNames) ∧
        (∀ r ∈ f.records, r.Valid f.enumNames f.recordNames ∧ f.containsItself r.name = false) ∧
        f.names.Nodup :=
  ⟨fun ⟨a, b, c, d⟩ => ⟨a, b, c, d⟩, fun ⟨a, b, c, d⟩ => ⟨a, b, c, d⟩⟩

instance File.decidableValid (f : File) : Decidable f.Valid :=
  decidable_of_iff _ (File.valid_iff f).symm

theorem File.checkRecordIn_eq_nil_iff (f : File) (r : RecordDecl) :
    f.checkRecordIn r = [] ↔
      r.Valid f.enumNames f.recordNames ∧ f.containsItself r.name = false := by
  unfold File.checkRecordIn
  by_cases hc : f.containsItself r.name <;> simp [hc, checkRecord_eq_nil_iff]

/-- A declaration has no problems exactly when it is valid. -/
theorem Decl.check_eq_nil_iff (f : File) (x : Decl) :
    x.check f = [] ↔
      (∀ d, x = .enum d → Dxn.Valid d) ∧ (∀ t, x = .type t → t.Valid f.enumNames) ∧
        (∀ r, x = .record r →
          r.Valid f.enumNames f.recordNames ∧ f.containsItself r.name = false) := by
  cases x with
  | enum d => simp [Decl.check, Dxn.check_eq_nil_iff]
  | type t => simp [Decl.check, checkType_eq_nil_iff]
  | record r => simp [Decl.check, File.checkRecordIn_eq_nil_iff]

/-- The checker accepts exactly the valid files. -/
theorem File.check_eq_nil_iff (f : File) : f.check = [] ↔ f.Valid := by
  rw [File.valid_iff, ← duplicates_eq_nil_iff]
  simp only [File.check, List.append_eq_nil_iff, List.flatMap_eq_nil_iff, List.map_eq_nil_iff,
    Decl.check_eq_nil_iff, File.mem_enums, File.mem_types, File.mem_records]
  constructor
  · rintro ⟨h, hd⟩
    exact ⟨fun d hd' => (h _ hd').1 d rfl, fun t ht => (h _ ht).2.1 t rfl,
      fun r hr => (h _ hr).2.2 r rfl, hd⟩
  · rintro ⟨he, ht, hr, hd⟩
    refine ⟨fun x hx => ⟨?_, ?_, ?_⟩, hd⟩
    · rintro d rfl; exact he d hx
    · rintro t rfl; exact ht t hx
    · rintro r rfl; exact hr r hx

theorem Decl.duplicateName_not_mem_check (f : File) (x : Decl) (n : Name) :
    .duplicateName n ∉ x.check f := by
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
      | record r => simp [Decl.check] at hm
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
      | record r => simp [Decl.check] at hm
    · cases heq
  · rintro ⟨t, ht, rfl, he⟩
    exact .inl ⟨_, ht, by simp [Decl.check, he]⟩

/-- The checker reports a record's problem exactly when that record has it. -/
theorem File.record_mem_check (f : File) (n : Name) (e : RecordError) :
    .record n e ∈ f.check ↔ ∃ r ∈ f.records, r.name = n ∧ e ∈ f.checkRecordIn r := by
  simp only [File.check, List.mem_append, List.mem_flatMap, List.mem_map, File.mem_records]
  constructor
  · rintro (⟨x, hx, hm⟩ | ⟨_, _, heq⟩)
    · cases x with
      | enum d => simp [Decl.check] at hm
      | type t => simp [Decl.check] at hm
      | record r =>
        simp only [Decl.check, List.mem_map, FileError.record.injEq] at hm
        obtain ⟨e', he', rfl, rfl⟩ := hm
        exact ⟨r, hx, rfl, he'⟩
    · cases heq
  · rintro ⟨r, hr, rfl, he⟩
    exact .inl ⟨_, hr, by simp [Decl.check, he]⟩

/-! ## The order of reported problems -/

/-- A problem's place in the order: a declaration's own problems, then F1. -/
def FileError.rank : FileError → Nat
  | .enum _ _ => 0
  | .type _ _ => 0
  | .record _ _ => 0
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

theorem Decl.rank_of_mem_check {f : File} {x : Decl} {e : FileError}
    (h : e ∈ x.check f) : e.rank = 0 := by
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
    declProblemsOf f.check = f.decls.flatMap (Decl.check f) := by
  unfold declProblemsOf File.check
  rw [List.filter_append]
  have hdrop : (List.map FileError.duplicateName (duplicates f.names)).filter
      (fun | .duplicateName _ => false | _ => true) = [] :=
    List.filter_eq_nil_iff.mpr fun e he => by
      obtain ⟨_, _, rfl⟩ := List.mem_map.mp he
      simp
  have hkeep : (f.decls.flatMap (Decl.check f)).filter
      (fun | .duplicateName _ => false | _ => true) = f.decls.flatMap (Decl.check f) :=
    List.filter_eq_self.mpr fun e he => by
      obtain ⟨x, _, hx⟩ := List.mem_flatMap.mp he
      cases x <;> simp only [Decl.check, List.mem_map] at hx <;> obtain ⟨_, _, rfl⟩ := hx <;> rfl
  rw [hdrop, hkeep, List.append_nil]

/-- Names written twice come in the order they are first written. -/
theorem File.duplicateNamesOf_check_sublist (f : File) :
    List.Sublist (duplicateNamesOf f.check) f.names.eraseDups := by
  have hnone : (f.decls.flatMap (Decl.check f)).filterMap
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
