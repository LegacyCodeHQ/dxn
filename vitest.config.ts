import { defineConfig } from "vitest/config";

// One run over both packages, so coverage and its thresholds cover them together.
export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/cli/src/main.ts"],
      reporter: ["text", "lcov"],
      thresholds: { lines: 70, functions: 85 },
    },
  },
});
