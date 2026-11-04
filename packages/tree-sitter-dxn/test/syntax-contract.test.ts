import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const grammar = join(__dirname, "..");
const binary = (() => {
  for (let directory = grammar; ; directory = dirname(directory)) {
    const path = join(directory, "node_modules/.bin/tree-sitter");
    if (existsSync(path)) return path;
    if (dirname(directory) === directory) throw new Error("tree-sitter-cli is not installed");
  }
})();
const folder = mkdtempSync(join(tmpdir(), "dxn-syntax-contract-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const accepted = [
  ["single enum value", "enum Hover = rest"],
  ["all-capital enum name", "enum HOVER2 = rest"],
  ["numeric names remain textual", "enum Level = 1 | 01 | 2d | touch-screen"],
  ["keyword values", "enum Timing = enum | type | state | when | else | on"],
  ["newline before equals", "enum Hover\n= rest | hovered"],
  ["newline after equals", "enum Hover =\nrest | hovered"],
  ["newline before pipe", "enum Hover = rest\n| hovered"],
  ["newline after pipe", "enum Hover = rest |\nhovered"],
  [
    "blank lines and comments between values",
    "enum Hover =\n# First\nrest\n\n# Second\n|\n\nhovered",
  ],
  ["same-line members and brace", "type Button { state hover: Hover, focus: Focus }"],
  ["separate state declarations", "type Button {\nstate hover: Hover\nstate focus: Focus\n}"],
  ["type brace on next line", "type Button\n{ state hover: Hover }"],
  ["newline after comma", "type Button { state hover: Hover,\nfocus: Focus }"],
  ["newline before comma", "type Button { state hover: Hover\n, focus: Focus }"],
  [
    "comments between states",
    "type Button { state hover: Hover, # Hover\n\n# Focus\nfocus: Focus }",
  ],
  ["comments before state comma", "type Button { state hover: Hover\n# Focus\n, focus: Focus }"],
  ["empty documentation line", "## Description\n##\n## @value rest\nenum Hover = rest"],
  [
    "mixed documentation separated by a blank line",
    "# Ordinary\n\n## Description\nenum Hover = rest",
  ],
  ["split field", "type Button { state hover\n\n:\nHover }"],
  ["ordinary comments inside body", "type Button {\n# First\nstate hover: Hover\n# Last\n}"],
  [
    "documentation attaches to enum",
    "## Pointer interaction.\n## @value rest At rest.\nenum Hover = rest | hovered",
  ],
  ["documentation attaches to type", "## A button.\ntype Button {}"],
  [
    "documentation attaches to state",
    "type Button {\n## @state hover Pointer interaction.\nstate hover: Hover\n}",
  ],
  [
    "indented documentation continuation",
    "## @value rest At rest.\n##   Continued text.\n## General text.\nenum Hover = rest",
  ],
  ["empty description", "## @value rest\nenum Hover = rest"],
  ["unattached docs are ordinary comments", "## @bogus unknown\n\nenum Hover = rest"],
  ["unattached docs at EOF", "## Documentation without a declaration"],
  ["mixed unattached comments are ordinary", "## Unattached\n# Ordinary\n\nenum Hover = rest"],
  [
    "Unicode in prose and strings",
    '## État — 中文\nenum Hover = rest\n# Δ\nexpect "你好" { in Button some hover = rest }',
  ],
  ["duplicate names are checker work", "enum Mode = off | off\nenum Mode = on\ntype Mode {}"],
  [
    "forward reference and shadowing are checker work",
    "enum Mode = off\ntype Button {\nstate mode: Mode\nenum Mode = on\n}",
  ],
  [
    "wrong or unknown documentation tags are checker work",
    "## @state unknown\n## @bogus whatever\n## @value rest First.\n## @value rest Second.\nenum Hover = rest",
  ],
];
const rejected = [
  ["same-line enum declarations", "enum Hover = rest enum Focus = blurred"],
  ["same-line type declarations", "type Button {} type Link {}"],
  ["same-line nested declarations", "type Button { enum Hover = rest state hover: Hover }"],
  ["same-line states", "type Button { state hover: Hover state focus: Focus }"],
  ["newline after enum keyword", "enum\nHover = rest"],
  ["newline after type keyword", "type\nButton {}"],
  ["newline after state keyword", "type Button { state\nhover: Hover }"],
  ["leading pipe", "enum Hover = | rest | hovered"],
  ["trailing pipe", "enum Hover = rest |"],
  ["empty enum", "enum Hover ="],
  ["missing pipe", "enum Hover = rest hovered"],
  ["doubled pipe", "enum Hover = rest || hovered"],
  ["trailing comma", "type Button { state hover: Hover, }"],
  [
    "multiple same-line enums after documentation",
    "## Description\nenum Hover = rest enum Focus = blurred",
  ],
  ["comment before colon", "type Button { state hover\n# Comment\n: Hover }"],
  ["comment before field type", "type Button { state hover:\n# Comment\nHover }"],
  ["comment in needs header", "type Button needs\n# Comment\nPointer {}"],
  ["comment in receives header", "type Button receives\n# Comment\nmode: Mode {}"],
  ["comment inside header list", "type Button needs Pointer,\n# Comment\nKeyboard {}"],
  ["comment in type header", "type Button\n# Comment\n{}"],
  ["comment in enum header", "enum Hover\n# Comment\n= rest"],
  ["ordinary comment within docs", "## Documentation\n# Ordinary\nenum Hover = rest"],
  ["ordinary comment before docs", "# Ordinary\n## Documentation\nenum Hover = rest"],
  ["mixed docs on type", "## Documentation\n# Ordinary\ntype Button {}"],
  ["mixed docs on state", "type Button {\n## Documentation\n# Ordinary\nstate hover: Hover\n}"],
  ...["hover", "1Hover", "Hover-Mode", "Hover_Mode", "État"].map((name) => [
    `invalid enum name ${name}`,
    `enum ${name} = rest`,
  ]),
  ...["Rest", "touchScreen", "-rest", "rest-", "touch--screen", "touch_screen", "prêt", "١٢"].map(
    (value) => [`invalid enum value ${value}`, `enum Hover = ${value}`],
  ),
];
const baseCases = [
  ...accepted.map(([title, source]) => ({ title, source: source as string, valid: true })),
  ...rejected.map(([title, source]) => ({ title, source: source as string, valid: false })),
];
const cases = baseCases.flatMap((test) =>
  ["LF", "CRLF", "CR"].map((ending) => ({
    ...test,
    title: `${test.title} (${ending})`,
    source: test.source.replaceAll(
      "\n",
      ending === "CRLF" ? "\r\n" : ending === "CR" ? "\r" : "\n",
    ),
  })),
);
const files = cases.map(({ source }, index) => {
  const file = join(folder, `${index}.dxn`);
  writeFileSync(file, source);
  return file;
});
const parsed = spawnSync(binary, ["parse", "--quiet", "--json-summary", ...files], {
  cwd: grammar,
  encoding: "utf8",
});
if (parsed.error) throw parsed.error;
const start = parsed.stdout.indexOf("{");
if (start < 0) throw new Error(parsed.stderr || parsed.stdout);
const summaries = JSON.parse(parsed.stdout.slice(start)).parse_summaries as {
  file: string;
  successful: boolean;
}[];
const outcomes = new Map(summaries.map(({ file, successful }) => [file, successful]));

describe("the agreed enum, type, state and documentation syntax", () => {
  it.each(cases.map((each, index) => ({ ...each, file: files[index] as string })))(
    "$title",
    ({ file, valid }) => {
      expect(outcomes.get(file)).toBe(valid);
    },
  );
});

describe("documentation structure", () => {
  it("exposes attachment, tag names, targets, descriptions and continuation whitespace", () => {
    const file = join(folder, "documentation.dxn");
    writeFileSync(
      file,
      `## @bogus ignored because unattached.

## A button.
type Button {
  ## @value rest No interaction.
  ##   Continued text.
  ## General enum description.
  enum Hover = rest | hovered
  ## @state hover
  state hover: Hover
}
`,
    );
    const result = spawnSync(binary, ["parse", "--no-ranges", file], {
      cwd: grammar,
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr + result.stdout);
    const query = join(folder, "documentation.scm");
    writeFileSync(
      query,
      "(documentation_text) @text\n(documentation_tag name: (identifier) @tag target: (identifier) @target)",
    );
    const captured = spawnSync(binary, ["query", query, file], { cwd: grammar, encoding: "utf8" });
    if (captured.status !== 0) throw new Error(captured.stderr + captured.stdout);
    const captures = [
      ...captured.stdout.matchAll(/capture: (?:\d+ - )?(\w+), .*text: `(.*)`/g),
    ].map(([, name, text]) => [name, text]);
    expect({ tree: result.stdout.trim(), captures }).toMatchInlineSnapshot(`
      {
        "captures": [
          [
            "text",
            " A button.",
          ],
          [
            "tag",
            "value",
          ],
          [
            "target",
            "rest",
          ],
          [
            "text",
            " No interaction.",
          ],
          [
            "text",
            "   Continued text.",
          ],
          [
            "text",
            " General enum description.",
          ],
          [
            "tag",
            "state",
          ],
          [
            "target",
            "hover",
          ],
        ],
        "tree": "(source_file
        (comment)
        (type_declaration
          documentation: (documentation
            (documentation_text))
          name: (identifier)
          body: (type_body
            (enum_declaration
              documentation: (documentation
                (documentation_tag
                  name: (identifier)
                  target: (identifier)
                  description: (documentation_text))
                (documentation_text)
                (documentation_text))
              name: (identifier)
              (value)
              (value))
            (state_declaration
              documentation: (documentation
                (documentation_tag
                  name: (identifier)
                  target: (identifier)))
              (state_field
                name: (identifier)
                type: (identifier))))))",
      }
    `);
  });
});

const documented = "## Description\n## @value off Off.\nenum Mode = off\n";
const mixed = documented.replace("## @value", "# @value");
const detached = documented.replace("enum Mode", "\nenum Mode");
it.each([
  {
    title: "detach with a blank line",
    before: documented,
    after: detached,
    edit: "2,0 0 \n",
    status: 0,
  },
  {
    title: "reattach by removing the blank line",
    before: detached,
    after: documented,
    edit: "2,0 1 ",
    status: 0,
  },
  {
    title: "reject an ordinary marker inserted into docs",
    before: documented,
    after: mixed,
    edit: "1,0 2 #",
    status: 1,
  },
  { title: "repair a mixed block", before: mixed, after: documented, edit: "1,0 1 ##", status: 0 },
])("incremental parsing: $title", ({ before, after, edit, status }) => {
  const original = join(folder, "before.dxn");
  const changed = join(folder, "after.dxn");
  writeFileSync(original, before);
  writeFileSync(changed, after);
  const options = { cwd: grammar, encoding: "utf8" as const, timeout: 10_000 };
  const incremental = spawnSync(
    binary,
    ["parse", "--no-ranges", original, "--edits", edit],
    options,
  );
  const fresh = spawnSync(binary, ["parse", "--no-ranges", changed], options);
  if (incremental.error || fresh.error) throw incremental.error || fresh.error;
  const tree = (output: string) =>
    output
      .split("\n")
      .filter((line) => !/\t(?:Parse|Edit):/.test(line))
      .join("\n")
      .trim();
  expect({ status: [incremental.status, fresh.status], tree: tree(incremental.stdout) }).toEqual({
    status: [status, status],
    tree: tree(fresh.stdout),
  });
});
