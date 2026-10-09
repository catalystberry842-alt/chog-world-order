/**
 * Shared application data types.
 *
 * These describe the shape of data the app will eventually read from
 * PostgreSQL (via Prisma) and from Monad. In Phase 1 every value comes from
 * the mock modules in `src/lib/mock`.
 */

export type Address = `0x${string}`;

/** ISO 8601 date string, e.g. "2026-09-14". */
export type IsoDate = string;

/** Where a record came from. Phase 1 only ever produces "mock". */
export type DataSource = "mock" | "database" | "onchain";

// ---------------------------------------------------------------------------
// Contributions & reputation
// ---------------------------------------------------------------------------

export type ContributionCategory =
  | "development"
  | "design"
  | "content"
  | "community"
  | "research";

/**
 * How much we trust a contribution record.
 * - self-reported: the contributor claimed it, nobody checked.
 * - pending-review: submitted for review, not yet checked.
 * - peer-reviewed: a reviewer confirmed the evidence off-chain.
 * - onchain-verified: reserved for proofs checked against Monad. No mock
 *   record uses this status; the app must never fake it.
 */
export type VerificationStatus =
  | "self-reported"
  | "pending-review"
  | "peer-reviewed"
  | "onchain-verified";

export type EvidenceKind = "pull-request" | "post" | "design-file" | "document" | "event" | "video";

export type Contribution = {
  id: string;
  contributor: Address;
  title: string;
  summary: string;
  category: ContributionCategory;
  status: VerificationStatus;
  /** Base points before the status multiplier is applied. */
  basePoints: number;
  date: IsoDate;
  evidence: { kind: EvidenceKind; label: string };
  /** Set when the contribution was delivered through a Collab Board campaign. */
  campaignId?: string;
  source: DataSource;
};

export type ScoreBreakdown = Record<ContributionCategory, number> & {
  collabs: number;
  stamps: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Passport stamps
// ---------------------------------------------------------------------------

export type StampMotif =
  | "chog"
  | "code"
  | "brush"
  | "quill"
  | "megaphone"
  | "lens"
  | "links"
  | "star"
  | "lightning"
  | "heart";

export type StampColor = "purple" | "pink" | "mint" | "sky" | "yellow" | "orange";

export type StampTier = "common" | "rare" | "legendary";

export type StampDefinition = {
  id: string;
  name: string;
  description: string;
  /** Plain-language rule for earning this stamp. */
  criteria: string;
  motif: StampMotif;
  color: StampColor;
  tier: StampTier;
  category: ContributionCategory | "collab" | "milestone";
};

export type StampAward = {
  stampId: string;
  holder: Address;
  awardedOn: IsoDate;
  /** Stamps are records, not NFTs. Minting is optional and not built yet. */
  minted: false;
  source: DataSource;
};

// ---------------------------------------------------------------------------
// Contributors
// ---------------------------------------------------------------------------

export type Contributor = {
  address: Address;
  handle: string;
  displayName: string;
  bio: string;
  skills: string[];
  joined: IsoDate;
  /** Hue (0-360) for the generated avatar. */
  avatarHue: number;
  collabsCompleted: number;
  source: DataSource;
};

export type RankedContributor = Contributor & {
  rank: number;
  score: ScoreBreakdown;
  stampCount: number;
  contributionCount: number;
};

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
