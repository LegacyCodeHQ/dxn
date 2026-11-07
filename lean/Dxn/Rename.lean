import Dxn.File

/-!
# Renaming a declaration

A rename changes one declaration's name in a file, an enumeration's, a type's
or a record's, and every place that refers to it: a type varying over it, or a
record field of its type. Nothing else changes. It is refused, with every
reason that applies, when the file has problems, when the new name breaks the
naming rules, when no declaration has the old name, or when another declaration
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
  | badName (name : Name)
  /-- No declaration has the old name. -/
  | noSuchName (name : Name)
  /-- Another declaration, of any kind, already has the new name. -/
  | nameExists (name : Name)
  deriving Repr, DecidableEq

/-- The stable notebook ID belonging to this refusal. -/
def RenameError.ruleId : RenameError → String
  | .fileHasProblems => "RE1"
  | .badName _ => "RE2"
  | .noSuchName _ => "RE3"
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

/-- A record after the rename: its fields keep their names, and their types follow the rename. -/
def RecordDecl.rename (old new : Name) (r : RecordDecl) : RecordDecl :=
  { name := renameName old new r.name,
    fields := r.fields.map fun field => (field.1, renameName old new field.2) }

/-- A declaration after the rename. -/
def Decl.rename (old new : Name) : Decl → Decl
  | .enum d => .enum (d.rename old new)
  | .type t => .type (t.rename old new)
  | .record r => .record (r.rename old new)

/-- A value after the rename: it keeps its name, and takes the new enumeration name. -/
def Value.renameEnum (old new : Name) (v : Value) : Value :=
  { v with enum := renameName old new v.enum }
-- #endregion map

-- #region rename
/-- Every reason a rename is refused. None means it is done. -/
def renameErrors (f : File) (old new : Name) : List RenameError :=
  if f.check = [] then
    (if isEnumName new then [] else [.badName new]) ++
    (if old ∈ f.names then [] else [.noSuchName old]) ++
    (if new ≠ old ∧ new ∈ f.names then [.nameExists new] else [])
  else [.fileHasProblems]

/-- Rename the declaration `old` to `new` in a file, or say every reason it is refused. -/
def renameDecl (f : File) (old new : Name) : Except (List RenameError) File :=
  if renameErrors f old new = [] then .ok ⟨f.decls.map (Decl.rename old new)⟩
  else .error (renameErrors f old new)
-- #endregion rename

/-- A rename happens exactly when the file is valid, the new name follows the rules, the old
name is a declaration's, and the new name is no other declaration's. -/
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

/-! ## Which reasons are given, and in what order -/

/-- A file with problems gives that as the only reason. -/
theorem renameErrors_of_not_valid {f : File} {old new : Name} (h : ¬f.Valid) :
    renameErrors f old new = [.fileHasProblems] := by
  unfold renameErrors
  rw [← File.check_eq_nil_iff] at h
  simp [h]

/-- In a valid file, a bad new name is given exactly when the new name breaks the rules. -/
theorem badName_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .badName n ∈ renameErrors f old new ↔ n = new ∧ isEnumName new = false := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.names <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- In a valid file, a missing name is given exactly when no declaration has the old name. -/
theorem noSuchName_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .noSuchName n ∈ renameErrors f old new ↔ n = old ∧ old ∉ f.names := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.names <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- In a valid file, a taken name is given exactly when another declaration has the new name. -/
theorem nameExists_mem_renameErrors {f : File} {old new n : Name} (hv : f.Valid) :
    .nameExists n ∈ renameErrors f old new ↔ n = new ∧ new ≠ old ∧ new ∈ f.names := by
  unfold renameErrors
  rw [(File.check_eq_nil_iff f).mpr hv]
  by_cases hn : isEnumName new <;> by_cases ho : old ∈ f.names <;>
    by_cases he : new = old <;> by_cases hm : new ∈ f.names <;> simp_all

/-- No reason is given twice. -/
theorem nodup_renameErrors (f : File) (old new : Name) : (renameErrors f old new).Nodup := by
  unfold renameErrors
  by_cases hc : f.check = [] <;> by_cases hn : isEnumName new <;>
    by_cases ho : old ∈ f.names <;> by_cases he : new = old <;> by_cases hm : new ∈ f.names <;>
    simp_all

/-- A reason's place in the order: the file's problems, then a bad new name, then a missing
enumeration, then a taken name. -/
def RenameError.rank : RenameError → Nat
  | .fileHasProblems => 0
  | .badName _ => 1
  | .noSuchName _ => 2
  | .nameExists _ => 3

