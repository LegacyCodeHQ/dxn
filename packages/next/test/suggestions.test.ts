import { analyze, isEnumName, isValueName } from "@next/index.js";
import { expect, it } from "vitest";

it.each([
  ["enum light { off }", "badEnumName", "Light"],
  ["enum ui-state { off }", "badEnumName", "UiState"],
  ["enum ui_state { off }", "badEnumName", "UiState"],
  ["enum Light { Off }", "badValueName", "off"],
  ["enum Light { noKeyboard }", "badValueName", "no-keyboard"],
  ["enum Light { no_keyboard }", "badValueName", "no-keyboard"],
  ["enum Light { -dim }", "badValueName", "dim"],
  ["enum Light { dim- }", "badValueName", "dim"],
  ["enum Light { a--b }", "badValueName", "a-b"],
] as const)("suggests an accepted spelling for %s", (source, code, suggestion) => {
  const problems = analyze(source).problems;
  expect(problems).toHaveLength(1);
  expect(problems[0]).toHaveProperty("suggestion", suggestion);
  expect(problems[0]?.message).toContain(`use '${suggestion}'`);
  expect(code === "badEnumName" ? isEnumName(suggestion) : isValueName(suggestion)).toBe(true);
});

it.each([
  "enum 2Light { off }",
  "enum Lïght { off }",
  "enum Light { ön }",
  "enum Light { - }",
  "enum Light { __ }",
])("does not invent a name for %s", (source) => {
  const problems = analyze(source).problems;
  expect(problems).toHaveLength(1);
  expect(problems[0]).not.toHaveProperty("suggestion");
});

it.each([
  ["enum Light { Off, off }", "off"],
  ["enum Light { noKeyboard, no-keyboard }", "no-keyboard"],
  ["enum light { off } enum Light { on }", "Light"],
])("explains why a correction would collide in %s", (source, taken) => {
  const problem = analyze(source).problems[0];
  expect(problem).not.toHaveProperty("suggestion");
  expect(problem?.message).toContain(`'${taken}' is already declared`);
});

it("checks collisions in the correct declaration when enum names are duplicated", () => {
  const problems = analyze("enum Light { off } enum Light { Off }").problems;
  expect(problems.find((p) => p.code === "badValueName")).toHaveProperty("suggestion", "off");
});
