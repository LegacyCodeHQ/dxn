import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validate } from "../src/evidence/validate.js";
import { parse } from "../src/syntax/parse.js";

// The settings example, which the editor extensions are tried in, stays a file
// without problems, whose stored records check: a file with problems would
// leave most of what an editor does nothing to work on.

const settings = join(__dirname, "../../../examples/settings");
const file = parse(readFileSync(join(settings, "settings.dxn"), "utf8"));

describe("the settings example", () => {
  it("has no problems", () => {
    expect(file.diagnostics).toEqual([]);
  });

  it("has stored records that check", () => {
    const stored = readFileSync(join(settings, "evidence/settings.json"), "utf8");
    expect(validate(file, "Evidence", stored)).toEqual([]);
  });
});
