import { analyze, quickFixes } from "@next/index.js";
import type { Span } from "@next/model/enumeration.js";
import { expect, it } from "vitest";

it.each([
  ["enum light { off }", "light", "Light", "E1"],
  ["type button {}", "button", "Button", "T1"],
  ["record review { v: Verdict } enum Verdict { approved }", "review", "Review", "R1"],
  ["record Review { Verdict: Verdict } enum Verdict { approved }", "Verdict", "verdict", "R3"],
  ["enum Light { noKeyboard }", "noKeyboard", "no-keyboard", "E3"],
  ["enum Light {\r\n  Off,\r\n  on\r\n}", "Off", "off", "E3"],
] as const)("corrects only the offending name in %s", (source, name, replacement, rule) => {
  const start = source.indexOf(name),
    end = start + name.length;
  const fixes = quickFixes(source, { start, end });
  expect(fixes).toHaveLength(1);
  expect(fixes[0]).toMatchObject({
    title: `Replace '${name}' with '${replacement}'`,
    rule,
    edits: [{ span: { start, end }, text: replacement }],
  });
  const edit = fixes[0]?.edits[0];
  if (!edit) throw new Error("missing edit");
  const corrected = source.slice(0, edit.span.start) + edit.text + source.slice(edit.span.end);
  expect(corrected).toBe(source.replace(name, replacement));
  expect(analyze(corrected).problems).toEqual([]);
});

it.each([
  "type button {} enum Button { primary }",
  "enum button { primary } type Button {}",
  "enum Light { Off, off }",
  "enum light { off } enum Light { on }",
  "enum Light { ön }",
  "enum Light { off, on }",
  "enum light { off } enum Broken {",
])("offers no naming action for %s", (source) => {
  expect(quickFixes(source, { start: 0, end: source.length })).toEqual([]);
});

it("offers one edit per occurrence and rechecks collisions after an earlier correction", () => {
  const source = "enum Light { Off, Off }";
  const fixes = quickFixes(source, { start: 0, end: source.length });
  expect(fixes.map((f) => f.edits)).toEqual([
    [{ span: { start: 13, end: 16 }, text: "off" }],
    [{ span: { start: 18, end: 21 }, text: "off" }],
  ]);
  expect(quickFixes("enum Light { off, Off }", { start: 0, end: 22 })).toEqual([]);
});

it.each([
  [{ start: 13, end: 13 }, 1],
  [{ start: 16, end: 16 }, 1],
  [{ start: 12, end: 13 }, 0],
  [{ start: 16, end: 17 }, 0],
  [{ start: -1, end: 0 }, 0],
  [{ start: 18, end: 10 }, 0],
  [{ start: 0, end: 99 }, 0],
] satisfies [Span, number][])("selects only intersecting names at %j", (selection, count) => {
  expect(quickFixes("enum Light { Off }", selection)).toHaveLength(count);
});

it("checks record field suggestions in their own record and names the right container", () => {
  const source = "record Review { Verdict: Verdict\nverdict: Verdict } enum Verdict { approved }";
  expect(quickFixes(source, { start: 0, end: source.length })).toEqual([]);
  expect(analyze(source).problems.find((p) => p.rule === "R3")?.message).toContain(
    "in this record",
  );
});
