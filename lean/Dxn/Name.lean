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

end Dxn
