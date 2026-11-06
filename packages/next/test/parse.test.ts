import { parse } from "@next/syntax/parse.js";
import { describe, expect, it } from "vitest";

// The grammar, from lean/notes/enumerations.md: what is read, and which text is
// a syntax error. Whether what is read is valid is the checker's to say.

// What a file reads as, without positions.
const read = (source: string) => {
  const { declarations, problems } = parse(source);
  return {
    declarations: declarations.map(
      ({ name, values }) => `${name.text} { ${values.map((value) => value.text).join(", ")} }`,
    ),
    problems: problems.map(({ message }) => message),
  };
};

describe("reading enumerations", () => {
  it("reads a declaration on one line, or one value per line", () => {
    const snapshot: unknown[] = [];
    snapshot.push(read("enum Light { off, on }"));
    snapshot.push(read("enum Light {\n  off,\n  on\n}\n"));
    snapshot.push(read("enum Light{off,on}"));
    snapshot.push(read("enum Light { off, on }\nenum Power { off, on }\n"));
    snapshot.push(read(""));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "declarations": [
            "Light { off, on }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Light { off, on }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Light { off, on }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Light { off, on }",
            "Power { off, on }",
          ],
          "problems": [],
        },
        {
          "declarations": [],
          "problems": [],
        },
      ]
    `);
  });

  it("reads what the checker rejects, so it can report it by name", () => {
    const snapshot: unknown[] = [];
    snapshot.push(read("enum Light { }"));
    snapshot.push(read("enum Light { on, off, on }"));
    snapshot.push(read("enum light { Off, no_keyboard, dim-, a--b }"));
    snapshot.push(read("enum Lïght { ön }"));
    snapshot.push(read("enum Light { enum }"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "declarations": [
            "Light {  }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Light { on, off, on }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "light { Off, no_keyboard, dim-, a--b }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Lïght { ön }",
          ],
          "problems": [],
        },
        {
          "declarations": [
            "Light { enum }",
          ],
          "problems": [],
        },
      ]
    `);
  });

  it("reports a syntax error, and reads the declarations before it", () => {
    const snapshot: unknown[] = [];
    snapshot.push(read("enum Light { off, on, }"));
    snapshot.push(read("enum Light { off on }"));
    snapshot.push(read("enum Light { off, on"));
    snapshot.push(read("enum Light off, on }"));
    snapshot.push(read("enum { off, on }"));
    snapshot.push(read("enum Light { off, , on }"));
    snapshot.push(read("Light { off, on }"));
    snapshot.push(read("enum Light { off, on }\nenum Power { off; on }"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "declarations": [],
          "problems": [
            "a trailing comma is not allowed after the last value",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected ',' or '}' after a value, found 'on'",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected ',' or '}' after a value, found the end of the file",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected '{' after the enumeration name, found 'off'",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected an enumeration name after 'enum', found '{'",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected a value name after ',', found ','",
          ],
        },
        {
          "declarations": [],
          "problems": [
            "expected 'enum', found 'Light'",
          ],
        },
        {
          "declarations": [
            "Light { off, on }",
          ],
          "problems": [
            "expected ',' or '}' after a value, found ';'",
          ],
        },
      ]
    `);
  });

  it("says where each name is", () => {
    const source = "enum Light {\n  off,\n  on\n}";
    const [light] = parse(source).declarations;
    const where = ({ text, span }: { text: string; span: { start: number; end: number } }) =>
      `${text} ${span.start}-${span.end} ${JSON.stringify(source.slice(span.start, span.end))}`;
    const snapshot: unknown[] = [];
    snapshot.push(light && [where(light.name), ...light.values.map(where)]);
    snapshot.push(light?.span);
    snapshot.push(parse("enum Light { off on }").problems);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Light 5-10 "Light"",
          "off 15-18 "off"",
          "on 22-24 "on"",
        ],
        {
          "end": 26,
          "start": 0,
        },
        [
          {
            "at": {
              "end": 19,
              "start": 17,
            },
            "message": "expected ',' or '}' after a value, found 'on'",
          },
        ],
      ]
    `);
  });
});
