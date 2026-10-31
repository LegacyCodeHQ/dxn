import { defineProject } from "vitest/config";

export default defineProject({
  // The language's sources, not its build, so a test run needs no build first.
  // The conditions after "source" are Vite's defaults for code run in Node.
  ssr: { resolve: { conditions: ["source", "module", "node", "development|production"] } },
  test: {
    name: "cli",
    include: ["test/**/*.test.ts"],
    environment: "node",
    snapshotSerializers: ["test/support/serializer.ts"],
  },
});
