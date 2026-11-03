import { serverOptions } from "@vscode/server.js";
import { describe, expect, it } from "vitest";

describe("the server the extension starts", () => {
  it("is the one it bundles, run with VS Code's Node", () => {
    expect(serverOptions("/extension", undefined, [])).toEqual({
      module: "/extension/dist/server.mjs",
    });
  });

  it("is the one the settings name, with its arguments, when they name one", () => {
    expect(
      serverOptions("/extension", "node", ["/dxn/packages/language-server/dist/main.js"]),
    ).toEqual({ command: "node", args: ["/dxn/packages/language-server/dist/main.js"] });
    expect(serverOptions("/extension", "", [])).toEqual({ module: "/extension/dist/server.mjs" });
  });
});
