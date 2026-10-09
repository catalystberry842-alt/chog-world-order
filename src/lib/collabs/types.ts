import type { PaymentTokenKey } from "@/lib/collabs/tokens";
import type { Address, CampaignCategory, DataSource } from "@/lib/types";

export type CampaignLifecycle = "draft" | "published" | "closed" | "completed" | "cancelled";
export type RegistrationStatus = "not-registered" | "pending" | "confirmed" | "failed";
export type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type DeliverableStatus = "submitted" | "accepted" | "rejected";

/** Campaign as shown in the UI. Built from the database or from sample data. */
export type CampaignView = {
  id: string;
  title: string;
  projectName: string;
  summary: string;
  description: string;
  category: CampaignCategory;
  status: CampaignLifecycle;
  objectives: string[];
  deliverables: string[];
  eligibility: string[];
  acceptanceCriteria: string[];
  requiredSkills: string[];
  paymentToken: PaymentTokenKey;
  /** Base units, as a decimal string. */
  amountPerCreator: string;
  slots: { total: number; filled: number };
  applicants: number;
  deadline: string;
  publishedAt: string | null;
  /** The wallet that signed in and created the campaign (null for samples). */
  ownerAddress: Address | null;
  registration: { status: RegistrationStatus; txHash: string | null; chainCampaignId: string | null; error: string | null };
  source: DataSource;
};

export type ApplicationView = {
  id: string;
  campaignId: string;
  applicantAddress: Address;
  proposal: string;
  evidence: { id: string; title: string; kind: string }[];
  status: ApplicationStatus;
  decisionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type DeliverableView = {
  id: string;
  applicationId: string;
  campaignId: string;
  creatorAddress: Address;
  contentUrl: string;
  contentHash: string;
  notes: string | null;
  revision: number;
  status: DeliverableStatus;
  createdAt: string;
  reviews: { decision: DeliverableStatus; reason: string; reviewerAddress: Address; createdAt: string }[];
};

export type CampaignSort = "newest" | "budget" | "deadline";

export type CampaignListQuery = {
  q: string;
  category: CampaignCategory | null;
  sort: CampaignSort;
  page: number;
};

export type CampaignListPage = {
  campaigns: CampaignView[];
  page: number;
  pageSize: number;
  total: number;
  source: DataSource;
};
