import Dxn.Enumeration

/-!
# Records

A record is a named group of typed fields: plain data that does not vary. Each
field has a name and a type, the name of an enumeration or of another record
of the file, one field per line.

On its own, a record is checked for a name that breaks the naming rules (R1),
no fields (R2), each field name that breaks the naming rules for values (R3),
each field name written twice (R4) and each field type the file has no
enumeration or record for (R5). Whether a record contains itself (R6) depends
on the file's other records, so a file checks it.

A record may have `check` blocks, each a list of fields the checker records
about an entry. Each is read as written, so a second block can be reported
(C1). Check fields follow the rules for fields: names for values (C2), none
twice within a block (C3) and types the file has (C4). A record's values are its own fields'
only, so R6 does not follow check fields.
-/

namespace Dxn

-- #region record
/-- A record as written: its name, its fields in written order, each a name and a type, and its
`check` blocks in written order, each a list of fields. -/
structure RecordDecl where
  name : Name
  fields : List (Name × Name)
  checks : List (List (Name × Name))
  deriving Repr, DecidableEq

/-- The names of a record's fields, in written order. -/
def RecordDecl.fieldNames (r : RecordDecl) : List Name :=
  r.fields.map (·.1)

/-- The types of a record's fields, in written order. -/
def RecordDecl.fieldTypes (r : RecordDecl) : List Name :=
  r.fields.map (·.2)

/-- The fields of a record's `check` blocks, in written order. -/
def RecordDecl.checkFields (r : RecordDecl) : List (Name × Name) :=
  r.checks.flatten

/-- The names of a record's check fields, in written order. -/
def RecordDecl.checkFieldNames (r : RecordDecl) : List Name :=
  r.checkFields.map (·.1)

/-- The check field names written more than once within a `check` block, each once, block by
block in written order. -/
def RecordDecl.duplicateCheckFieldNames (r : RecordDecl) : List Name :=
  (r.checks.flatMap fun block => duplicates (block.map (·.1))).eraseDups

/-- The types of a record's check fields, in written order. -/
def RecordDecl.checkFieldTypes (r : RecordDecl) : List Name :=
  r.checkFields.map (·.2)
-- #endregion record

-- #region errors
/-- Why the checker rejects a record, in the order the checker reports them. -/
inductive RecordError where
  /-- The record's name breaks the naming rules. -/
  | badRecordName (name : Name)
  /-- The record has no fields. -/
  | noFields
  /-- The field's name breaks the naming rules for values. -/
  | badFieldName (name : Name)
  /-- The field name is written more than once. -/
  | duplicateField (name : Name)
  /-- No enumeration or record in the file has this name. -/
  | noSuchFieldType (name : Name)
  /-- The record contains itself, directly or through other records. -/
  | containsItself
  /-- The record has more than one `check` block. -/
  | duplicateCheck
  /-- The check field's name breaks the naming rules for values. -/
  | badCheckFieldName (name : Name)
  /-- The check field name is written more than once. -/
  | duplicateCheckField (name : Name)
  /-- No enumeration or record in the file has this name, a check field's type. -/
  | noSuchCheckFieldType (name : Name)
  deriving Repr, DecidableEq

/-- The stable notebook rule ID belonging to this problem. -/
def RecordError.ruleId : RecordError → String
  | .badRecordName _ => "R1"
  | .noFields => "R2"
  | .badFieldName _ => "R3"
  | .duplicateField _ => "R4"
  | .noSuchFieldType _ => "R5"
  | .containsItself => "R6"
  | .duplicateCheck => "C1"
  | .badCheckFieldName _ => "C2"
  | .duplicateCheckField _ => "C3"
  | .noSuchCheckFieldType _ => "C4"
-- #endregion errors

-- #region check
/-- Field types the file has no enumeration or record for, each once, in written order. -/
def unknownFieldTypes (enums records : List Name) (r : RecordDecl) : List Name :=
  r.fieldTypes.eraseDups.filter fun n => n ∉ enums ∧ n ∉ records

/-- Check field types the file has no enumeration or record for, each once, in written order. -/
def unknownCheckFieldTypes (enums records : List Name) (r : RecordDecl) : List Name :=
  r.checkFieldTypes.eraseDups.filter fun n => n ∉ enums ∧ n ∉ records

