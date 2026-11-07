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
-/

namespace Dxn

-- #region record
/-- A record as written: its name, and its fields in written order, each a name and a type. -/
structure RecordDecl where
  name : Name
  fields : List (Name × Name)
  deriving Repr, DecidableEq

/-- The names of a record's fields, in written order. -/
def RecordDecl.fieldNames (r : RecordDecl) : List Name :=
  r.fields.map (·.1)

/-- The types of a record's fields, in written order. -/
def RecordDecl.fieldTypes (r : RecordDecl) : List Name :=
  r.fields.map (·.2)
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
  deriving Repr, DecidableEq

/-- The stable notebook rule ID belonging to this problem. -/
def RecordError.ruleId : RecordError → String
  | .badRecordName _ => "R1"
  | .noFields => "R2"
  | .badFieldName _ => "R3"
  | .duplicateField _ => "R4"
  | .noSuchFieldType _ => "R5"
  | .containsItself => "R6"
-- #endregion errors

-- #region check
/-- Field types the file has no enumeration or record for, each once, in written order. -/
def unknownFieldTypes (enums records : List Name) (r : RecordDecl) : List Name :=
  r.fieldTypes.eraseDups.filter fun n => n ∉ enums ∧ n ∉ records

/--
Check a record on its own, against the names of the file's enumerations and records: every
problem with it, each once, in the order of the rules R1 to R5, and within a rule in the order
the names are first written.
-/
def checkRecord (enums records : List Name) (r : RecordDecl) : List RecordError :=
  (if isEnumName r.name then [] else [.badRecordName r.name]) ++
  (if r.fields = [] then [.noFields] else []) ++
  (badValueNames r.fieldNames).map .badFieldName ++
  (duplicates r.fieldNames).map .duplicateField ++
  (unknownFieldTypes enums records r).map .noSuchFieldType
-- #endregion check

-- #region valid
/-- A record is valid on its own when its name and field names follow the naming rules, it has
fields, none twice, and each field's type is an enumeration or a record of the file. -/
structure RecordDecl.Valid (enums records : List Name) (r : RecordDecl) : Prop where
  name : isEnumName r.name
  nonempty : r.fields ≠ []
  fieldNames : ∀ n ∈ r.fieldNames, isValueName n
  nodup : r.fieldNames.Nodup
  known : ∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records
-- #endregion valid

theorem RecordDecl.valid_iff (enums records : List Name) (r : RecordDecl) :
    r.Valid enums records ↔
      isEnumName r.name ∧ r.fields ≠ [] ∧ (∀ n ∈ r.fieldNames, isValueName n) ∧
        r.fieldNames.Nodup ∧ (∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records) :=
  ⟨fun ⟨a, b, c, d, e⟩ => ⟨a, b, c, d, e⟩, fun ⟨a, b, c, d, e⟩ => ⟨a, b, c, d, e⟩⟩

instance RecordDecl.decidableValid (enums records : List Name) (r : RecordDecl) :
    Decidable (r.Valid enums records) :=
  decidable_of_iff _ (RecordDecl.valid_iff enums records r).symm

theorem unknownFieldTypes_eq_nil_iff (enums records : List Name) (r : RecordDecl) :
    unknownFieldTypes enums records r = [] ↔ ∀ n ∈ r.fieldTypes, n ∈ enums ∨ n ∈ records := by
  unfold unknownFieldTypes
  simp only [List.filter_eq_nil_iff, List.mem_eraseDups, decide_eq_true_eq, not_and,
    Classical.not_not]
  exact ⟨fun h n hn => (Classical.em (n ∈ enums)).elim .inl fun he => .inr (h n hn he),
    fun h n hn he => (h n hn).resolve_left he⟩

/-- The checker accepts exactly the records valid on their own. -/
theorem checkRecord_eq_nil_iff (enums records : List Name) (r : RecordDecl) :
    checkRecord enums records r = [] ↔ r.Valid enums records := by
  rw [RecordDecl.valid_iff, ← badValueNames_eq_nil_iff, ← duplicates_eq_nil_iff,
    ← unknownFieldTypes_eq_nil_iff]
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;> simp [hn, hf]

/-- R1 is reported exactly when the record name breaks the naming rules. -/
theorem badRecordName_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .badRecordName n ∈ checkRecord enums records r ↔ n = r.name ∧ isEnumName r.name = false := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;> simp [hn, hf, eq_comm]

/-- R2 is reported exactly when the record has no fields. -/
theorem noFields_mem_checkRecord (enums records : List Name) (r : RecordDecl) :
    .noFields ∈ checkRecord enums records r ↔ r.fields = [] := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;> simp [hn, hf]

/-- R3 is reported exactly for each field name that breaks the naming rules for values. -/
theorem badFieldName_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .badFieldName n ∈ checkRecord enums records r ↔ n ∈ r.fieldNames ∧ isValueName n = false := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    simp [hn, hf, mem_badValueNames]

/-- R4 is reported exactly for each field name written more than once. -/
theorem duplicateField_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .duplicateField n ∈ checkRecord enums records r ↔ 2 ≤ r.fieldNames.count n := by
  unfold checkRecord
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    simp [hn, hf, mem_duplicates]

/-- R5 is reported exactly for each field type the file has no enumeration or record for. -/
theorem noSuchFieldType_mem_checkRecord (enums records : List Name) (r : RecordDecl) (n : Name) :
    .noSuchFieldType n ∈ checkRecord enums records r ↔
      n ∈ r.fieldTypes ∧ n ∉ enums ∧ n ∉ records := by
  unfold checkRecord unknownFieldTypes
  by_cases hn : isEnumName r.name <;> by_cases hf : r.fields = [] <;>
    simp [hn, hf, List.mem_filter, List.mem_eraseDups]

end Dxn
