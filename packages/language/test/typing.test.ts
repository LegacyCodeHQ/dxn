import { readFileSync } from "node:fs";
import { join } from "node:path";
import { completions } from "@language/editor/complete.js";
import { definition, usages } from "@language/editor/definition.js";
import { hover } from "@language/editor/hover.js";
import { renameAt, renameable } from "@language/editor/rename-at.js";
import { symbols } from "@language/editor/symbols.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

// An editor asks about a file while it is being typed, so it is unfinished
// at every step: each feature answers at every point of it, and none throws.

const sample = readFileSync(join(__dirname, "../../zed/test/highlight.dxn"), "utf8");

describe("a file being typed", () => {
  it("is parsed, and answered at the cursor, at every character of it", () => {
    const failures: string[] = [];
    for (let at = 0; at <= sample.length; at++) {
      const text = sample.slice(0, at);
      const lines = text.split("\n");
      const line = lines.length;
      const column = (lines.at(-1) ?? "").length + 1;
      try {
        const file = parse(text);
        symbols(text, file);
        for (const place of [column, Math.max(1, column - 1)]) {
          definition(text, line, place, file);
          usages(text, line, place, file);
          hover(text, line, place, file);
          completions(text, line, place, file);
          renameable(text, line, place, file);
          renameAt(text, line, place, "renamed", [], file);
        }
      } catch (error) {
        failures.push(`${at}: ${(error as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    // Every feature at every character is thousands of answers: well under a
    // second alone, but longer under coverage on a shared CI machine.
  }, 30_000);
});