/--
Check a record on its own, against the names of the file's enumerations and records: every
problem with it, each once, in the order of the rules R1 to R5, then C1 to C4, and within a rule
in the order the names are first written.
-/
def checkRecord (enums records : List Name) (r : RecordDecl) : List RecordError :=
  (if isEnumName r.name then [] else [.badRecordName r.name]) ++
  (if r.fields = [] then [.noFields] else []) ++
  (badValueNames r.fieldNames).map .badFieldName ++
  (duplicates r.fieldNames).map .duplicateField ++
  (unknownFieldTypes enums records r).map .noSuchFieldType ++
  (if 2 ≤ r.checks.length then [.duplicateCheck] else []) ++
  (badValueNames r.checkFieldNames).map .badCheckFieldName ++
  r.duplicateCheckFieldNames.map .duplicateCheckField ++
  (unknownCheckFieldTypes enums records r).map .noSuchCheckFieldType
-- #endregion check

-- #region valid
/-- A record is valid on its own when its name and field names follow the naming rules, it has
fields, none twice, and each field's type is an enumeration or a record of the file; and it has at
most one `check` block, whose fields follow the same rules, except that it may have none. -/
structure RecordDecl.Valid (enums records : List Name) (r : RecordDecl) : Prop where
  name : isEnumName r.name
  nonempty : r.fields ≠ []
  fieldNames : ∀ n ∈ r.fieldNames, isValueName n
  nodup : r.fieldNames.Nodup
  known : ∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records
  oneCheck : r.checks.length ≤ 1
  checkFieldNames : ∀ n ∈ r.checkFieldNames, isValueName n
  checkNodup : ∀ block ∈ r.checks, (block.map (·.1)).Nodup
  checkKnown : ∀ n ∈ r.checkFieldTypes, n ∈ enums ∨ n ∈ records
-- #endregion valid

theorem RecordDecl.valid_iff (enums records : List Name) (r : RecordDecl) :
    r.Valid enums records ↔
      isEnumName r.name ∧ r.fields ≠ [] ∧ (∀ n ∈ r.fieldNames, isValueName n) ∧
        r.fieldNames.Nodup ∧ (∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records) ∧
        r.checks.length ≤ 1 ∧ (∀ n ∈ r.checkFieldNames, isValueName n) ∧
        (∀ block ∈ r.checks, (block.map (·.1)).Nodup) ∧
        (∀ n ∈ r.checkFieldTypes, n ∈ enums ∨ n ∈ records) :=
  ⟨fun ⟨a, b, c, d, e, f, g, h, i⟩ => ⟨a, b, c, d, e, f, g, h, i⟩,
    fun ⟨a, b, c, d, e, f, g, h, i⟩ => ⟨a, b, c, d, e, f, g, h, i⟩⟩

instance RecordDecl.decidableValid (enums records : List Name) (r : RecordDecl) :
    Decidable (r.Valid enums records) :=
  decidable_of_iff _ (RecordDecl.valid_iff enums records r).symm

theorem unknown_eq_nil_iff (enums records l : List Name) :
    l.eraseDups.filter (fun n => n ∉ enums ∧ n ∉ records) = [] ↔
      ∀ n ∈ l, n ∈ enums ∨ n ∈ records := by
  simp only [List.filter_eq_nil_iff, List.mem_eraseDups, decide_eq_true_eq, not_and,
    Classical.not_not]
  exact ⟨fun h n hn => (Classical.em (n ∈ enums)).elim .inl fun he => .inr (h n hn he),
    fun h n hn he => (h n hn).resolve_left he⟩

theorem unknownFieldTypes_eq_nil_iff (enums records : List Name) (r : RecordDecl) :
    unknownFieldTypes enums records r = [] ↔ ∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records :=
  unknown_eq_nil_iff enums records r.fieldTypes

theorem unknownCheckFieldTypes_eq_nil_iff (enums records : List Name) (r : RecordDecl) :
    unknownCheckFieldTypes enums records r = [] ↔
      ∀ n ∈ r.checkFieldTypes, n ∈ enums ∨ n ∈ records :=
  unknown_eq_nil_iff enums records r.checkFieldTypes

theorem RecordDecl.mem_duplicateCheckFieldNames {r : RecordDecl} {n : Name} :
    n ∈ r.duplicateCheckFieldNames ↔ ∃ block ∈ r.checks, 2 ≤ (block.map (·.1)).count n := by
  simp [RecordDecl.duplicateCheckFieldNames, List.mem_eraseDups, mem_duplicates]

