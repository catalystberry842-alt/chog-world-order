import type { EvidenceKind } from "@/lib/passport/types";
import { campaignDeliverableHandler } from "@/server/verification/campaign";
import { createOnchainHandler, type OnchainClient } from "@/server/verification/onchain";
import { codeContributionHandler, reviewedContributionHandler } from "@/server/verification/reviewed";
import type { SupportedApp } from "@/server/verification/supported-apps";
import type { VerificationHandler } from "@/server/verification/types";

export type HandlerRegistry = Record<EvidenceKind, VerificationHandler>;

/** One handler per evidence kind. */
export function createHandlerRegistry(options: { onchainClient: OnchainClient | null; apps: SupportedApp[] }): HandlerRegistry {
  const onchain = createOnchainHandler({ client: options.onchainClient, apps: options.apps });
  return {
    "onchain-interaction": onchain,
    "community-contribution": reviewedContributionHandler,
    "research-contribution": reviewedContributionHandler,
    "code-contribution": codeContributionHandler,
    "campaign-deliverable": campaignDeliverableHandler,
  };
}
