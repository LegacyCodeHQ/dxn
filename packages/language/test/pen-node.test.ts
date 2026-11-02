import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { coverage } from "../src/status.js";
import { validate } from "../src/validate.js";
import { problems } from "./support/language.js";

const source = `enum Style = filled | plain
type Button {
  state style: Style
}
record PenEvidence {
  source: PenNode
}
actor DesignAgent records PenEvidence
`;

const file = parse(source);

// A stored PenEvidence for a style, with this source.
const entry = (style: string, at: unknown) => ({
  context: { type: "Button", dimensions: {}, states: { style } },
  actor: "DesignAgent",
  source: at,
});
const messages = (...entries: unknown[]) =>
  validate(file, "PenEvidence", JSON.stringify(entries)).map(
    ({ path, message }) => `${path}: ${message}`,
  );

describe("PenNode", () => {
  it("is built in: a field can be one, and nothing can be declared with its name", () => {
    expect([
      problems(source),
      problems("record PenNode {\n}\n"),
      problems("record Note {\n  source: PenNod\n}\n"),
    ]).toMatchInlineSnapshot(`
      [
        [],
        [
          "1:8: reserved-name: \`PenNode\` is built in; choose another name",
        ],
        [
          "2:11: unknown-type: \`PenNod\` is not an enum, a record or a scalar; did you mean \`PenNode\`?",
        ],
      ]
    `);
  });

  it("is a node of a design file: its file, its frame, its node if it has one, and its fingerprint", () => {
    expect([
      messages(
        entry("filled", { file: "gazette.pen", frame: "IeCCz", node: "OcEJ9", fingerprint: "a1" }),
      ),
      messages(entry("plain", { file: "gazette.pen", frame: "IeCCz", fingerprint: "b2" })),
    ]).toEqual([[], []]);
    expect(
      messages(
        entry("filled", { file: "gazette.pen", frame: "IeCCz" }),
        entry("filled", { file: "../gazette.pen", frame: "IeCCz", fingerprint: "a1" }),
        entry("filled", { file: "gazette.pen", frame: "", fingerprint: "a1" }),
        entry("filled", { file: "gazette.pen", frame: "IeCCz", page: 2, fingerprint: "a1" }),
        entry("filled", "gazette.pen"),
      ),
    ).toMatchInlineSnapshot(`
      [
        "$[0].source: \`PenNode\` is missing \`fingerprint\`",
        "$[1].source.file: "../gazette.pen" is not a \`RelativePath\`: a path from the repository root: parts split by /, none of them empty, . or .., and none with a \\ or spaces at either end, nor starting with a drive such as C:",
        "$[2].source.frame: "" is not a \`NonEmptyString\`: at least one character, with no spaces at either end and no control characters",
        "$[3].source.page: \`PenNode\` has no field \`page\` (\`file\`, \`frame\`, \`node\`, \`fingerprint\`)",
        "$[4].source: expected a \`PenNode\` (an object), found a string",
      ]
    `);
  });

  it("is what status checks, each stored one by its node, or its frame without one", () => {
    const checked: unknown[] = [];
    const stored = JSON.stringify([
      entry("filled", { file: "gazette.pen", frame: "IeCCz", node: "OcEJ9", fingerprint: "a1" }),
      entry("plain", { file: "gazette.pen", frame: "IeCCz", fingerprint: "b2" }),
    ]);
    const counted = coverage(file, "PenEvidence", [stored], (node) => {
      checked.push(node);
      return node.node === undefined ? "stale" : "present";
    });
    expect([checked, counted.present, counted.stale]).toEqual([
      [
        { file: "gazette.pen", frame: "IeCCz", node: "OcEJ9", fingerprint: "a1" },
        { file: "gazette.pen", frame: "IeCCz", fingerprint: "b2" },
      ],
      1,
      1,
    ]);
  });
});
