import { describe, expect, it } from "vitest";
import { declarationNamed } from "../src/rename-at.js";

const source = `dimension Pointer = mouse | touch
enum Hover = rest | hovered

type Link needs Pointer {
  event press
  state hover: Hover
  action rest: hover hovered -> rest
}

type Menu {
  enum State = closed | open
  state menu: State
  event close
  action close: menu open -> closed
  type Toggle {
    state hover: Hover
  }
}

environment Device = Pointer
profile phone: Device { Pointer = touch }
modifier trackpad on phone { Pointer = mouse }
enum Actor = designer
record Evidence {
  actor: Actor
}
actor EvidenceRecorder records Evidence
`;

const lines = source.split("\n");

// The line a name is declared on, as written, or why it cannot be found.
function find(target: string): string {
  const found = declarationNamed(source, target);
  if ("refusal" in found) return found.refusal;
  const line = lines[found.line - 1] ?? "";
  return `${found.line}:${found.column} ${line.trim()} [${line.slice(found.column - 1).match(/^[A-Za-z0-9-]+/)?.[0]}]`;
}

describe("a declaration by its name", () => {
  it("is found by its name as it is written, its type's and enum's first", () => {
    const snapshot: string[] = [];
    for (const target of [
      "Hover",
      "Hover.rest",
      "Pointer",
      "Pointer.touch",
      "Link",
      "Link.hover",
      "Link.rest",
      "Link.press",
      "Menu.State",
      "Menu.State.open",
      "Menu.Toggle",
      "Menu.Toggle.hover",
      "Device",
      "phone",
      "trackpad",
      "Evidence",
    ]) {
      snapshot.push(find(target));
    }
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "2:6 enum Hover = rest | hovered [Hover]",
        "2:14 enum Hover = rest | hovered [rest]",
        "1:11 dimension Pointer = mouse | touch [Pointer]",
        "1:29 dimension Pointer = mouse | touch [touch]",
        "4:6 type Link needs Pointer { [Link]",
        "6:9 state hover: Hover [hover]",
        "7:10 action rest: hover hovered -> rest [rest]",
        "5:9 event press [press]",
        "11:8 enum State = closed | open [State]",
        "11:25 enum State = closed | open [open]",
        "15:8 type Toggle { [Toggle]",
        "16:11 state hover: Hover [hover]",
        "20:13 environment Device = Pointer [Device]",
        "21:9 profile phone: Device { Pointer = touch } [phone]",
        "22:10 modifier trackpad on phone { Pointer = mouse } [trackpad]",
        "24:8 record Evidence { [Evidence]",
      ]
    `);
  });

  it("is told apart by its kind, where one name names two", () => {
    expect([
      find("Menu.close"),
      find("event:Menu.close"),
      find("action:Menu.close"),
    ]).toMatchInlineSnapshot(`
      [
        "Menu.close names an action and an event; say which: action:Menu.close or event:Menu.close",
        "13:9 event close [close]",
        "14:10 action close: menu open -> closed [close]",
      ]
    `);
  });

  it("is refused when nothing is declared by the name, with the names close to it", () => {
    expect([
      find("Hovr"),
      find("Link.hovr"),
      find("Nothing.here"),
      find("state:Hover"),
    ]).toMatchInlineSnapshot(`
      [
        "nothing is declared as Hovr; did you mean Hover?",
        "nothing is declared as Link.hovr; did you mean Link.hover?",
        "nothing is declared as Nothing.here (Hover, Hover.rest, Hover.hovered, Actor, Actor.designer, Menu.State, Menu.State.closed, Menu.State.open, Pointer, Pointer.mouse, Pointer.touch, Link, Link.hover, Link.rest, Link.press, Menu, Menu.menu, Menu.close, Menu.Toggle, Menu.Toggle.hover, Device, phone, trackpad, Evidence, EvidenceRecorder)",
        "no state is declared as Hover (Link.hover, Menu.menu, Menu.Toggle.hover)",
      ]
    `);
  });
});
