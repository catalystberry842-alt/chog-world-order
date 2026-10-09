/**
 * Runs against a real PostgreSQL database when TEST_DATABASE_URL is set
 * (migrations applied). Skipped otherwise. Verifies that the database itself,
 * not just application code, blocks duplicates.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DuplicateEvidenceError, NonceReusedError } from "@/server/errors";
import { PrismaPassportStore } from "@/server/passport/prisma-store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PrismaPassportStore (PostgreSQL)", () => {
  let db: PrismaClient;
  let store: PrismaPassportStore;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    store = new PrismaPassportStore(db);
    await db.$executeRawUnsafe(
      'TRUNCATE "ReputationEvent", "PassportStamp", "Evidence", "WalletSession", "User" CASCADE',
    );
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const newEvidence = (userId: string, dedupeKey: string) => ({
    userId,
    kind: "community-contribution" as const,
    method: "reviewer-approval" as const,
    status: "pending" as const,
    title: "Notes",
    summary: "Builder call notes",
    reference: `https://example.org/${dedupeKey}`,
    dedupeKey,
    chainId: null,
    txHash: null,
    appId: null,
    occurredAt: new Date("2026-09-01T00:00:00Z"),
    statusReason: null,
  });

  it("enforces unique evidence at the database level", async () => {
    const alice = await store.upsertUser("0x00000000000000000000000000000000000000a1");
    const bob = await store.upsertUser("0x00000000000000000000000000000000000000b2");
    await store.createEvidence(newEvidence(alice.id, "community-contribution:https://example.org/x"));
    await expect(store.createEvidence(newEvidence(bob.id, "community-contribution:https://example.org/x"))).rejects.toBeInstanceOf(
      DuplicateEvidenceError,
    );
  });

  it("writes issuance idempotently", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000c3");
    const evidence = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/y"));
    await store.updateEvidenceIfStatus(evidence.id, "pending", { status: "verified", verifiedAt: new Date() });
    const write = {
      userId: user.id,
      evidenceId: evidence.id,
      issuedById: null,
      stamps: [{ category: "community-contributor" as const, points: 15 }],
      contribution: { source: "community", points: 25 },
    };
    expect(await store.writeIssuance(write)).toHaveLength(1);
    expect(await store.writeIssuance(write)).toHaveLength(0);
    expect(await store.listStamps(user.id)).toHaveLength(1);
    const events = await store.listReputation(user.id);
    expect(events.map((event) => event.kind).sort()).toEqual(["contribution-verified", "stamp-issued"]);
    expect(await store.rankOf(user.id)).toBe(1);
  });

  it("refuses a second stamp of the same category from different evidence", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000d4");
    const first = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/z1"));
    const second = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/z2"));
    const stamp = [{ category: "community-contributor" as const, points: 15 }];
    await store.writeIssuance({ userId: user.id, evidenceId: first.id, issuedById: null, stamps: stamp, contribution: null });
    const again = await store.writeIssuance({ userId: user.id, evidenceId: second.id, issuedById: null, stamps: stamp, contribution: null });
    expect(again).toHaveLength(0);
    expect(await store.listStamps(user.id)).toHaveLength(1);
  });

  it("only lets an evidence status change once (conditional update)", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000e5");
    const evidence = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/w"));
    const [a, b] = await Promise.all([
      store.updateEvidenceIfStatus(evidence.id, "pending", { status: "verified" }),
      store.updateEvidenceIfStatus(evidence.id, "pending", { status: "rejected" }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("refuses to reuse a sign-in nonce", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000f6");
    const session = { userId: user.id, nonce: "abcdefgh12345678", chainId: 143, expiresAt: new Date(Date.now() + 60_000) };
    await store.createSession({ ...session, tokenHash: "hash-1" });
    await expect(store.createSession({ ...session, tokenHash: "hash-2" })).rejects.toBeInstanceOf(NonceReusedError);
  });
});
