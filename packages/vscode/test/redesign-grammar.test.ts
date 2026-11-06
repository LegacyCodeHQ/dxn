import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";
import { INITIAL, parseRawGrammar, Registry } from "vscode-textmate";

let registry: Registry;
beforeAll(async () => {
  const require = createRequire(join(__dirname, "../package.json"));
  await loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer);
  registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p) => new OnigScanner(p),
      createOnigString: (t) => new OnigString(t),
    }),
    loadGrammar: async () =>
      parseRawGrammar(
        readFileSync(join(__dirname, "../syntaxes/dxn.tmLanguage.json"), "utf8"),
        "dxn.tmLanguage.json",
      ),
  });
});
it("colors enum members contextually, including keyword spellings", async () => {
  const grammar = await registry.loadGrammar("source.dxn");
  if (!grammar) throw new Error("missing grammar");
  const source = "enum Light { enum, on, type }";
  const { tokens } = grammar.tokenizeLine(source, INITIAL);
  const members = tokens.filter(
    (t) =>
      ["enum", "on", "type"].includes(source.slice(t.startIndex, t.endIndex)) && t.startIndex > 5,
  );
  expect(members).toHaveLength(3);
  expect(members.map((t) => t.scopes.at(-1))).toEqual(Array(3).fill("constant.other.enum.dxn"));
  expect(
    tokens.map((t) => [source.slice(t.startIndex, t.endIndex), t.scopes.at(-1)]),
  ).toMatchInlineSnapshot(`
   [
     [
       "enum",
       "keyword.declaration.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "Light",
       "entity.name.type.enum.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "{",
       "punctuation.section.block.begin.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "enum",
       "constant.other.enum.dxn",
     ],
     [
       ",",
       "punctuation.separator.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "on",
       "constant.other.enum.dxn",
     ],
     [
       ",",
       "punctuation.separator.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "type",
       "constant.other.enum.dxn",
     ],
     [
       " ",
       "meta.enum.dxn",
     ],
     [
       "}",
       "punctuation.section.block.end.dxn",
     ],
   ]
 `);
});
