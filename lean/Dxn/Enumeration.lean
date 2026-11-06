import Dxn.FiniteSet
import Dxn.Name

/-!
# Enumerations

A declaration is what is written: a name and a list of value names, in
written order. The checker reports every problem with it: a name that breaks
the naming rules, no names, or a name written more than once. It accepts a declaration with no problems.

An accepted declaration means a finite set with one element per name. Each
element is a value tagged with the enumeration's name, so enumerations with
different names share no value. The written order means nothing.
-/

namespace Dxn

/-- An enumeration as written: its name and its value names, in written order. -/
structure EnumDecl where
  name : Name
  values : List Name
  deriving Repr, DecidableEq

/-- Why the checker rejects a declaration. -/
inductive EnumError where
  /-- The enumeration's name breaks the naming rules. -/
  | badEnumName (name : Name)
  /-- The declaration has no names. -/
  | empty
  /-- The name is written more than once. -/
  | duplicate (value : Name)
  /-- The value name breaks the naming rules. -/
  | badValueName (value : Name)
  deriving Repr, DecidableEq

/-- A declaration is valid when its names follow the naming rules, and it has at least one
value name and none twice. -/
structure Valid (d : EnumDecl) : Prop where
  name : isEnumName d.name
  values : ∀ v ∈ d.values, isValueName v
  nonempty : d.values ≠ []
  nodup : d.values.Nodup

theorem valid_iff (d : EnumDecl) :
    Valid d ↔ isEnumName d.name ∧ (∀ v ∈ d.values, isValueName v) ∧ d.values ≠ [] ∧
      d.values.Nodup :=
  ⟨fun ⟨a, b, c, e⟩ => ⟨a, b, c, e⟩, fun ⟨a, b, c, e⟩ => ⟨a, b, c, e⟩⟩

instance (d : EnumDecl) : Decidable (Valid d) :=
  decidable_of_iff _ (valid_iff d).symm

/-- The value names that break the naming rules, each once, in the order they first appear. -/
def badValueNames (l : List Name) : List Name :=
  l.eraseDups.filter fun v => !isValueName v

/-- The names written more than once, each once, in the order they first appear. -/
def duplicates (l : List Name) : List Name :=
  l.eraseDups.filter fun v => 2 ≤ l.count v

/--
Check a declaration: every problem with it, each once. No problems means it is accepted. A bad
enumeration name comes first, then no names, then bad value names, then names written twice.
-/
def check (d : EnumDecl) : List EnumError :=
  (if isEnumName d.name then [] else [.badEnumName d.name]) ++
  (if d.values = [] then [.empty] else []) ++
  (badValueNames d.values).map .badValueName ++
  (duplicates d.values).map .duplicate

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

theorem mem_badValueNames {l : List Name} {v : Name} :
    v ∈ badValueNames l ↔ v ∈ l ∧ isValueName v = false := by
  simp [badValueNames, List.mem_filter, List.mem_eraseDups]

theorem nodup_badValueNames (l : List Name) : (badValueNames l).Nodup :=
  (nodup_eraseDups l).sublist (List.filter_sublist)

theorem badValueNames_eq_nil_iff (l : List Name) :
    badValueNames l = [] ↔ ∀ v ∈ l, isValueName v := by
  rw [List.eq_nil_iff_forall_not_mem]
  simp only [mem_badValueNames]
  exact ⟨fun h v hv => by simpa [hv] using h v, fun h v ⟨hv, hb⟩ => by simp [h v hv] at hb⟩

/-- The checker accepts exactly the valid declarations. -/
theorem check_eq_nil_iff (d : EnumDecl) : check d = [] ↔ Valid d := by
  rw [valid_iff, ← badValueNames_eq_nil_iff, ← duplicates_eq_nil_iff]
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;> simp [hn, he]

/-- The checker reports a bad enumeration name exactly when the name breaks the rules. -/
theorem badEnumName_mem_check (d : EnumDecl) (n : Name) :
    .badEnumName n ∈ check d ↔ n = d.name ∧ isEnumName d.name = false := by
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;> simp [hn, he, eq_comm]

/-- The checker reports a bad value name exactly for each written name that breaks the rules. -/
theorem badValueName_mem_check (d : EnumDecl) (v : Name) :
    .badValueName v ∈ check d ↔ v ∈ d.values ∧ isValueName v = false := by
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;>
    simp [hn, he, mem_badValueNames]

