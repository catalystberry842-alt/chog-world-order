import type { EvidenceKind, StampCategory, VerificationMethod, VerificationStatus } from "@/lib/passport/types";
import type { Address } from "@/lib/types";

/**
 * Storage interface for the Passport system.
 *
 * Two implementations: `PrismaPassportStore` (PostgreSQL) and
 * `MemoryPassportStore` (tests). Both enforce the same uniqueness rules:
 * - evidence dedupeKey is unique (DuplicateEvidenceError),
 * - one stamp per (user, category) and per (evidence, category),
 * - reputation events are unique by dedupeKey and reversed at most once,
 * - a sign-in nonce can create only one session (NonceReusedError).
 */

export type UserRole = "contributor" | "reviewer" | "admin";

export type UserRecord = {
  id: string;
  address: Address;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  nonce: string;
  chainId: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type EvidenceRecord = {
  id: string;
  userId: string;
  kind: EvidenceKind;
  method: VerificationMethod;
  status: VerificationStatus;
  title: string;
  summary: string;
  reference: string;
  dedupeKey: string;
  chainId: number | null;
  txHash: string | null;
  appId: string | null;
  /** Reputation category derived from the kind at submission. */
  category: string;
  occurredAt: Date;
  statusReason: string | null;
  /** Public verification details (block number, app, reviewer decision time...). */
  verificationData: Record<string, string | number> | null;
  reviewerNote: string | null;
  reviewerId: string | null;
  reviewedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

export type StampRecord = {
  id: string;
  userId: string;
  category: StampCategory;
  evidenceId: string;
  issuedAt: Date;
  issuedById: string | null;
};

export type ReputationEventKind = "contribution" | "consistency" | "adjustment" | "reversal";

export type ReputationRecord = {
  id: string;
  userId: string;
  kind: ReputationEventKind;
  points: number;
  category: string;
  reason: string;
  planKey: string | null;
  dedupeKey: string;
  calculationVersion: string;
  evidenceId: string | null;
  periodKey: string | null;
  reversesEventId: string | null;
  actorId: string | null;
  createdAt: Date;
};

export type ReputationWrite = Omit<ReputationRecord, "id" | "userId" | "createdAt">;

export type SnapshotCause = "verification" | "recalculation" | "adjustment";

export type SnapshotRecord = {
  id: string;
  userId: string;
  total: number;
  breakdown: Record<string, number>;
  tier: string;
  calculationVersion: string;
  cause: SnapshotCause;
  eventCount: number;
  triggeredById: string | null;
  createdAt: Date;
};

export type SnapshotWrite = Omit<SnapshotRecord, "id" | "userId" | "createdAt">;

/** Evidence fields the reputation engine reads. */
export type VerifiedEvidenceRow = Pick<EvidenceRecord, "id" | "kind" | "occurredAt"> & { verifiedAt: Date };

export type LeaderboardRow = {
  userId: string;
  address: Address;
  displayName: string | null;
  /** Points in the filtered category, or the total when unfiltered. */
  points: number;
  total: number;
  verifiedCount: number;
};

export type NewEvidence = Omit<
  EvidenceRecord,
  "id" | "createdAt" | "reviewerNote" | "reviewerId" | "reviewedAt" | "verifiedAt"
>;

export type EvidenceUpdate = Partial<
  Pick<
    EvidenceRecord,
      | "status"
    | "statusReason"
    | "reviewerNote"
    | "reviewerId"
    | "reviewedAt"
    | "verifiedAt"
    | "occurredAt"
    | "verificationData"
  >
>;

export type IssuanceWrite = {
  userId: string;
  evidenceId: string;
  issuedById: string | null;
  stamps: StampCategory[];
};

export interface PassportStore {
  findUserByAddress(address: Address): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  upsertUser(address: Address): Promise<UserRecord>;

  createSession(input: Omit<SessionRecord, "id" | "createdAt" | "revokedAt">): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<{ session: SessionRecord; user: UserRecord } | null>;
  revokeSession(id: string, at: Date): Promise<void>;

  createEvidence(input: NewEvidence): Promise<EvidenceRecord>;
  findEvidence(id: string): Promise<EvidenceRecord | null>;
  listEvidence(filter: { userId?: string; status?: VerificationStatus; limit: number }): Promise<EvidenceRecord[]>;
  /**
   * Updates evidence only if it is still in `expectedStatus`. Returns the
   * updated record, or null when another request changed it first.
   */
  updateEvidenceIfStatus(
    id: string,
    expectedStatus: VerificationStatus,
    update: EvidenceUpdate,
  ): Promise<EvidenceRecord | null>;

  listStamps(userId: string): Promise<StampRecord[]>;
  /** Verified evidence of a user, used by stamp rules and the reputation engine. */
  listVerifiedEvidence(userId: string): Promise<VerifiedEvidenceRow[]>;
  /**
   * Creates stamps in one transaction. Existing (user, category) or
   * (evidence, category) rows are skipped, so repeating a call is a no-op.
   * Returns the stamps that were newly created.
   */
  writeIssuance(write: IssuanceWrite): Promise<StampRecord[]>;

  /** The user's full reputation ledger, oldest first. */
  listReputation(userId: string): Promise<ReputationRecord[]>;
  /**
   * Atomically updates one user's ledger. Runs `decide` with the current
   * ledger and verified evidence while holding a per-user lock, then writes
   * the returned events (unique dedupeKey) and snapshot in the same
   * transaction. Returns the events that were created.
   */
  updateLedger(
    userId: string,
    decide: (state: { ledger: ReputationRecord[]; verified: VerifiedEvidenceRow[] }) => {
      writes: ReputationWrite[];
      snapshot: SnapshotWrite | null;
    },
  ): Promise<ReputationRecord[]>;
  listSnapshots(userId: string, limit: number): Promise<SnapshotRecord[]>;
  /** Ids of users who have verified evidence or reputation events. */
  listUsersWithReputationData(): Promise<string[]>;
  /** 1-based rank by total reputation, or null when the user has none. */
  rankOf(userId: string): Promise<number | null>;
  /** Users ranked by total (or by one category), highest first. Users with no points are excluded. */
  leaderboard(input: { category: string | null; skip: number; take: number }): Promise<{ rows: LeaderboardRow[]; total: number }>;
}
