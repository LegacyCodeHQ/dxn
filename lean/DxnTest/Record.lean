import Dxn.Record

namespace DxnTest.Record

open Dxn

def enums : List Name := ["Verdict", "Urgency"]
def records : List Name := ["Finding", "Review"]

-- A record whose fields are the file's enumerations and records: no problems.
#guard checkRecord enums records ⟨"Review", [("verdict", "Verdict"), ("finding", "Finding")]⟩ = []

-- A record with one field.
#guard checkRecord enums records ⟨"Decision", [("verdict", "Verdict")]⟩ = []

-- R1: the record name follows the naming rules.
#guard checkRecord enums records ⟨"review", [("verdict", "Verdict")]⟩ = [.badRecordName "review"]

-- R2: a record has at least one field.
#guard checkRecord enums records ⟨"Approved", []⟩ = [.noFields]

-- R3: each field name follows the naming rules for values, each reported once.
#guard checkRecord enums records
    ⟨"Review", [("Verdict", "Verdict"), ("reviewed-at", "Urgency"), ("Verdict", "Urgency")]⟩ =
  [.badFieldName "Verdict", .duplicateField "Verdict"]

-- R4: no two fields share a name.
#guard checkRecord enums records ⟨"Review", [("verdict", "Verdict"), ("verdict", "Urgency")]⟩ =
  [.duplicateField "verdict"]

-- R5: each field's type is an enumeration or a record of the file, each reported once.
#guard checkRecord enums records
    ⟨"Review", [("verdict", "Missing"), ("urgent", "Urgency"), ("again", "Missing")]⟩ =
  [.noSuchFieldType "Missing"]

-- Every problem at once, in the order of the rules.
#guard checkRecord enums records ⟨"review", [("Bad", "Missing"), ("Bad", "Urgency")]⟩ =
  [.badRecordName "review", .badFieldName "Bad", .duplicateField "Bad", .noSuchFieldType "Missing"]

#guard [RecordError.badRecordName "r", .noFields, .badFieldName "F", .duplicateField "f",
    .noSuchFieldType "T", .containsItself].map RecordError.ruleId =
  ["R1", "R2", "R3", "R4", "R5", "R6"]

-- The checker accepts exactly the records valid on their own.
example (es rs : List Name) (r : RecordDecl) : checkRecord es rs r = [] ↔ r.Valid es rs :=
  checkRecord_eq_nil_iff es rs r

-- Each problem is reported exactly when its rule is broken.
example (es rs : List Name) (r : RecordDecl) (n : Name) :
    .badRecordName n ∈ checkRecord es rs r ↔ n = r.name ∧ isEnumName r.name = false :=
  badRecordName_mem_checkRecord es rs r n
example (es rs : List Name) (r : RecordDecl) :
    .noFields ∈ checkRecord es rs r ↔ r.fields = [] :=
  noFields_mem_checkRecord es rs r
example (es rs : List Name) (r : RecordDecl) (n : Name) :
    .badFieldName n ∈ checkRecord es rs r ↔ n ∈ r.fieldNames ∧ isValueName n = false :=
  badFieldName_mem_checkRecord es rs r n
example (es rs : List Name) (r : RecordDecl) (n : Name) :
    .duplicateField n ∈ checkRecord es rs r ↔ 2 ≤ r.fieldNames.count n :=
  duplicateField_mem_checkRecord es rs r n
example (es rs : List Name) (r : RecordDecl) (n : Name) :
    .noSuchFieldType n ∈ checkRecord es rs r ↔ n ∈ r.fieldTypes ∧ n ∉ es ∧ n ∉ rs :=
  noSuchFieldType_mem_checkRecord es rs r n

end DxnTest.Record
