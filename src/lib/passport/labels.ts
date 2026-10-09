import type { EvidenceKind, VerificationMethod, VerificationStatus } from "@/lib/passport/types";

export const evidenceKindLabels: Record<EvidenceKind, string> = {
  "onchain-interaction": "On-chain interaction",
  "community-contribution": "Community contribution",
  "code-contribution": "Code contribution",
  "research-contribution": "Research",
  "campaign-deliverable": "Campaign deliverable",
};

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
  unavailable: "Verification unavailable",
};

export const verificationMethodLabels: Record<VerificationMethod, string> = {
  "onchain-receipt": "Transaction receipt on Monad",
  "reviewer-approval": "Reviewer approval",
  "maintainer-approval": "Maintainer approval",
  "campaign-acceptance": "Campaign acceptance",
};
