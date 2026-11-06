import { dxn } from "@vscode/run.js";
import { describe, expect, it } from "vitest";

describe("what a code lens runs", () => {
  it("is the dxn the extension bundles, the command, the file, and the rest", () => {
    expect(dxn("/extension", "model.dxn", ["check"])).toEqual([
      "/extension/dist/dxn.mjs",
      "check",
      "model.dxn",
    ]);
    expect(dxn("/extension", "model.dxn", ["fmt", "--check"])).toEqual([
      "/extension/dist/dxn.mjs",
      "fmt",
      "model.dxn",
      "--check",
    ]);
  });
});
