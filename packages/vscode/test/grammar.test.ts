import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";
import { INITIAL, parseRawGrammar, Registry } from "vscode-textmate";

// How VS Code colours a .dxn file, from the extension's TextMate grammar: each
// token's text and the last scope it is in, tokenized as VS Code does.

const extension = join(__dirname, "..");
const require = createRequire(join(extension, "package.json"));
const sample = readFileSync(join(extension, "../zed/test/highlight.dxn"), "utf8").split("\n");

let registry: Registry;
beforeAll(async () => {
  await loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer);
  registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async () =>
      parseRawGrammar(
        readFileSync(join(extension, "syntaxes/dxn.tmLanguage.json"), "utf8"),
        "dxn.tmLanguage.json",
      ),
  });
});

// The lines holding these texts, each token as "<text> <scope>", spaces left
// out.
async function tokens(...texts: string[]): Promise<string[][]> {
  const grammar = await registry.loadGrammar("source.dxn");
  if (grammar === null) throw new Error("the grammar did not load");
  let state = INITIAL;
  const byLine = sample.map((line) => {
    const { tokens: found, ruleStack } = grammar.tokenizeLine(line, state);
    state = ruleStack;
    return found
      .map(({ startIndex, endIndex, scopes }) => [line.slice(startIndex, endIndex), scopes.at(-1)])
      .filter(([text]) => text?.trim() !== "")
      .map(([text, scope]) => `${text?.trim()} ${scope}`);
  });
  return texts.map((text) => byLine[sample.findIndex((line) => line.includes(text))] ?? []);
}

