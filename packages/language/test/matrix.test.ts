import { describe, expect, it } from "vitest";
import { problems } from "./support/language.js";

describe("a condition, against the combinations there really are", () => {
  it("is never true where other rules or a fixed value leave none of its values", () => {
    expect([
      problems(`dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered
type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  enabled = enabled only when Pointer = touch
  hover = hovered only when Pointer = mouse and enabled = enabled
}
`),
      problems(`enum Layout = compact | inline
enum Hover = rest | hovered
type Button {
  state layout: Layout = compact
  state hover: Hover
  hover = hovered only when layout = inline
}
`),
      problems(`enum Layout = compact | inline
type Panel {}
type Menu {
  state layout: Layout = compact
  has panel: Panel only when layout = inline
}
`),
    ]).toEqual([
      [
        "8:3: impossible-condition: `Pointer = mouse and enabled = enabled` is never true, so `hovered` exists nowhere",
      ],
      ["6:3: impossible-condition: `layout = inline` is never true, so `hovered` exists nowhere"],
      ["5:7: impossible-condition: `layout = inline` is never true, so `panel` is never there"],
    ]);
  });

  it("is always true where the other values never happen", () => {
    expect(
      problems(`enum Layout = compact | inline
enum Hover = rest | hovered
type Button {
  state layout: Layout = compact
  state hover: Hover
  hover = hovered only when layout = compact
}
`),
    ).toEqual([
      "6:3: warning: vacuous-condition: `layout = compact` is always true, so the rule restricts nothing",
    ]);
  });
});

describe("a condition never true in one type", () => {
  it("is reported, and the types after it are still judged", () => {
    expect(
      problems(
        "dimension Pointer = mouse | touch\nenum Hover = rest | hovered\ntype Link needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\ntype Card needs Pointer {\n  state hover: Hover\n  hover = hovered only when Pointer = mouse\n}\nenvironment Device = Pointer\nprofile Phone: Device { Pointer = touch }\n",
      ),
    ).toEqual([
      "5:3: impossible-condition: `Pointer = mouse` is never true, so `hovered` exists nowhere",
      "9:3: impossible-condition: `Pointer = mouse` is never true, so `hovered` exists nowhere",
    ]);
  });
});

describe("two triggers of one event", () => {
  it("clash only where both can fire on one value, with their conditions and events", () => {
    expect([
      problems(`enum S = x | y | z
type T {
  event k
  state s: S
  on k: s -> y only when s = x
  on k: s -> x
}
`),
      problems(`dimension Breakpoint = base | lg | xl
enum S = x | y | z
type T needs Breakpoint {
  state s: S
  on Breakpoint = lg: s -> y
  on Breakpoint in (lg, xl): s -> z only when Breakpoint = xl
}
`),
    ]).toEqual([[], []]);
  });

  it("is reported where its event and its condition can never both hold", () => {
    expect(
      problems(`dimension Breakpoint = base | lg | xl
enum S = x | y
type T needs Breakpoint {
  state s: S
  on Breakpoint = base: s -> y only when Breakpoint = lg
}
`),
    ).toEqual([
      "5:3: impossible-condition: `Breakpoint = lg` is never true on `Breakpoint = base`, so the trigger never fires",
    ]);
  });

  it("is the same change whichever comes first: a named action and a change in place to one value", () => {
    const pair = (first: string, second: string) =>
      problems(`enum S = x | y | z
type T {
  event k
  state s: S
  action a: s x -> z
  ${first}
  ${second}
}
`);
    expect([pair("on k: s -> z", "on k: a"), pair("on k: a", "on k: s -> z")]).toEqual([
      ["7:3: duplicate-trigger: `k` already triggers `a`"],
      ["7:3: duplicate-trigger: `k` already triggers `s -> z`"],
    ]);
  });
});
