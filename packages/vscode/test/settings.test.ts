import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
  name: string;
  publisher: string;
  contributes: { configurationDefaults?: Record<string, unknown> };
};

describe("the extension's settings for .dxn files", () => {
  it("format a file with the extension when it is saved", () => {
    expect(manifest.contributes.configurationDefaults?.["[dxn]"]).toEqual({
      "editor.defaultFormatter": `${manifest.publisher}.${manifest.name}`,
      "editor.formatOnSave": true,
    });
  });
});
