import Dxn.FiniteSet

namespace DxnTest.FiniteSet

open Dxn

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

end DxnTest.FiniteSet
