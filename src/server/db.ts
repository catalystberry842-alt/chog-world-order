import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { chogPrisma?: { url: string; client: PrismaClient } };

/** One PrismaClient per process (and per dev-server reload). */
export function getPrisma(databaseUrl: string): PrismaClient {
  const cached = globalForPrisma.chogPrisma;
  if (cached && cached.url === databaseUrl) return cached.client;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  globalForPrisma.chogPrisma = { url: databaseUrl, client };
  return client;
}