/-- The reasons come in their stated order. -/
theorem renameErrors_sorted (f : File) (old new : Name) :
    (renameErrors f old new).Pairwise (fun a b => a.rank ≤ b.rank) := by
  unfold renameErrors
  by_cases hc : f.check = [] <;> by_cases hn : isEnumName new <;>
    by_cases ho : old ∈ f.names <;> by_cases he : new = old <;> by_cases hm : new ∈ f.names <;>
    simp_all [RenameError.rank]

theorem renameDecl_ok {f g : File} {old new : Name} (h : renameDecl f old new = .ok g) :
    renameErrors f old new = [] ∧ g = ⟨f.decls.map (Decl.rename old new)⟩ := by
  unfold renameDecl at h
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
  | .record r => r.name :: r.fieldTypes

/-- A declaration with every name it mentions sent through `φ`. -/
def Decl.mapNames (φ : Name → Name) : Decl → Decl
  | .enum d => .enum { d with name := φ d.name }
  | .type t => .type { name := φ t.name, varies := t.varies.map φ }
  | .record r => .record { name := φ r.name, fields := r.fields.map fun field => (field.1, φ field.2) }

theorem Decl.rename_eq_mapNames (old new : Name) (x : Decl) :
    x.rename old new = x.mapNames (renameName old new) := by
  cases x <;> rfl

theorem Decl.mapNames_mapNames (φ ψ : Name → Name) (x : Decl) :
    (x.mapNames φ).mapNames ψ = x.mapNames (ψ ∘ φ) := by
  cases x <;> simp [Decl.mapNames, List.map_map, Function.comp_def]

theorem Decl.mapNames_congr {φ ψ : Name → Name} {x : Decl}
    (h : ∀ n ∈ x.mentions, φ n = ψ n) : x.mapNames φ = x.mapNames ψ := by
  cases x with
  | enum d => simp_all [Decl.mapNames, Decl.mentions]
  | type t =>
    simp only [Decl.mentions, List.mem_cons, forall_eq_or_imp] at h
    simp [Decl.mapNames, h.1, List.map_congr_left h.2]
  | record r =>
    simp only [Decl.mentions, List.mem_cons, forall_eq_or_imp, RecordDecl.fieldTypes,
      List.mem_map] at h
    simp only [Decl.mapNames, h.1, Decl.record.injEq, RecordDecl.mk.injEq, true_and]
    exact List.map_congr_left fun field hf => by rw [h.2 _ ⟨field, hf, rfl⟩]

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
  | record r =>
    intro n hn
    rcases List.mem_cons.mp hn with rfl | hn
    · exact hname
    · rcases ((hv.records r (File.mem_records.mpr hx)).1.known n hn) with he | hr
      · exact File.enumNames_subset he
      · exact File.recordNames_subset hr

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

theorem records_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).records =
      f.records.map (RecordDecl.rename old new) := by
  simp only [File.records, List.filterMap_map, List.map_filterMap]
  congr 1
  funext x
  cases x <;> rfl

theorem recordNames_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).recordNames =
      f.recordNames.map (renameName old new) := by
  simp [File.recordNames, records_rename, RecordDecl.rename, List.map_map, Function.comp_def]

theorem enumNames_rename (f : File) (old new : Name) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).enumNames =
      f.enumNames.map (renameName old new) := by
  simp [File.enumNames, enums_rename, EnumDecl.rename, List.map_map, Function.comp_def]

/-! ## A rename keeps which records contain themselves -/

theorem any_congr_mem {α : Type} {l : List α} {p q : α → Bool} (h : ∀ a ∈ l, p a = q a) :
    l.any p = l.any q := by
  induction l with
  | nil => rfl
  | cons a l ih =>
    simp only [List.any_cons, h a List.mem_cons_self,
      ih fun b hb => h b (List.mem_cons_of_mem _ hb)]

theorem find?_congr_mem {α : Type} {l : List α} {p q : α → Bool} (h : ∀ a ∈ l, p a = q a) :
    l.find? p = l.find? q := by
  induction l with
  | nil => rfl
  | cons a l ih =>
    simp only [List.find?_cons, h a List.mem_cons_self,
      ih fun b hb => h b (List.mem_cons_of_mem _ hb)]

section graph

variable {f : File} {old new : Name}

