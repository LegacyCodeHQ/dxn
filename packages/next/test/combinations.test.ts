import { product } from "@next/check/product.js";
import { combinationCounts, listCombinations, renderCombinationTables } from "@next/index.js";
import { expect, it } from "vitest";

it("counts a product beyond safe integers without enumerating it", () => {
  const names = Array.from({ length: 60 }, (_, i) => `Factor${i}`);
  const source = `${names.map((name) => `enum ${name} { off, on }`).join("\n")} type Large { varies ${names.join(", ")} }`;
  expect(combinationCounts(source)).toMatchObject([
    { type: "Large", count: "1152921504606846976" },
  ]);
});

it.each([
  "type Good {} type Bad { varies Missing }",
  "type Good {} enum Invalid {",
  "type Good {} type Good {}",
])("lists no part of an invalid file: %s", (source) => {
  expect(combinationCounts(source)).toEqual([]);
  expect(listCombinations(source, "Good")).toMatchObject({ kind: "invalid" });
});

it("distinguishes an empty product from a product with an empty factor", () => {
  expect([...product([])]).toEqual([[]]);
  expect([...product([[]])]).toEqual([]);
});

it("keeps columns, row numbering and type order when several factors have the same values", () => {
  const result = listCombinations(
    "enum A { off, on } enum B { off, on } type Lamp { varies B, A } type Logo {}",
  );
  if (result.kind !== "listed") throw new Error("expected a listing");
  expect(result.types.map((t) => ({ name: t.type, count: t.count, columns: t.varies }))).toEqual([
    { name: "Lamp", count: 4, columns: ["B", "A"] },
    { name: "Logo", count: 1, columns: [] },
  ]);
  expect(renderCombinationTables(result.types)).toMatchInlineSnapshot(`
    "Lamp: 4 combinations

      #  B    A
      1  off  off
      2  off  on
      3  on   off
      4  on   on

    Logo: 1 combination (varies over nothing)"
  `);
});

it.each(["", "enum Kind { primary }"])("reports no types when none are declared: %s", (source) => {
  expect(listCombinations(source)).toEqual({ kind: "listed", types: [] });
  expect(listCombinations(source, "Kind")).toMatchObject({ kind: "unknownType", available: [] });
});
