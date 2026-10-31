import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "language",
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
