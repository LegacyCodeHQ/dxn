import { format } from "@language/syntax/format.js";
import { read } from "@language/syntax/read.js";
import { describe, expect, it } from "vitest";

const meaning = (source: string) =>
  JSON.parse(
    JSON.stringify(read(source), (key, value) =>
      ["line", "column", "length"].includes(key) ? undefined : value,
    ),
  );

const cases = [
  {
    title: "documentation-looking trivia before a keyword enum value",
    source: "enum Mode = off |\n##Keep this trivia.\nstate\n",
    expected: "enum Mode = off |\n  ##Keep this trivia.\n  state\n",
  },
  {
    title: "blank attachment boundary after inline body documentation",
    source: "type Button { ##Detached.\n\nenum Mode=off\n}\n",
    expected: "type Button {  ##Detached.\n\n  enum Mode = off\n}\n",
  },
  {
    title: "prose, tags and continuation spacing",
    source:
      "##Modes.  \n##\t@value\t off\t  Disabled.  \n##\t More detail.  \n## @value off Duplicate.\n## @unknown off Retained.\nenum Mode=off|on\n",
    expected:
      "## Modes.\n## @value off Disabled.\n##   More detail.\n## @value off Duplicate.\n## @unknown off Retained.\nenum Mode = off | on\n",
  },
  {
    title: "nested state groups and type documentation",
    source:
      "##Button.\ntype Button {\n##\t@state\tmode\t Mode.\n##    More.\nstate mode:Mode, other:Mode\n##Nested.\ntype Inner {}\n}\n",
    expected:
      "## Button.\ntype Button {\n  ## @state mode Mode.\n  ##   More.\n  state mode: Mode, other: Mode\n  ## Nested.\n  type Inner { }\n}\n",
  },
  {
    title: "empty markers, whitespace prose and continuation boundaries",
    source:
      "## @value off First.\n##\n##   Continued.\n## \n##   Declaration prose.\n##\t\n## End.\nenum Mode=off\n",
    expected:
      "## @value off First.\n##\n##   Continued.\n## \n## Declaration prose.\n## \n## End.\nenum Mode = off\n",
  },
  {
    title: "detached documentation and ordinary comments",
    source: "##Detached.\n\nenum Mode=off\n#Ordinary.\ntype Button { #inline\n}\n",
    expected: "##Detached.\n\nenum Mode = off\n#Ordinary.\ntype Button {  #inline\n}\n",
  },
  {
    title: "inline documentation at an opening body",
    source: "type Button { ##Modes.\nenum Mode=off\n}\n",
    expected: "type Button {  ## Modes.\n  enum Mode = off\n}\n",
  },
  {
    title: "empty continuation text does not become declaration prose",
    source: "## @value off First.\n##\t\n##  More.\nenum Mode=off\n",
    expected: "## @value off First.\n##\n##   More.\nenum Mode = off\n",
  },
];

describe("documentation formatting", () => {
  it.each(cases)("normalizes $title", ({ source, expected }) => {
    expect(format(source)).toBe(expected);
  });
  it.each(cases)("preserves meaning and is idempotent for $title", ({ source }) => {
    const formatted = format(source) as string;
    expect({ meaning: meaning(formatted), again: format(formatted) }).toEqual({
      meaning: meaning(source),
      again: formatted,
    });
  });
  it.each(["\n", "\r\n", "\r"])("supports BOM, Unicode prose and %j endings", (ending) => {
    expect(format(`\uFEFF##Café.  ${ending}enum Mode=off${ending}`)).toBe(
      "## Café.\nenum Mode = off\n",
    );
  });
  it.each(["## @", "## @value ", "## Docs.\n# Ordinary."])(
    "refuses invalid documentation %j",
    (comment) => {
      expect(format(`${comment}\nenum Mode=off\n`)).toBeUndefined();
    },
  );
});
