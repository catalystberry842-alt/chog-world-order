import type {
  CampaignCategory,
  CampaignStatus,
  ContributionCategory,
  StampTier,
  VerificationStatus,
} from "@/lib/types";

export const contributionCategoryLabels: Record<ContributionCategory, string> = {
  development: "Development",
  design: "Design",
  content: "Content",
  community: "Community",
  research: "Research",
};

export const campaignCategoryLabels: Record<CampaignCategory, string> = {
  art: "Art & design",
  content: "Writing",
  development: "Development",
  community: "Community",
  research: "Research",
  video: "Video",
};

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  open: "Open",
  "in-review": "In review",
  completed: "Completed",
};

export const verificationLabels: Record<VerificationStatus, string> = {
  "self-reported": "Self-reported",
  "pending-review": "Pending review",
  "peer-reviewed": "Peer reviewed",
  "onchain-verified": "Verified on-chain",
};

export const stampTierLabels: Record<StampTier, string> = {
  common: "Common",
  rare: "Rare",
  legendary: "Legendary",
};
