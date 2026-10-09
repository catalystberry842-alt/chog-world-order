import { reputationConfig, type ReputationConfig } from "@/lib/reputation/config";

export type ReputationTier = {
  title: string;
  minScore: number;
  /** Next tier, or null at the top. */
  next: { title: string; minScore: number } | null;
};

/** The tier for a score. Thresholds come from config; negative scores sit in the first tier. */
export function tierFor(score: number, config: ReputationConfig = reputationConfig): ReputationTier {
  const tiers = [...config.tiers].sort((a, b) => a.minScore - b.minScore);
  let index = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    if (score >= tiers[i].minScore) index = i;
  }
  const next = tiers[index + 1] ?? null;
  return { title: tiers[index].title, minScore: tiers[index].minScore, next };
}
