import Dxn.Name

namespace DxnTest.Name

open Dxn

-- An enumeration name is a capital letter, then letters and digits.
#guard ["Light", "UIState", "HOVER", "Light2", "L"].all isEnumName
#guard !(["light", "2Light", "Li-ght", "Li_ght", "", "Lïght", "Éclair"].any isEnumName)

-- A value name is lowercase letters and digits, with single hyphens only between them.
#guard ["off", "no-keyboard", "19px", "2", "700", "a-1"].all isValueName
#guard !(["Off", "a-", "-a", "a--b", "-", "", "no_keyboard", "ön"].any isValueName)

end DxnTest.Name
