import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";

// The playground, which the editor extensions are tried in, stays a file
// without problems, whose stored records check: a file with problems would
// leave most of what an editor does nothing to work on.

const playground = join(__dirname, "../../../playground");
const file = parse(readFileSync(join(playground, "settings.dxn"), "utf8"));

describe("the playground", () => {
  it("has no problems", () => {
    expect(file.diagnostics).toEqual([]);
  });

  it("has stored records that check", () => {
    const stored = readFileSync(join(playground, "evidence/settings.json"), "utf8");
    expect(validate(file, "Evidence", stored)).toEqual([]);
  });
});
