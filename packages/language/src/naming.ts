// What a value is written as: lowercase letters and digits, with single
// hyphens only between them, so no two values differ only in case.
export const isValue = (text: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text);
