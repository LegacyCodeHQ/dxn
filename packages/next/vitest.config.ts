import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { tsconfigPaths: true },
  test: {
    name: "next",
    include: ["test/**/*.test.ts"],
    // The agreement checks need Lean; `make agreement` runs them.
    exclude: ["test/agreement/**"],
    environment: "node",
  },
});
