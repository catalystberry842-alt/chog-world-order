import { normalizeAddress } from "@/lib/passport/address";
import { planStamps } from "@/lib/passport/rules";
import type { PublicEvidence, PublicPassport, PublicStamp } from "@/lib/passport/types";
import { categoryForEvidence } from "@/lib/reputation/config";
import { badRequest, conflict, DuplicateEvidenceError, forbidden, notFound } from "@/server/errors";
import { requireRole, requireStore, type AuthContext } from "@/server/auth/session";
import { evidenceReference } from "@/server/passport/evidence-reference";
import type { EvidenceRecord, PassportStore, ReputationRecord, StampRecord, UserRecord } from "@/server/passport/store";
import { buildPublicReputation, recalculateReputation } from "@/server/reputation/service";
import { formatTokenUnits } from "@/lib/collabs/rules";
import type { PaymentView } from "@/lib/collabs/types";
import { toPaymentView } from "@/server/payments/view";
import type { Services } from "@/server/services";
import type { EvidenceClaim } from "@/server/verification/types";

/**
 * Net reputation points earned directly by each evidence record, from the
 * ledger: contribution events plus any reversals of them. Consistency
 * bonuses are counted separately.
 */
export function pointsByEvidence(ledger: ReputationRecord[]) {
  const points = new Map<string, number>();
  for (const event of ledger) {
    if (!event.evidenceId || event.category === "consistency" || event.category === "adjustment") continue;
    points.set(event.evidenceId, (points.get(event.evidenceId) ?? 0) + event.points);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Public read model. Nothing here exposes reviewer notes, dedupe keys,
// reviewer ids, or session data.
// ---------------------------------------------------------------------------

function toPublicEvidence(record: EvidenceRecord, points: number): PublicEvidence {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    reference: evidenceReference(record),
    status: record.status,
    method: record.method,
    statusReason: record.statusReason,
    occurredAt: record.occurredAt.toISOString(),
    submittedAt: record.createdAt.toISOString(),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    points,
    verificationData: record.verificationData,
    source: "database",
  };
}

function toPublicStamp(stamp: StampRecord, evidence: EvidenceRecord | undefined): PublicStamp | null {
  if (!evidence) return null;
  return {
    id: stamp.id,
    category: stamp.category,
    issuedAt: stamp.issuedAt.toISOString(),
    evidence: { id: evidence.id, kind: evidence.kind, title: evidence.title, reference: evidenceReference(evidence) },
    source: "database",
  };
}

/**
 * Builds the passport for an address. Returns null when the address has no
 * account. Connecting a wallet alone creates nothing: an account only exists
 * after sign-in, and it starts with zero stamps and zero reputation.
 *
 * @param viewer the signed-in user, if any. Owners also see pending, rejected,
 *               and unavailable records; everyone else sees verified records only.
 */
export async function getPassport(services: Services, rawAddress: string, viewer: UserRecord | null) {
  const store = requireStore(services);
  const address = normalizeAddress(rawAddress);
  if (!address) throw badRequest("That is not a valid wallet address.", "invalid_address");

  const user = await store.findUserByAddress(address);
  if (!user) return null;

  const isOwner = viewer?.id === user.id;
  const [evidence, stamps, ledger, rank, reputation] = await Promise.all([
    store.listEvidence({ userId: user.id, limit: 500 }),
    store.listStamps(user.id),
    store.listReputation(user.id),
    store.rankOf(user.id),
    buildPublicReputation(store, user.id),
  ]);

  const earned = pointsByEvidence(ledger);
  // Campaign evidence references its deliverable id; attach the payment for it, if any.
  const campaignDeliverables = evidence.filter((record) => record.kind === "campaign-deliverable").map((record) => record.reference);
  const paymentsByDeliverable = new Map<string, PaymentView>();
  if (services.payments && campaignDeliverables.length > 0) {
    for (const payment of await services.payments.listPaymentsByDeliverables(campaignDeliverables)) {
      paymentsByDeliverable.set(payment.deliverableId, toPaymentView(payment));
    }
  }
  const paymentFor = (record: EvidenceRecord): PublicEvidence["payment"] => {
    const payment = record.kind === "campaign-deliverable" ? paymentsByDeliverable.get(record.reference) : undefined;
    // Public viewers only see confirmed payments; the owner also sees pending ones.
    if (!payment || (!isOwner && payment.status !== "confirmed")) return null;
    return {
      status: payment.status,
      amount: formatTokenUnits(payment.amount, payment.token),
      tokenSymbol: payment.token.symbol,
      txHash: payment.status === "confirmed" ? payment.txHash : null,
      explorerUrl: payment.status === "confirmed" ? payment.explorerUrl : null,
      confirmedAt: payment.confirmedAt,
    };
  };
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));

  const passport: PublicPassport = {
    address,
    profile: { displayName: user.displayName, handle: null, bio: null, skills: [], avatarHue: parseInt(address.slice(2, 8), 16) % 360 },
    joinedAt: user.createdAt.toISOString(),
    rank,
    reputation,
    verifiedContributionCount: evidence.filter((record) => record.status === "verified").length,
    stamps: stamps
      .map((stamp) => toPublicStamp(stamp, evidenceById.get(stamp.evidenceId)))
      .filter((stamp): stamp is PublicStamp => stamp !== null),
    contributions: evidence
      .filter((record) => isOwner || record.status === "verified")
      .map((record) => ({ ...toPublicEvidence(record, earned.get(record.id) ?? 0), payment: paymentFor(record) })),
    source: "database",
  };
  return passport;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const earliestActivity = new Date("2025-01-01T00:00:00Z");
