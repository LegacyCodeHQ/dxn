import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dxn from "@legacycodehq/tree-sitter-dxn";
import { parse } from "@next/syntax/parse.js";
import Parser from "tree-sitter";
import { expect, it } from "vitest";

const parser = new Parser();
parser.setLanguage(Dxn);
it("agrees with the core parser on enum syntax and reads keyword values contextually", () => {
  const sources = [
    "",
    "enum Light{off,on}",
    "enum Light {\n off,\n on\n}",
    "enum Light {}",
    "enum light { Off, a--b, ön }",
    "enum Light { enum, on, type, 01 }",
    "enum Light { off } enum Power { off }",
    "enum Light { on, }",
    "enum Light { on off }",
    "enum Light = off | on",
    "type Button {}",
    "# note\nenum Light { off }",
    "enum Light { off",
  ];
  const snapshot = sources.map((source) => {
    const tree = parser.parse(source);
    const accepted = !tree.rootNode.hasError;
    expect(accepted, source).toBe(parse(source).problems.length === 0);
    return { source, accepted };
  });
  expect(snapshot).toMatchInlineSnapshot(`
   [
     {
       "accepted": true,
       "source": "",
     },
     {
       "accepted": true,
       "source": "enum Light{off,on}",
     },
     {
       "accepted": true,
       "source": "enum Light {
    off,
    on
   }",
     },
     {
       "accepted": true,
       "source": "enum Light {}",
     },
     {
       "accepted": true,
       "source": "enum light { Off, a--b, ön }",
     },
     {
       "accepted": true,
       "source": "enum Light { enum, on, type, 01 }",
     },
     {
       "accepted": true,
       "source": "enum Light { off } enum Power { off }",
     },
     {
       "accepted": false,
       "source": "enum Light { on, }",
     },
     {
       "accepted": false,
       "source": "enum Light { on off }",
     },
     {
       "accepted": false,
       "source": "enum Light = off | on",
     },
     {
       "accepted": false,
       "source": "type Button {}",
     },
     {
       "accepted": false,
       "source": "# note
   enum Light { off }",
     },
     {
       "accepted": false,
       "source": "enum Light { off",
     },
   ]
 `);
});
it("compiles every Zed syntax query against the redesigned grammar", () => {
  for (const file of ["highlights", "indents", "outline", "brackets", "runnables", "overrides"]) {
    expect(
      () =>
        new Parser.Query(
          Dxn,
          readFileSync(join(__dirname, `../../zed/languages/dxn/${file}.scm`), "utf8"),
        ),
      file,
    ).not.toThrow();
  }
  const tree = parser.parse("enum Light { enum, on }");
  const query = new Parser.Query(
    Dxn,
    readFileSync(join(__dirname, "../queries/highlights.scm"), "utf8"),
  );
  expect(query.captures(tree.rootNode).map((c) => [c.name, c.node.text])).toMatchInlineSnapshot(`
   [
     [
       "keyword",
       "enum",
     ],
     [
       "type",
       "Light",
     ],
     [
       "punctuation.bracket",
       "{",
     ],
     [
       "constant",
       "enum",
     ],
     [
       "punctuation.delimiter",
       ",",
     ],
     [
       "constant",
       "on",
     ],
     [
       "punctuation.bracket",
       "}",
     ],
   ]
 `);
});

it("preserves the same names, values and UTF-16 spans as the core parser", () => {
  const cases = JSON.parse(
    readFileSync(join(__dirname, "../../next/test/agreement/cases.json"), "utf8"),
  ) as { name: string; values: string[] }[];
  const sources = cases
    .filter((d) => [d.name, ...d.values].every((n) => /^[\p{L}\p{N}_-]+$/u.test(n)))
    .map((d) => `enum ${d.name} { ${d.values.join(", ")} }`);
  sources.push("enum Light { 𐐀, on }", "enum Light { off }\r\nenum Power { off }");
  for (const source of sources) {
    const tree = parser.parse(source);
    expect(tree.rootNode.hasError, source).toBe(false);
    const named = (n: Parser.SyntaxNode) => ({
      text: n.text,
      span: { start: n.startIndex, end: n.endIndex },
    });
    const declarations = tree.rootNode.namedChildren.map((n) => ({
      name: named(n.childForFieldName("name") as Parser.SyntaxNode),
      values: n.childrenForFieldName("value").map(named),
      span: { start: n.startIndex, end: n.endIndex },
    }));
    expect(declarations, source).toEqual(parse(source).declarations);
  }
});
