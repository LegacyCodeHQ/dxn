import Dxn.File

/-!
# Renaming an enumeration

A rename changes one enumeration's name in a file, and nothing else. It is
refused, with every reason that applies, when the file has problems, when the
new name breaks the naming rules, when no enumeration has the old name, or
when another enumeration already has the new name. Renaming to the same name
is allowed and changes nothing.

A rename that is not refused keeps the file valid, and maps its values one to
one onto the new file's values: each value keeps its name and takes the new
enumeration name if it had the old one. Renaming back undoes it, renaming to
the same name changes nothing, and two renames in a row are one rename.
-/

namespace Dxn

/-- Why a rename is refused, in the order they are reported. -/
inductive RenameError where
  /-- The file has problems: a rename starts only from a file the checker accepts. -/
  | fileHasProblems
  /-- The new name breaks the naming rules. -/
  | badEnumName (name : Name)
  /-- No enumeration has the old name. -/
  | noSuchEnum (name : Name)
  /-- Another enumeration already has the new name. -/
  | enumExists (name : Name)
  deriving Repr, DecidableEq

/-- A name after the rename: the new name if it was the old one, else as it was. -/
def renameName (old new n : Name) : Name :=
  if n = old then new else n

/-- A declaration after the rename: only its name may change. -/
def EnumDecl.rename (old new : Name) (d : EnumDecl) : EnumDecl :=
  { d with name := renameName old new d.name }

/-- A value after the rename: it keeps its name, and takes the new enumeration name. -/
def Value.renameEnum (old new : Name) (v : Value) : Value :=
  { v with enum := renameName old new v.enum }

/-- Every reason a rename is refused. None means it is done. -/
def renameErrors (f : File) (old new : Name) : List RenameError :=
  if f.check = [] then
    (if isEnumName new then [] else [.badEnumName new]) ++
    (if old ∈ f.names then [] else [.noSuchEnum old]) ++
    (if new ≠ old ∧ new ∈ f.names then [.enumExists new] else [])
  else [.fileHasProblems]

/-- Rename the enumeration `old` to `new` in a file, or say every reason it is refused. -/
def renameEnum (f : File) (old new : Name) : Except (List RenameError) File :=
  if renameErrors f old new = [] then .ok ⟨f.decls.map (EnumDecl.rename old new)⟩
  else .error (renameErrors f old new)

/-- A rename happens exactly when the file is valid, the new name follows the rules, the old
name is an enumeration's, and the new name is no other enumeration's. -/
theorem renameErrors_eq_nil_iff (f : File) (old new : Name) :
    renameErrors f old new = [] ↔
      f.Valid ∧ isEnumName new ∧ old ∈ f.names ∧ (new = old ∨ new ∉ f.names) := by
  unfold renameErrors
  rw [← File.check_eq_nil_iff]
  by_cases hc : f.check = []
  · simp only [hc, ↓reduceIte, List.append_eq_nil_iff, true_and]
    by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.names <;>
      by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp [hn, ho, he, hm]
  · simp [hc]

