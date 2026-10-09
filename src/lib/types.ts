/**
 * Shared application data types.
 *
 * Passport types live in `src/lib/passport/types.ts`. Collab Board types are
 * still backed only by mock data in `src/lib/mock`.
 */

export type Address = `0x${string}`;

/** ISO 8601 date string, e.g. "2026-09-14". */
export type IsoDate = string;

/** Where a record came from. "mock" records are samples and must be labelled in the UI. */
export type DataSource = "mock" | "database";

// ---------------------------------------------------------------------------
// Collab Board
// ---------------------------------------------------------------------------

export type CampaignCategory =
  | "art"
  | "content"
  | "development"
  | "community"
  | "research"
  | "video";

export type CampaignStatus = "open" | "in-review" | "completed";

export type PaymentToken = "USDC" | "MON";

export type CampaignBudget = {
  /** Total campaign budget in whole token units. */
  total: number;
  token: PaymentToken;
  /** "fixed": paid per accepted creator; "pool": split across accepted work. */
  model: "fixed" | "pool";
  /** For fixed campaigns, the amount each accepted creator receives. */
  perCreator?: number;
};

export type CampaignProject = {
  name: string;
  handle: string;
  /** Hue (0-360) for the generated project mark. */
  hue: number;
};

export type Campaign = {
  id: string;
  title: string;
  project: CampaignProject;
  category: CampaignCategory;
  status: CampaignStatus;
  summary: string;
  description: string[];
  deliverables: string[];
  requirements: string[];
  tags: string[];
  budget: CampaignBudget;
  slots: { total: number; filled: number };
  applicants: number;
  minReputation: number;
  postedOn: IsoDate;
  deadline: IsoDate;
  source: DataSource;
};

export type BudgetRange = "any" | "under-1k" | "1k-5k" | "over-5k";

export type CampaignSort = "newest" | "budget" | "deadline";

export type CampaignFilters = {
  query: string;
  category: CampaignCategory | "all";
  status: CampaignStatus | "all";
  budget: BudgetRange;
  sort: CampaignSort;
};
