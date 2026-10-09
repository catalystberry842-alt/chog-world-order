import { z } from "zod";
import { evidenceKinds, verificationStatuses } from "@/lib/passport/types";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/**
 * Evidence claim. `.strict()` rejects unknown fields, so a client cannot
 * pass `address`, `status`, `points`, or `userId`: the claimant always comes
 * from the session and the status always comes from verification.
 */
export const evidenceClaimSchema = z
  .object({
    kind: z.enum(evidenceKinds),
    title: text(4, 120),
    summary: text(10, 600),
    reference: text(3, 500),
    occurredAt: z.iso.date().optional(),
    appId: text(2, 64).optional(),
  })
  .strict();

export const reviewSchema = z
  .object({
    decision: z.enum(["approve", "reject", "recheck"]),
    publicReason: text(3, 280).optional(),
    internalNote: text(1, 1000).optional(),
  })
  .strict();

export const issueSchema = z.object({ evidenceId: text(1, 64) }).strict();

export const signInSchema = z
  .object({ message: text(20, 4000), signature: text(10, 20_000) })
  .strict();

export const reviewQueueStatusSchema = z.enum(verificationStatuses).default("pending");
