import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { tsconfigPaths: true },
  test: {
    name: "vscode",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
