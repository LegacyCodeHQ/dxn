import { defineConfig } from "vitest/config";

// One run over every npm workspace, with a shared report and package gates.
export default defineConfig({
  test: {
    // Packages with tests, by their configs: packages/zed holds a checkout of
    // this repository once Zed builds the extension, whose tests are not ours.
    projects: ["packages/*/vitest.config.{ts,mts}"],
    coverage: {
      provider: "v8",
      // Also match relative to a package root when --project selects one.
      // Include unimported files, the grammar DSL and the extension's bundler.
      include: [
        "{packages/*/,}src/**/*.{ts,js,mjs}",
        "{packages/*/,}grammar.js",
        "{packages/*/,}build.mjs",
      ],
      exclude: [
        "{packages/cli/,}src/main.ts",
        "{packages/language-server/,}src/main.ts",
        // Only VS Code can run it; what it starts is chosen in server.ts.
        "{packages/vscode/,}src/extension.ts",
      ],
      reportsDirectory: "coverage/javascript",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportOnFailure: true,
      thresholds: {
        lines: 70,
        functions: 85,
        "packages/language/**": { lines: 70, functions: 85 },
        "packages/cli/**": { lines: 70, functions: 85 },
        "packages/language-server/**": { lines: 70, functions: 85 },
        "packages/vscode/**": { lines: 70, functions: 85 },
        "packages/next/**": { lines: 70, functions: 85 },
        // Native parser tests do not execute the JavaScript grammar DSL.
        // Report its uncovered code rather than excluding it or inventing a gate.
      },
    },
  },
});
