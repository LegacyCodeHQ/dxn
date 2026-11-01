import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "tree-sitter-dxn",
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The first parse compiles the grammar with the C compiler.
    testTimeout: 120_000,
  },
});
