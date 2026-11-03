import {
  apartShort,
  evidenceColumns,
  evidenceLabel,
  evidenceShort,
  outdatedItem,
  outdatedSummary,
  outdatedWhy,
  ratio,
  sayRatio,
  storedRecords,
} from "@language/core/vocabulary.js";
import { describe, expect, it } from "vitest";

// The words dxn and an editor both say a count of evidence in: one place, so
// neither says it otherwise.

const count = (over: Partial<Parameters<typeof evidenceLabel>[0]> = {}) => ({
  record: "Evidence",
  recorded: 2,
  combinations: 10,
  stale: 0,
  gone: 0,
  outdated: [],
  ...over,
});

describe("the words for evidence", () => {
  it("count the combinations recorded, with what is stale, gone or outdated", () => {
    const snapshot: string[] = [];
    snapshot.push(evidenceLabel(count()));
    snapshot.push(evidenceLabel(count({ recorded: 1, combinations: 1 })));
    snapshot.push(evidenceLabel(count({ stale: 1, gone: 2 })));
    snapshot.push(
      evidenceLabel(
        count({ outdated: [{ path: "Link", says: "hover = rest", added: ["focus"] }] }),
      ),
    );
    // A component where a type places it: what the type can show of it.
    const usage = { in: "Feed", of: "Row", own: 4, pins: ["reading = read"] };
    snapshot.push(evidenceLabel(count({ recorded: 2, combinations: 2 }), usage));
    snapshot.push(evidenceLabel(count({ recorded: 1, combinations: 4 }), { ...usage, pins: [] }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "Evidence 2/10 combinations recorded",
        "Evidence 1/1 combination recorded",
        "Evidence 2/10 combinations recorded, 1 stale, 2 gone",
        "Evidence 2/10 combinations recorded · 1 outdated: focus added",
        "Evidence: Feed can show 2 combinations of Row, reading = read, all recorded",
        "Evidence: Feed can show all 4 combinations of Row, 1 recorded",
      ]
    `);
  });

  it("say why records are outdated, and what to do", () => {
    expect([
      outdatedWhy([{ path: "Link", says: "hover = rest", added: ["focus"] }]),
      outdatedWhy([
        { path: "Link", says: "hover = rest", added: ["focus", "size"] },
        { path: "Menu", says: "open = closed", added: ["size"] },
      ]),
    ]).toMatchInlineSnapshot(`
      [
        "1 stored record is outdated: \`focus\` was added to \`Link\` after it was recorded, so it does not say which \`focus\` it shows. Add its \`focus\` value to count it again.",
        "2 stored records are outdated: \`focus\` and \`size\` were added to \`Link\` and \`Menu\` after they were recorded, so they do not say which \`focus\` or \`size\` they show. Add each one's \`focus\` and \`size\` values to count it again.",
      ]
    `);
  });

  it("list outdated records for an agent: how many, what to do, and each with what it lacks", () => {
    expect([
      outdatedSummary([{ path: "Button", says: "style = filled", added: ["hover"] }]),
      outdatedSummary([
        { path: "Button", says: "style = filled", added: ["hover"] },
        { path: "Button", says: "style = outline", added: ["hover"] },
        { path: "Link", says: "hover = rest", added: ["focus"] },
      ]),
      outdatedItem({ path: "Button", says: "style = filled", added: ["hover"] }),
      outdatedItem({ path: "Link", says: "hover = rest", added: ["focus", "Theme"] }),
    ]).toMatchInlineSnapshot(`
      [
        "1 stored record. Add its \`hover\` value to count it again.",
        "3 stored records. Add each one's \`hover\` and \`focus\` values to count it again.",
        "Button: style = filled; \`hover\` was added after it was recorded",
        "Link: hover = rest; \`focus\` and \`Theme\` were added after it was recorded",
      ]
    `);
  });

  it("count stored records, each one item of a record's stored files", () => {
    expect([storedRecords(1), storedRecords(3)]).toMatchInlineSnapshot(`
      [
        "1 stored record",
        "3 stored records",
      ]
    `);
  });

  it("count, short, for a hint beside the code: the count, then how many need a look", () => {
    const short = (over: Partial<Parameters<typeof evidenceShort>[0]> = {}) =>
      evidenceShort({ ...count(), outdated: 0, apart: 0, mismatched: 0, ...over });
    expect([
      short(),
      short({ recorded: 0, combinations: 1 }),
      short({ stale: 1, gone: 2, outdated: 3, apart: 1, mismatched: 2 }),
      apartShort("Evidence", 3),
    ]).toMatchInlineSnapshot(`
      [
        "Evidence 2/10 recorded",
        "Evidence 0/1 recorded",
        "Evidence 2/10 recorded · 1 stale, 2 gone, 3 outdated, 1 set apart, 2 don't match the model",
        "Evidence: 3 stored records set apart",
      ]
    `);
  });

  it("say a ratio one way, a part of a whole", () => {
    expect([sayRatio(ratio(2, 6)), sayRatio(ratio(0, 1))]).toMatchInlineSnapshot(`
      [
        "2/6",
        "0/1",
      ]
    `);
  });

  it("name a table's columns", () => {
    expect(evidenceColumns()).toMatchInlineSnapshot(`
      [
        "path",
        "combinations",
        "recorded",
        "stale",
        "gone",
        "missing",
      ]
    `);
  });
});
