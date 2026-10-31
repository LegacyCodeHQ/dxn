import { describe, expect, it } from "vitest";
import { parse } from "../../src/language/parse.js";
import { validate } from "../../src/language/validate.js";
import { problems } from "../support/language.js";

// The problems in a list of records of this one-field record, as
// "code: path: message".
const data = (type: string, ...values: unknown[]) =>
  validate(
    parse(`record Entry {\n  value: ${type}\n}\n`),
    "Entry",
    JSON.stringify(values.map((value) => ({ value }))),
  ).map(({ code, path, message }) => `${code}: ${path}: ${message}`);

describe("Timestamp", () => {
  it("types a record's field", () => {
    const source = "record Evidence {\n  at: Timestamp\n}\n";
    expect([
      problems(source),
      parse(source).records[0]?.fields.map((field) => [field.name, field.type.name]),
    ]).toEqual([[], [["at", "Timestamp"]]]);
  });

  it("is built in, so its name cannot be declared", () => {
    expect([
      problems("enum Timestamp = now | later\n"),
      problems("record Timestamp {\n  at: Timestamp\n}\n"),
    ]).toEqual([
      ["1:6: reserved-name: Timestamp is a built-in scalar; choose another name"],
      ["1:8: reserved-name: Timestamp is a built-in scalar; choose another name"],
    ]);
  });

  it("is only for records: no state or dimension can have one", () => {
    expect([
      problems("type Link {\n  states at: Timestamp\n}\n"),
      problems("environment Device = Timestamp\n"),
    ]).toEqual([
      ["2:14: unknown-enum: Timestamp is a scalar, not an enum"],
      ["1:22: unknown-dimension: Timestamp is a scalar, not a dimension"],
    ]);
  });

  it("holds an ISO 8601 date and time with a time zone", () => {
    expect(data("Timestamp", "2026-10-31T08:50:05.662Z", "2026-10-31T10:50+02:00")).toEqual([]);
  });

  it("reports a value that is not a real date and time with a time zone", () => {
    const message = (index: number, value: string) =>
      `invalid-value: $[${index}].value: ${JSON.stringify(value)} is not a Timestamp: an ISO 8601 date and time with a time zone, e.g. 2026-10-31T08:50:05Z`;
    expect(data("Timestamp", "2026-10-31", "2026-10-31T08:50:05", "2026-02-30T08:50:05Z")).toEqual([
      message(0, "2026-10-31"),
      message(1, "2026-10-31T08:50:05"),
      message(2, "2026-02-30T08:50:05Z"),
    ]);
  });

  it("reports a value that is not a string", () => {
    expect(data("Timestamp", 20261031)).toEqual([
      "wrong-kind: $[0].value: expected a Timestamp (a string), found a number",
    ]);
  });
});
