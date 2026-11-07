import { acceptFile, analyze, format, parse, renameDecl } from "@next/index.js";
import { expect, it } from "vitest";

it.each([
  "record Empty {}",
  "record Review { verdict: Verdict } enum Verdict { approved, changes }",
  "record Review {\n verdict: Verdict\n finding: Finding\n} record Finding { severity: Severity } enum Severity { major, minor } enum Verdict { approved }",
  "record record { type: enum\nrecord: record }",
])("reads record syntax independently of checker validity: %s", (source) => {
  expect(parse(source).problems).toEqual([]);
  expect(format(format(source) ?? "")).toBe(format(source));
});

it.each([
  "record Review { a: Verdict b: Verdict }",
  "record Review { a: Verdict,\nb: Verdict }",
  "record Review { a Verdict }",
  "record Review { a: }",
  "record Review { a:\nVerdict }",
  "record Review { a: Verdict",
])("rejects malformed record syntax: %s", (source) => {
  expect(parse(source).problems).toHaveLength(1);
  expect(format(source)).toBeUndefined();
});

it("reports R1–R6 and cross-kind F1 in rule and declaration order", () => {
  const source =
    "enum Verdict { approved } type Button {} record review { Bad: Missing\nBad: review\nbutton: Button } record Empty {} record Verdict { v: Verdict }";
  expect(analyze(source).problems.map((p) => [p.rule, p.code])).toMatchInlineSnapshot(`
    [
      [
        "R1",
        "badRecordName",
      ],
      [
        "R3",
        "badFieldName",
      ],
      [
        "R4",
        "duplicateField",
      ],
      [
        "R5",
        "noSuchFieldType",
      ],
      [
        "R5",
        "noSuchFieldType",
      ],
      [
        "R6",
        "containsItself",
      ],
      [
        "R2",
        "noFields",
      ],
      [
        "R6",
        "containsItself",
      ],
      [
        "F1",
        "duplicateName",
      ],
    ]
  `);
});

it("reports every record on a cycle, with the fields that lead back", () => {
  const source = "record A { b: B } record B { a: A } record Other { a: A }";
  expect(
    analyze(source)
      .problems.filter((p) => p.rule === "R6")
      .map((p) => ({ message: p.message, at: p.at.map((s) => source.slice(s.start, s.end)) })),
  ).toMatchInlineSnapshot(`
    [
      {
        "at": [
          "B",
          "A",
        ],
        "message": "[R6] record 'A' contains itself: A -> B -> A; remove a field that leads back",
      },
      {
        "at": [
          "A",
          "B",
        ],
        "message": "[R6] record 'B' contains itself: B -> A -> B; remove a field that leads back",
      },
    ]
  `);
});

it("renames enum references in record fields without touching field names", () => {
  const source = "record Review { verdict: Verdict } enum Verdict { verdict, changes }";
  expect(renameDecl(source, "Verdict", "Decision").source).toBe(
    "record Review { verdict: Decision } enum Decision { verdict, changes }",
  );
});

it("renames records and types, updating only declaration references", async () => {
  const { renameDecl } = await import("@next/index.js");
  const source =
    "enum Verdict { approved } record Finding { verdict: Verdict } record Review { finding: Finding } type Button { varies Verdict }";
  expect(renameDecl(source, "Finding", "Issue").source).toBe(source.replaceAll("Finding", "Issue"));
  expect(renameDecl(source, "Button", "Control").source).toBe(source.replace("Button", "Control"));
});

it("enumerates nested field values and compares by field name and enum identity", async () => {
  const { equalFieldValues, fieldValue } = await import("@next/index.js");
  const source =
    "record Review { decision: Decision\nurgent: Urgency } record Decision { verdict: Verdict } enum Verdict { approved, changes } enum Urgency { low, high }";
  const file = acceptFile(parse(source).declarations).file;
  if (!file) throw new Error("expected an accepted file");
  const values = file.recordValues("Review");
  expect(values).toHaveLength(4);
  const first = values[0];
  if (first?.kind !== "record") throw new Error("expected record value");
  const reordered = {
    kind: "record" as const,
    fields: Object.fromEntries(Object.entries(first.fields).reverse()),
  };
  expect(equalFieldValues(first, reordered)).toBe(true);
  expect(equalFieldValues(first, values[1] ?? first)).toBe(false);
  expect(fieldValue(fieldValue(first, "decision") ?? first, "verdict")).toEqual({
    kind: "enum",
    value: { enum: "Verdict", name: "approved" },
  });
  expect(fieldValue(first, "missing")).toBeUndefined();
  expect(
    equalFieldValues(
      { kind: "enum", value: { enum: "Verdict", name: "approved" } },
      { kind: "enum", value: { enum: "Other", name: "approved" } },
    ),
  ).toBe(false);
  expect(file.recordValues("Missing")).toEqual([]);
});

it("shows valid record syntax in a record hover", async () => {
  const { symbolAt } = await import("@next/index.js");
  const source = "record Review { verdict: Verdict\nurgent: Urgency }";
  const symbol = symbolAt(source, source.indexOf("Review"));
  expect(parse(symbol?.signature ?? "").problems).toEqual([]);
});

it("retains immutable records and field spans after acceptance", () => {
  const parsed = parse("record Review { verdict: Verdict } enum Verdict { approved }");
  const file = acceptFile(parsed.declarations).file;
  const record = parsed.declarations[0];
  if (!file || !record || !("fields" in record)) throw new Error("expected record");
  Object.assign(record.fields[0]?.type ?? {}, { text: "Missing" });
  expect(file.records[0]?.fields[0]?.type.text).toBe("Verdict");
  expect(() =>
    Object.assign(file.records[0]?.fields[0]?.type ?? {}, { text: "Missing" }),
  ).toThrow();
  expect(file.recordValues("Review")).toHaveLength(1);
});

it.each(["\n", "\r\n", "\r"])(
  "reverses declaration renames without reformatting line ending %j",
  (newline) => {
    const source = [
      "record Finding { verdict: Verdict }",
      "record Review { finding: Finding }",
      "enum Verdict { approved }",
      "type Button { varies Verdict }",
    ].join(newline);
    for (const from of ["Finding", "Review", "Verdict", "Button"]) {
      const renamed = renameDecl(source, from, "Changed");
      if (!renamed.source) throw new Error("expected successful rename");
      expect(renameDecl(renamed.source, "Changed", from).source).toBe(source);
      expect(renameDecl(source, from, from).edits).toEqual([]);
    }
  },
);
