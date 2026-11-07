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
    "enum Light { enum, on, type, varies, 01 }",
    "enum Light { off } enum Power { off }",
    "enum Light { on, }",
    "enum Light { on off }",
    "enum Light = off | on",
    "type Button {}",
    "type Button { varies Kind, State } enum Kind { primary }",
    "type type { varies enum, type, varies }",
    "type Button { varies Kind, }",
    "type Button { varies }",
    "type Button { varies Kind State }",
    "type Button { Kind }",
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
        "source": "enum Light { enum, on, type, varies, 01 }",
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
        "accepted": true,
        "source": "type Button {}",
      },
      {
        "accepted": true,
        "source": "type Button { varies Kind, State } enum Kind { primary }",
      },
      {
        "accepted": true,
        "source": "type type { varies enum, type, varies }",
      },
      {
        "accepted": false,
        "source": "type Button { varies Kind, }",
      },
      {
        "accepted": false,
        "source": "type Button { varies }",
      },
      {
        "accepted": false,
        "source": "type Button { varies Kind State }",
      },
      {
        "accepted": false,
        "source": "type Button { Kind }",
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

it.each([
  "type Logo {}",
  "type Button { varies Kind, State }",
  "type button { varies Missing, Missing }",
])("reads type fields and spans consistently: %s", (source) => {
  const tree = parser.parse(source);
  expect(tree.rootNode.hasError).toBe(false);
  const named = (n: Parser.SyntaxNode) => ({
    text: n.text,
    span: { start: n.startIndex, end: n.endIndex },
  });
  expect(
    tree.rootNode.namedChildren.map((n) => ({
      kind: "type",
      name: named(n.childForFieldName("name") as Parser.SyntaxNode),
      varies: n.childrenForFieldName("varies").map(named),
      span: { start: n.startIndex, end: n.endIndex },
    })),
  ).toEqual(parse(source).declarations);
});

it.each([
  ["record Empty {}", true],
  ["record Review { verdict: Verdict }", true],
  ["record Review { verdict: Verdict\nurgency: Urgency }", true],
  ["record Review { verdict: Verdict urgency: Urgency }", false],
  ["record Review { verdict: Verdict,\nurgency: Urgency }", false],
  ["record Review { verdict:\nVerdict }", false],
  ["record Review { verdict: Verdict", false],
] as const)("agrees with the core parser on record field boundaries: %s", (source, accepted) => {
  expect(!parser.parse(source).rootNode.hasError).toBe(accepted);
  expect(parse(source).problems.length === 0).toBe(accepted);
});

it.each(["\n", "\r\n", "\r", "\u2028", "\u2029"])(
  "preserves record fields and UTF-16 spans with line ending %j",
  (newline) => {
    const source = `\uFEFFrecord Review {${newline}  record: 𐐀${newline}  type: Verdict${newline}}`;
    const tree = parser.parse(source);
    expect(tree.rootNode.hasError).toBe(false);
    const named = (n: Parser.SyntaxNode) => ({
      text: n.text,
      span: { start: n.startIndex, end: n.endIndex },
    });
    expect(
      tree.rootNode.namedChildren.map((n) => ({
        kind: "record",
        name: named(n.childForFieldName("name") as Parser.SyntaxNode),
        fields: n.namedChildren
          .filter((c) => c.type === "record_field")
          .map((f) => ({
            name: named(f.childForFieldName("name") as Parser.SyntaxNode),
            type: named(f.childForFieldName("type") as Parser.SyntaxNode),
          })),
        body: { start: source.indexOf("{"), end: source.length },
        span: { start: n.startIndex, end: n.endIndex },
      })),
    ).toEqual(parse(source).declarations);
  },
);
