import Dxn.FiniteSet

namespace DxnTest.FiniteSet

open Dxn

-- #region light
/-- An enumeration with two names. -/
inductive Light where
  | off
  | on
  deriving DecidableEq, Repr

instance : Finite Light where
  elems := [.off, .on]
  complete := by intro a; cases a <;> simp
  nodup := by decide

-- Distinct names are distinct elements.
example : Light.off ≠ Light.on := by decide

-- Nothing else is in the set.
example : ∀ a : Light, a = .off ∨ a = .on := by
  intro a; cases a <;> simp

-- One element per name.
example : card Light = 2 := rfl
-- #endregion light

-- The number of elements does not depend on how they are listed.
example {α : Type} {l₁ l₂ : List α} (c₁ : ∀ a, a ∈ l₁) (n₁ : l₁.Nodup) (c₂ : ∀ a, a ∈ l₂)
    (n₂ : l₂.Nodup) : l₁.length = l₂.length :=
  length_eq_of_complete_nodup c₁ n₁ c₂ n₂

example {α : Type} (i₁ i₂ : Finite α) : @card α i₁ = @card α i₂ := card_unique i₁ i₂

-- Light listed the other way round still has 2 elements.
def lightReversed : Finite Light where
  elems := [.on, .off]
  complete := by intro a; cases a <;> simp
  nodup := by decide

example : @card Light lightReversed = card Light := card_unique _ _

end DxnTest.FiniteSet
