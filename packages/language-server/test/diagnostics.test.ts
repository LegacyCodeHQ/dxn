import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { diagnose } from "../src/diagnostics.js";

describe("diagnose", () => {
  it("finds no problem in a file that checks", () => {
    expect(
      diagnose("enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabled\n}\n"),
    ).toEqual([]);
  });

  it("gives each problem as an editor shows it: over the word it is at, from zero", () => {
    expect(
      diagnose("enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabld\n}\n"),
    ).toEqual([
      {
        range: { start: { line: 2, character: 17 }, end: { line: 2, character: 23 } },
        severity: DiagnosticSeverity.Error,
        code: "unknown-enum",
        source: "dxn",
        message: "Enabld is not an enum (Enabled)",
      },
    ]);
  });

  it("gives a warning as a warning", () => {
    expect(
      diagnose(
        "dimension Screen = small | large\ntype Logo needs Screen {\n  alike Screen\n}\n",
      ).map(({ severity, code, range }) => [severity, code, range.start, range.end]),
    ).toEqual([
      [
        DiagnosticSeverity.Warning,
        "unused-need",
        { line: 1, character: 16 },
        { line: 1, character: 22 },
      ],
    ]);
  });

  it("marks a problem at the end of a line or of the file, where no word is", () => {
    expect(
      diagnose("enum Hover =\n").map(({ code, range }) => [code, range.start, range.end]),
    ).toEqual([["syntax-error", { line: 0, character: 12 }, { line: 0, character: 12 }]]);
  });
});
