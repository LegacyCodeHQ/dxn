/-!
# Names

Names are ASCII. Their case says which kind of name they are: an enumeration
name starts with a capital letter, and a value name is lowercase.
-/

namespace Dxn

/-- A name as written. -/
abbrev Name := String

/-- An enumeration name: a capital letter, then letters and digits, as `Light` or `UIState`. -/
def isEnumName (n : Name) : Bool :=
  match n.toList with
  | [] => false
  | c :: cs => c.isUpper && cs.all fun c => c.isAlpha || c.isDigit

/--
The rest of a value name, after its start or after a hyphen (`boundary`) or after a letter or
digit. A hyphen must follow a letter or digit, and the name must end on one.
-/
def valueNameRest : (boundary : Bool) → List Char → Bool
  | boundary, [] => !boundary
  | boundary, c :: cs =>
    if c = '-' then !boundary && valueNameRest true cs
    else (c.isLower || c.isDigit) && valueNameRest false cs

/--
A value name: lowercase letters and digits, with single hyphens only between them, as `off`,
`no-keyboard` or `19px`. It may start with a digit, or be only digits.
-/
def isValueName (n : Name) : Bool :=
  valueNameRest true n.toList

/-! ## The rules as their plain descriptions -/

/-- An enumeration name is a capital letter, then letters and digits. -/
theorem isEnumName_iff (n : Name) :
    isEnumName n = true ↔
      ∃ c cs, n.toList = c :: cs ∧ c.isUpper ∧ ∀ c ∈ cs, c.isAlpha ∨ c.isDigit := by
  unfold isEnumName
  cases n.toList with
  | nil => simp
  | cons c cs =>
    simp only [Bool.and_eq_true, List.all_eq_true, Bool.or_eq_true, List.cons.injEq]
    exact ⟨fun ⟨h1, h2⟩ => ⟨c, cs, ⟨rfl, rfl⟩, h1, h2⟩, fun ⟨_, _, ⟨rfl, rfl⟩, h1, h2⟩ => ⟨h1, h2⟩⟩

/-- No two neighbouring characters are both hyphens. -/
def NoDoubleHyphen (cs : List Char) : Prop :=
  ∀ p ∈ cs.zip cs.tail, ¬(p.1 = '-' ∧ p.2 = '-')

theorem noDoubleHyphen_cons (c : Char) (cs : List Char) :
    NoDoubleHyphen (c :: cs) ↔ (c = '-' → cs.head? ≠ some '-') ∧ NoDoubleHyphen cs := by
  cases cs with
  | nil => simp [NoDoubleHyphen]
  | cons d ds =>
    simp only [NoDoubleHyphen, List.tail_cons, List.zip_cons_cons, List.mem_cons,
      forall_eq_or_imp, List.head?_cons, ne_eq, Option.some.injEq]
    constructor
    · rintro ⟨h1, h2⟩; exact ⟨fun hc hd => h1 ⟨hc, hd⟩, h2⟩
    · rintro ⟨h1, h2⟩; exact ⟨fun ⟨hc, hd⟩ => h1 hc hd, h2⟩

theorem valueNameRest_iff (boundary : Bool) (cs : List Char) :
    valueNameRest boundary cs = true ↔
      (∀ c ∈ cs, c.isLower ∨ c.isDigit ∨ c = '-') ∧ (cs = [] → boundary = false) ∧
      (boundary = true → cs.head? ≠ some '-') ∧ cs.getLast? ≠ some '-' ∧
      NoDoubleHyphen cs := by
  induction cs generalizing boundary with
  | nil => cases boundary <;> simp [valueNameRest, NoDoubleHyphen]
  | cons c cs ih =>
    rw [noDoubleHyphen_cons]
    by_cases hc : c = '-'
    · subst hc
      cases cs with
      | nil => cases boundary <;> simp [valueNameRest]
      | cons d ds =>
        have := ih true
        cases boundary <;>
          simp_all [valueNameRest, List.getLast?_cons, and_comm, and_left_comm, and_assoc]
    · have := ih false
      cases cs with
      | nil => cases boundary <;> simp_all [valueNameRest, and_comm]
      | cons d ds =>
        cases boundary <;>
          simp_all [valueNameRest, List.getLast?_cons, and_comm, and_left_comm, and_assoc]

/--
A value name is lowercase letters, digits and hyphens, at least one character, with no hyphen
first, last, or next to another.
-/
theorem isValueName_iff (n : Name) :
    isValueName n = true ↔
      n.toList ≠ [] ∧
      (∀ c ∈ n.toList, c.isLower ∨ c.isDigit ∨ c = '-') ∧
      n.toList.head? ≠ some '-' ∧
      n.toList.getLast? ≠ some '-' ∧
      ∀ p ∈ n.toList.zip n.toList.tail, ¬(p.1 = '-' ∧ p.2 = '-') := by
  unfold isValueName
  rw [valueNameRest_iff]
  simp only [NoDoubleHyphen, Bool.true_eq_false, imp_false, forall_const]
  exact ⟨fun ⟨a, b, c, d, e⟩ => ⟨b, a, c, d, e⟩, fun ⟨b, a, c, d, e⟩ => ⟨a, b, c, d, e⟩⟩

/-! ## Names are ASCII -/

theorem Char.toNat_lt_of_isUpper {c : Char} (h : c.isUpper = true) : c.toNat < 128 := by
  unfold Char.isUpper at h
  simp only [decide_eq_true_eq] at h
  have := UInt32.le_iff_toNat_le.mp h.2
  have : ('Z' : Char).val.toNat = 90 := rfl
  show c.val.toNat < 128
  omega

theorem Char.toNat_lt_of_isLower {c : Char} (h : c.isLower = true) : c.toNat < 128 := by
  unfold Char.isLower at h
  simp only [Bool.and_eq_true, decide_eq_true_eq] at h
  have := UInt32.le_iff_toNat_le.mp h.2
  have : ('z' : Char).val.toNat = 122 := rfl
  show c.val.toNat < 128
  omega

theorem Char.toNat_lt_of_isDigit {c : Char} (h : c.isDigit = true) : c.toNat < 128 := by
  unfold Char.isDigit at h
  simp only [Bool.and_eq_true, decide_eq_true_eq] at h
  have := UInt32.le_iff_toNat_le.mp h.2
  have : ('9' : Char).val.toNat = 57 := rfl
  show c.val.toNat < 128
  omega

/-- Every character of an enumeration name is ASCII. -/
theorem ascii_of_isEnumName {n : Name} (h : isEnumName n = true) :
    ∀ c ∈ n.toList, c.toNat < 128 := by
  obtain ⟨c, cs, hn, hc, hcs⟩ := (isEnumName_iff n).mp h
  rw [hn]
  intro d hd
  rcases List.mem_cons.mp hd with rfl | hd
  · exact Char.toNat_lt_of_isUpper hc
  · rcases hcs d hd with ha | hd'
    · rcases Bool.or_eq_true_iff.mp ha with hu | hl
      · exact Char.toNat_lt_of_isUpper hu
      · exact Char.toNat_lt_of_isLower hl
    · exact Char.toNat_lt_of_isDigit hd'

/-- Every character of a value name is ASCII. -/
theorem ascii_of_isValueName {n : Name} (h : isValueName n = true) :
    ∀ c ∈ n.toList, c.toNat < 128 := by
  intro c hc
  rcases ((isValueName_iff n).mp h).2.1 c hc with hl | hd | rfl
  · exact Char.toNat_lt_of_isLower hl
  · exact Char.toNat_lt_of_isDigit hd
  · decide

end Dxn
