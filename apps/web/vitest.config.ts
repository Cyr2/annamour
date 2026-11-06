import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The non-visual logic: network, sync engine and the screens' stores and rules.
      include: ["src/api/**/*.ts", "src/sync/**/*.ts", "src/features/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        // React glue around tested engines; exercised through the screens.
        "src/sync/usePlayerSync.ts",
        "src/features/**/use*.ts",
        "src/lib/motion.ts",
      ],
      reporter: ["text-summary"],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