/** Open claims (pending or unavailable) per wallet, so one wallet cannot flood the database or the review queue. */
export const MAX_PENDING_CLAIMS = 20;

const endOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

/**
 * Stores an evidence claim for the signed-in wallet and runs its handler.
 * The claimant is always the session's user; the request cannot name another wallet.
 */
export async function submitEvidence(services: Services, auth: AuthContext, claim: EvidenceClaim) {
  const store = requireStore(services);
  const handler = services.handlers[claim.kind];
  const prepared = handler.prepare(claim);
  const now = services.now();

  // Dates arrive as noon UTC of the chosen day, so compare with the end of today, not "now".
  const occurredAt = claim.occurredAt ?? now;
  if (occurredAt > endOfUtcDay(now) || occurredAt < earliestActivity) {
    throw badRequest("The activity date must be in the past and after January 2025.", "invalid_date");
  }

  const [pending, unavailable] = await Promise.all([
    store.listEvidence({ userId: auth.user.id, status: "pending", limit: MAX_PENDING_CLAIMS }),
    store.listEvidence({ userId: auth.user.id, status: "unavailable", limit: MAX_PENDING_CLAIMS }),
  ]);
  if (pending.length + unavailable.length >= MAX_PENDING_CLAIMS) {
    throw conflict("too_many_pending", `You have ${MAX_PENDING_CLAIMS} claims that are not verified yet. Wait for some to be reviewed or checked first.`);
  }

  // A transaction has exactly one sender, and only that wallet can ever verify it, so the
  // on-chain key is scoped to the claimant. Someone else claiming your transaction first
  // gets their own (rejected) record and cannot block yours.
  const dedupeKey = handler.method === "onchain-receipt" ? `${prepared.dedupeKey}:${auth.user.address.toLowerCase()}` : prepared.dedupeKey;

  let record: EvidenceRecord;
  try {
    record = await store.createEvidence({
      userId: auth.user.id,
      kind: claim.kind,
      method: handler.method,
      status: "pending",
      title: claim.title,
      summary: claim.summary,
      reference: prepared.reference,
      dedupeKey,
      chainId: prepared.chainId,
      txHash: prepared.txHash,
      appId: prepared.appId,
      category: categoryForEvidence[claim.kind],
      occurredAt,
      statusReason: "Received. Verification has not run yet.",
      verificationData: null,
    });
  } catch (error) {
    if (error instanceof DuplicateEvidenceError) throw conflict("duplicate_evidence", error.message);
    throw error;
  }

  const outcome = await handler.verifyOnSubmit(prepared, { wallet: auth.user.address });
  const updated =
    (await store.updateEvidenceIfStatus(record.id, "pending", {
      status: outcome.status,
      statusReason: outcome.reason,
      occurredAt: outcome.occurredAt ?? record.occurredAt,
      verifiedAt: outcome.status === "verified" ? now : null,
      verificationData: outcome.data ?? null,
    })) ?? record;

  const issued = updated.status === "verified" ? await issueForEvidence(services, updated.id, null) : null;
  return result(updated, issued);
}

export type ReviewDecision = {
  decision: "approve" | "reject" | "recheck";
  publicReason?: string;
  internalNote?: string;
};

/**
 * Reviewer action on an evidence record.
 * - approve / reject: off-chain kinds only, while the record is pending.
 * - recheck: on-chain kinds only; re-runs the receipt check against the owner's wallet.
 */
