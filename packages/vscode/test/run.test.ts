import { describe, expect, it } from "vitest";
import { dxn } from "../src/run.js";

describe("what a code lens runs", () => {
  it("is the dxn the extension bundles, the command, the file, and the rest", () => {
    expect(dxn("/extension", "settings.dxn", ["states", "Help.Toggle"])).toEqual([
      "/extension/dist/dxn.mjs",
      "states",
      "settings.dxn",
      "Help.Toggle",
    ]);
    expect(
      dxn("/extension", "settings.dxn", ["check", "--expect", "Closing the help closes it"]),
    ).toEqual([
      "/extension/dist/dxn.mjs",
      "check",
      "settings.dxn",
      "--expect",
      "Closing the help closes it",
    ]);
  });
});
