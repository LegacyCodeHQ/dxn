import { tokens } from "@language/editor/semantic.js";
import { describe, expect, it } from "vitest";

const parts = (source: string) => {
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  return tokens(source)
    .filter(({ kind }) => kind.startsWith("dxnDocumentation"))
    .map(({ line, column, length, kind, declaration }) => ({
      text: [...(lines[line - 1] ?? "")].slice(column - 1, column - 1 + length).join(""),
      kind,
      declaration,
    }));
};

describe("documentation semantic styling", () => {
  it.each(["\n", "\r\n", "\r"])(
    "classifies markers, tags, keyword targets and Unicode prose with %j",
    (newline) => {
      expect(
        parts(
          `\uFEFF## Modes 😀.\n## @value on Active.\n##   Continued.\nenum Mode = on\n`.replaceAll(
            "\n",
            newline,
          ),
        ),
      ).toEqual([
        { text: "## Modes 😀.", kind: "dxnDocumentation", declaration: false },
        { text: "## ", kind: "dxnDocumentation", declaration: false },
        { text: "@value", kind: "dxnDocumentationTag", declaration: false },
        { text: " ", kind: "dxnDocumentation", declaration: false },
        { text: "on", kind: "dxnDocumentationTarget", declaration: false },
        { text: " Active.", kind: "dxnDocumentation", declaration: false },
        { text: "##   Continued.", kind: "dxnDocumentation", declaration: false },
      ]);
    },
  );
  it.each(["# @value on Ordinary.", 'expect "## @value on quoted" {\n in Missing\n absent\n}'])(
    "leaves ordinary comments and quoted markers alone: %s",
    (source) => {
      expect(parts(source)).toEqual([]);
    },
  );
  it.each(["value", "state", "unknown"])(
    "styles @%s even before validation or attachment",
    (tag) => {
      expect(
        parts(`type Button { ##\t@${tag}\t on Description.\n}\n`).filter(
          ({ kind }) => kind !== "dxnDocumentation",
        ),
      ).toEqual([
        { text: `@${tag}`, kind: "dxnDocumentationTag", declaration: false },
        { text: "on", kind: "dxnDocumentationTarget", declaration: false },
      ]);
    },
  );
  it.each(["## @", "##", "## @value"])(
    "keeps incomplete documentation styled without empty tokens: %s",
    (source) => {
      expect(
        parts(source)
          .map(({ text }) => text)
          .join(""),
      ).toBe(source);
    },
  );
});
