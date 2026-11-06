import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The entry point only wires things together; it is exercised by the Docker smoke test in CI.
      exclude: ["src/index.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
