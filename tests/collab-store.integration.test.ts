/**
 * Collab Board store against a real PostgreSQL database (TEST_DATABASE_URL,
 * migrated, disposable). Verifies the database and transactions enforce the
 * rules even under concurrency.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaCollabStore } from "@/server/collabs/prisma-store";
import { DuplicateApplicationError, DuplicateDeliverableError } from "@/server/collabs/store";
import { PrismaPassportStore } from "@/server/passport/prisma-store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PrismaCollabStore (PostgreSQL)", () => {
  let db: PrismaClient;
  let collabs: PrismaCollabStore;
  let passports: PrismaPassportStore;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    collabs = new PrismaCollabStore(db);
    passports = new PrismaPassportStore(db);
    await db.$executeRawUnsafe(
      'TRUNCATE "DeliverableReview", "Deliverable", "CampaignApplication", "Campaign", "ReputationSnapshot", "ReputationEvent", "PassportStamp", "Evidence", "WalletSession", "User" CASCADE',
    );
  });
  afterAll(async () => db?.$disconnect());

  let n = 0;
  const user = () => passports.upsertUser(`0x${(++n).toString(16).padStart(40, "0")}` as `0x${string}`);
  const campaign = async (slots = 1) => {
    const owner = await user();
    const created = await collabs.createCampaign(owner.id, {
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
      slots,
      deadline: new Date(Date.now() + 10 * 86_400_000),
    });
    await collabs.updateCampaignIfStatus(created.id, "draft", { status: "published", publishedAt: new Date() });
    return { owner, campaign: created };
  };

  it("stores large base-unit budgets exactly", async () => {
    const { campaign: created } = await campaign();
    expect((await collabs.findCampaign(created.id))?.amountPerCreator).toBe(BigInt("250000000000000000000"));
  });

  it("blocks duplicate applications in the database", async () => {
    const { campaign: created } = await campaign();
    const applicant = await user();
    const input = { campaignId: created.id, applicantId: applicant.id, proposal: "p", evidenceIds: [] };
    await collabs.createApplication(input);
    await expect(collabs.createApplication(input)).rejects.toBeInstanceOf(DuplicateApplicationError);
  });

  it("never overfills slots under concurrent acceptance", async () => {
    const { owner, campaign: created } = await campaign(1);
    const apps = await Promise.all(
      [1, 2, 3].map(async () => collabs.createApplication({ campaignId: created.id, applicantId: (await user()).id, proposal: "p", evidenceIds: [] })),
    );
    const results = await Promise.all(
      apps.map((app) => collabs.decideApplication(app.id, { status: "accepted", reason: "ok", reviewerId: owner.id, at: new Date(), slots: 1 })),
    );
    expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
    expect(results.filter((result) => result === "full")).toHaveLength(2);
    expect(await db.campaignApplication.count({ where: { campaignId: created.id, status: "ACCEPTED" } })).toBe(1);
  });

  it("allows one open submission per application, even concurrently, and blocks duplicate content", async () => {
    const { owner, campaign: created } = await campaign();
    const creator = await user();
    const app = await collabs.createApplication({ campaignId: created.id, applicantId: creator.id, proposal: "p", evidenceIds: [] });
    await collabs.decideApplication(app.id, { status: "accepted", reason: "ok", reviewerId: owner.id, at: new Date(), slots: 1 });
    const submit = (hash: string) =>
      collabs.submitDeliverable({ campaignId: created.id, applicationId: app.id, creatorId: creator.id, contentUrl: "https://example.org/x", contentHash: hash, notes: null });
    const results = await Promise.all([submit(`0x${"a".repeat(64)}`), submit(`0x${"b".repeat(64)}`)]);
    expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
    expect(results.filter((result) => result === "open_submission")).toHaveLength(1);

    const open = results.find((result) => typeof result === "object")!;
    if (typeof open !== "object") throw new Error("unreachable");
    await collabs.reviewDeliverable(open.id, { decision: "rejected", reason: "no", reviewerId: owner.id, at: new Date() });
    await expect(submit(open.contentHash)).rejects.toBeInstanceOf(DuplicateDeliverableError);
    expect((await collabs.listDeliverableReviews([open.id])).map((review) => review.decision)).toEqual(["rejected"]);
  });
});
