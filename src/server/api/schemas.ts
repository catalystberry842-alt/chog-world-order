import { z } from "zod";
import { evidenceKinds, verificationStatuses } from "@/lib/passport/types";
import { reputationCategories } from "@/lib/reputation/config";

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

/** Requests that must not carry data (e.g. recalculation): any field, including points, is rejected. */
export const emptyBodySchema = z.object({}).strict();

/**
 * Admin correction. The only place a points value is accepted, and only from
 * an admin, bounded, with a written reason that is stored with the admin's id.
 */
export const adjustmentSchema = z
  .object({
    points: z
      .number()
      .int()
      .min(-100)
      .max(100)
      .refine((value) => value !== 0, "Adjustment cannot be zero."),
    reason: text(10, 280),
  })
  .strict();

export const pageQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });

export const leaderboardQuerySchema = z.object({
  category: z.enum(reputationCategories).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Collab Board -------------------------------------------------------------------

const campaignCategories = ["art", "content", "development", "community", "research", "video"] as const;
const list = (max: number, itemMax = 200) => z.array(text(3, itemMax)).max(max);

/**
 * Campaign content. Strict: owner, status, registration, and payment fields
 * can never be set by the client.
 */
export const campaignInputSchema = z
  .object({
    projectName: text(2, 80),
    title: text(6, 120),
    summary: text(20, 280),
    description: text(40, 5000),
    category: z.enum(campaignCategories),
    objectives: list(12),
    deliverables: list(12),
    eligibility: list(12),
    acceptanceCriteria: list(12),
    requiredSkills: z.array(text(1, 40)).max(12),
    paymentToken: text(2, 10),
    amountPerCreator: text(1, 40),
    slots: z.number().int().min(1).max(500),
    deadline: z.iso.datetime({ offset: true }),
  })
  .strict();

export const applicationSchema = z
  .object({
    proposal: text(60, 3000),
    evidenceIds: z.array(text(1, 64)).max(5).default([]),
  })
  .strict();

export const decisionSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    reason: text(3, 500),
  })
  .strict();

export const deliverableSchema = z
  .object({
    contentUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }, "Use a full https:// link."),
    contentHash: z
      .string()
      .trim()
      .regex(/^0x[0-9a-fA-F]{64}$/, "Use a 0x-prefixed SHA-256 hash (64 hex characters)."),
    notes: text(1, 1000).optional(),
  })
  .strict();

export const campaignListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.enum(campaignCategories).optional(),
  sort: z.enum(["newest", "budget", "deadline"]).default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Payments ---------------------------------------------------------------------

const txHash = z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/, "Use a transaction hash: 0x followed by 64 hex characters.");

/** Body only carries a hash hint. Amounts, recipients, and statuses are never accepted. */
export const txHashSchema = z.object({ txHash }).strict();
export const registrationHintSchema = z.object({ txHash: txHash.optional() }).strict();
