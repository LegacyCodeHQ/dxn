import { defineConfig } from "vitest/config";

// One run over both packages, so coverage and its thresholds cover them together.
export default defineConfig({
  test: {
    // Packages with tests, by their configs: packages/zed holds a checkout of
    // this repository once Zed builds the extension, whose tests are not ours.
    projects: ["packages/*/vitest.config.{ts,mts}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/cli/src/main.ts",
        "packages/language-server/src/main.ts",
        // Only VS Code can run it; what it starts is chosen in server.ts.
        "packages/vscode/src/extension.ts",
      ],
      reporter: ["text", "lcov"],
      thresholds: { lines: 70, functions: 85 },
    },
  },
});
