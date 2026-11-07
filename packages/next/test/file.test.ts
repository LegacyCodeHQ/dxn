import { acceptFile, CheckedFile, checkFile } from "@next/check/file.js";
import { parse } from "@next/syntax/parse.js";
import { describe, expect, it } from "vitest";

// The file checker of lean/Dxn/File.lean, with the cases of lean/DxnTest/File.lean.

const declarations = (source: string) => parse(source).declarations;

// What the checker says, without positions: the part Lean also says.
const said = (source: string) =>
  checkFile(declarations(source)).map((problem) =>
    problem.kind === "duplicateName"
      ? `duplicateName ${problem.name}`
      : `${problem.name}: ${problem.problem.kind}${"name" in problem.problem ? ` ${problem.problem.name}` : ""}`,
  );

describe("checking a file", () => {
  it("reports each enumeration's problems in written order, then names written twice", () => {
    const snapshot: unknown[] = [];
    snapshot.push(said("enum Light { off, on }\nenum Power { off, on }"));
    snapshot.push(said(""));
    snapshot.push(said("enum Light { off, on }\nenum Light { dim }"));
    snapshot.push(said("enum light { }\nenum Power { on, on }\nenum light { dim }"));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [],
        [],
        [
          "duplicateName Light",
        ],
        [
          "light: badEnumName light",
          "light: empty",
          "Power: duplicate on",
          "light: badEnumName light",
          "duplicateName light",
        ],
      ]
    `);
  });

  it("points a name written twice at every declaration that has it", () => {
    const source = "enum Light { off }\nenum Light { dim }";
    const [problem] = checkFile(declarations(source));
    const snapshot: unknown[] = [];
    snapshot.push(
      problem?.kind === "duplicateName" &&
        problem.at.map(({ start, end }) => source.slice(start, end)),
    );
    expect(snapshot).toMatchInlineSnapshot(`
      [
        [
          "Light",
          "Light",
        ],
      ]
    `);
  });

  it("gives a checked file, and its values, only for a file with no problems", () => {
    const accepted = acceptFile(declarations("enum Light { off, on }\nenum Power { off, on }"));
    const rejected = acceptFile(declarations("enum Light { off }\nenum Light { dim }"));
    const snapshot: unknown[] = [];
    snapshot.push(accepted.file instanceof CheckedFile, accepted.file?.values);
    snapshot.push(rejected.file, rejected.problems.length);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        true,
        [
          {
            "enum": "Light",
            "name": "off",
          },
          {
            "enum": "Light",
            "name": "on",
          },
          {
            "enum": "Power",
            "name": "off",
          },
          {
            "enum": "Power",
            "name": "on",
          },
        ],
        undefined,
        1,
      ]
    `);
  });

  it("makes a checked file only by checking it", () => {
    // Checked by the type checker, as Enum is.
    // @ts-expect-error The constructor is private.
    const made = () => new CheckedFile([]);
    // @ts-expect-error A look-alike object is not a checked file.
    const alike: CheckedFile = { enums: [], values: [] };
    expect([typeof made, typeof alike]).toEqual(["function", "object"]);
  });
});
