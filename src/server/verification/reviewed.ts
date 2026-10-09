import { canonicalCodeUrl, canonicalUrl } from "@/server/verification/canonical-url";
import type { VerificationHandler } from "@/server/verification/types";

/**
 * Approved community contributions and research. The claim stays pending
 * until an authorized reviewer approves or rejects it.
 */
export const reviewedContributionHandler: VerificationHandler = {
  kinds: ["community-contribution", "research-contribution"],
  method: "reviewer-approval",
  reviewerApproves: true,
  prepare(claim) {
    const reference = canonicalUrl(claim.reference);
    return { reference, dedupeKey: `${claim.kind}:${reference}`, chainId: null, txHash: null, appId: null };
  },
  async verifyOnSubmit() {
    return { status: "pending", reason: "Waiting for an authorized reviewer to check the evidence." };
  },
};

/** Verified code contributions. A maintainer must approve the linked change. */
export const codeContributionHandler: VerificationHandler = {
  kinds: ["code-contribution"],
  method: "maintainer-approval",
  reviewerApproves: true,
  prepare(claim) {
    const reference = canonicalCodeUrl(claim.reference);
    return { reference, dedupeKey: `code:${reference}`, chainId: null, txHash: null, appId: null };
  },
  async verifyOnSubmit() {
    return { status: "pending", reason: "Waiting for a maintainer to confirm the change was merged and is yours." };
  },
};
