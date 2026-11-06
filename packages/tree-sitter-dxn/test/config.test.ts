import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// How Zed edits a dxn file, from the extension's language configuration.

const config = readFileSync(join(__dirname, "../../zed/languages/dxn/config.toml"), "utf8");

// The quoted strings of a setting that is a list, such as `word_characters`.
function list(key: string): string[] {
  const line = config.match(new RegExp(`^${key} = \\[(.*)\\]$`, "m"));
  return [...(line?.[1] ?? "").matchAll(/"([^"]*)"/g)].map(([, each]) => each as string);
}

describe("the configuration", () => {
  it("selects a name with hyphens as one word", () => {
    const snapshot: string[] = [];
    // `take-focus` is one name, so double-clicking it or moving over it takes all of it.
    snapshot.push(`word characters: ${list("word_characters").join(" ")}`);
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "word characters: -",
      ]
    `);
  });
});
