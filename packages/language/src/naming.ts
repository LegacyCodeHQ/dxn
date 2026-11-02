// The keywords a value cannot be, and why: where a value is written, each
// would be read as itself. Every other keyword can be a value.
export const reserved: ReadonlyMap<string, string> = new Map([
  ["when", "which starts a derived state"],
  ["else", "which starts a when's last branch"],
]);

// What a value is written as: lowercase letters and digits, with single
// hyphens only between them, so no two values differ only in case; and not
// a reserved keyword.
export const isValue = (text: string) =>
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text) && !reserved.has(text);
