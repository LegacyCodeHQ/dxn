// The naming rules of lean/Dxn/Name.lean. Names are ASCII, and their case says
// which kind of name they are.

/** An enumeration name: a capital letter, then letters and digits, as `Light` or `UIState`. */
export function isEnumName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * A value name: lowercase letters and digits, with single hyphens only between them, as `off`,
 * `no-keyboard` or `19px`. It may start with a digit, or be only digits.
 */
export function isValueName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}
