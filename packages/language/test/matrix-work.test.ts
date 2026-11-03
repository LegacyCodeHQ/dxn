import * as combinations from "@language/evaluation/status.js";
import { parse } from "@language/syntax/parse.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("condition analysis work", () => {
  it("does not enumerate a type with no conditions to judge", () => {
    const enumerate = vi.spyOn(combinations, "alone");
    const file = parse(`enum Flag = off | on
type Item {
  state first: Flag, second: Flag, third: Flag
}
`);
    expect([file.diagnostics, enumerate.mock.calls.length]).toMatchInlineSnapshot(`
      [
        [],
        0,
      ]
    `);
  });
});
