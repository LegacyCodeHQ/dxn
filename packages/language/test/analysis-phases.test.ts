import { afterEach, describe, expect, it, vi } from "vitest";
import * as assertions from "../src/evaluation/expect.js";
import * as matrix from "../src/evaluation/matrix.js";
import { format } from "../src/syntax/format.js";
import { parse } from "../src/syntax/parse.js";
import { read } from "../src/syntax/read.js";

afterEach(() => vi.restoreAllMocks());

const source = `type Outer {
  enum Flag = off | on
  type Inner {
    state flag: Flag
  }
}
record Proof {
  file: RelativePath
}
actor Tester records Proof
`;

describe("source analysis phases", () => {
  it("reads declarations without resolving names or deriving record context", () => {
    const file = read(source);
    const outer = file.types[0];
    const snapshot: unknown[] = [];
    snapshot.push(file.types.map(({ name }) => name));
    snapshot.push(outer?.types.map(({ name, states }) => [name, states[0]?.enum.name]));
    snapshot.push(file.records.map(({ context }) => context));
    snapshot.push(file.diagnostics);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Outer",
        ],
        [
          [
            "Inner",
            "Flag",
          ],
        ],
        [
          false,
        ],
        [],
      ]
    `);
  });

  it("keeps resolution and record context in the full parse", () => {
    const file = parse(source);
    const snapshot: unknown[] = [];
    snapshot.push(file.types.map(({ name }) => name));
    snapshot.push(file.types[1]?.states[0]?.enum.name);
    snapshot.push(file.records.map(({ context }) => context));
    snapshot.push(file.diagnostics);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Outer",
          "Outer.Inner",
        ],
        "Outer.Flag",
        [
          true,
        ],
        [],
      ]
    `);
  });

  it("formats a failing expectation without executing source analysis", () => {
    const conditions = vi.spyOn(matrix, "conditionsInMatrix");
    const expectations = vi.spyOn(assertions, "expectations");
    const text = `enum Flag = off | on
type Item {
state flag: Flag
}
expect "must be on" {
in Item
then flag = on
}
`;
    const snapshot: unknown[] = [];
    snapshot.push(format(text));
    snapshot.push(conditions.mock.calls.length, expectations.mock.calls.length);
    // Full analysis still executes the expectation and reports its failure.
    snapshot.push(parse(text).diagnostics.map(({ code }) => code));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "enum Flag = off | on
      type Item {
        state flag: Flag
      }
      expect "must be on" {
        in Item
        then flag = on
      }
      ",
        0,
        0,
        [
          "expectation-failed",
        ],
      ]
    `);
  });
});
