import { Badge } from "@/components/ui/badge";
import { campaignStatusLabels } from "@/lib/labels";
import type { CampaignStatus } from "@/lib/types";

const tone = { open: "mint", "in-review": "yellow", completed: "neutral" } as const;

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge tone={tone[status]}>
      {status === "open" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-crayon-mint" />}
      {campaignStatusLabels[status]}
    </Badge>
  );
}