theorem renameEnum_ok {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    renameErrors f old new = [] ∧ g = ⟨f.decls.map (EnumDecl.rename old new)⟩ := by
  unfold renameEnum at h
  split at h
  · exact ⟨by assumption, (Except.ok.inj h).symm⟩
  · cases h

/-- With the new name no other enumeration's, renaming tells different names apart. -/
theorem renameName_injOn {names : List Name} {old new : Name}
    (hnew : new = old ∨ new ∉ names) :
    ∀ a ∈ names, ∀ b ∈ names, renameName old new a = renameName old new b → a = b := by
  intro a ha b hb heq
  unfold renameName at heq
  by_cases hao : a = old <;> by_cases hbo : b = old <;> simp only [hao, hbo, ↓reduceIte] at heq
  · exact hao.trans hbo.symm
  · rcases hnew with hn | hn
    · exact absurd (heq.symm.trans hn) hbo
    · exact absurd (heq ▸ hb) hn
  · rcases hnew with hn | hn
    · exact absurd (heq.trans hn) hao
    · exact absurd (heq ▸ ha) hn
  · exact heq

theorem names_rename (f : File) (old new : Name) :
    (⟨f.decls.map (EnumDecl.rename old new)⟩ : File).names = f.names.map (renameName old new) := by
  simp [File.names, EnumDecl.rename, List.map_map, Function.comp_def]

/-- A rename keeps the file valid. -/
theorem valid_of_renameEnum {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    g.Valid := by
  obtain ⟨he, rfl⟩ := renameEnum_ok h
  obtain ⟨hv, hn, _, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  refine ⟨?_, ?_⟩
  · simp only [List.mem_map]
    rintro _ ⟨d, hd, rfl⟩
    have hdv := hv.enums d hd
    refine ⟨?_, hdv.values, hdv.nonempty, hdv.nodup⟩
    unfold EnumDecl.rename renameName
    split
    · exact hn
    · exact hdv.name
  · rw [names_rename]
    exact (List.pairwise_map.mpr (hv.nodup.imp_of_mem fun ha hb hne heq =>
      hne (renameName_injOn hnew _ ha _ hb heq)))

/-- Each value goes to its renamed value: only its enumeration's name changes. -/
theorem values_of_renameEnum {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    g.values = f.values.map (Value.renameEnum old new) := by
  obtain ⟨_, rfl⟩ := renameEnum_ok h
  simp only [File.values, List.flatMap_map, List.map_flatMap]
  congr 1
  funext d
  simp [EnumDecl.tagged, EnumDecl.rename, Value.renameEnum, List.map_map, Function.comp_def]

/-- No two values go to the same one, so the map onto the new values is a bijection. -/
theorem injOn_of_renameEnum {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    ∀ v ∈ f.values, ∀ w ∈ f.values, v.renameEnum old new = w.renameEnum old new → v = w := by
  obtain ⟨he, _⟩ := renameEnum_ok h
  obtain ⟨_, _, _, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  have enum_mem : ∀ v ∈ f.values, v.enum ∈ f.names := by
    intro v hv
    simp only [File.values, List.mem_flatMap, EnumDecl.tagged, List.mem_map] at hv
    obtain ⟨d, hd, _, _, rfl⟩ := hv
    exact List.mem_map_of_mem hd
  intro v hv w hw heq
  have hen := renameName_injOn hnew _ (enum_mem _ hv) _ (enum_mem _ hw)
    (congrArg Value.enum heq)
  have hna : (v.renameEnum old new).name = (w.renameEnum old new).name := congrArg Value.name heq
  cases v; cases w
  simp only [Value.renameEnum] at hen hna
  rw [hen, hna]

/-- Only enumeration names change: every enumeration keeps its values, in written order. -/
theorem decls_values_of_renameEnum {f g : File} {old new : Name}
    (h : renameEnum f old new = .ok g) : g.decls.map (·.values) = f.decls.map (·.values) := by
  obtain ⟨_, rfl⟩ := renameEnum_ok h
  simp [EnumDecl.rename, List.map_map, Function.comp_def]

/-- Renaming back undoes a rename. -/
theorem renameEnum_undo {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    renameEnum g new old = .ok f := by
  have hg := valid_of_renameEnum h
  obtain ⟨he, rfl⟩ := renameEnum_ok h
  obtain ⟨hv, _, hold, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  have hback : (f.decls.map (EnumDecl.rename old new)).map (EnumDecl.rename new old) = f.decls := by
    rw [List.map_map]
    refine (List.map_congr_left fun d hd => ?_).trans (List.map_id' _)
    have hdn : d.name ∈ f.names := List.mem_map_of_mem hd
    cases d with
    | mk name values =>
      simp only [Function.comp_def, EnumDecl.rename, renameName]
      by_cases hno : name = old
      · simp [hno]
      · have : name ≠ new := by
          rcases hnew with hn | hn
          · exact hn ▸ hno
          · exact fun h => hn (h ▸ hdn)
        simp [hno, this]
  have hok : renameErrors ⟨f.decls.map (EnumDecl.rename old new)⟩ new old = [] := by
    rw [renameErrors_eq_nil_iff, names_rename]
    obtain ⟨d, hd, hdo⟩ := List.mem_map.mp hold
    refine ⟨hg, hdo ▸ (hv.enums d hd).name, ?_, ?_⟩
    · exact List.mem_map.mpr ⟨old, hold, by simp [renameName]⟩
    · by_cases hno : new = old
      · exact .inl hno.symm
      · refine .inr fun hm => ?_
        obtain ⟨m, _, hm⟩ := List.mem_map.mp hm
        unfold renameName at hm
        split at hm
        · exact hno hm
        · contradiction
  unfold renameEnum
  simp only [hok, ↓reduceIte, hback]

/-- Renaming to its own name gives the same file. -/
theorem renameEnum_self {f : File} {n : Name} (hv : f.Valid) (hn : n ∈ f.names) :
    renameEnum f n n = .ok f := by
  have hok : renameErrors f n n = [] := by
    rw [renameErrors_eq_nil_iff]
    obtain ⟨d, hd, rfl⟩ := List.mem_map.mp hn
    exact ⟨hv, (hv.enums d hd).name, hn, .inl rfl⟩
  have hsame : f.decls.map (EnumDecl.rename n n) = f.decls := by
    refine (List.map_congr_left fun d _ => ?_).trans (List.map_id' _)
    cases d
    simp only [EnumDecl.rename, renameName]
    split <;> simp_all
  unfold renameEnum
  simp only [hok, ↓reduceIte, hsame]

/-- Two renames in a row are one rename: `a` to `b`, then `b` to `c`, is `a` to `c`. -/
theorem renameEnum_comp {f g h : File} {a b c : Name} (hg : renameEnum f a b = .ok g)
    (hh : renameEnum g b c = .ok h) : renameEnum f a c = .ok h := by
  obtain ⟨heg, rfl⟩ := renameEnum_ok hg
  obtain ⟨heh, rfl⟩ := renameEnum_ok hh
  obtain ⟨hv, _, ha, hb⟩ := (renameErrors_eq_nil_iff f a b).mp heg
  obtain ⟨_, hc, _, hcg⟩ := (renameErrors_eq_nil_iff _ b c).mp heh
  rw [names_rename] at hcg
  -- In the file, a name other than `a` is never `b`, and never `c` unless `c` is `a`.
  have hnb : ∀ n ∈ f.names, n ≠ a → n ≠ b := by
    intro n hn hna hnb
    rcases hb with hb | hb
    · exact hna (hnb.trans hb)
    · exact hb (hnb ▸ hn)
  have hca : c = a ∨ c ∉ f.names := by
    by_cases hcb : c = b
    · subst hcb
      exact hb
    · rcases hcg with hcg | hcg
      · exact absurd hcg hcb
      · by_cases hcf : c ∈ f.names
        · by_cases hcea : c = a
          · exact .inl hcea
          · exact absurd (List.mem_map.mpr ⟨c, hcf, by simp [renameName, hcea]⟩) hcg
        · exact .inr hcf
  have hok : renameErrors f a c = [] := (renameErrors_eq_nil_iff f a c).mpr ⟨hv, hc, ha, hca⟩
  have hdecls : (f.decls.map (EnumDecl.rename a b)).map (EnumDecl.rename b c) =
      f.decls.map (EnumDecl.rename a c) := by
    rw [List.map_map]
    refine List.map_congr_left fun d hd => ?_
    have hdn : d.name ∈ f.names := List.mem_map_of_mem hd
    cases d with
    | mk name values =>
      simp only [Function.comp_def, EnumDecl.rename, renameName]
      by_cases hna : name = a
      · simp [hna]
      · simp [hna, hnb name hdn hna]
  unfold renameEnum
  simp only [hok, ↓reduceIte, hdecls]

end Dxn
