import { describe, expect, it } from "vitest";
import { folderOf } from "../../src/language/store.js";

describe("where a record is stored", () => {
  it("is a folder named after the record, in kebab-case, with no plural", () => {
    expect(
      ["Evidence", "DesignReview", "HTTPLog", "Step2Result", "A"].map((name) => folderOf(name)),
    ).toEqual(["evidence", "design-review", "http-log", "step2-result", "a"]);
  });
});
