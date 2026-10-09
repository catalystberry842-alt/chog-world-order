import { randomUUID } from "node:crypto";
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
import type { CampaignLifecycle, CampaignSort } from "@/lib/collabs/types";
import type { CampaignCategory } from "@/lib/types";

/** In-memory Collab Board store with the same rules as the database. Tests only. */
export class MemoryCollabStore implements CollabStore {
  campaigns: CampaignRecord[] = [];
  applications: ApplicationRecord[] = [];
  deliverables: DeliverableRecord[] = [];
  reviews: DeliverableReviewRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  private withCounts(campaign: CampaignRecord): CampaignWithCounts {
    const apps = this.applications.filter((app) => app.campaignId === campaign.id);
    return { ...campaign, applicants: apps.length, accepted: apps.filter((app) => app.status === "accepted").length };
  }

  async createCampaign(ownerId: string, content: CampaignContent) {
    const now = this.now();
    const record: CampaignRecord = {
      ...content,
      id: randomUUID(),
      ownerId,
      status: "draft",
      publishedAt: null,
      chainCampaignId: null,
      registrationStatus: "not-registered",
      registrationTxHash: null,
      registrationError: null,
      registeredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.push(record);
    return { ...record };
  }

  async findCampaign(id: string) {
    const campaign = this.campaigns.find((item) => item.id === id);
    return campaign ? this.withCounts(campaign) : null;
  }

  async findCampaignByChainId(chainCampaignId: string) {
    const campaign = this.campaigns.find((item) => item.chainCampaignId === chainCampaignId.toLowerCase());
    return campaign ? this.withCounts(campaign) : null;
  }

  async updateCampaignIfStatus(id: string, expected: CampaignLifecycle, update: CampaignUpdate) {
    const campaign = this.campaigns.find((item) => item.id === id);
    if (!campaign || campaign.status !== expected) return null;
    if (
      update.chainCampaignId &&
      this.campaigns.some((item) => item.id !== id && item.chainCampaignId === update.chainCampaignId)
    ) {
      throw new Error("unique violation: chainCampaignId");
    }
    Object.assign(campaign, update, { updatedAt: this.now() });
    return { ...campaign };
  }

  async listCampaigns(query: {
    q: string;
    category: CampaignCategory | null;
    sort: CampaignSort;
    statuses: CampaignLifecycle[];
    skip: number;
    take: number;
  }) {
    const needle = query.q.trim().toLowerCase();
    const rows = this.campaigns
      .filter((item) => query.statuses.includes(item.status))
      .filter((item) => !query.category || item.category === query.category)
      .filter(
        (item) =>
          !needle ||
          [item.title, item.summary, item.projectName, ...item.requiredSkills].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        query.sort === "budget"
          ? Number(b.amountPerCreator - a.amountPerCreator) || b.createdAt.getTime() - a.createdAt.getTime()
          : query.sort === "deadline"
            ? a.deadline.getTime() - b.deadline.getTime()
            : (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime(),
      )
      .map((item) => this.withCounts(item));
    return { rows: rows.slice(query.skip, query.skip + query.take), total: rows.length };
  }

  async listCampaignsByOwner(ownerId: string) {
    return this.campaigns.filter((item) => item.ownerId === ownerId).map((item) => this.withCounts(item));
  }

  async createApplication(input: Pick<ApplicationRecord, "campaignId" | "applicantId" | "proposal" | "evidenceIds">) {
    if (this.applications.some((app) => app.campaignId === input.campaignId && app.applicantId === input.applicantId)) {
      throw new DuplicateApplicationError();
    }
    const record: ApplicationRecord = {
      ...input,
      id: randomUUID(),
      status: "pending",
      decisionReason: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: this.now(),
    };
    this.applications.push(record);
    return { ...record };
  }

  async findApplication(id: string) {
    const app = this.applications.find((item) => item.id === id);
    return app ? { ...app } : null;
  }

  async listApplications(filter: { campaignId?: string; applicantId?: string }) {
    return this.applications
      .filter((app) => (!filter.campaignId || app.campaignId === filter.campaignId) && (!filter.applicantId || app.applicantId === filter.applicantId))
      .map((app) => ({ ...app }));
  }

  async decideApplication(
    id: string,
    input: { status: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date; slots: number },
  ) {
    const app = this.applications.find((item) => item.id === id);
    if (!app || app.status !== "pending") return "not_pending" as const;
    if (input.status === "accepted") {
      const accepted = this.applications.filter((item) => item.campaignId === app.campaignId && item.status === "accepted").length;
      if (accepted >= input.slots) return "full" as const;
    }
    Object.assign(app, { status: input.status, decisionReason: input.reason, reviewedById: input.reviewerId, reviewedAt: input.at });
    return { ...app };
  }

  async submitDeliverable(
    input: Pick<DeliverableRecord, "campaignId" | "applicationId" | "creatorId" | "contentUrl" | "contentHash" | "notes">,
  ) {
    const existing = this.deliverables.filter((item) => item.applicationId === input.applicationId);
    if (existing.some((item) => item.status === "accepted")) return "already_accepted" as const;
    if (existing.some((item) => item.status === "submitted")) return "open_submission" as const;
    if (existing.some((item) => item.contentHash === input.contentHash)) throw new DuplicateDeliverableError();
    const record: DeliverableRecord = {
      ...input,
      id: randomUUID(),
      revision: existing.length + 1,
      status: "submitted",
      createdAt: this.now(),
    };
    this.deliverables.push(record);
    return { ...record };
  }

  async findDeliverable(id: string) {
    const item = this.deliverables.find((deliverable) => deliverable.id === id);
    return item ? { ...item } : null;
  }

  async listDeliverables(filter: { campaignId?: string; applicationId?: string }) {
    return this.deliverables
      .filter((item) => (!filter.campaignId || item.campaignId === filter.campaignId) && (!filter.applicationId || item.applicationId === filter.applicationId))
      .map((item) => ({ ...item }));
  }

  async reviewDeliverable(
    id: string,
    input: { decision: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date },
  ) {
    const item = this.deliverables.find((deliverable) => deliverable.id === id);
    if (!item || item.status !== "submitted") return null;
    item.status = input.decision;
    this.reviews.push({
      id: randomUUID(),
      deliverableId: id,
      reviewerId: input.reviewerId,
      decision: input.decision,
      reason: input.reason,
      createdAt: input.at,
    });
    return { ...item };
  }

  async listDeliverableReviews(deliverableIds: string[]) {
    return this.reviews.filter((review) => deliverableIds.includes(review.deliverableId)).map((review) => ({ ...review }));
  }
}
