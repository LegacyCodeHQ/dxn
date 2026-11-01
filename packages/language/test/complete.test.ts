import { describe, expect, it } from "vitest";
import { completions } from "../src/complete.js";

const declarations = `dimension Breakpoint = base | lg
dimension Pointer = mouse | touch
enum Hover = rest | hovered
enum Focus = blurred | focused
record Source {
  file: RelativePath
}
`;

const link = `type Link needs Pointer {
  event press
  state hover: Hover, focus: Focus
  action blur: focus focused -> blurred
`;

// What is suggested at the ‸ in a file that starts with the declarations: each
// as its label and its kind.
function at(text: string): string[] {
  const source = `${declarations}${text}`;
  const offset = source.indexOf("‸");
  const before = source.slice(0, offset).split("\n");
  return completions(source.replace("‸", ""), before.length, (before.at(-1) ?? "").length + 1).map(
    ({ label, kind }) => `${label} ${kind}`,
  );
}

describe("completions", () => {
  it("suggest the enums, types and records a name's type can be, and nothing else", () => {
    const snapshot: unknown[] = [];
    // A state's enum, as it is being typed too.
    snapshot.push(at("type Link {\n  state hover: ‸\n}\n"));
    snapshot.push(at("type Link {\n  state hover: Ho‸\n}\n"));
    snapshot.push(at("type Link {\n  state hover: Hover, focus: ‸\n}\n"));
    // A type's own enums and its parents' first, by the names they are seen by.
    snapshot.push(
      at(
        "type Menu {\n  enum Openness = closed | open\n  type Toggle {\n    state expanded: ‸\n  }\n}\n",
      ),
    );
    // A child's type: any type but the one it is in.
    snapshot.push(at(`${link}}\ntype Menu {\n  has link: ‸\n}\n`));
    // A record's field: an enum, a record or a scalar.
    snapshot.push(at("record Evidence {\n  source: ‸\n}\n"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Hover enum",
          "Focus enum",
        ],
        [
          "Hover enum",
          "Focus enum",
        ],
        [
          "Hover enum",
          "Focus enum",
        ],
        [
          "Openness enum",
          "Hover enum",
          "Focus enum",
        ],
        [
          "Link type",
        ],
        [
          "Hover enum",
          "Focus enum",
          "Source record",
          "Timestamp scalar",
          "NonEmptyString scalar",
          "RelativePath scalar",
          "PenNode record",
        ],
      ]
    `);
  });

  it("suggest dimensions, environments and profiles where they go", () => {
    const snapshot: unknown[] = [];
    snapshot.push(at("type Link needs ‸"));
    snapshot.push(at("type Link needs Pointer, ‸"));
    snapshot.push(at("environment Device = Breakpoint x ‸"));
    snapshot.push(at("environment Device = Breakpoint x Pointer\nprofile phone: ‸"));
    snapshot.push(
      at("environment Device = Breakpoint x Pointer\nprofile phone: Device { Breakpoint = base, ‸"),
    );
    snapshot.push(
      at("environment Device = Breakpoint x Pointer\nprofile phone: Device { Breakpoint = ‸"),
    );
    snapshot.push(
      at(
        "environment Device = Breakpoint x Pointer\nprofile phone: Device { Breakpoint = base, Pointer = touch }\nmodifier trackpad on ‸",
      ),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Breakpoint dimension",
          "Pointer dimension",
        ],
        [
          "Breakpoint dimension",
        ],
        [
          "Pointer dimension",
        ],
        [
          "Device environment",
        ],
        [
          "Pointer dimension",
        ],
        [
          "base value",
          "lg value",
        ],
        [
          "phone profile",
        ],
      ]
    `);
  });

  it("suggest a type's states and needs in a condition, and their values after them", () => {
    const snapshot: unknown[] = [];
    snapshot.push(at(`${link}  hover = hovered only when ‸\n}\n`));
    snapshot.push(at(`${link}  hover = hovered only when Pointer = mouse and ‸\n}\n`));
    snapshot.push(at(`${link}  hover = hovered only when Pointer = ‸\n}\n`));
    snapshot.push(at(`${link}  hover = ‸\n}\n`));
    snapshot.push(at(`${link}  alike ‸\n}\n`));
    snapshot.push(at(`${link}  alike hover in (rest, ‸\n}\n`));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "hover state",
          "focus state",
          "Pointer dimension",
        ],
        [
          "hover state",
          "focus state",
          "Pointer dimension",
        ],
        [
          "mouse value",
          "touch value",
        ],
        [
          "rest value",
          "hovered value",
        ],
        [
          "hover state",
          "focus state",
          "Pointer dimension",
        ],
        [
          "hovered value",
        ],
      ]
    `);
  });

  it("suggest events, actions and changes in a trigger, and in an action its state and values", () => {
    const snapshot: unknown[] = [];
    snapshot.push(at(`${link}  on ‸\n}\n`));
    snapshot.push(at(`${link}  on press: ‸\n}\n`));
    snapshot.push(at(`${link}  on press: blur, hover -> ‸\n}\n`));
    snapshot.push(at(`${link}  action take-focus: ‸\n}\n`));
    snapshot.push(at(`${link}  action take-focus: focus ‸\n}\n`));
    snapshot.push(at(`${link}  action take-focus: focus blurred -> ‸\n}\n`));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "press event",
          "Pointer dimension",
        ],
        [
          "blur action",
          "hover state",
          "focus state",
        ],
        [
          "rest value",
          "hovered value",
        ],
        [
          "hover state",
          "focus state",
        ],
        [
          "blurred value",
          "focused value",
        ],
        [
          "blurred value",
          "focused value",
        ],
      ]
    `);
  });

  it("suggest along a path into a child: its events in an event, its actions in a change", () => {
    const snapshot: unknown[] = [];
    snapshot.push(at(`${link}}\ntype Menu {\n  has link: Link\n  on link.‸\n}\n`));
    snapshot.push(
      at(`${link}}\ntype Menu {\n  has link: Link\n  event escape\n  on escape: link.‸\n}\n`),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "press event",
        ],
        [
          "blur action",
        ],
      ]
    `);
  });

  it("suggest, in an actor's declaration, records and then the record it records", () => {
    expect([
      at("actor designer ‸"),
      at("actor designer rec‸"),
      at("actor designer records ‸"),
      at("record Evidence {\n  at: Timestamp\n}\nactor designer records Ev‸"),
    ]).toMatchInlineSnapshot(`
      [
        [
          "records keyword",
        ],
        [
          "records keyword",
        ],
        [
          "Source record",
        ],
        [
          "Source record",
          "Evidence record",
        ],
      ]
    `);
  });

  it("suggest what starts a declaration, at the start of a line", () => {
    const snapshot: unknown[] = [];
    snapshot.push(at("‸"));
    snapshot.push(at(`${link}  ‸\n}\n`));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "dimension keyword",
          "enum keyword",
          "type keyword",
          "record keyword",
          "actor keyword",
          "environment keyword",
          "profile keyword",
          "modifier keyword",
          "expect keyword",
        ],
        [
          "state keyword",
          "event keyword",
          "action keyword",
          "on keyword",
          "has keyword",
          "alike keyword",
          "provides keyword",
          "enum keyword",
          "type keyword",
          "hover state",
          "focus state",
        ],
      ]
    `);
  });

  it("suggest, in an expectation, the element's path, its keys and their values, and its events", () => {
    const model = `${link}  on press: blur
}
type Menu {
  enum Openness = closed | open
  state menu: Openness
  event escape
  has link: Link only when menu = open
  on escape: link.blur
}
type Page {
  has menu: Menu
}
environment Device = Pointer
profile phone: Device { Pointer = touch }
`;
    const snapshot: unknown[] = [];
    snapshot.push(at(`${model}expect "x" {\n  ‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in ‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu.‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu.link\n  when ‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu.link\n  when menu.menu = ‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu.link\n  when profile = ‸\n}\n`));
    snapshot.push(
      at(
        `${model}expect "x" {\n  in Page.menu.link\n  when Pointer = mouse\n  then focus = ‸\n}\n`,
      ),
    );
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu\n  on ‸\n}\n`));
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu\n  on link.‸\n}\n`));
    snapshot.push(
      at(`${model}expect "x" {\n  in Page.menu\n  on escape\n  then menu = closed, ‸\n}\n`),
    );
    // What happens is to the element's own states, or a child's: not a
    // parent's, or a dimension.
    snapshot.push(
      at(`${model}expect "x" {\n  in Page.menu.link\n  when menu.menu = open\n  then ‸\n}\n`),
    );
    snapshot.push(at(`${model}expect "x" {\n  in Page.menu\n  on escape\n  then ‸\n}\n`));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "in keyword",
          "when keyword",
          "on keyword",
          "then keyword",
          "some keyword",
          "absent keyword",
        ],
        [
          "Link type",
          "Menu type",
          "Page type",
        ],
        [
          "menu child",
        ],
        [
          "link child",
        ],
        [
          "hover state",
          "focus state",
          "menu child",
          "Pointer dimension",
          "profile keyword",
        ],
        [
          "closed value",
          "open value",
        ],
        [
          "phone profile",
        ],
        [
          "blurred value",
          "focused value",
        ],
        [
          "escape event",
          "link child",
        ],
        [
          "press event",
        ],
        [
          "link child",
        ],
        [
          "hover state",
          "focus state",
        ],
        [
          "menu state",
          "link child",
        ],
      ]
    `);
  });
});
