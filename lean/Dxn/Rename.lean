import Dxn.File

/-!
# Renaming an enumeration

A rename changes one enumeration's name in a file, and every place a type
varies over it, and nothing else. It is refused, with every reason that
applies, when the file has problems, when the new name breaks the naming
rules, when no enumeration has the old name, or when another declaration
already has the new name. Renaming to the same name is allowed and changes
nothing.

A rename that is not refused keeps the file valid, and maps its values one to
one onto the new file's values: each value keeps its name and takes the new
enumeration name if it had the old one. Renaming back undoes it, renaming to
the same name changes nothing, and two renames in a row are one rename.
-/

namespace Dxn

-- #region refusals
/-- Why a rename is refused, in the order they are reported. -/
inductive RenameError where
  /-- The file has problems: a rename starts only from a file the checker accepts. -/
  | fileHasProblems
  /-- The new name breaks the naming rules. -/
  | badEnumName (name : Name)
  /-- No enumeration has the old name. -/
  | noSuchEnum (name : Name)
  /-- Another declaration, of any kind, already has the new name. -/
  | nameExists (name : Name)
  deriving Repr, DecidableEq

/-- The stable notebook ID belonging to this refusal. -/
def RenameError.ruleId : RenameError → String
  | .fileHasProblems => "RE1"
  | .badEnumName _ => "RE2"
  | .noSuchEnum _ => "RE3"
  | .nameExists _ => "RE4"

-- #endregion refusals

-- #region map
/-- A name after the rename: the new name if it was the old one, else as it was. -/
def renameName (old new n : Name) : Name :=
  if n = old then new else n

/-- An enumeration after the rename: only its name may change. -/
def EnumDecl.rename (old new : Name) (d : EnumDecl) : EnumDecl :=
  { d with name := renameName old new d.name }

/-- A type after the rename: the enumerations it varies over follow the rename. -/
def TypeDecl.rename (old new : Name) (t : TypeDecl) : TypeDecl :=
  { name := renameName old new t.name, varies := t.varies.map (renameName old new) }

/-- A declaration after the rename. -/
def Decl.rename (old new : Name) : Decl → Decl
  | .enum d => .enum (d.rename old new)
  | .type t => .type (t.rename old new)

/-- A value after the rename: it keeps its name, and takes the new enumeration name. -/
def Value.renameEnum (old new : Name) (v : Value) : Value :=
  { v with enum := renameName old new v.enum }
-- #endregion map

-- #region rename
/-- Every reason a rename is refused. None means it is done. -/
def renameErrors (f : File) (old new : Name) : List RenameError :=
  if f.check = [] then
    (if isEnumName new then [] else [.badEnumName new]) ++
    (if old ∈ f.enumNames then [] else [.noSuchEnum old]) ++
    (if new ≠ old ∧ new ∈ f.names then [.nameExists new] else [])
  else [.fileHasProblems]

/-- Rename the enumeration `old` to `new` in a file, or say every reason it is refused. -/
def renameEnum (f : File) (old new : Name) : Except (List RenameError) File :=
  if renameErrors f old new = [] then .ok ⟨f.decls.map (Decl.rename old new)⟩
  else .error (renameErrors f old new)
-- #endregion rename

/-- A rename happens exactly when the file is valid, the new name follows the rules, the old
name is an enumeration's, and the new name is no other declaration's. -/
theorem renameErrors_eq_nil_iff (f : File) (old new : Name) :
    renameErrors f old new = [] ↔
      f.Valid ∧ isEnumName new ∧ old ∈ f.enumNames ∧ (new = old ∨ new ∉ f.names) := by
  unfold renameErrors
  rw [← File.check_eq_nil_iff]
  by_cases hc : f.check = []
  · simp only [hc, ↓reduceIte, List.append_eq_nil_iff, true_and]
    by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.enumNames <;>
      by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp [hn, ho, he, hm]
  · simp [hc]

/-! ## Which reasons are given, and in what order -/

