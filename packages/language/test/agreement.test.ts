import { describe, expect, it } from "vitest";
import { snippets } from "./agreement/read.js";
import { errors } from "./support/language.js";

// What parse.ts reads in each shared snippet; the Tree-sitter grammar reads
// the same snippets in its own tests.

describe("the snippets parse.ts and the grammar share", () => {
  it.each(snippets().map((snippet) => [`${snippet.file}: ${snippet.title}`, snippet] as const))(
    "%s",
    (_, { parse, source }) => {
      expect(errors(source).length === 0 ? "ok" : "error").toBe(parse);
    },
  );

  it("says why the grammar reads a snippet otherwise than parse.ts, and only then", () => {
    const unexplained = snippets()
      .filter(({ parse, treeSitter, reason }) => (parse === treeSitter) !== (reason === undefined))
      .map(({ file, title }) => `${file}: ${title}`);
    expect(unexplained).toEqual([]);
  });
});