/-- Where a record's fields lead, after a rename that tells the file's names apart. -/
theorem fieldRecords_rename (hv : f.Valid)
    (hinj : ∀ a ∈ f.names, ∀ b ∈ f.names, renameName old new a = renameName old new b → a = b)
    {n : Name} (hn : n ∈ f.names) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).fieldRecords (renameName old new n) =
      (f.fieldRecords n).map (renameName old new) := by
  have hrec : ∀ r ∈ f.records, r.name ∈ f.names := fun r hr =>
    File.recordNames_subset (List.mem_map_of_mem hr)
  have hfind : f.records.find? ((fun x => x.name == renameName old new n) ∘
      RecordDecl.rename old new) = f.records.find? (·.name == n) :=
    find?_congr_mem fun r hr => by
      simp only [Function.comp_def, RecordDecl.rename]
      exact decide_eq_decide.mpr ⟨hinj _ (hrec r hr) _ hn, fun h => h ▸ rfl⟩
  unfold File.fieldRecords
  rw [records_rename, List.find?_map, hfind, recordNames_rename]
  cases hr : f.records.find? (·.name == n) with
  | none => rfl
  | some r =>
    have hrm : r ∈ f.records := List.mem_of_find?_eq_some hr
    have hknown := (hv.records r hrm).1.known
    have hft : (r.rename old new).fieldTypes = r.fieldTypes.map (renameName old new) := by
      simp [RecordDecl.rename, RecordDecl.fieldTypes, List.map_map, Function.comp_def]
    simp only [Option.map_some]
    rw [hft, List.filter_map]
    congr 1
    apply List.filter_congr
    intro t ht
    have htn : t ∈ f.names := by
      rcases hknown t ht with he | hr'
      · exact File.enumNames_subset he
      · exact File.recordNames_subset hr'
    simp only [Function.comp_def, decide_eq_decide, List.mem_map]
    constructor
    · rintro ⟨m, hm, heq⟩
      exact hinj _ (File.recordNames_subset hm) _ htn heq ▸ hm
    · exact fun h => ⟨t, h, rfl⟩

/-- After the rename, a record reaches another exactly when it did before. -/
theorem reachesWithin_rename (hv : f.Valid)
    (hinj : ∀ a ∈ f.names, ∀ b ∈ f.names, renameName old new a = renameName old new b → a = b)
    (k : Nat) {a b : Name} (ha : a ∈ f.names) (hb : b ∈ f.names) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).reachesWithin k (renameName old new a)
        (renameName old new b) = f.reachesWithin k a b := by
  induction k generalizing a with
  | zero => rfl
  | succ k ih =>
    unfold File.reachesWithin
    rw [fieldRecords_rename hv hinj ha, List.any_map]
    apply any_congr_mem
    intro c hc
    have hcn : c ∈ f.names := by
      unfold File.fieldRecords at hc
      split at hc
      · exact File.recordNames_subset (of_decide_eq_true (List.mem_filter.mp hc).2)
      · cases hc
    simp only [Function.comp_def, ih hcn]
    congr 1
    exact decide_eq_decide.mpr ⟨hinj _ hcn _ hb, fun h => h ▸ rfl⟩

/-- A rename keeps which records contain themselves. -/
theorem containsItself_rename (hv : f.Valid)
    (hinj : ∀ a ∈ f.names, ∀ b ∈ f.names, renameName old new a = renameName old new b → a = b)
    {n : Name} (hn : n ∈ f.names) :
    (⟨f.decls.map (Decl.rename old new)⟩ : File).containsItself (renameName old new n) =
      f.containsItself n := by
  unfold File.containsItself
  rw [records_rename, List.length_map]
  exact reachesWithin_rename hv hinj _ hn hn

end graph

/-! ## What a rename keeps -/

