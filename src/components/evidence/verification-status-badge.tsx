import { Badge } from "@/components/ui/badge";
import { verificationStatusLabels } from "@/lib/passport/labels";
import type { VerificationStatus } from "@/lib/passport/types";
import type { DataSource } from "@/lib/types";

const tone = { verified: "mint", pending: "yellow", rejected: "danger", unavailable: "neutral" } as const;

/**
 * Verification status. Sample (mock) records always say so, so a sample can
 * never be read as real verified activity.
 */
export function VerificationStatusBadge({ status, source }: { status: VerificationStatus; source: DataSource }) {
  const sample = source === "mock";
  return (
    <Badge tone={sample ? "neutral" : tone[status]}>
      {status === "pending" && !sample && (
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-crayon-yellow motion-reduce:animate-none" />
      )}
      {sample ? `Sample · ${verificationStatusLabels[status].toLowerCase()}` : verificationStatusLabels[status]}
    </Badge>
  );
}
