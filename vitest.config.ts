import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["backend/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",        // Isolate each test file in a separate process
    poolOptions: {
      forks: { singleFork: false },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["backend/**/*.ts"],
      exclude: [
        "backend/**/*.test.ts",
        "backend/_core/**",
        "backend/integrations/stripe.test.ts",
      ],
    },
  },
});
