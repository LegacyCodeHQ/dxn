import Dxn.Rename

namespace DxnTest.Rename

open Dxn

-- Lets #guard compare results; core Lean gives Except no decidable equality.
instance {ε α : Type} [DecidableEq ε] [DecidableEq α] : DecidableEq (Except ε α)
  | .ok a, .ok b =>
    if h : a = b then isTrue (h ▸ rfl) else isFalse fun e => h (Except.ok.inj e)
  | .error a, .error b =>
    if h : a = b then isTrue (h ▸ rfl) else isFalse fun e => h (Except.error.inj e)
  | .ok _, .error _ => isFalse fun e => by cases e
  | .error _, .ok _ => isFalse fun e => by cases e

def file : File := ⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Power", ["off", "on"]⟩]⟩

-- Renaming changes the enumeration's name, and nothing else.
#guard renameEnum file "Light" "Lamp" =
  .ok ⟨[.enum ⟨"Lamp", ["off", "on"]⟩, .enum ⟨"Power", ["off", "on"]⟩]⟩

def lamp : File :=
  ⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Power", ["mains", "battery"]⟩,
    .type ⟨"Lamp", ["Light", "Power"]⟩]⟩

-- A type that varies over the enumeration follows the rename.
#guard renameEnum lamp "Light" "Glow" =
  .ok ⟨[.enum ⟨"Glow", ["off", "on"]⟩, .enum ⟨"Power", ["mains", "battery"]⟩,
    .type ⟨"Lamp", ["Glow", "Power"]⟩]⟩

-- Only an enumeration is renamed: a type's name is not an enumeration's.
#guard renameEnum lamp "Lamp" "Bulb" = .error [.noSuchEnum "Lamp"]

-- Refused onto a name any declaration has, a type's included.
#guard renameEnum lamp "Light" "Lamp" = .error [.nameExists "Lamp"]

-- Renaming to its own name is allowed and changes nothing.
#guard renameEnum file "Light" "Light" = .ok file

-- Refused while the file has problems.
#guard renameEnum ⟨[.enum ⟨"Light", []⟩]⟩ "Light" "Lamp" = .error [.fileHasProblems]

-- Refused when the new name breaks the naming rules.
#guard renameEnum file "Light" "lamp" = .error [.badEnumName "lamp"]

-- Refused when no enumeration has the old name.
#guard renameEnum file "Bulb" "Lamp" = .error [.noSuchEnum "Bulb"]

-- Refused when another declaration already has the new name.
#guard renameEnum file "Light" "Power" = .error [.nameExists "Power"]

-- Every reason at once, in this order.
#guard renameEnum file "Bulb" "power" = .error [.badEnumName "power", .noSuchEnum "Bulb"]
#guard renameEnum file "Bulb" "Power" = .error [.noSuchEnum "Bulb", .nameExists "Power"]

-- A rename happens exactly when the file is valid, the new name follows the rules, the old
-- name is an enumeration's, and the new name is no other declaration's.
example (f : File) (old new : Name) :
    renameErrors f old new = [] ↔
      f.Valid ∧ isEnumName new ∧ old ∈ f.enumNames ∧ (new = old ∨ new ∉ f.names) :=
  renameErrors_eq_nil_iff f old new

-- A file with problems gives that as the only reason.
example (f : File) (old new : Name) (h : ¬f.Valid) :
    renameErrors f old new = [.fileHasProblems] :=
  renameErrors_of_not_valid h

-- In a valid file, each reason is given exactly when it applies.
example (f : File) (old new n : Name) (hv : f.Valid) :
    .badEnumName n ∈ renameErrors f old new ↔ n = new ∧ isEnumName new = false :=
  badEnumName_mem_renameErrors hv
example (f : File) (old new n : Name) (hv : f.Valid) :
    .noSuchEnum n ∈ renameErrors f old new ↔ n = old ∧ old ∉ f.enumNames :=
  noSuchEnum_mem_renameErrors hv
example (f : File) (old new n : Name) (hv : f.Valid) :
    .nameExists n ∈ renameErrors f old new ↔ n = new ∧ new ≠ old ∧ new ∈ f.names :=
  nameExists_mem_renameErrors hv

-- No reason is given twice, and the reasons come in their stated order.
example (f : File) (old new : Name) : (renameErrors f old new).Nodup := nodup_renameErrors f old new
example (f : File) (old new : Name) :
    (renameErrors f old new).Pairwise (fun a b => a.rank ≤ b.rank) :=
  renameErrors_sorted f old new

-- A rename keeps the file valid.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) : g.Valid :=
  valid_of_renameEnum h

-- Each value goes to its renamed value: only its enumeration's name changes.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) :
    g.values = f.values.map (Value.renameEnum old new) :=
  values_of_renameEnum h

-- No two values go to the same one, so with the line above, the map is a bijection.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) :
    ∀ v ∈ f.values, ∀ w ∈ f.values, v.renameEnum old new = w.renameEnum old new → v = w :=
  injOn_of_renameEnum h

-- Only names change: every enumeration keeps its values, in written order.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) :
    g.enums.map (·.values) = f.enums.map (·.values) :=
  enums_values_of_renameEnum h

-- Every type keeps its name, and varies over the same enumerations, renamed.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) :
    g.types = f.types.map (TypeDecl.rename old new) :=
  types_of_renameEnum h

-- Renaming back undoes it.
example (f g : File) (old new : Name) (h : renameEnum f old new = .ok g) :
    renameEnum g new old = .ok f :=
  renameEnum_undo h

-- Two renames in a row are one rename.
#guard (do let g ← renameEnum file "Light" "Lamp"; renameEnum g "Lamp" "Bulb") =
  renameEnum file "Light" "Bulb"

example (f g h : File) (a b c : Name) (hg : renameEnum f a b = .ok g)
    (hh : renameEnum g b c = .ok h) : renameEnum f a c = .ok h :=
  renameEnum_comp hg hh

-- Renaming to its own name gives the same file.
example (f : File) (n : Name) (hv : f.Valid) (hn : n ∈ f.enumNames) : renameEnum f n n = .ok f :=
  renameEnum_self hv hn

#guard ([RenameError.fileHasProblems, .badEnumName "lamp", .noSuchEnum "Missing", .nameExists "Power"].map RenameError.ruleId) = ["RE1", "RE2", "RE3", "RE4"]

end DxnTest.Rename
