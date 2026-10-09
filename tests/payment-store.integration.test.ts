/**
 * Payment store against a real PostgreSQL database (TEST_DATABASE_URL,
 * migrated, disposable). The unique constraints are what keep a payment or
 * an on-chain event from being counted twice.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaCollabStore } from "@/server/collabs/prisma-store";
import { PrismaPassportStore } from "@/server/passport/prisma-store";
import { PrismaPaymentStore } from "@/server/payments/prisma-store";
import { ProofAlreadyUsedError } from "@/server/payments/store";

const url = process.env.TEST_DATABASE_URL;
const hex = (n: number, bytes = 32) => `0x${n.toString(16).padStart(bytes * 2, "0")}`;

describe.skipIf(!url)("PrismaPaymentStore (PostgreSQL)", () => {
  let db: PrismaClient;
  let collabs: PrismaCollabStore;
  let passports: PrismaPassportStore;
  let payments: PrismaPaymentStore;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    collabs = new PrismaCollabStore(db);
    passports = new PrismaPassportStore(db);
    payments = new PrismaPaymentStore(db);
    await db.$executeRawUnsafe(
      'TRUNCATE "ChainEvent", "IndexerCursor", "CampaignPayment", "DeliverableReview", "Deliverable", "CampaignApplication", "Campaign", "ReputationSnapshot", "ReputationEvent", "PassportStamp", "Evidence", "WalletSession", "User" CASCADE',
    );
  });
  afterAll(async () => db?.$disconnect());

  let n = 0;
  const user = () => passports.upsertUser(hex(++n, 20) as `0x${string}`);

  /** An accepted deliverable and its payment intent. */
  const intent = async () => {
    const owner = await user();
    const creator = await user();
    const campaign = await collabs.createCampaign(owner.id, {
      projectName: "Project",
      title: "Campaign title",
      summary: "A summary that is long enough.",
      description: "A description that is long enough for validation purposes here.",
      category: "development",
      objectives: ["o"],
      deliverables: ["d"],
      eligibility: ["e"],
      acceptanceCriteria: ["a"],
      requiredSkills: ["solidity"],
      paymentToken: "MON",
      amountPerCreator: BigInt("250000000000000000000"),
      slots: 5,
      deadline: new Date(Date.now() + 10 * 86_400_000),
    });
    const app = await collabs.createApplication({ campaignId: campaign.id, applicantId: creator.id, proposal: "p", evidenceIds: [] });
    const deliverable = await collabs.submitDeliverable({
      campaignId: campaign.id,
      applicationId: app.id,
      creatorId: creator.id,
      contentUrl: "https://example.com/work",
      contentHash: hex(++n),
      notes: null,
    });
    if (typeof deliverable === "string") throw new Error(deliverable);
    const input = {
      campaignId: campaign.id,
      deliverableId: deliverable.id,
      chainId: 143,
      contractAddress: hex(1, 20),
      chainCampaignId: hex(++n),
      tokenAddress: hex(0, 20),
      tokenKey: "MON",
      amount: BigInt("250000000000000000000"),
      creatorAddress: creator.address,
      payerAddress: owner.address,
      deliverableRef: hex(++n),
    };
    return { input, payment: await payments.createOrGetIntent(input) };
  };

  it("keeps one payment per deliverable, even under concurrent requests", async () => {
    const { input, payment } = await intent();
    const again = await Promise.all([1, 2, 3].map(() => payments.createOrGetIntent(input)));
    expect(new Set(again.map((item) => item.id))).toEqual(new Set([payment.id]));
    expect(again[0].amount).toBe(BigInt("250000000000000000000"));
    expect(await payments.findPaymentByRef(input.chainCampaignId, input.deliverableRef)).toMatchObject({ id: payment.id });
  });

  it("never lets one on-chain event be the proof of two payments", async () => {
    const a = await intent();
    const b = await intent();
    const proof = { txHash: hex(++n), logIndex: 0, blockNumber: BigInt(10), blockHash: hex(++n) };
    await payments.updatePaymentIfStatus(a.payment.id, ["awaiting-transaction"], { ...proof, status: "confirmed", confirmedAt: new Date() });
    await expect(
      payments.updatePaymentIfStatus(b.payment.id, ["awaiting-transaction"], { ...proof, status: "confirmed", confirmedAt: new Date() }),
    ).rejects.toBeInstanceOf(ProofAlreadyUsedError);
  });

  it("only updates from the expected statuses", async () => {
    const { payment } = await intent();
    expect(await payments.updatePaymentIfStatus(payment.id, ["pending-confirmation"], { status: "confirmed" })).toBeNull();
    expect((await payments.updatePaymentIfStatus(payment.id, ["awaiting-transaction"], { status: "failed" }))?.status).toBe("failed");
  });

  it("records each chain event once and keeps the cursor", async () => {
    const event = {
      chainId: 143,
      contractAddress: hex(1, 20),
      eventName: "CreatorPaid",
      txHash: hex(++n),
      logIndex: 3,
      blockNumber: BigInt(12),
      blockHash: hex(++n),
      args: { amount: "1" },
    };
    const results = await Promise.all([1, 2, 3].map(() => payments.recordChainEvent(event)));
    expect(results.filter((item) => item.created)).toHaveLength(1);
    expect(new Set(results.map((item) => item.id)).size).toBe(1);
    await payments.setChainEventOutcome(results[0].id, "confirmed-payment");
    expect((await payments.recordChainEvent(event)).outcome).toBe("confirmed-payment");

    expect(await payments.getCursor("test-cursor")).toBeNull();
    await payments.setCursor("test-cursor", BigInt(99));
    await payments.setCursor("test-cursor", BigInt(120));
    expect(await payments.getCursor("test-cursor")).toBe(BigInt(120));
  });
});
