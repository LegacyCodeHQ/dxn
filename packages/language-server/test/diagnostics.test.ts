import { diagnose } from "@language-server/protocol/diagnostics.js";
import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver/node";

describe("diagnose", () => {
  it("underlines the first documentation marker of a detached block as a warning", () => {
    expect(
      diagnose("  ## Detached.\n\nenum Mode = off\ntype Button { state mode: Mode }\n"),
    ).toEqual([
      {
        code: "unattached-documentation",
        source: "dxn",
        severity: 2,
        message:
          "documentation is not attached to a declaration; remove the separating blank line or use `#` for an ordinary comment",
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 4 } },
      },
    ]);
  });
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
        message: "`Enabld` is not an enum; did you mean `Enabled`?",
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

  it("marks a problem at an expectation over its whole title, quotes and all", () => {
    expect(
      diagnose(
        'enum State = closed | open\ntype Menu {\n  state menu: State\n}\nexpect "Always closed" {\n  in Menu\n  then menu = closed\n}\n',
      ).map(({ code, range }) => [code, range.start, range.end]),
    ).toEqual([["expectation-failed", { line: 4, character: 7 }, { line: 4, character: 22 }]]);
  });

  it("marks a problem at the end of a line or of the file, where no word is", () => {
    expect(
      diagnose("enum Hover =\n").map(({ code, range }) => [code, range.start, range.end]),
    ).toEqual([["syntax-error", { line: 0, character: 12 }, { line: 0, character: 12 }]]);
  });

  it("marks a problem at the same place with Windows line endings, the ends of lines too", () => {
    const text = "enum Hover =\ntype A {\n  state hover: Hovr\n}\n";
    expect(diagnose(text.replaceAll("\n", "\r\n"))).toEqual(diagnose(text));
  });

  it("marks a problem at the same place with lines that end with \\r alone", () => {
    const text = "enum Hover =\ntype A {\n  state hover: Hovr\n}\n";
    expect(diagnose(text.replaceAll("\n", "\r"))).toEqual(diagnose(text));
  });
});