/-- The checker reports a duplicate exactly for each name written more than once. -/
theorem duplicate_mem_check (d : EnumDecl) (v : Name) :
    .duplicate v ∈ check d ↔ 2 ≤ d.values.count v := by
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;>
    simp [hn, he, mem_duplicates]

/-- The checker reports an empty declaration exactly when it has no names. -/
theorem empty_mem_check (d : EnumDecl) : .empty ∈ check d ↔ d.values = [] := by
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;> simp [hn, he]

/-- The checker reports no problem twice. -/
theorem nodup_check (d : EnumDecl) : (check d).Nodup := by
  have hb : ((badValueNames d.values).map EnumError.badValueName).Nodup :=
    (nodup_badValueNames d.values).map _ fun _ _ hne heq => hne (EnumError.badValueName.inj heq)
  have hd : ((duplicates d.values).map EnumError.duplicate).Nodup :=
    (nodup_duplicates d.values).map _ fun _ _ hne heq => hne (EnumError.duplicate.inj heq)
  unfold check
  by_cases hn : isEnumName d.name <;> by_cases he : d.values = [] <;>
    simp_all [List.nodup_append]

/-- A declaration the checker accepted. -/
structure Enum where
  decl : EnumDecl
  valid : Valid decl

/-- A value of an enumeration, tagged with the enumeration's name, as in a disjoint union. -/
structure Value where
  enum : Name
  name : Name
  deriving Repr, DecidableEq

/-- The values of an enumeration, in written order: each name tagged with the enumeration's. -/
def Enum.values (e : Enum) : List Value :=
  e.decl.values.map (Value.mk e.decl.name)

theorem Enum.mem_values {e : Enum} {v : Value} :
    v ∈ e.values ↔ v.enum = e.decl.name ∧ v.name ∈ e.decl.values := by
  cases v
  simp only [Enum.values, List.mem_map, Value.mk.injEq]
  constructor
  · rintro ⟨n, hn, rfl, rfl⟩; exact ⟨rfl, hn⟩
  · rintro ⟨rfl, hn⟩; exact ⟨_, hn, rfl, rfl⟩

theorem Enum.nodup_values (e : Enum) : e.values.Nodup :=
  e.valid.nodup.map _ fun _ _ hne heq => hne (Value.mk.inj heq).2

/-- Enumerations with different names share no value. -/
theorem Enum.values_disjoint {e f : Enum} (h : e.decl.name ≠ f.decl.name) (v : Value) :
    v ∈ e.values → v ∉ f.values :=
  fun he hf => h ((mem_values.mp he).1.symm.trans (mem_values.mp hf).1)

/-- The elements of an enumeration: its values. -/
def Enum.Elem (e : Enum) : Type :=
  { v : Value // v ∈ e.values }

instance (e : Enum) : Finite e.Elem where
  elems := e.values.attach
  complete := List.mem_attach _
  nodup := by
    have h : (e.values.attach.map Subtype.val).Nodup := by
      rw [List.attach_map_subtype_val]; exact e.nodup_values
    exact (List.pairwise_map.mp h).imp fun hne heq => hne (congrArg Subtype.val heq)

/-- An enumeration has as many elements as names. -/
theorem Enum.card_elem (e : Enum) : card e.Elem = e.decl.values.length :=
  List.length_attach.trans (List.length_map _)

/-- Two declarations declare the same enumeration: the same name, the same set of names. -/
def Same (d e : EnumDecl) : Prop :=
  d.name = e.name ∧ ∀ v, v ∈ d.values ↔ v ∈ e.values

/-- Order means nothing: the same names in another order declare the same enumeration. -/
theorem same_of_perm {d e : EnumDecl} (hn : d.name = e.name) (hp : d.values.Perm e.values) :
    Same d e :=
  ⟨hn, fun _ => hp.mem_iff⟩

/-- Reordering the names keeps a declaration valid. -/
theorem valid_of_perm {d e : EnumDecl} (hn : d.name = e.name) (hp : d.values.Perm e.values) :
    Valid d → Valid e :=
  fun h => {
    name := hn ▸ h.name
    values := fun v hv => h.values v (hp.mem_iff.mpr hv)
    nonempty := fun he => h.nonempty (List.Perm.eq_nil (he ▸ hp))
    nodup := hp.nodup_iff.mp h.nodup }

end Dxn
