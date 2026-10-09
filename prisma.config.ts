import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env files. Load one if present (Node 22+), but never
// require it: `prisma validate` and `prisma generate` work without a database.
try {
  process.loadEnvFile();
} catch {
  // No .env file. Use the process environment as-is.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
