import { describe, expect, it } from "vitest";
import { type DocumentSymbol, symbols } from "../src/symbols.js";

const source = `dimension Pointer = mouse | touch
# Whether the pointer is over it.
enum Hover = rest | hovered

type Menu needs Pointer {
  event escape
  enum State = closed | open
  state menu: State
  type Toggle {
    state hover: Hover
  }
  has toggle: Toggle
  action close: menu open -> closed
  on escape: close
}

type Page receives shown: Hover {
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
modifier Trackpad on Phone {
  Pointer = mouse
}

record Evidence {
  hover: Hover
}

expect "Escape closes the menu" {
  in Menu
  on escape
  then menu = closed
}
actor EvidenceRecorder records Evidence
`;

// Each symbol as its kind, its name, the lines it spans and where its name
// is, indented under the one it is in.
function outline(list: DocumentSymbol[], depth = 0): string[] {
  return list.flatMap((symbol) => [
    `${"  ".repeat(depth)}${symbol.kind} ${symbol.name} ${symbol.start.line}-${symbol.end.line} @${symbol.at.line}:${symbol.at.column}`,
    ...outline(symbol.children, depth + 1),
  ]);
}

describe("symbols", () => {
  it("outline a file: its declarations, what each type and record declares, and its expectations", () => {
    expect(outline(symbols(source))).toMatchInlineSnapshot(`
      [
        "dimension Pointer 1-1 @1:11",
        "enum Hover 3-3 @3:6",
        "type Menu 5-15 @5:6",
        "  event escape 6-6 @6:9",
        "  enum State 7-7 @7:8",
        "  state menu 8-8 @8:9",
        "  type Toggle 9-11 @9:8",
        "    state hover 10-10 @10:11",
        "  child toggle 12-12 @12:7",
        "  action close 13-13 @13:10",
        "type Page 17-18 @17:6",
        "  state shown 17-17 @17:20",
        "environment Device 20-20 @20:13",
        "profile Phone 21-21 @21:9",
        "modifier Trackpad 22-24 @22:10",
        "record Evidence 26-28 @26:8",
        "  field hover 27-27 @27:3",
        "expectation Escape closes the menu 30-34 @30:8",
        "actor EvidenceRecorder 35-35 @35:7",
      ]
    `);
  });

  it("outline what a file that does not parse to its end declares", () => {
    expect(
      outline(symbols("enum Hover = rest | hovered\ntype Menu {\n  state menu: Hover\n")),
    ).toMatchInlineSnapshot(`
      [
        "enum Hover 1-1 @1:6",
        "type Menu 2-4 @2:6",
        "  state menu 3-3 @3:9",
      ]
    `);
  });
});
