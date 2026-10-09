import { Badge } from "@/components/ui/badge";
import type { CampaignLifecycle, RegistrationStatus } from "@/lib/collabs/types";

const statusTone = { draft: "neutral", published: "mint", closed: "yellow", completed: "neutral", cancelled: "danger" } as const;
const statusLabel: Record<CampaignLifecycle, string> = {
  draft: "Draft",
  published: "Open",
  closed: "Closed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function CampaignStatusBadge({ status }: { status: CampaignLifecycle }) {
  return (
    <Badge tone={statusTone[status]}>
      {status === "published" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-crayon-mint" />}
      {statusLabel[status]}
    </Badge>
  );
}

const registrationTone = { "not-registered": "neutral", pending: "yellow", confirmed: "mint", failed: "danger" } as const;
const registrationLabel: Record<RegistrationStatus, string> = {
  "not-registered": "Not registered on-chain",
  pending: "Registration pending",
  confirmed: "Registered on Monad",
  failed: "Registration failed",
};

/** On-chain registration in CampaignPayments. "Registered" only after the event is verified. */
export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return <Badge tone={registrationTone[status]}>{registrationLabel[status]}</Badge>;
}
