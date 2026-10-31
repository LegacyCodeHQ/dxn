import { parse } from "../../src/parse.js";

// Each diagnostic of a source as "line:column: code: message", with
// "warning: " before the code of a warning, in source order.
export const problems = (source: string) =>
  parse(source).diagnostics.map(
    ({ line, column, severity, code, message }) =>
      `${line}:${column}: ${severity === "warning" ? "warning: " : ""}${code}: ${message}`,
  );

// Only the errors, for a test about an error in a source that may also warn.
export const errors = (source: string) =>
  problems(source).filter((problem) => !/^\d+:\d+: warning: /.test(problem));
