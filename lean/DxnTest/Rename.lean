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
#guard renameDecl file "Light" "Lamp" =
  .ok ⟨[.enum ⟨"Lamp", ["off", "on"]⟩, .enum ⟨"Power", ["off", "on"]⟩]⟩

def lamp : File :=
  ⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Power", ["mains", "battery"]⟩,
    .type ⟨"Lamp", ["Light", "Power"]⟩]⟩

-- A type that varies over the enumeration follows the rename.
#guard renameDecl lamp "Light" "Glow" =
  .ok ⟨[.enum ⟨"Glow", ["off", "on"]⟩, .enum ⟨"Power", ["mains", "battery"]⟩,
    .type ⟨"Lamp", ["Glow", "Power"]⟩]⟩

def reviewed : File :=
  ⟨[.enum ⟨"Verdict", ["approved", "changes"]⟩,
    .record ⟨"Review", [("verdict", "Verdict")]⟩]⟩

-- A record field of the enumeration follows the rename; the field keeps its name.
#guard renameDecl reviewed "Verdict" "Decision" =
  .ok ⟨[.enum ⟨"Decision", ["approved", "changes"]⟩,
    .record ⟨"Review", [("verdict", "Decision")]⟩]⟩

-- A record is renamed too, and every field of its type follows.
def nested : File :=
  ⟨[.enum ⟨"Verdict", ["approved", "changes"]⟩, .record ⟨"Finding", [("verdict", "Verdict")]⟩,
    .record ⟨"Review", [("finding", "Finding")]⟩]⟩

#guard renameDecl nested "Finding" "Issue" =
  .ok ⟨[.enum ⟨"Verdict", ["approved", "changes"]⟩, .record ⟨"Issue", [("verdict", "Verdict")]⟩,
    .record ⟨"Review", [("finding", "Issue")]⟩]⟩

-- A new name may not be a record's.
#guard renameDecl reviewed "Verdict" "Review" = .error [.nameExists "Review"]

-- A type is renamed too; nothing refers to a type yet.
#guard renameDecl lamp "Lamp" "Bulb" =
  .ok ⟨[.enum ⟨"Light", ["off", "on"]⟩, .enum ⟨"Power", ["mains", "battery"]⟩,
    .type ⟨"Bulb", ["Light", "Power"]⟩]⟩

-- Refused when no declaration has the old name.
#guard renameDecl lamp "Missing" "Bulb" = .error [.noSuchName "Missing"]

-- Refused onto a name any declaration has, a type's included.
#guard renameDecl lamp "Light" "Lamp" = .error [.nameExists "Lamp"]

-- Renaming to its own name is allowed and changes nothing.
#guard renameDecl file "Light" "Light" = .ok file

-- Refused while the file has problems.
#guard renameDecl ⟨[.enum ⟨"Light", []⟩]⟩ "Light" "Lamp" = .error [.fileHasProblems]

-- Refused when the new name breaks the naming rules.
#guard renameDecl file "Light" "lamp" = .error [.badName "lamp"]

-- Refused when no enumeration has the old name.
#guard renameDecl file "Bulb" "Lamp" = .error [.noSuchName "Bulb"]

-- Refused when another declaration already has the new name.
#guard renameDecl file "Light" "Power" = .error [.nameExists "Power"]

-- Every reason at once, in this order.
#guard renameDecl file "Bulb" "power" = .error [.badName "power", .noSuchName "Bulb"]
#guard renameDecl file "Bulb" "Power" = .error [.noSuchName "Bulb", .nameExists "Power"]

-- A rename happens exactly when the file is valid, the new name follows the rules, the old
-- name is a declaration's, and the new name is no other declaration's.
example (f : File) (old new : Name) :
    renameErrors f old new = [] ↔
      f.Valid ∧ isEnumName new ∧ old ∈ f.names ∧ (new = old ∨ new ∉ f.names) :=
  renameErrors_eq_nil_iff f old new

-- A file with problems gives that as the only reason.
example (f : File) (old new : Name) (h : ¬f.Valid) :
    renameErrors f old new = [.fileHasProblems] :=
  renameErrors_of_not_valid h

-- In a valid file, each reason is given exactly when it applies.
example (f : File) (old new n : Name) (hv : f.Valid) :
    .badName n ∈ renameErrors f old new ↔ n = new ∧ isEnumName new = false :=
  badName_mem_renameErrors hv
example (f : File) (old new n : Name) (hv : f.Valid) :
    .noSuchName n ∈ renameErrors f old new ↔ n = old ∧ old ∉ f.names :=
  noSuchName_mem_renameErrors hv
example (f : File) (old new n : Name) (hv : f.Valid) :
    .nameExists n ∈ renameErrors f old new ↔ n = new ∧ new ≠ old ∧ new ∈ f.names :=
  nameExists_mem_renameErrors hv

-- No reason is given twice, and the reasons come in their stated order.
example (f : File) (old new : Name) : (renameErrors f old new).Nodup := nodup_renameErrors f old new
example (f : File) (old new : Name) :
    (renameErrors f old new).Pairwise (fun a b => a.rank ≤ b.rank) :=
  renameErrors_sorted f old new

-- A rename keeps the file valid.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) : g.Valid :=
  valid_of_renameDecl h

-- Each value goes to its renamed value: only its enumeration's name changes.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    g.values = f.values.map (Value.renameEnum old new) :=
  values_of_renameDecl h

-- No two values go to the same one, so with the line above, the map is a bijection.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    ∀ v ∈ f.values, ∀ w ∈ f.values, v.renameEnum old new = w.renameEnum old new → v = w :=
  injOn_of_renameDecl h

-- Only names change: every enumeration keeps its values, in written order.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    g.enums.map (·.values) = f.enums.map (·.values) :=
  enums_values_of_renameDecl h

-- Every record keeps its name and fields, each field's type renamed.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    g.records = f.records.map (RecordDecl.rename old new) :=
  records_of_renameDecl h

-- Every type keeps its name, and varies over the same enumerations, renamed.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    g.types = f.types.map (TypeDecl.rename old new) :=
  types_of_renameDecl h

-- Renaming back undoes it.
example (f g : File) (old new : Name) (h : renameDecl f old new = .ok g) :
    renameDecl g new old = .ok f :=
  renameDecl_undo h

-- Two renames in a row are one rename.
#guard (do let g ← renameDecl file "Light" "Lamp"; renameDecl g "Lamp" "Bulb") =
  renameDecl file "Light" "Bulb"

example (f g h : File) (a b c : Name) (hg : renameDecl f a b = .ok g)
    (hh : renameDecl g b c = .ok h) : renameDecl f a c = .ok h :=
  renameDecl_comp hg hh

-- Renaming to its own name gives the same file.
example (f : File) (n : Name) (hv : f.Valid) (hn : n ∈ f.names) : renameDecl f n n = .ok f :=
  renameDecl_self hv hn

#guard ([RenameError.fileHasProblems, .badName "lamp", .noSuchName "Missing", .nameExists "Power"].map RenameError.ruleId) = ["RE1", "RE2", "RE3", "RE4"]

end DxnTest.Rename
