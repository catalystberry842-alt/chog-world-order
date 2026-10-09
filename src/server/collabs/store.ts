import type {
  ApplicationStatus,
  CampaignLifecycle,
  CampaignSort,
  DeliverableStatus,
  RegistrationStatus,
} from "@/lib/collabs/types";
import type { CampaignCategory } from "@/lib/types";

export type CampaignRecord = {
  id: string;
  ownerId: string;
  projectName: string;
  title: string;
  summary: string;
  description: string;
  category: CampaignCategory;
  objectives: string[];
  deliverables: string[];
  eligibility: string[];
  acceptanceCriteria: string[];
  requiredSkills: string[];
  paymentToken: string;
  /** Base units. */
  amountPerCreator: bigint;
  slots: number;
  deadline: Date;
  status: CampaignLifecycle;
  publishedAt: Date | null;
  chainCampaignId: string | null;
  registrationStatus: RegistrationStatus;
  registrationTxHash: string | null;
  registrationError: string | null;
  registeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignContent = Pick<
  CampaignRecord,
  | "projectName"
  | "title"
  | "summary"
  | "description"
  | "category"
  | "objectives"
  | "deliverables"
  | "eligibility"
  | "acceptanceCriteria"
  | "requiredSkills"
  | "paymentToken"
  | "amountPerCreator"
  | "slots"
  | "deadline"
>;

export type CampaignUpdate = Partial<
  CampaignContent &
    Pick<
      CampaignRecord,
      | "status"
      | "publishedAt"
      | "chainCampaignId"
      | "registrationStatus"
      | "registrationTxHash"
      | "registrationError"
      | "registeredAt"
    >
>;

export type CampaignWithCounts = CampaignRecord & { applicants: number; accepted: number };

export type ApplicationRecord = {
  id: string;
  campaignId: string;
  applicantId: string;
  proposal: string;
  evidenceIds: string[];
  status: ApplicationStatus;
  decisionReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

export type DeliverableRecord = {
  id: string;
  campaignId: string;
  applicationId: string;
  creatorId: string;
  contentUrl: string;
  contentHash: string;
  notes: string | null;
  revision: number;
  status: DeliverableStatus;
  createdAt: Date;
};

export type DeliverableReviewRecord = {
  id: string;
  deliverableId: string;
  reviewerId: string;
  decision: DeliverableStatus;
  reason: string;
  createdAt: Date;
};

export class DuplicateApplicationError extends Error {
  constructor() {
    super("You have already applied to this campaign.");
  }
}

export class DuplicateDeliverableError extends Error {
  constructor() {
    super("This content has already been submitted for this application.");
  }
}

export interface CollabStore {
  createCampaign(ownerId: string, content: CampaignContent): Promise<CampaignRecord>;
  findCampaign(id: string): Promise<CampaignWithCounts | null>;
  /** Updates only if the campaign is still in `expected` status. Null when it changed first. */
  updateCampaignIfStatus(id: string, expected: CampaignLifecycle, update: CampaignUpdate): Promise<CampaignRecord | null>;
  listCampaigns(query: {
    q: string;
    category: CampaignCategory | null;
    sort: CampaignSort;
    statuses: CampaignLifecycle[];
    skip: number;
    take: number;
  }): Promise<{ rows: CampaignWithCounts[]; total: number }>;
  listCampaignsByOwner(ownerId: string): Promise<CampaignWithCounts[]>;

  /** Throws DuplicateApplicationError for a second application to the same campaign. */
  createApplication(input: Pick<ApplicationRecord, "campaignId" | "applicantId" | "proposal" | "evidenceIds">): Promise<ApplicationRecord>;
  findApplication(id: string): Promise<ApplicationRecord | null>;
  listApplications(filter: { campaignId?: string; applicantId?: string }): Promise<ApplicationRecord[]>;
  /**
   * Accepts or rejects a pending application. Acceptance checks the campaign's
   * free slots in the same transaction, so slots can never be overfilled.
   */
  decideApplication(
    id: string,
    input: { status: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date; slots: number },
  ): Promise<ApplicationRecord | "not_pending" | "full">;

  /**
   * Adds a deliverable as the next revision, in one transaction. Refuses when
   * the application already has a submission awaiting review or an accepted
   * one. Throws DuplicateDeliverableError for content already submitted.
   */
  submitDeliverable(
    input: Pick<DeliverableRecord, "campaignId" | "applicationId" | "creatorId" | "contentUrl" | "contentHash" | "notes">,
  ): Promise<DeliverableRecord | "open_submission" | "already_accepted">;
  findDeliverable(id: string): Promise<DeliverableRecord | null>;
  listDeliverables(filter: { campaignId?: string; applicationId?: string }): Promise<DeliverableRecord[]>;
  /** Records a decision on a submitted deliverable and appends it to the review history, atomically. */
  reviewDeliverable(
    id: string,
    input: { decision: "accepted" | "rejected"; reason: string; reviewerId: string; at: Date },
  ): Promise<DeliverableRecord | null>;
  listDeliverableReviews(deliverableIds: string[]): Promise<DeliverableReviewRecord[]>;
}
