import type { CampaignCategory, CampaignStatus } from "@/lib/types";

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