/-- A file with problems gives that as the only reason. -/
theorem renameErrors_of_not_valid {f : File} {old new : Name} (h : ¬f.Valid) :
    renameErrors f old new = [.fileHasProblems] := by
  unfold renameErrors
  rw [← File.check_eq_nil_iff] at h
  simp [h]

/-- In a valid file, a bad new name is given exactly when the new name breaks the rules. -/
theorem badEnumName_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .badEnumName n ∈ renameErrors f old new ↔ n = new ∧ isEnumName new = false := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.enumNames <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- In a valid file, a missing enumeration is given exactly when no enumeration has the old
name. -/
theorem noSuchEnum_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .noSuchEnum n ∈ renameErrors f old new ↔ n = old ∧ old ∉ f.enumNames := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.enumNames <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- In a valid file, a taken name is given exactly when another declaration has the new name. -/
theorem nameExists_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .nameExists n ∈ renameErrors f old new ↔ n = new ∧ new ≠ old ∧ new ∈ f.names := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.enumNames <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- No reason is given twice. -/
theorem nodup_renameErrors (f : File) (old new : Name) : (renameErrors f old new).Nodup := by
  unfold renameErrors
  by_cases hc : f.check = [] <;> by_cases hn : isEnumName new <;>
    by_cases ho : old ∈ f.enumNames <;> by_cases he : new = old <;> by_cases hm : new ∈ f.names <;>
    simp_all

/-- A reason's place in the order: the file's problems, then a bad new name, then a missing
enumeration, then a taken name. -/
def RenameError.rank : RenameError → Nat
  | .fileHasProblems => 0
  | .badEnumName _ => 1
  | .noSuchEnum _ => 2
  | .nameExists _ => 3

/-- The reasons come in their stated order. -/
theorem renameErrors_sorted (f : File) (old new : Name) :
    (renameErrors f old new).Pairwise (fun a b => a.rank ≤ b.rank) := by
  unfold renameErrors
  by_cases hc : f.check = [] <;> by_cases hn : isEnumName new <;>
    by_cases ho : old ∈ f.enumNames <;> by_cases he : new = old <;> by_cases hm : new ∈ f.names <;>
    simp_all [RenameError.rank]

theorem renameEnum_ok {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    renameErrors f old new = [] ∧ g = ⟨f.decls.map (Decl.rename old new)⟩ := by
  unfold renameEnum at h
  split at h
  · exact ⟨by assumption, (Except.ok.inj h).symm⟩
  · cases h

/-- With the new name no other declaration's, renaming tells different names apart. -/
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

/-! ## Renaming every name a declaration mentions -/

/-- Every name a declaration mentions: its own, and for a type, those it varies over. -/
def Decl.mentions : Decl → List Name
  | .enum d => [d.name]
  | .type t => t.name :: t.varies

/-- A declaration with every name it mentions sent through `φ`. -/
def Decl.mapNames (φ : Name → Name) : Decl → Decl
  | .enum d => .enum { d with name := φ d.name }
  | .type t => .type { name := φ t.name, varies := t.varies.map φ }

theorem Decl.rename_eq_mapNames (old new : Name) (x : Decl) :
    x.rename old new = x.mapNames (renameName old new) := by
  cases x <;> rfl

theorem Decl.mapNames_mapNames (φ ψ : Name → Name) (x : Decl) :
    (x.mapNames φ).mapNames ψ = x.mapNames (ψ ∘ φ) := by
  cases x <;> simp [Decl.mapNames, List.map_map]

theorem Decl.mapNames_congr {φ ψ : Name → Name} {x : Decl}
    (h : ∀ n ∈ x.mentions, φ n = ψ n) : x.mapNames φ = x.mapNames ψ := by
  cases x with
  | enum d => simp_all [Decl.mapNames, Decl.mentions]
  | type t =>
    simp only [Decl.mentions, List.mem_cons, forall_eq_or_imp] at h
    simp [Decl.mapNames, h.1, List.map_congr_left h.2]

theorem Decl.mapNames_id {φ : Name → Name} {x : Decl} (h : ∀ n ∈ x.mentions, φ n = n) :
    x.mapNames φ = x := by
  rw [Decl.mapNames_congr (ψ := id) h]
  cases x <;> simp [Decl.mapNames]

/-- In a valid file, every name a declaration mentions is one of the file's names. -/
theorem File.mentions_subset {f : File} (hv : f.Valid) {x : Decl} (hx : x ∈ f.decls) :
    ∀ n ∈ x.mentions, n ∈ f.names := by
  have hname : x.name ∈ f.names := List.mem_map_of_mem hx
  cases x with
  | enum d => simpa [Decl.mentions, Decl.name] using hname
  | type t =>
    intro n hn
    rcases List.mem_cons.mp hn with rfl | hn
    · exact hname
    · exact File.enumNames_subset ((hv.types t (File.mem_types.mpr hx)).known n hn)

theorem names_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).names = f.names.map (renameName old new) := by
  simp only [File.names, List.map_map]
  exact List.map_congr_left fun x _ => by cases x <;> rfl

