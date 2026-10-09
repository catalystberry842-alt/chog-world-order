import "server-only";
import {
  Prisma,
  type PrismaClient,
  type Campaign as CampaignRow,
  type CampaignApplication as ApplicationRow,
  type Deliverable as DeliverableRow,
  type DeliverableReview as ReviewRow,
} from "@/generated/prisma/client";
import type { CampaignLifecycle, CampaignSort, RegistrationStatus } from "@/lib/collabs/types";
import type { CampaignCategory } from "@/lib/types";
import {
  DuplicateApplicationError,
  DuplicateDeliverableError,
  type ApplicationRecord,
  type CampaignContent,
  type CampaignRecord,
  type CampaignUpdate,
  type CampaignWithCounts,
  type CollabStore,
  type DeliverableRecord,
  type DeliverableReviewRecord,
} from "@/server/collabs/store";

const toDb = (value: string) => value.toUpperCase().replace(/-/g, "_");
const fromDb = <T extends string>(value: string) => value.toLowerCase().replace(/_/g, "-") as T;

const isUniqueViolation = (error: unknown, field: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  JSON.stringify(error.meta ?? {}).includes(field);

const mapCampaign = (row: CampaignRow): CampaignRecord => ({
  id: row.id,
  ownerId: row.ownerId,
  projectName: row.projectName,
  title: row.title,
  summary: row.summary,
  description: row.description,
  category: fromDb<CampaignCategory>(row.category),
  objectives: row.objectives,
  deliverables: row.deliverables,
  eligibility: row.eligibility,
  acceptanceCriteria: row.acceptanceCriteria,
  requiredSkills: row.requiredSkills,
  paymentToken: row.paymentToken,
  amountPerCreator: BigInt(row.amountPerCreator.toFixed(0)),
  slots: row.slots,
  deadline: row.deadline,
  status: fromDb<CampaignLifecycle>(row.status),
  publishedAt: row.publishedAt,
  chainCampaignId: row.chainCampaignId,
  registrationStatus: fromDb<RegistrationStatus>(row.registrationStatus),
  registrationTxHash: row.registrationTxHash,
  registrationError: row.registrationError,
  registeredAt: row.registeredAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapApplication = (row: ApplicationRow): ApplicationRecord => ({
  id: row.id,
  campaignId: row.campaignId,
  applicantId: row.applicantId,
  proposal: row.proposal,
  evidenceIds: row.evidenceIds,
  status: fromDb(row.status),
  decisionReason: row.decisionReason,
  reviewedById: row.reviewedById,
  reviewedAt: row.reviewedAt,
  createdAt: row.createdAt,
});

const mapDeliverable = (row: DeliverableRow): DeliverableRecord => ({
  id: row.id,
  campaignId: row.campaignId,
  applicationId: row.applicationId,
  creatorId: row.creatorId,
  contentUrl: row.contentUrl,
  contentHash: row.contentHash,
  notes: row.notes,
  revision: row.revision,
  status: fromDb(row.status),
  createdAt: row.createdAt,
});

const mapReview = (row: ReviewRow): DeliverableReviewRecord => ({
  id: row.id,
  deliverableId: row.deliverableId,
  reviewerId: row.reviewerId,
  decision: fromDb(row.decision),
  reason: row.reason,
  createdAt: row.createdAt,
});

function contentData(content: Partial<CampaignContent>) {
  const { category, amountPerCreator, ...rest } = content;
  return {
    ...rest,
    ...(category ? { category: toDb(category) as CampaignRow["category"] } : {}),
    ...(amountPerCreator !== undefined ? { amountPerCreator: new Prisma.Decimal(amountPerCreator.toString()) } : {}),
  };
}

export class PrismaCollabStore implements CollabStore {
  constructor(private readonly db: PrismaClient) {}

  private async counts(ids: string[]) {
    const rows = await this.db.campaignApplication.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });
    return (id: string) => ({
      applicants: rows.filter((row) => row.campaignId === id).reduce((sum, row) => sum + row._count._all, 0),
      accepted: rows.find((row) => row.campaignId === id && row.status === "ACCEPTED")?._count._all ?? 0,
    });
  }

  private async withCounts(rows: CampaignRow[]): Promise<CampaignWithCounts[]> {
    const countFor = await this.counts(rows.map((row) => row.id));
    return rows.map((row) => ({ ...mapCampaign(row), ...countFor(row.id) }));
  }

  async createCampaign(ownerId: string, content: CampaignContent) {
    const row = await this.db.campaign.create({
      data: { ...contentData(content), ownerId } as Prisma.CampaignUncheckedCreateInput,
    });
    return mapCampaign(row);
  }

  async findCampaign(id: string) {
    const row = await this.db.campaign.findUnique({ where: { id } });
    return row ? (await this.withCounts([row]))[0] : null;
  }

  async updateCampaignIfStatus(id: string, expected: CampaignLifecycle, update: CampaignUpdate) {
    const { status, registrationStatus, ...rest } = update;
    const result = await this.db.campaign.updateMany({
      where: { id, status: toDb(expected) as CampaignRow["status"] },
      data: {
        ...contentData(rest),
        ...(status ? { status: toDb(status) as CampaignRow["status"] } : {}),
        ...(registrationStatus ? { registrationStatus: toDb(registrationStatus) as CampaignRow["registrationStatus"] } : {}),
      },
    });
    if (result.count === 0) return null;
    const row = await this.db.campaign.findUnique({ where: { id } });
    return row ? mapCampaign(row) : null;
  }

  async listCampaigns(query: {
    q: string;
    category: CampaignCategory | null;
    sort: CampaignSort;
    statuses: CampaignLifecycle[];
    skip: number;
    take: number;
  }) {
    const needle = query.q.trim();
    const where: Prisma.CampaignWhereInput = {
      status: { in: query.statuses.map((status) => toDb(status) as CampaignRow["status"]) },
      ...(query.category ? { category: toDb(query.category) as CampaignRow["category"] } : {}),
      ...(needle
        ? {
            OR: [
              { title: { contains: needle, mode: "insensitive" } },
              { summary: { contains: needle, mode: "insensitive" } },
              { projectName: { contains: needle, mode: "insensitive" } },
              { requiredSkills: { has: needle.toLowerCase() } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.CampaignOrderByWithRelationInput[] =
      query.sort === "budget"
        ? [{ amountPerCreator: "desc" }, { createdAt: "desc" }]
        : query.sort === "deadline"
          ? [{ deadline: "asc" }, { id: "asc" }]
          : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    const [rows, total] = await Promise.all([
      this.db.campaign.findMany({ where, orderBy, skip: query.skip, take: query.take }),
      this.db.campaign.count({ where }),
    ]);
    return { rows: await this.withCounts(rows), total };
  }

  async listCampaignsByOwner(ownerId: string) {
    const rows = await this.db.campaign.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
    return this.withCounts(rows);
  }

  async createApplication(input: Pick<ApplicationRecord, "campaignId" | "applicantId" | "proposal" | "evidenceIds">) {
    try {
      return mapApplication(await this.db.campaignApplication.create({ data: input }));
    } catch (error) {
      if (isUniqueViolation(error, "campaignId")) throw new DuplicateApplicationError();
      throw error;
    }
  }

  async findApplication(id: string) {
    const row = await this.db.campaignApplication.findUnique({ where: { id } });
    return row ? mapApplication(row) : null;
  }

  async listApplications(filter: { campaignId?: string; applicantId?: string }) {
    const rows = await this.db.campaignApplication.findMany({
      where: { ...(filter.campaignId ? { campaignId: filter.campaignId } : {}), ...(filter.applicantId ? { applicantId: filter.applicantId } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapApplication);
  }

  async decideApplication(
    id: string,
    input: { status: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date; slots: number },
  ) {
    return this.db.$transaction(async (tx) => {
      const app = await tx.campaignApplication.findUnique({ where: { id } });
      if (!app || app.status !== "PENDING") return "not_pending" as const;
      // Lock the campaign row so concurrent acceptances are counted one at a time.
      await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${app.campaignId} FOR UPDATE`;
      if (input.status === "accepted") {
        const accepted = await tx.campaignApplication.count({ where: { campaignId: app.campaignId, status: "ACCEPTED" } });
        if (accepted >= input.slots) return "full" as const;
      }
      const result = await tx.campaignApplication.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: input.status === "accepted" ? "ACCEPTED" : "REJECTED",
          decisionReason: input.reason,
          reviewedById: input.reviewerId,
          reviewedAt: input.at,
        },
      });
      if (result.count === 0) return "not_pending" as const;
      return mapApplication((await tx.campaignApplication.findUnique({ where: { id } }))!);
    });
  }

  async submitDeliverable(
    input: Pick<DeliverableRecord, "campaignId" | "applicationId" | "creatorId" | "contentUrl" | "contentHash" | "notes">,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        // Serialise submissions per application.
        await tx.$queryRaw`SELECT id FROM "CampaignApplication" WHERE id = ${input.applicationId} FOR UPDATE`;
        const existing = await tx.deliverable.findMany({ where: { applicationId: input.applicationId } });
        if (existing.some((item) => item.status === "ACCEPTED")) return "already_accepted" as const;
        if (existing.some((item) => item.status === "SUBMITTED")) return "open_submission" as const;
        const row = await tx.deliverable.create({ data: { ...input, revision: existing.length + 1 } });
        return mapDeliverable(row);
      });
    } catch (error) {
      if (isUniqueViolation(error, "contentHash")) throw new DuplicateDeliverableError();
      throw error;
    }
  }

  async findDeliverable(id: string) {
    const row = await this.db.deliverable.findUnique({ where: { id } });
    return row ? mapDeliverable(row) : null;
  }

  async listDeliverables(filter: { campaignId?: string; applicationId?: string }) {
    const rows = await this.db.deliverable.findMany({
      where: { ...(filter.campaignId ? { campaignId: filter.campaignId } : {}), ...(filter.applicationId ? { applicationId: filter.applicationId } : {}) },
      orderBy: [{ createdAt: "asc" }],
    });
    return rows.map(mapDeliverable);
  }

  async reviewDeliverable(
    id: string,
    input: { decision: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date },
  ) {
    return this.db.$transaction(async (tx) => {
      const status = input.decision === "accepted" ? "ACCEPTED" : "REJECTED";
      const result = await tx.deliverable.updateMany({ where: { id, status: "SUBMITTED" }, data: { status } });
      if (result.count === 0) return null;
      await tx.deliverableReview.create({
        data: { deliverableId: id, reviewerId: input.reviewerId, decision: status, reason: input.reason, createdAt: input.at },
      });
      return mapDeliverable((await tx.deliverable.findUnique({ where: { id } }))!);
    });
  }

  async listDeliverableReviews(deliverableIds: string[]) {
    const rows = await this.db.deliverableReview.findMany({
      where: { deliverableId: { in: deliverableIds } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapReview);
  }
}
