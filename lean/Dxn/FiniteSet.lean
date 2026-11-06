/-!
# Finite sets

A set is finite when its elements can be listed, each exactly once. The
length of that list is the number of elements.

An enumeration defines a finite set by naming its elements. Its names must
be distinct, and nothing but the named elements is in the set.
-/

namespace Dxn

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

end Dxn