describe("the TextMate grammar", () => {
  it("colours declarations, and the names they declare", async () => {
    expect(
      await tokens(
        "# Every construct",
        "enum Hover = rest | hovered",
        "type Link needs Pointer receives current: Section {",
        "environment Device = Breakpoint x Pointer",
        "profile Phone: Device",
        "modifier Trackpad on Phone",
        "actor Designer records Evidence",
        "record Evidence {",
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "# Every construct of dxn, for checking the extension's queries. comment.line.number-sign.dxn",
        ],
        [
          "enum keyword.control.dxn",
          "Hover entity.name.type.dxn",
          "= keyword.operator.dxn",
          "rest constant.other.dxn",
          "| keyword.operator.dxn",
          "hovered constant.other.dxn",
        ],
        [
          "type keyword.control.dxn",
          "Link entity.name.type.dxn",
          "needs keyword.control.dxn",
          "Pointer entity.name.type.dxn",
          "receives keyword.control.dxn",
          "current variable.other.property.dxn",
          ": punctuation.separator.dxn",
          "Section entity.name.type.dxn",
          "{ punctuation.bracket.dxn",
        ],
        [
          "environment keyword.control.dxn",
          "Device entity.name.type.dxn",
          "= keyword.operator.dxn",
          "Breakpoint entity.name.type.dxn",
          "x keyword.operator.dxn",
          "Pointer entity.name.type.dxn",
        ],
        [
          "profile keyword.control.dxn",
          "Phone entity.name.type.dxn",
          ": punctuation.separator.dxn",
          "Device entity.name.type.dxn",
          "{ punctuation.bracket.dxn",
          "Breakpoint entity.name.type.dxn",
          "= keyword.operator.dxn",
          "base constant.other.dxn",
          ", punctuation.separator.dxn",
          "Pointer entity.name.type.dxn",
          "= keyword.operator.dxn",
          "touch constant.other.dxn",
          "} punctuation.bracket.dxn",
        ],
        [
          "modifier keyword.control.dxn",
          "Trackpad entity.name.type.dxn",
          "on keyword.control.dxn",
          "Phone entity.name.type.dxn",
          "{ punctuation.bracket.dxn",
          "Pointer entity.name.type.dxn",
          "= keyword.operator.dxn",
          "mouse constant.other.dxn",
          "} punctuation.bracket.dxn",
        ],
        [
          "actor keyword.control.dxn",
          "Designer entity.name.type.dxn",
          "records keyword.control.dxn",
          "Evidence entity.name.type.dxn",
        ],
        [
          "record keyword.control.dxn",
          "Evidence entity.name.type.dxn",
          "{ punctuation.bracket.dxn",
        ],
      ]
    `);
  });

  it("colours a type's states, rules, actions, events and triggers", async () => {
    expect(
      await tokens(
        "  state hover: Hover",
        "  hover = hovered only when Pointer = mouse",
        "  alike hover in (rest, hovered) when selection = selected",
        "  action take-focus: focus blurred -> focused",
        "  on activate: focus -> focused",
        "  on escape: close, link.take-focus only when menu = open",
        "  on Breakpoint in (lg): close",
        "  has link: Link {",
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "state keyword.control.dxn",
          "hover variable.other.property.dxn",
          ": punctuation.separator.dxn",
          "Hover entity.name.type.dxn",
        ],
        [
          "hover variable.other.property.dxn",
          "= keyword.operator.dxn",
          "hovered constant.other.dxn",
          "only keyword.control.dxn",
          "when keyword.control.dxn",
          "Pointer entity.name.type.dxn",
          "= keyword.operator.dxn",
          "mouse constant.other.dxn",
        ],
        [
          "alike keyword.control.dxn",
          "hover variable.other.property.dxn",
          "in keyword.control.dxn",
          "( punctuation.bracket.dxn",
          "rest constant.other.dxn",
          ", punctuation.separator.dxn",
          "hovered constant.other.dxn",
          ") punctuation.bracket.dxn",
          "when keyword.control.dxn",
          "selection variable.other.property.dxn",
          "= keyword.operator.dxn",
          "selected constant.other.dxn",
        ],
        [
          "action keyword.control.dxn",
          "take-focus entity.name.function.dxn",
          ": punctuation.separator.dxn",
          "focus variable.other.property.dxn",
          "blurred constant.other.dxn",
          "-> keyword.operator.dxn",
          "focused constant.other.dxn",
        ],
        [
          "on keyword.control.dxn",
          "activate entity.name.label.dxn",
          ": punctuation.separator.dxn",
          "focus variable.other.property.dxn",
          "-> keyword.operator.dxn",
          "focused constant.other.dxn",
        ],
        [
          "on keyword.control.dxn",
          "escape entity.name.label.dxn",
          ": punctuation.separator.dxn",
          "close entity.name.function.dxn",
          ", punctuation.separator.dxn",
          "link.take-focus entity.name.function.dxn",
          "only keyword.control.dxn",
          "when keyword.control.dxn",
          "menu variable.other.property.dxn",
          "= keyword.operator.dxn",
          "open constant.other.dxn",
        ],
        [
          "on keyword.control.dxn",
          "Breakpoint entity.name.type.dxn",
          "in keyword.control.dxn",
          "( punctuation.bracket.dxn",
          "lg constant.other.dxn",
          ") punctuation.bracket.dxn",
          ": punctuation.separator.dxn",
          "close entity.name.function.dxn",
        ],
        [
          "has keyword.control.dxn",
          "link variable.other.property.dxn",
          ": punctuation.separator.dxn",
          "Link entity.name.type.dxn",
          "{ punctuation.bracket.dxn",
        ],
      ]
    `);
  });

  it("colours an expectation", async () => {
    expect(
      await tokens(
        'expect "Escape closes the open menu" {',
        "  in Page.menu and below",
        "  when menu = open, profile = Phone+Trackpad",
        "  then menu = closed, link.focus = focused",
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "expect keyword.control.dxn",
          ""Escape closes the open menu" string.quoted.double.dxn",
          "{ punctuation.bracket.dxn",
        ],
        [
          "in keyword.control.dxn",
          "Page entity.name.type.dxn",
          ". punctuation.separator.dxn",
          "menu variable.other.property.dxn",
          "and keyword.control.dxn",
          "below keyword.control.dxn",
        ],
        [
          "when keyword.control.dxn",
          "menu variable.other.property.dxn",
          "= keyword.operator.dxn",
          "open constant.other.dxn",
          ", punctuation.separator.dxn",
          "profile keyword.control.dxn",
          "= keyword.operator.dxn",
          "Phone entity.name.type.dxn",
          "+ keyword.operator.dxn",
          "Trackpad entity.name.type.dxn",
        ],
        [
          "then keyword.control.dxn",
          "menu variable.other.property.dxn",
          "= keyword.operator.dxn",
          "closed constant.other.dxn",
          ", punctuation.separator.dxn",
          "link variable.other.property.dxn",
          ". punctuation.separator.dxn",
          "focus variable.other.property.dxn",
          "= keyword.operator.dxn",
          "focused constant.other.dxn",
        ],
      ]
    `);
  });
});
