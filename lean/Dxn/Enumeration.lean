import Dxn.FiniteSet

/-!
# Enumerations

A declaration is what is written: a name and a list of value names, in
written order. The checker accepts it only when it has at least one name and
no name twice. An accepted declaration means a finite set with one element
per name; the written order means nothing.
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

/-- The first name, in written order, that appears again later. -/
def firstDuplicate : List Name → Option Name
  | [] => none
  | v :: rest => if v ∈ rest then some v else firstDuplicate rest

/-- Check a declaration: `none` when it is accepted, else why it is not. -/
def check (d : EnumDecl) : Option EnumError :=
  if d.values = [] then some .empty else (firstDuplicate d.values).map .duplicate

/-- A declaration is valid when it has at least one name and no name twice. -/
def Valid (d : EnumDecl) : Prop :=
  d.values ≠ [] ∧ d.values.Nodup

instance (d : EnumDecl) : Decidable (Valid d) :=
  inferInstanceAs (Decidable (_ ∧ _))

theorem firstDuplicate_eq_none_iff (l : List Name) : firstDuplicate l = none ↔ l.Nodup := by
  induction l with
  | nil => simp [firstDuplicate]
  | cons v rest ih => by_cases h : v ∈ rest <;> simp [firstDuplicate, h, ih, List.nodup_cons]

/-- The checker accepts exactly the valid declarations. -/
theorem check_eq_none_iff (d : EnumDecl) : check d = none ↔ Valid d := by
  unfold check Valid
  by_cases h : d.values = [] <;> simp [h, firstDuplicate_eq_none_iff]

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
