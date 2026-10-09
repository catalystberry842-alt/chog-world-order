/**
 * Passport domain types shared by the server, the API, and the UI.
 * Everything here is safe to send to a browser: no session data and no
 * reviewer notes.
 */
import type { Address, DataSource } from "@/lib/types";

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

export const reputationSources = ["onchain", "community", "code", "research", "campaigns", "stamps"] as const;
export type ReputationSource = (typeof reputationSources)[number];

export type ReputationBreakdown = Record<ReputationSource, number> & { total: number };

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
  /** Reputation earned by this record (0 unless verified). */
  points: number;
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
  reputation: ReputationBreakdown;
  verifiedContributionCount: number;
  stamps: PublicStamp[];
  /** Public views list verified records only; the owner also sees pending and rejected ones. */
  contributions: PublicEvidence[];
  source: DataSource;
};

export type LeaderboardEntry = {
  address: Address;
  profile: PassportProfile;
  rank: number;
  reputation: ReputationBreakdown;
  stampCount: number;
  verifiedContributionCount: number;
  source: DataSource;
};
