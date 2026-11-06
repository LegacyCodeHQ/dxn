import Dxn.FiniteSet

/-!
# Enumerations

A declaration is what is written: a name and a list of value names, in
written order. The checker reports every problem with it: no names, or a name
written more than once. It accepts a declaration with no problems.

An accepted declaration means a finite set with one element per name. The
written order means nothing.
-/

namespace Dxn

/-- A name as written. -/
abbrev Name := String

/-- An enumeration as written: its name and its value names, in written order. -/
structure EnumDecl where
  name : Name
  values : List Name
  deriving Repr, DecidableEq

/-- Why the checker rejects a declaration. -/
inductive EnumError where
  /-- The declaration has no names. -/
  | empty
  /-- The name is written more than once. -/
  | duplicate (value : Name)
  deriving Repr, DecidableEq

/-- A declaration is valid when it has at least one name and no name twice. -/
def Valid (d : EnumDecl) : Prop :=
  d.values ≠ [] ∧ d.values.Nodup

instance (d : EnumDecl) : Decidable (Valid d) :=
  inferInstanceAs (Decidable (_ ∧ _))

/-- The names written more than once, each once, in the order they first appear. -/
def duplicates (l : List Name) : List Name :=
  l.eraseDups.filter fun v => 2 ≤ l.count v

/-- Check a declaration: every problem with it, each once. No problems means it is accepted. -/
def check (d : EnumDecl) : List EnumError :=
  if d.values = [] then [.empty] else (duplicates d.values).map .duplicate

theorem nodup_eraseDups (l : List Name) : l.eraseDups.Nodup := by
  match l with
  | [] => simp
  | a :: as =>
    rw [List.eraseDups_cons, List.nodup_cons]
    refine ⟨fun h => ?_, nodup_eraseDups _⟩
    simp [List.mem_eraseDups, List.mem_filter] at h
termination_by l.length
decreasing_by
  exact Nat.lt_succ_of_le (List.length_filter_le _ _)

theorem mem_duplicates {l : List Name} {v : Name} : v ∈ duplicates l ↔ 2 ≤ l.count v := by
  simp only [duplicates, List.mem_filter, List.mem_eraseDups, decide_eq_true_eq]
  exact ⟨And.right, fun h => ⟨List.count_pos_iff.mp (by omega), h⟩⟩

theorem nodup_duplicates (l : List Name) : (duplicates l).Nodup :=
  (nodup_eraseDups l).sublist (List.filter_sublist)

theorem duplicates_eq_nil_iff (l : List Name) : duplicates l = [] ↔ l.Nodup := by
  rw [List.eq_nil_iff_forall_not_mem, List.nodup_iff_count]
  simp only [mem_duplicates]
  exact ⟨fun h v => by have := h v; omega, fun h v => by have := h v; omega⟩

/-- The checker accepts exactly the valid declarations. -/
theorem check_eq_nil_iff (d : EnumDecl) : check d = [] ↔ Valid d := by
  unfold check Valid
  by_cases h : d.values = [] <;> simp [h, duplicates_eq_nil_iff]

/-- The checker reports a duplicate exactly for each name written more than once. -/
theorem duplicate_mem_check (d : EnumDecl) (v : Name) :
    .duplicate v ∈ check d ↔ 2 ≤ d.values.count v := by
  unfold check
  by_cases h : d.values = [] <;> simp [h, mem_duplicates]

/-- The checker reports an empty declaration exactly when it has no names. -/
theorem empty_mem_check (d : EnumDecl) : .empty ∈ check d ↔ d.values = [] := by
  unfold check
  by_cases h : d.values = [] <;> simp [h]

/-- The checker reports no problem twice. -/
theorem nodup_check (d : EnumDecl) : (check d).Nodup := by
  unfold check
  split
  · simp
  · exact (nodup_duplicates _).map EnumError.duplicate fun _ _ hne heq =>
      hne (EnumError.duplicate.inj heq)

/-- A declaration the checker accepted. -/
structure Enum where
  decl : EnumDecl
  valid : Valid decl

/-- The elements of an enumeration: one per name. -/
def Enum.Value (e : Enum) : Type :=
  { v : Name // v ∈ e.decl.values }

instance (e : Enum) : Finite e.Value where
  elems := e.decl.values.attach
  complete := List.mem_attach _
  nodup := by
    have h : (e.decl.values.attach.map Subtype.val).Nodup := by
      rw [List.attach_map_subtype_val]; exact e.valid.2
    exact (List.pairwise_map.mp h).imp fun hne heq => hne (congrArg Subtype.val heq)

/-- An enumeration has as many elements as names. -/
theorem Enum.card_value (e : Enum) : card e.Value = e.decl.values.length :=
  List.length_attach

/-- Two declarations declare the same enumeration: the same name, the same set of names. -/
def Same (d e : EnumDecl) : Prop :=
  d.name = e.name ∧ ∀ v, v ∈ d.values ↔ v ∈ e.values

/-- Order means nothing: the same names in another order declare the same enumeration. -/
theorem same_of_perm {d e : EnumDecl} (hn : d.name = e.name) (hp : d.values.Perm e.values) :
    Same d e :=
  ⟨hn, fun _ => hp.mem_iff⟩

/-- Reordering keeps a declaration valid. -/
theorem valid_of_perm {d e : EnumDecl} (hp : d.values.Perm e.values) : Valid d → Valid e :=
  fun ⟨hne, hnd⟩ => ⟨fun h => hne (List.Perm.eq_nil (h ▸ hp)), hp.nodup_iff.mp hnd⟩

end Dxn
