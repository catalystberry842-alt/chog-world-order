/**
 * Passport domain types shared by the server, the API, and the UI.
 * Everything here is safe to send to a browser: no session data and no
 * reviewer notes.
 */
import type { Address, DataSource } from "@/lib/types";
import type { ReputationBreakdown } from "@/lib/reputation/engine";
import type { ReputationCategory } from "@/lib/reputation/config";
import type { ReputationTier } from "@/lib/reputation/tiers";

export const stampCategories = [
  "monad-explorer",
  "community-contributor",
  "builder",
  "researcher",
  "collaborator",
  "consistent-contributor",
] as const;
export type StampCategory = (typeof stampCategories)[number];

export const evidenceKinds = [
  "onchain-interaction",
  "community-contribution",
  "code-contribution",
  "research-contribution",
  "campaign-deliverable",
] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

/**
 * - pending: waiting for a reviewer (off-chain) or for the chain (on-chain).
 * - verified: checked on-chain, or approved by an authorized reviewer.
 * - rejected: checked and refused. See statusReason.
 * - unavailable: the verification source is not configured, so nothing could be checked.
 */
export const verificationStatuses = ["pending", "verified", "rejected", "unavailable"] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export type VerificationMethod =
  | "onchain-receipt"
  | "reviewer-approval"
  | "maintainer-approval"
  | "campaign-acceptance";

export type { ReputationBreakdown } from "@/lib/reputation/engine";
export type { ReputationCategory } from "@/lib/reputation/config";

export type EvidenceReference = {
  /** Human-readable pointer, e.g. "PR #42 · org/repo" or a short tx hash. */
  label: string;
  /** Link to the evidence when it has one. Only http(s) URLs are ever stored. */
  url: string | null;
  txHash: string | null;
  chainId: number | null;
};

export type PublicEvidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  reference: EvidenceReference;
  status: VerificationStatus;
  method: VerificationMethod;
  /** Public explanation of the status. Never the reviewer's internal note. */
  statusReason: string | null;
  occurredAt: string;
  submittedAt: string;
  verifiedAt: string | null;
  /** Reputation earned by this record (0 unless verified and within limits). */
  points: number;
  /** Public verification details (block number, app, reviewer decision time...). */
  verificationData: Record<string, string | number> | null;
  source: DataSource;
};

export type PublicStamp = {
  id: string;
  category: StampCategory;
  issuedAt: string;
  evidence: { id: string; kind: EvidenceKind; title: string; reference: EvidenceReference };
  source: DataSource;
};

export type PassportProfile = {
  displayName: string | null;
  handle: string | null;
  bio: string | null;
  skills: string[];
  avatarHue: number;
};

export type PublicPassport = {
  address: Address;
  profile: PassportProfile;
  joinedAt: string;
  /** 1-based rank by total reputation, or null when the passport has no reputation yet. */
  rank: number | null;
  reputation: PublicReputation;
  verifiedContributionCount: number;
  stamps: PublicStamp[];
  /** Public views list verified records only; the owner also sees pending and rejected ones. */
  contributions: PublicEvidence[];
  source: DataSource;
};

export type PublicReputationEvent = {
  id: string;
  kind: "contribution" | "consistency" | "adjustment" | "reversal";
  category: ReputationCategory;
  points: number;
  reason: string;
  periodKey: string | null;
  calculationVersion: string;
  createdAt: string;
  /** The evidence that supports this event, when there is one. */
  evidence: { id: string; kind: EvidenceKind; title: string; reference: EvidenceReference } | null;
  /** True when a later event reversed this one. */
  reversed: boolean;
};

export type PublicReputation = {
  total: number;
  breakdown: ReputationBreakdown;
  tier: ReputationTier;
  calculationVersion: string;
  /** Weeks that earned (or hit the cap for) the consistency bonus, newest first. */
  consistency: { week: string; points: number }[];
  /** Ledger events, newest first. */
  events: PublicReputationEvent[];
};

export type LeaderboardEntry = {
  address: Address;
  displayName: string | null;
  avatarHue: number;
  rank: number;
  /** Total score, or the selected category's points when filtering. */
  points: number;
  total: number;
  tier: string;
  verifiedContributionCount: number;
};

export type LeaderboardPage = {
  entries: LeaderboardEntry[];
  page: number;
  pageSize: number;
  totalEntries: number;
  category: ReputationCategory | null;
};