theorem RecordDecl.duplicateCheckFieldNames_eq_nil_iff (r : RecordDecl) :
    r.duplicateCheckFieldNames = [] ↔ ∀ block ∈ r.checks, (block.map (·.1)).Nodup := by
  rw [List.eq_nil_iff_forall_not_mem]
  simp only [RecordDecl.mem_duplicateCheckFieldNames, not_exists, not_and]
  constructor
  · intro h block hb
    rw [← duplicates_eq_nil_iff, List.eq_nil_iff_forall_not_mem]
    exact fun n hn => h n block hb (mem_duplicates.mp hn)
  · intro h n block hb hc
    have := (duplicates_eq_nil_iff _).mpr (h block hb)
    rw [List.eq_nil_iff_forall_not_mem] at this
    exact this n (mem_duplicates.mpr hc)

/-- The checker accepts exactly the records valid on their own. -/
theorem checkRecord_eq_nil_iff (enums records : List Name) (r : RecordDecl) :
    checkRecord enums records r = [] ↔ r.Valid enums records := by
  rw [RecordDecl.valid_iff, ← badValueNames_eq_nil_iff, ← badValueNames_eq_nil_iff,
    ← duplicates_eq_nil_iff, ← RecordDecl.duplicateCheckFieldNames_eq_nil_iff,
    ← unknownFieldTypes_eq_nil_iff,
    ← unknownCheckFieldTypes_eq_nil_iff]
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc] <;> omega

/-- R1 is reported exactly when the record name breaks the naming rules. -/
theorem badRecordName_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .badRecordName n ∈ checkRecord enums records r ↔ n = r.name ∧ isEnumName r.name = false := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, eq_comm]

/-- R2 is reported exactly when the record has no fields. -/
theorem noFields_mem_checkRecord (enums records : List Name) (r : RecordDecl) :
    .noFields ∈ checkRecord enums records r ↔ r.fields = [] := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc]

/-- R3 is reported exactly for each field name that breaks the naming rules for values. -/
theorem badFieldName_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .badFieldName n ∈ checkRecord enums records r ↔ n ∈ r.fieldNames ∧ isValueName n = false := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, mem_badValueNames]

/-- R4 is reported exactly for each field name written more than once. -/
theorem duplicateField_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .duplicateField n ∈ checkRecord enums records r ↔ 2 ≤ r.fieldNames.count n := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, mem_duplicates]

/-- R5 is reported exactly for each field type the file has no enumeration or record for. -/
theorem noSuchFieldType_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .noSuchFieldType n ∈ checkRecord enums records r ↔
      n ∈ r.fieldTypes ∧ n ∉ enums ∧ n ∉ records := by
  unfold checkRecord unknownFieldTypes unknownCheckFieldTypes
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, List.mem_filter, List.mem_eraseDups]

/-- C1 is reported exactly when the record has more than one `check` block. -/
theorem duplicateCheck_mem_checkRecord (enums records : List Name) (r : RecordDecl) :
    .duplicateCheck ∈ checkRecord enums records r ↔ 2 ≤ r.checks.length := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc]

/-- C2 is reported exactly for each check field name that breaks the naming rules for values. -/
theorem badCheckFieldName_mem_checkRecord (enums records : List Name) (r : RecordDecl)
    (n : Name) :
    .badCheckFieldName n ∈ checkRecord enums records r ↔
      n ∈ r.checkFieldNames ∧ isValueName n = false := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, mem_badValueNames]

/-- C3 is reported exactly for each check field name written more than once within one `check`
block. -/
theorem duplicateCheckField_mem_checkRecord (enums records : List Name) (r : RecordDecl)
    (n : Name) :
    .duplicateCheckField n ∈ checkRecord enums records r ↔
      ∃ block ∈ r.checks, 2 ≤ (block.map (·.1)).count n := by
  rw [← RecordDecl.mem_duplicateCheckFieldNames]
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc]

/-- C4 is reported exactly for each check field type the file has no enumeration or record for. -/
theorem noSuchCheckFieldType_mem_checkRecord (enums records : List Name) (r : RecordDecl)
    (n : Name) :
    .noSuchCheckFieldType n ∈ checkRecord enums records r ↔
      n ∈ r.checkFieldTypes ∧ n ∉ enums ∧ n ∉ records := by
  unfold checkRecord unknownFieldTypes unknownCheckFieldTypes
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    by_cases hc : 2 ≤ r.checks.length <;> simp [hn, hf, hc, List.mem_filter, List.mem_eraseDups]

end Dxn
