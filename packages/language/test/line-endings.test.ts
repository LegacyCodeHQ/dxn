import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completions } from "../src/editor/complete.js";
import { definition, usages } from "../src/editor/definition.js";
import { hover } from "../src/editor/hover.js";
import { renameAt, renameable } from "../src/editor/rename-at.js";
import { tokens } from "../src/editor/semantic.js";
import { symbols } from "../src/editor/symbols.js";
import { parse } from "../src/syntax/parse.js";

// A file written on Windows ends its lines with \r\n, and one from an old Mac
// with \r alone: lines and columns are the same as with \n, so every answer
// is too.

const sample = readFileSync(join(__dirname, "../../zed/test/highlight.dxn"), "utf8");
const windows = sample.replaceAll("\n", "\r\n");
const mac = sample.replaceAll("\n", "\r");

// Every answer about a text: its problems and outline, and at the start,
// middle and end of every word, each feature's.
function answers(text: string): unknown[] {
  const file = parse(text);
  const result: unknown[] = [file.diagnostics, symbols(text, file), tokens(text, file)];
  text.split(/\r\n|\r|\n/).forEach((content, row) => {
    for (const word of content.matchAll(/[A-Za-z0-9.+-]+/g)) {
      const start = word.index + 1;
      for (const column of [
        start,
        start + Math.floor(word[0].length / 2),
        start + word[0].length,
      ]) {
        const line = row + 1;
        const renamed = renameAt(text, line, column, "renamed", [], file);
        result.push([
          line,
          column,
          definition(text, line, column, file),
          usages(text, line, column, file),
          hover(text, line, column, file),
          completions(text, line, column, file),
          renameable(text, line, column, file),
          // The renamed text, read back with its own line endings: the same.
          "refusal" in renamed
            ? renamed.refusal
            : [renamed.edits, renamed.source.replace(/\r\n?/g, "\n")],
        ]);
      }
    }
  });
  return result;
}

describe("a file with Windows line endings", () => {
  it("is answered as the same file with \\n line endings is", () => {
    expect(answers(windows)).toEqual(answers(sample));
  });

  it("has its problems at the same places, the ends of its lines too", () => {
    const broken = "enum Hover =\ntype A {\n  state hover:\n}\nenum Focus = blurred focused\n";
    expect(parse(broken.replaceAll("\n", "\r\n")).diagnostics).toEqual(parse(broken).diagnostics);
  });

  it("is answered as the same file with \\n line endings is, with \\r alone", () => {
    expect(answers(mac)).toEqual(answers(sample));
  });

  it("keeps its line endings when renamed", () => {
    const renamed = renameAt(windows, 7, 8, "Pointing");
    expect("refusal" in renamed ? renamed.refusal : renamed.source).toBe(
      windows.replaceAll("Hover", "Pointing"),
    );
  });
});
