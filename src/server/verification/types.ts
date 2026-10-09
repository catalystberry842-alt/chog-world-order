import type { EvidenceKind, VerificationMethod, VerificationStatus } from "@/lib/passport/types";
import type { Address } from "@/lib/types";

/** A claim as submitted by a signed-in contributor, after schema validation. */
export type EvidenceClaim = {
  kind: EvidenceKind;
  title: string;
  summary: string;
  /** URL (off-chain) or transaction hash (on-chain) or deliverable id (campaign). */
  reference: string;
  occurredAt?: Date;
  appId?: string;
};

/** What a handler extracts from a claim before anything is stored. */
export type PreparedClaim = {
  reference: string;
  dedupeKey: string;
  chainId: number | null;
  txHash: string | null;
  appId: string | null;
};

export type VerificationOutcome = {
  status: VerificationStatus;
  /** Public reason. Safe to show to the contributor. */
  reason: string;
  /** Activity time established by the verifier (block time for on-chain evidence). */
  occurredAt?: Date;
};

export type VerificationContext = { wallet: Address };

export interface VerificationHandler {
  kinds: EvidenceKind[];
  method: VerificationMethod;
  /**
   * True when an authorized reviewer must approve the claim. False when the
   * handler verifies automatically (on-chain) or the decision belongs to
   * another system (campaign acceptance).
   */
  reviewerApproves: boolean;
  /** Validates and canonicalises the claim. Throws HttpError(400) on bad input. */
  prepare(claim: EvidenceClaim): PreparedClaim;
  /** Runs right after the claim is stored. Must never return "verified" without a real check. */
  verifyOnSubmit(prepared: PreparedClaim, context: VerificationContext): Promise<VerificationOutcome>;
}