theorem enums_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).enums = f.enums.map (EnumDecl.rename old new) := by
  simp only [File.enums, List.filterMap_map, List.map_filterMap]
  congr 1
  funext x
  cases x <;> rfl

theorem types_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).types = f.types.map (TypeDecl.rename old new) := by
  simp only [File.types, List.filterMap_map, List.map_filterMap]
  congr 1
  funext x
  cases x <;> rfl

theorem enumNames_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).enumNames =
      f.enumNames.map (renameName old new) := by
  simp [File.enumNames, enums_rename, EnumDecl.rename, List.map_map, Function.comp_def]

/-! ## What a rename keeps -/

/-- A rename keeps the file valid. -/
theorem valid_of_renameEnum {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    g.Valid := by
  obtain ⟨he, rfl⟩ := renameEnum_ok h
  obtain ⟨hv, hn, _, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  have hinj : ∀ a ∈ f.names, ∀ b ∈ f.names, renameName old new a = renameName old new b → a = b :=
    renameName_injOn hnew
  refine ⟨?_, ?_, ?_⟩
  · rw [enums_rename]
    simp only [List.mem_map]
    rintro _ ⟨d, hd, rfl⟩
    have hdv := hv.enums d hd
    refine ⟨?_, hdv.values, hdv.nonempty, hdv.nodup⟩
    unfold EnumDecl.rename renameName
    split
    · exact hn
    · exact hdv.name
  · rw [types_rename, enumNames_rename]
    simp only [List.mem_map]
    rintro _ ⟨t, ht, rfl⟩
    have htv := hv.types t ht
    refine ⟨?_, ?_, ?_⟩
    · unfold TypeDecl.rename renameName
      split
      · exact hn
      · exact htv.name
    · intro n hn'
      obtain ⟨m, hm, rfl⟩ := List.mem_map.mp hn'
      exact List.mem_map_of_mem (htv.known m hm)
    · have hsub : ∀ m ∈ t.varies, m ∈ f.names := fun m hm =>
        File.enumNames_subset (htv.known m hm)
      exact List.pairwise_map.mpr (htv.nodup.imp_of_mem fun ha hb hne heq =>
        hne (hinj _ (hsub _ ha) _ (hsub _ hb) heq))
  · rw [names_rename]
    exact List.pairwise_map.mpr (hv.nodup.imp_of_mem fun ha hb hne heq =>
      hne (hinj _ ha _ hb heq))

/-- Each value goes to its renamed value: only its enumeration's name changes. -/
theorem values_of_renameEnum {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    g.values = f.values.map (Value.renameEnum old new) := by
  obtain ⟨_, rfl⟩ := renameEnum_ok h
  simp only [File.values, enums_rename, List.flatMap_map, List.map_flatMap]
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
    exact File.enumNames_subset (List.mem_map_of_mem hd)
  intro v hv w hw heq
  have hen := renameName_injOn hnew _ (enum_mem _ hv) _ (enum_mem _ hw)
    (congrArg Value.enum heq)
  have hna : (v.renameEnum old new).name = (w.renameEnum old new).name := congrArg Value.name heq
  cases v; cases w
  simp only [Value.renameEnum] at hen hna
  rw [hen, hna]

/-- Only names change: every enumeration keeps its values, in written order. -/
theorem enums_values_of_renameEnum {f g : File} {old new : Name}
    (h : renameEnum f old new = .ok g) : g.enums.map (·.values) = f.enums.map (·.values) := by
  obtain ⟨_, rfl⟩ := renameEnum_ok h
  simp [enums_rename, EnumDecl.rename, List.map_map, Function.comp_def]

/-- Every type keeps its name, and varies over the same enumerations, renamed. -/
theorem types_of_renameEnum {f g : File} {old new : Name}
    (h : renameEnum f old new = .ok g) : g.types = f.types.map (TypeDecl.rename old new) := by
  obtain ⟨_, rfl⟩ := renameEnum_ok h
  exact types_rename f old new

/-! ## Undoing and repeating a rename -/

/-- Renaming back undoes a rename. -/
theorem renameEnum_undo {f g : File} {old new : Name} (h : renameEnum f old new = .ok g) :
    renameEnum g new old = .ok f := by
  have hg := valid_of_renameEnum h
  obtain ⟨he, rfl⟩ := renameEnum_ok h
  obtain ⟨hv, _, hold, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  have hname : ∀ m ∈ f.names, renameName new old (renameName old new m) = m := by
    intro m hm
    unfold renameName
    by_cases hmo : m = old
    · simp [hmo]
    · have : m ≠ new := by
        rcases hnew with hn | hn
        · exact hn ▸ hmo
        · exact fun h => hn (h ▸ hm)
      simp [hmo, this]
  have hback : (f.decls.map (Decl.rename old new)).map (Decl.rename new old) = f.decls := by
    rw [List.map_map]
    refine (List.map_congr_left fun x hx => ?_).trans (List.map_id' _)
    simp only [Function.comp_def, Decl.rename_eq_mapNames, Decl.mapNames_mapNames]
    exact Decl.mapNames_id fun m hm => hname m (File.mentions_subset hv hx m hm)
  have hok : renameErrors ⟨f.decls.map (Decl.rename old new)⟩ new old = [] := by
    rw [renameErrors_eq_nil_iff, names_rename, enumNames_rename]
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
theorem renameEnum_self {f : File} {n : Name} (hv : f.Valid) (hn : n ∈ f.enumNames) :
    renameEnum f n n = .ok f := by
  have hok : renameErrors f n n = [] := by
    rw [renameErrors_eq_nil_iff]
    obtain ⟨d, hd, rfl⟩ := List.mem_map.mp hn
    exact ⟨hv, (hv.enums d hd).name, hn, .inl rfl⟩
  have hsame : f.decls.map (Decl.rename n n) = f.decls := by
    refine (List.map_congr_left fun x _ => ?_).trans (List.map_id' _)
    rw [Decl.rename_eq_mapNames]
    exact Decl.mapNames_id fun m _ => by unfold renameName; split <;> simp_all
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
  have hname : ∀ m ∈ f.names, renameName b c (renameName a b m) = renameName a c m := by
    intro m hm
    unfold renameName
    by_cases hma : m = a
    · simp [hma]
    · simp [hma, hnb m hm hma]
  have hdecls : (f.decls.map (Decl.rename a b)).map (Decl.rename b c) =
      f.decls.map (Decl.rename a c) := by
    rw [List.map_map]
    refine List.map_congr_left fun x hx => ?_
    simp only [Function.comp_def, Decl.rename_eq_mapNames, Decl.mapNames_mapNames]
    exact Decl.mapNames_congr fun m hm => hname m (File.mentions_subset hv hx m hm)
  unfold renameEnum
  simp only [hok, ↓reduceIte, hdecls]

end Dxn
