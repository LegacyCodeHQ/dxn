import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "@language/syntax/format.js";
import { parse } from "@language/syntax/parse.js";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");

describe("format", () => {
  it("indents by two spaces a brace, steps back at a closing one, and one more for a continued line", () => {
    expect(
      format(
        "type Menu {\nstate menu: Hover\n      hover = hovered only when Pointer = mouse\nand menu = rest\n  type Toggle {\n state hover: Hover\n   }\n}\ndimension Width =\n| narrow\n     | wide\n",
      ),
    ).toBe(
      "type Menu {\n  state menu: Hover\n  hover = hovered only when Pointer = mouse\n    and menu = rest\n  type Toggle {\n    state hover: Hover\n  }\n}\ndimension Width =\n  | narrow\n  | wide\n",
    );
  });

  it("indents a line that continues one ending in |, and or or", () => {
    expect(
      format(
        "enum Size = xs | sm |\nlg | xl\ntype Menu {\nstate size: Size\nsize = xs only when size = sm and\nsize = lg\n}\n",
      ),
    ).toBe(
      "enum Size = xs | sm |\n  lg | xl\ntype Menu {\n  state size: Size\n  size = xs only when size = sm and\n    size = lg\n}\n",
    );
  });

  it("indents a comment between continued lines as the lines around it", () => {
    expect(
      format(
        "enum Size = xs |\n# sm |\n\nmd\nenum Gap =\n| xs\n    # | sm\n\n| md\nenum Ring =\n# none first\n| none\n| focus\n",
      ),
    ).toBe(
      "enum Size = xs |\n  # sm |\n\n  md\nenum Gap =\n  | xs\n  # | sm\n\n  | md\nenum Ring =\n  # none first\n  | none\n  | focus\n",
    );
  });

  it("spaces a line's words and signs one way", () => {
    expect(
      format(
        [
          "enum   Hover=rest|hovered",
          "type Link needs Pointer,Keyboard receives current :Section{",
          "  action take-focus:focus blurred->focused",
          "  on escape:close , link . take-focus only when menu=open and( a = b or c=d )",
          "  has toggle: Toggle {expanded = menu}",
          "  alike hover in(rest,hovered)",
          "}",
          'expect   "A title"{',
          "in   Link",
          "  when profile = Phone + Trackpad",
          "absent",
          "}",
          "",
        ].join("\n"),
      ),
    ).toBe(
      [
        "enum Hover = rest | hovered",
        "type Link needs Pointer, Keyboard receives current: Section {",
        "  action take-focus: focus blurred -> focused",
        "  on escape: close, link.take-focus only when menu = open and (a = b or c = d)",
        "  has toggle: Toggle { expanded = menu }",
        "  alike hover in (rest, hovered)",
        "}",
        'expect "A title" {',
        "  in Link",
        "  when profile = Phone+Trackpad",
        "  absent",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("keeps every comment as written, a trailing one two spaces after the code", () => {
    expect(
      format(
        "#A comment, kept as it is   \n      # indented with the code\ntype Menu {   # trailing\n# inside\n  state menu: Hover#tight\n}\n",
      ),
    ).toBe(
      "#A comment, kept as it is\n# indented with the code\ntype Menu {  # trailing\n  # inside\n  state menu: Hover  #tight\n}\n",
    );
  });

  it("keeps at most one blank line, and none at the start, after an opening brace or before a closing one", () => {
    expect(
      format(
        "\n\n\nenum A = a\n\n\n\nenum B = b\ntype T {\n\n  state a: A\n\n\n  state b: B\n\n}\n\n\n",
      ),
    ).toBe("enum A = a\n\nenum B = b\ntype T {\n  state a: A\n\n  state b: B\n}\n");
  });

  it("ends lines with a line feed, turns tabs into spaces, and ends the file with one", () => {
    expect(format("type T {\r\n\tstate a: A\r\n}")).toBe("type T {\n  state a: A\n}\n");
  });

  it("leaves a file that does not parse alone", () => {
    expect(format("enum Hover = rest hovered\n")).toBeUndefined();
    expect(format('expect "unclosed {\n}\n')).toBeUndefined();
  });

  describe("on every dxn file and every example in the guide", () => {
    // Every plain fenced block of the guide and the tutorials: those that are
    // not dxn do not parse, and are left out with the others that do not.
    const docs = [
      "docs/language/guide.md",
      ...readdirSync(join(root, "docs/tutorials")).map((name) => `docs/tutorials/${name}`),
    ];
    const examples = docs.flatMap((path) =>
      [...readFileSync(join(root, path), "utf8").matchAll(/```\n([\s\S]*?)```/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    const files = [
      "examples/settings/settings.dxn",
      "packages/zed/test/highlight.dxn",
      "packages/zed/test/runnables.dxn",
    ].map((path) => readFileSync(join(root, path), "utf8"));
    const sources = [...files, ...examples].filter((source) => format(source) !== undefined);
    // What a file declares, without where: formatting moves names, never what
    // they mean.
    const model = (source: string) =>
      JSON.stringify(parse(source), (key, value) =>
        key === "line" || key === "column" ? undefined : value,
      );
    const comments = (source: string) =>
      source
        .split(/\r?\n/)
        .flatMap((line) => line.replace(/"[^"]*"/g, "").match(/#.*$/) ?? [])
        .map((comment) => comment.trimEnd());

    it("has examples to try", () => {
      expect(sources.length).toBeGreaterThan(20);
    });

    it("changes nothing the second time", () => {
      for (const source of sources) {
        const once = format(source) as string;
        expect(format(once)).toBe(once);
      }
    });

    it("never changes what a file means", () => {
      for (const source of sources) expect(model(format(source) as string)).toBe(model(source));
    });

    it("keeps every comment, in order", () => {
      for (const source of sources) {
        expect(comments(format(source) as string)).toEqual(comments(source));
      }
    });
  });
});
