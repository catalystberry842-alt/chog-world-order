import type { EvidenceKind } from "@/lib/passport/types";

/**
 * Reputation parameters.
 *
 * These are initial values for testing the system. They are not a measure of
 * contribution quality. Changing any value must also change `version`, so
 * every ledger event records which rules produced it.
 *
 * Reputation never counts wallet balances, NFT ownership, follower counts, or
 * raw transaction volume. Only verified or approved evidence is scored.
 */
export const reputationCategories = ["campaign", "protocol", "content", "research", "code", "consistency", "adjustment"] as const;
export type ReputationCategory = (typeof reputationCategories)[number];

/** Categories earned directly from one piece of evidence. */
export type ContributionCategory = Exclude<ReputationCategory, "consistency" | "adjustment">;

export type ReputationConfig = {
  version: string;
  /** Points per verified contribution. */
  weights: Record<ContributionCategory, number>;
  /** Maximum number of point-earning contributions per category per UTC day / calendar month. */
  limits: Record<ContributionCategory, { daily: number; monthly: number }>;
  consistency: { pointsPerWeek: number; monthlyCap: number };
  /** Tier thresholds, ascending. NFT ownership never affects tiers. */
  tiers: { title: string; minScore: number }[];
};

export const reputationConfig: ReputationConfig = {
  version: "2026-10.2",
  weights: {
    campaign: 10,
    protocol: 3,
    content: 5,
    research: 5,
    code: 8,
  },
  limits: {
    campaign: { daily: 3, monthly: 20 },
    protocol: { daily: 2, monthly: 10 },
    content: { daily: 3, monthly: 15 },
    research: { daily: 2, monthly: 8 },
    code: { daily: 5, monthly: 30 },
  },
  consistency: { pointsPerWeek: 2, monthlyCap: 8 },
  tiers: [
    { title: "Curious Chog", minScore: 0 },
    { title: "Chog Scout", minScore: 10 },
    { title: "Chog Contributor", minScore: 40 },
    { title: "Chog Builder", minScore: 100 },
    { title: "Chog Legend", minScore: 250 },
  ],
};

export const categoryForEvidence: Record<EvidenceKind, ContributionCategory> = {
  "campaign-deliverable": "campaign",
  "onchain-interaction": "protocol",
  "community-contribution": "content",
  "research-contribution": "research",
  "code-contribution": "code",
};

export const reputationCategoryLabels: Record<ReputationCategory, string> = {
  campaign: "Accepted campaign work",
  protocol: "Protocol interactions",
  content: "Community & content",
  research: "Research",
  code: "Code",
  consistency: "Consistency bonus",
  adjustment: "Corrections",
};
