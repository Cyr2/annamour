import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Both drive a real browser: exercised on the server, not in unit tests.
      exclude: ["src/index.ts", "src/naka-page.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
