import Dxn.Enumeration

/-!
# Files

A file is its enumeration declarations, in written order. The checker reports
each declaration's own problems, in written order, then each enumeration name
written more than once. A valid file's enumerations have pairwise different
names, so no two of them share a value.
-/

namespace Dxn

-- #region file
/-- A file as written: its enumeration declarations, in written order. -/
structure File where
  decls : List EnumDecl
  deriving Repr, DecidableEq
-- #endregion file

/-- The enumeration names of a file, in written order. -/
def File.names (f : File) : List Name :=
  f.decls.map (·.name)

-- #region errors
/-- Why the checker rejects a file, in the order the checker reports them. -/
inductive FileError where
  /-- A problem with the enumeration of this name. -/
  | enum (name : Name) (error : EnumError)
  /-- The enumeration name is written more than once. -/
  | duplicateEnum (name : Name)
  deriving Repr, DecidableEq
-- #endregion errors

-- #region check
/--
Check a file: each declaration's own problems, in written order, then each enumeration name
written more than once, once, in the order it first appears. No problems means it is accepted.
-/
def File.check (f : File) : List FileError :=
  f.decls.flatMap (fun d => (Dxn.check d).map (.enum d.name)) ++
  (duplicates f.names).map .duplicateEnum
-- #endregion check

-- #region valid
/-- A file is valid when every declaration is, and no two have the same name. -/
structure File.Valid (f : File) : Prop where
  enums : ∀ d ∈ f.decls, Dxn.Valid d
  nodup : f.names.Nodup
-- #endregion valid

theorem File.valid_iff (f : File) : f.Valid ↔ (∀ d ∈ f.decls, Dxn.Valid d) ∧ f.names.Nodup :=
  ⟨fun ⟨a, b⟩ => ⟨a, b⟩, fun ⟨a, b⟩ => ⟨a, b⟩⟩

instance (f : File) : Decidable f.Valid :=
  decidable_of_iff _ (File.valid_iff f).symm

/-- The checker accepts exactly the valid files. -/
theorem File.check_eq_nil_iff (f : File) : f.check = [] ↔ f.Valid := by
  rw [File.valid_iff, ← duplicates_eq_nil_iff]
  simp [File.check, List.flatMap_eq_nil_iff, Dxn.check_eq_nil_iff]

/-- The checker reports a name written twice exactly when it is. -/
theorem File.duplicateEnum_mem_check (f : File) (n : Name) :
    .duplicateEnum n ∈ f.check ↔ 2 ≤ f.names.count n := by
  simp [File.check, mem_duplicates]

/-- The checker reports an enumeration's problem exactly when that enumeration has it. -/
theorem File.enum_mem_check (f : File) (n : Name) (e : EnumError) :
    .enum n e ∈ f.check ↔ ∃ d ∈ f.decls, d.name = n ∧ e ∈ Dxn.check d := by
  simp only [File.check, List.mem_append, List.mem_flatMap, List.mem_map]
  constructor
  · rintro (⟨d, hd, e', he', heq⟩ | ⟨_, _, heq⟩)
    · cases heq; exact ⟨d, hd, rfl, he'⟩
    · cases heq
  · rintro ⟨d, hd, rfl, he⟩
    exact .inl ⟨d, hd, e, he, rfl⟩

/-- A declaration's values, in written order, each tagged with its enumeration's name. -/
def EnumDecl.tagged (d : EnumDecl) : List Value :=
  d.values.map (Value.mk d.name)

/-- A file's values, in written order, each tagged with its enumeration's name. -/
def File.values (f : File) : List Value :=
  f.decls.flatMap EnumDecl.tagged

/-- In a valid file, no two enumerations share a value, and none has a value twice. -/
theorem File.nodup_values {f : File} (h : f.Valid) : f.values.Nodup := by
  unfold File.values List.Nodup
  rw [List.pairwise_flatMap]
  refine ⟨fun d hd => ?_, ?_⟩
  · exact (h.enums d hd).nodup.map _ fun _ _ hne heq => hne (Value.mk.inj heq).2
  · have hn : (f.decls.map (·.name)).Nodup := h.nodup
    refine (List.pairwise_map.mp hn).imp fun hne x hx y hy heq => hne ?_
    simp only [EnumDecl.tagged, List.mem_map] at hx hy
    obtain ⟨_, _, rfl⟩ := hx
    obtain ⟨_, _, rfl⟩ := hy
    exact (Value.mk.inj heq).1

end Dxn
