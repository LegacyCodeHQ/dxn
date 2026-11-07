import Dxn.File

/-!
# Record values

A value a field can hold is an enumeration's value, or a record's value: a
value for each of its fields, found by the field's name. A record's values are
every way to give each field a value, nested records included: the product of
its fields' values, with the parts named.

Two values of a record are equal exactly when every field is, comparing nested
records field by field down to enumeration values.

A check's value is a value for each field of its `check` block, found by name,
as a record's is. A block with no fields has one value, the empty record. A
record's own values never include a check.
-/

namespace Dxn

-- #region value
/-- A value a field can hold: an enumeration's value, tagged, or a record's value, a value for
each field by name, in the record's written order. -/
inductive FieldValue where
  | enum (v : Value)
  | record (fields : List (Name × FieldValue))
  deriving Repr

mutual
/-- Whether two field values are equal: the same enumeration value, or records whose fields are
equal, field by field. -/
def FieldValue.decEq : (a b : FieldValue) → Decidable (a = b)
  | .enum v, .enum w =>
    if h : v = w then isTrue (h ▸ rfl) else isFalse fun e => h (FieldValue.enum.inj e)
  | .record xs, .record ys =>
    match FieldValue.decEqFields xs ys with
    | isTrue h => isTrue (h ▸ rfl)
    | isFalse h => isFalse fun e => h (FieldValue.record.inj e)
  | .enum _, .record _ => isFalse fun e => by cases e
  | .record _, .enum _ => isFalse fun e => by cases e

/-- Whether two lists of fields are equal, field by field. -/
def FieldValue.decEqFields : (xs ys : List (Name × FieldValue)) → Decidable (xs = ys)
  | [], [] => isTrue rfl
  | [], _ :: _ => isFalse fun e => by cases e
  | _ :: _, [] => isFalse fun e => by cases e
  | (k, v) :: xs, (l, w) :: ys =>
    if hk : k = l then
      match FieldValue.decEq v w, FieldValue.decEqFields xs ys with
      | isTrue hv, isTrue hxs => isTrue (by rw [hk, hv, hxs])
      | isFalse hv, _ => isFalse fun e => by
          simp only [List.cons.injEq, Prod.mk.injEq] at e
          exact hv e.1.2
      | _, isFalse hxs => isFalse fun e => by
          simp only [List.cons.injEq] at e
          exact hxs e.2
    else isFalse fun e => by
      simp only [List.cons.injEq, Prod.mk.injEq] at e
      exact hk e.1.1
end

instance : DecidableEq FieldValue := FieldValue.decEq

/-- The value of a record value's field, read by its name; none for another name or an
enumeration's value. -/
def FieldValue.get : FieldValue → Name → Option FieldValue
  | .record fields, key => fields.lookup key
  | .enum _, _ => none
-- #endregion value

-- #region values
/-- The values of the enumeration or record of this name, nesting at most `k` deep: a record's
values are every way to give each field a value, in written order, first field slowest. -/
def File.valuesWithin (f : File) : Nat → Name → List FieldValue
  | 0, _ => []
  | k + 1, n =>
    match f.records.find? (·.name == n) with
    | some r =>
      (product (r.fieldTypes.map (f.valuesWithin k))).map fun vs =>
        .record (r.fieldNames.zip vs)
    | none => (f.enumValues n).map .enum

/-- The values of the record of this name. Records nest at most as deep as there are records, and
an enumeration's values one level below, so this depth lists them all. -/
def File.recordValues (f : File) (n : Name) : List FieldValue :=
  f.valuesWithin (f.records.length + 1) n
-- #endregion values

-- #region checkValues
/-- The values a check of this `check` block can hold: every way to give each of its fields a
value, in written order, first field slowest. -/
def File.checkValues (f : File) (block : List (Name × Name)) : List FieldValue :=
  (product (block.map fun field => f.recordValues field.2)).map fun vs =>
    .record ((block.map (·.1)).zip vs)
-- #endregion checkValues

/-- The number of a check's values is the product of its fields' numbers of values. -/
theorem File.length_checkValues (f : File) (block : List (Name × Name)) :
    (f.checkValues block).length =
      (block.map fun field => (f.recordValues field.2).length).foldr (· * ·) 1 := by
  simp [File.checkValues, length_product, List.map_map, Function.comp_def]

/-- A `check` block with no fields has exactly one value: the empty record. -/
theorem File.checkValues_nil (f : File) : f.checkValues [] = [.record []] := rfl

/-- The number of a record's values is the product of its fields' numbers of values. -/
theorem File.length_valuesWithin_record {f : File} {k : Nat} {r : RecordDecl}
    (hr : f.records.find? (·.name == r.name) = some r) :
    (f.valuesWithin (k + 1) r.name).length =
      (r.fieldTypes.map fun t => (f.valuesWithin k t).length).foldr (· * ·) 1 := by
  simp only [File.valuesWithin, hr, List.length_map, length_product, List.map_map,
    Function.comp_def]

/-- Two values of a record, with the same fields, are equal exactly when every field is. -/
theorem FieldValue.record_eq_iff_get {keys : List Name} (hk : keys.Nodup)
    {vs ws : List FieldValue} (hv : vs.length = keys.length) (hw : ws.length = keys.length) :
    FieldValue.record (keys.zip vs) = .record (keys.zip ws) ↔
      ∀ key ∈ keys, (FieldValue.record (keys.zip vs)).get key =
        (FieldValue.record (keys.zip ws)).get key := by
  constructor
  · intro h key _
    rw [h]
  · intro h
    simp only [FieldValue.get] at h
    congr 1
    induction keys generalizing vs ws with
    | nil => simp
    | cons k ks ih =>
      match vs, ws, hv, hw with
      | v :: vs', w :: ws', hv, hw =>
        have hkk : (k == k) = true := beq_self_eq_true k
        have hvw : v = w := by
          have := h k List.mem_cons_self
          simpa [List.zip_cons_cons, List.lookup_cons, hkk] using this
        subst hvw
        have hks := (List.nodup_cons.mp hk)
        have rest := ih hks.2 (by simpa using hv) (by simpa using hw) fun key hkey => by
          have hne : (key == k) = false := by
            simp only [beq_eq_false_iff_ne]
            exact fun h' => hks.1 (h' ▸ hkey)
          have := h key (List.mem_cons_of_mem _ hkey)
          simpa [List.zip_cons_cons, List.lookup_cons, hne] using this
        simp [List.zip_cons_cons, rest]

end Dxn
