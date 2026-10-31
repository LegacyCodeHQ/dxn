import { parse } from "../../src/language/parse.js";

// Each diagnostic of a source as "line:column: code: message", in source order.
export const problems = (source: string) =>
  parse(source).diagnostics.map(
    ({ line, column, code, message }) => `${line}:${column}: ${code}: ${message}`,
  );
