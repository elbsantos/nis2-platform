import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",        // Isolate each test file in a separate process
    poolOptions: {
      forks: { singleFork: false },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["server/**/*.ts"],
      exclude: [
        "server/**/*.test.ts",
        "server/_core/**",
        "server/integrations/stripe.test.ts",
      ],
    },
  },
});
