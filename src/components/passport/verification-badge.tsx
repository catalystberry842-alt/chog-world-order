import { Badge } from "@/components/ui/badge";
import { verificationLabels } from "@/lib/labels";
import type { VerificationStatus } from "@/lib/types";

const tone = {
  "onchain-verified": "mint",
  "peer-reviewed": "purple",
  "pending-review": "yellow",
  "self-reported": "neutral",
} as const;

const hint: Record<VerificationStatus, string> = {
  "onchain-verified": "Checked against Monad.",
  "peer-reviewed": "A reviewer confirmed the evidence off-chain.",
  "pending-review": "Waiting for a reviewer. Earns no points yet.",
  "self-reported": "Claimed by the contributor. Earns a quarter of its points.",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge tone={tone[status]}>
      <span title={hint[status]}>{verificationLabels[status]}</span>
    </Badge>
  );
}