/-- A rename keeps the file valid. -/
theorem valid_of_renameDecl {f g : File} {old new : Name} (h : renameDecl f old new = .ok g) :
    g.Valid := by
  obtain ⟨he, rfl⟩ := renameDecl_ok h
  obtain ⟨hv, hn, _, hnew⟩ := (renameErrors_eq_nil_iff f old new).mp he
  have hinj : ∀ a ∈ f.names, ∀ b ∈ f.names, renameName old new a = renameName old new b → a = b :=
    renameName_injOn hnew
  refine ⟨?_, ?_, ?_, ?_⟩
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
  · rw [records_rename, enumNames_rename, recordNames_rename]
    simp only [List.mem_map]
    rintro _ ⟨r, hr, rfl⟩
    obtain ⟨hrv, hself⟩ := hv.records r hr
    have hrn : r.name ∈ f.names := File.recordNames_subset (List.mem_map_of_mem hr)
    refine ⟨⟨?_, ?_, ?_, ?_, ?_⟩, ?_⟩
    · unfold RecordDecl.rename renameName
      split
      · exact hn
      · exact hrv.name
    · simpa [RecordDecl.rename] using hrv.nonempty
    · simpa [RecordDecl.rename, RecordDecl.fieldNames, List.map_map, Function.comp_def]
        using hrv.fieldNames
    · simpa [RecordDecl.rename, RecordDecl.fieldNames, List.map_map, Function.comp_def]
        using hrv.nodup
    · intro t ht
      simp only [RecordDecl.rename, RecordDecl.fieldTypes, List.map_map, Function.comp_def,
        List.mem_map] at ht
      obtain ⟨field, hfield, rfl⟩ := ht
      rcases hrv.known field.2 (List.mem_map_of_mem hfield) with he | hr'
      · exact .inl (List.mem_map_of_mem he)
      · exact .inr (List.mem_map_of_mem hr')
    · show (⟨f.decls.map (Decl.rename old new)⟩ : File).containsItself
        (renameName old new r.name) = false
      rw [containsItself_rename hv hinj hrn, hself]
  · rw [names_rename]
    exact List.pairwise_map.mpr (hv.nodup.imp_of_mem fun ha hb hne heq =>
      hne (hinj _ ha _ hb heq))

/-- Each value goes to its renamed value: only its enumeration's name changes. -/
theorem values_of_renameDecl {f g : File} {old new : Name} (h : renameDecl f old new = .ok g) :
    g.values = f.values.map (Value.renameEnum old new) := by
  obtain ⟨_, rfl⟩ := renameDecl_ok h
  simp only [File.values, enums_rename, List.flatMap_map, List.map_flatMap]
  congr 1
  funext d
  simp [EnumDecl.tagged, EnumDecl.rename, Value.renameEnum, List.map_map, Function.comp_def]

/-- No two values go to the same one, so the map onto the new values is a bijection. -/
theorem injOn_of_renameDecl {f g : File} {old new : Name} (h : renameDecl f old new = .ok g) :
    ∀ v ∈ f.values, ∀ w ∈ f.values, v.renameEnum old new = w.renameEnum old new → v = w := by
  obtain ⟨he, _⟩ := renameDecl_ok h
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
theorem enums_values_of_renameDecl {f g : File} {old new : Name}
    (h : renameDecl f old new = .ok g) : g.enums.map (·.values) = f.enums.map (·.values) := by
  obtain ⟨_, rfl⟩ := renameDecl_ok h
  simp [enums_rename, EnumDecl.rename, List.map_map, Function.comp_def]

/-- Every record keeps its name and fields, each field's type renamed. -/
theorem records_of_renameDecl {f g : File} {old new : Name}
    (h : renameDecl f old new = .ok g) : g.records = f.records.map (RecordDecl.rename old new) := by
  obtain ⟨_, rfl⟩ := renameDecl_ok h
  exact records_rename f old new

/-- Every type keeps its name, and varies over the same enumerations, renamed. -/
theorem types_of_renameDecl {f g : File} {old new : Name}
    (h : renameDecl f old new = .ok g) : g.types = f.types.map (TypeDecl.rename old new) := by
  obtain ⟨_, rfl⟩ := renameDecl_ok h
  exact types_rename f old new

/-! ## Undoing and repeating a rename -/

/-- Renaming back undoes a rename. -/
theorem renameDecl_undo {f g : File} {old new : Name} (h : renameDecl f old new = .ok g) :
    renameDecl g new old = .ok f := by
  have hg := valid_of_renameDecl h
  obtain ⟨he, rfl⟩ := renameDecl_ok h
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
    rw [renameErrors_eq_nil_iff, names_rename]
    refine ⟨hg, File.isEnumName_of_mem_names hv hold, ?_, ?_⟩
    · exact List.mem_map.mpr ⟨old, hold, by simp [renameName]⟩
    · by_cases hno : new = old
      · exact .inl hno.symm
      · refine .inr fun hm => ?_
        obtain ⟨m, _, hm⟩ := List.mem_map.mp hm
        unfold renameName at hm
        split at hm
        · exact hno hm
        · contradiction
  unfold renameDecl
  simp only [hok, ↓reduceIte, hback]

/-- Renaming to its own name gives the same file. -/
theorem renameDecl_self {f : File} {n : Name} (hv : f.Valid) (hn : n ∈ f.names) :
    renameDecl f n n = .ok f := by
  have hok : renameErrors f n n = [] := by
    rw [renameErrors_eq_nil_iff]
    exact ⟨hv, File.isEnumName_of_mem_names hv hn, hn, .inl rfl⟩
  have hsame : f.decls.map (Decl.rename n n) = f.decls := by
    refine (List.map_congr_left fun x _ => ?_).trans (List.map_id' _)
    rw [Decl.rename_eq_mapNames]
    exact Decl.mapNames_id fun m _ => by unfold renameName; split <;> simp_all
  unfold renameDecl
  simp only [hok, ↓reduceIte, hsame]

/-- Two renames in a row are one rename: `a` to `b`, then `b` to `c`, is `a` to `c`. -/
theorem renameDecl_comp {f g h : File} {a b c : Name} (hg : renameDecl f a b = .ok g)
    (hh : renameDecl g b c = .ok h) : renameDecl f a c = .ok h := by
  obtain ⟨heg, rfl⟩ := renameDecl_ok hg
  obtain ⟨heh, rfl⟩ := renameDecl_ok hh
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
  unfold renameDecl
  simp only [hok, ↓reduceIte, hdecls]

end Dxn
