import { defineProject } from "vitest/config";

// The agreement checks: the same declarations through this implementation and
// the Lean specification. They need Lean, so only `make agreement` runs them.
export default defineProject({
  resolve: { tsconfigPaths: true },
  test: {
    name: "next-agreement",
    include: ["test/agreement/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
