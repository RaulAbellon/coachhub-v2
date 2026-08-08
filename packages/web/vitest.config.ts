import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/api/__tests__/**/*.test.ts", "src/web/**/__tests__/**/*.test.ts"],
    env: {
      // Dummy value so importing src/api/database/index.ts doesn't throw at module
      // load time (createClient validates the URL format eagerly). Tests in this
      // suite are pure unit tests and never actually hit the DB.
      DATABASE_URL: "http://localhost:8080",
    },
  },
});
