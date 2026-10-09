import type { EvidenceKind, StampCategory, VerificationMethod, VerificationStatus } from "@/lib/passport/types";
import type { Address } from "@/lib/types";

/**
 * Storage interface for the Passport system.
 *
 * Two implementations: `PrismaPassportStore` (PostgreSQL) and
 * `MemoryPassportStore` (tests). Both enforce the same uniqueness rules:
 * - evidence dedupeKey is unique (DuplicateEvidenceError),
 * - one stamp per (user, category) and per (evidence, category),
 * - one contribution event per evidence, one stamp event per stamp,
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
  occurredAt: Date;
  statusReason: string | null;
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

export type ReputationRecord = {
  id: string;
  userId: string;
  kind: "contribution-verified" | "stamp-issued" | "adjustment";
  points: number;
  source: string;
  reason: string;
  evidenceId: string | null;
  stampId: string | null;
  createdAt: Date;
};

export type NewEvidence = Omit<
  EvidenceRecord,
  "id" | "createdAt" | "reviewerNote" | "reviewerId" | "reviewedAt" | "verifiedAt"
>;

export type EvidenceUpdate = Partial<
  Pick<
    EvidenceRecord,
    "status" | "statusReason" | "reviewerNote" | "reviewerId" | "reviewedAt" | "verifiedAt" | "occurredAt"
  >
>;

export type IssuanceWrite = {
  userId: string;
  evidenceId: string;
  issuedById: string | null;
  stamps: { category: StampCategory; points: number }[];
  contribution: { source: string; points: number } | null;
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
  listReputation(userId: string): Promise<ReputationRecord[]>;
  /** Verified evidence of a user (id, kind, occurredAt), used by stamp rules. */
  listVerifiedEvidence(userId: string): Promise<Pick<EvidenceRecord, "id" | "kind" | "occurredAt">[]>;
  /**
   * Writes stamps and reputation events in one transaction. Rows that already
   * exist are skipped, so calling this twice for the same evidence is a no-op.
   * Returns the stamps that were newly created.
   */
  writeIssuance(write: IssuanceWrite): Promise<StampRecord[]>;
  /** 1-based rank by total reputation, or null when the user has none. */
  rankOf(userId: string): Promise<number | null>;
}
