import type {
  Contribution,
  ContributionCategory,
  ScoreBreakdown,
  StampDefinition,
  StampTier,
  VerificationStatus,
} from "@/lib/types";

/**
 * Reputation is a plain sum. Every weight lives here so the UI can show the
 * exact formula next to every score.
 */
export const statusMultiplier: Record<VerificationStatus, number> = {
  "onchain-verified": 1,
  "peer-reviewed": 1,
  "self-reported": 0.25,
  "pending-review": 0,
};

export const pointsPerCompletedCollab = 50;

export const pointsPerStampTier: Record<StampTier, number> = {
  common: 10,
  rare: 25,
  legendary: 50,
};

export const contributionCategories: ContributionCategory[] = [
  "development",
  "design",
  "content",
  "community",
  "research",
];

export function contributionPoints(contribution: Contribution) {
  return Math.round(contribution.basePoints * statusMultiplier[contribution.status]);
}

export function computeScore(input: {
  contributions: Contribution[];
  collabsCompleted: number;
  stamps: StampDefinition[];
}): ScoreBreakdown {
  const score: ScoreBreakdown = {
    development: 0,
    design: 0,
    content: 0,
    community: 0,
    research: 0,
    collabs: input.collabsCompleted * pointsPerCompletedCollab,
    stamps: input.stamps.reduce((sum, stamp) => sum + pointsPerStampTier[stamp.tier], 0),
    total: 0,
  };

  for (const contribution of input.contributions) {
    score[contribution.category] += contributionPoints(contribution);
  }

  score.total =
    contributionCategories.reduce((sum, category) => sum + score[category], 0) +
    score.collabs +
    score.stamps;

  return score;
}