export async function reviewEvidence(services: Services, reviewer: UserRecord, evidenceId: string, input: ReviewDecision) {
  const store = requireStore(services);
  requireRole(reviewer, ["reviewer", "admin"]);

  const evidence = await store.findEvidence(evidenceId);
  if (!evidence) throw notFound("Evidence not found.");
  if (evidence.userId === reviewer.id) throw forbidden("You cannot review your own evidence.");

  const handler = services.handlers[evidence.kind];
  const now = services.now();

  if (input.decision === "recheck") {
    if (evidence.method !== "onchain-receipt") {
      throw conflict("not_recheckable", "Only on-chain evidence can be re-checked automatically.");
    }
    if (evidence.status !== "pending" && evidence.status !== "unavailable") {
      throw conflict("already_final", "This evidence already has a final status.");
    }
    const owner = await findOwner(store, evidence.userId);
    const outcome = await handler.verifyOnSubmit(
      { reference: evidence.reference, dedupeKey: evidence.dedupeKey, chainId: evidence.chainId, txHash: evidence.txHash, appId: evidence.appId },
      { wallet: owner.address },
    );
    const updated = await store.updateEvidenceIfStatus(evidence.id, evidence.status, {
      status: outcome.status,
      statusReason: outcome.reason,
      occurredAt: outcome.occurredAt ?? evidence.occurredAt,
      verifiedAt: outcome.status === "verified" ? now : null,
      verificationData: outcome.data ?? null,
    });
    if (!updated) throw conflict("changed", "This evidence changed while you were reviewing it.");
    const issued = updated.status === "verified" ? await issueForEvidence(services, updated.id, reviewer.id) : null;
    return result(updated, issued);
  }

  if (!handler.reviewerApproves) {
    throw conflict(
      "not_reviewer_verified",
      evidence.method === "onchain-receipt"
        ? "On-chain evidence is verified from its transaction receipt, not by reviewers. Use recheck."
        : "Campaign deliverables are accepted through the Collab Board, not by reviewers.",
    );
  }
  if (evidence.status !== "pending") throw conflict("already_reviewed", "This evidence has already been reviewed.");

  const approve = input.decision === "approve";
  const updated = await store.updateEvidenceIfStatus(evidence.id, "pending", {
    status: approve ? "verified" : "rejected",
    statusReason: input.publicReason?.trim() || (approve ? "Approved by an authorized reviewer." : "Not approved by a reviewer."),
    reviewerNote: input.internalNote?.trim() || null,
    reviewerId: reviewer.id,
    reviewedAt: now,
    verifiedAt: approve ? now : null,
    verificationData: { decision: approve ? "approved" : "rejected", reviewedAt: now.toISOString() },
    // A rejected claim releases its key, so the real author can still submit the same link.
    ...(approve ? {} : { dedupeKey: `released:${evidence.id}:${evidence.dedupeKey}` }),
  });
  if (!updated) throw conflict("already_reviewed", "This evidence has already been reviewed.");

  const issued = approve ? await issueForEvidence(services, updated.id, reviewer.id) : null;
  return result(updated, issued);
}

async function findOwner(store: PassportStore, userId: string) {
  const owner = await store.findUserById(userId);
  if (!owner) throw notFound("Evidence owner not found.");
  return owner;
}

function result(evidence: EvidenceRecord, issued: Awaited<ReturnType<typeof issueForEvidence>> | null) {
  return {
    evidence: toPublicEvidence(evidence, issued?.points ?? 0),
    issuedStamps: issued?.stamps.map((stamp) => stamp.category) ?? [],
  };
}

/**
 * Issues what a verified evidence record earns: its stamps, then a
 * reputation recalculation through the rules engine.
 * Idempotent: repeated calls for the same evidence create nothing new.
 * Refuses evidence that is not verified.
 */
export async function issueForEvidence(services: Services, evidenceId: string, issuedById: string | null) {
  const store = requireStore(services);
  const evidence = await store.findEvidence(evidenceId);
  if (!evidence) throw notFound("Evidence not found.");
  if (evidence.status !== "verified") {
    throw conflict("not_verified", "Stamps can only be issued for verified evidence.");
  }

  const [held, verified] = await Promise.all([store.listStamps(evidence.userId), store.listVerifiedEvidence(evidence.userId)]);
  const stamps = await store.writeIssuance({
    userId: evidence.userId,
    evidenceId: evidence.id,
    issuedById,
    stamps: planStamps({
      evidence: { id: evidence.id, kind: evidence.kind, occurredAt: evidence.occurredAt },
      verifiedSoFar: verified,
      heldStamps: new Set(held.map((stamp) => stamp.category)),
    }).map((stamp) => stamp.category),
  });

  const events = await recalculateReputation(services, evidence.userId, { cause: "verification", actorId: issuedById });
  const ledger = await store.listReputation(evidence.userId);
  return { stamps, events, points: pointsByEvidence(ledger).get(evidence.id) ?? 0 };
}

/** Reviewer view of the queue. Includes the submitter's address and internal notes. */
export async function listForReview(services: Services, reviewer: UserRecord, status: EvidenceRecord["status"]) {
  const store = requireStore(services);
  requireRole(reviewer, ["reviewer", "admin"]);
  const records = await store.listEvidence({ status, limit: 100 });
  return Promise.all(
    records.map(async (record) => ({
      ...toPublicEvidence(record, 0),
      submitter: (await store.findUserById(record.userId))?.address ?? null,
      reviewerNote: record.reviewerNote,
      canReview: services.handlers[record.kind].reviewerApproves && record.userId !== reviewer.id,
    })),
  );
}
