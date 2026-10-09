import { badRequest } from "@/server/errors";
import type { VerificationHandler } from "@/server/verification/types";

/**
 * Accepted campaign deliverables. Acceptance must come from the Collab Board,
 * where the project that posted the campaign accepts the work. That system
 * is not built yet, so every claim is stored as "unavailable" and reviewers
 * cannot approve it on the project's behalf.
 */
export const campaignDeliverableHandler: VerificationHandler = {
  kinds: ["campaign-deliverable"],
  method: "campaign-acceptance",
  reviewerApproves: false,
  prepare(claim) {
    const id = claim.reference.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(id)) {
      throw badRequest("Use the deliverable id shown on the campaign, e.g. meetup-recap-reel.", "invalid_reference");
    }
    return { reference: id, dedupeKey: `campaign:${id}`, chainId: null, txHash: null, appId: null };
  },
  async verifyOnSubmit() {
    return {
      status: "unavailable",
      reason: "Campaign acceptance is verified by the Collab Board, which is not available yet.",
    };
  },
};
