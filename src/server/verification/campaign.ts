import { badRequest } from "@/server/errors";
import type { VerificationHandler } from "@/server/verification/types";

/**
 * Accepted campaign deliverables. These are never claimed by hand: the Collab
 * Board records verified campaign evidence automatically when the project
 * that posted the campaign accepts a deliverable. Manual claims are refused,
 * and reviewers cannot approve campaign work on a project's behalf.
 */
export const campaignDeliverableHandler: VerificationHandler = {
  kinds: ["campaign-deliverable"],
  method: "campaign-acceptance",
  reviewerApproves: false,
  prepare() {
    throw badRequest(
      "Campaign work is recorded automatically when the project accepts your deliverable on the Collab Board.",
      "not_claimable",
    );
  },
  async verifyOnSubmit() {
    return {
      status: "unavailable",
      reason: "Campaign work is recorded automatically when the project accepts it.",
    };
  },
};
