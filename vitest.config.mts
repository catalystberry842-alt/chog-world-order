import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js handles `server-only` itself; in tests it is a no-op.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The PostgreSQL integration suites share one disposable database and truncate it, so they must not overlap.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
