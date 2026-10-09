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
import type { ReputationWrite } from "@/server/passport/store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PrismaPassportStore (PostgreSQL)", () => {
  let db: PrismaClient;
  let store: PrismaPassportStore;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    store = new PrismaPassportStore(db);
    await db.$executeRawUnsafe(
      'TRUNCATE "ReputationSnapshot", "ReputationEvent", "PassportStamp", "Evidence", "WalletSession", "User" CASCADE',
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
    category: "content",
    statusReason: null,
    verificationData: null,
  });

  it("enforces unique evidence at the database level", async () => {
    const alice = await store.upsertUser("0x00000000000000000000000000000000000000a1");
    const bob = await store.upsertUser("0x00000000000000000000000000000000000000b2");
    await store.createEvidence(newEvidence(alice.id, "community-contribution:https://example.org/x"));
    await expect(store.createEvidence(newEvidence(bob.id, "community-contribution:https://example.org/x"))).rejects.toBeInstanceOf(
      DuplicateEvidenceError,
    );
  });

  it("writes stamps idempotently", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000c3");
    const evidence = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/y"));
    const write = { userId: user.id, evidenceId: evidence.id, issuedById: null, stamps: ["community-contributor" as const] };
    expect(await store.writeIssuance(write)).toHaveLength(1);
    expect(await store.writeIssuance(write)).toHaveLength(0);
    expect(await store.listStamps(user.id)).toHaveLength(1);
  });

  it("refuses a second stamp of the same category from different evidence", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000d4");
    const first = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/z1"));
    const second = await store.createEvidence(newEvidence(user.id, "community-contribution:https://example.org/z2"));
    const stamp = ["community-contributor" as const];
    await store.writeIssuance({ userId: user.id, evidenceId: first.id, issuedById: null, stamps: stamp });
    const again = await store.writeIssuance({ userId: user.id, evidenceId: second.id, issuedById: null, stamps: stamp });
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

  const write = (overrides: Partial<ReputationWrite>): ReputationWrite => ({
    kind: "contribution",
    points: 5,
    category: "content",
    reason: "test",
    planKey: null,
    dedupeKey: `key-${Math.random()}`,
    calculationVersion: "test",
    evidenceId: null,
    periodKey: null,
    reversesEventId: null,
    actorId: null,
    ...overrides,
  });

  it("enforces unique reputation event keys and single reversal in the database", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000a7");
    const [event] = await store.updateLedger(user.id, () => ({ writes: [write({ dedupeKey: "dup-key" })], snapshot: null }));
    await expect(store.updateLedger(user.id, () => ({ writes: [write({ dedupeKey: "dup-key" })], snapshot: null }))).rejects.toThrow();
    await store.updateLedger(user.id, () => ({
      writes: [write({ kind: "reversal", points: -5, dedupeKey: "rev-1", reversesEventId: event.id })],
      snapshot: null,
    }));
    await expect(
      store.updateLedger(user.id, () => ({
        writes: [write({ kind: "reversal", points: -5, dedupeKey: "rev-2", reversesEventId: event.id })],
        snapshot: null,
      })),
    ).rejects.toThrow();
    // The failed transactions wrote nothing.
    expect((await store.listReputation(user.id)).map((item) => item.dedupeKey)).toEqual(["dup-key", "rev-1"]);
  });

  it("serialises concurrent ledger updates for one user", async () => {
    const user = await store.upsertUser("0x00000000000000000000000000000000000000a8");
    // Each update writes "next" only if it has not been written: without the lock both would see an empty ledger.
    const decide = ({ ledger }: { ledger: { dedupeKey: string }[] }) => ({
      writes: ledger.some((item) => item.dedupeKey === "once") ? [] : [write({ dedupeKey: "once" })],
      snapshot: null,
    });
    const results = await Promise.allSettled([store.updateLedger(user.id, decide), store.updateLedger(user.id, decide)]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await store.listReputation(user.id)).toHaveLength(1);
  });

  it("ranks the leaderboard from the ledger with category filters and pagination", async () => {
    await db.$executeRawUnsafe('TRUNCATE "ReputationSnapshot", "ReputationEvent", "PassportStamp", "Evidence", "WalletSession", "User" CASCADE');
    const users = await Promise.all(
      ["b1", "b2", "b3"].map((suffix) => store.upsertUser(`0x00000000000000000000000000000000000000${suffix}`)),
    );
    await store.updateLedger(users[0].id, () => ({ writes: [write({ points: 10, category: "code" })], snapshot: null }));
    await store.updateLedger(users[1].id, () => ({ writes: [write({ points: 20, category: "research" })], snapshot: null }));
    await store.updateLedger(users[2].id, () => ({
      writes: [write({ points: 5, category: "code" }), write({ kind: "adjustment", points: -5, category: "adjustment" })],
      snapshot: null,
    }));
    const overall = await store.leaderboard({ category: null, skip: 0, take: 10 });
    expect(overall.rows.map((row) => row.userId)).toEqual([users[1].id, users[0].id]);
    expect(overall.total).toBe(2);
    const code = await store.leaderboard({ category: "code", skip: 0, take: 10 });
    expect(code.rows.map((row) => [row.userId, row.points, row.total])).toEqual([
      [users[0].id, 10, 10],
      [users[2].id, 5, 0],
    ]);
    const second = await store.leaderboard({ category: null, skip: 1, take: 1 });
    expect(second.rows.map((row) => row.userId)).toEqual([users[0].id]);
  });
});
