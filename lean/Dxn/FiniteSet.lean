/-!
# Finite sets

A set is finite when its elements can be listed, each exactly once. The
length of that list is the number of elements, and any two such lists have
the same length, so that number does not depend on how they are listed.

An enumeration defines a finite set by naming its elements. Its names must
be distinct, and nothing but the named elements is in the set.
-/

namespace Dxn

-- #region finite
/-- A finite set of values: a list holding every value exactly once. -/
class Finite (α : Type) where
  elems : List α
  /-- Nothing else is in the set. -/
  complete : ∀ a, a ∈ elems
  /-- Every element appears once. -/
  nodup : elems.Nodup

/-- The number of elements of a finite set, its cardinality. -/
def card (α : Type) [Finite α] : Nat :=
  (Finite.elems : List α).length
-- #endregion finite

-- #region unique
/-- Two lists that each hold every value exactly once have the same length: they are
reorderings of each other. -/
theorem length_eq_of_complete_nodup {α : Type} {l₁ l₂ : List α}
    (c₁ : ∀ a, a ∈ l₁) (n₁ : l₁.Nodup) (c₂ : ∀ a, a ∈ l₂) (n₂ : l₂.Nodup) :
    l₁.length = l₂.length :=
  ((List.perm_ext_iff_of_nodup n₁ n₂).mpr fun a => ⟨fun _ => c₂ a, fun _ => c₁ a⟩).length_eq

/-- The number of elements of a finite set does not depend on how its elements are listed. -/
theorem card_unique {α : Type} (i₁ i₂ : Finite α) : @card α i₁ = @card α i₂ :=
  length_eq_of_complete_nodup i₁.complete i₁.nodup i₂.complete i₂.nodup
-- #endregion unique

end Dxn
