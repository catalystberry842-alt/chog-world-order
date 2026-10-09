import { randomUUID } from "node:crypto";
import { DuplicateEvidenceError, NonceReusedError } from "@/server/errors";
import type {
  EvidenceRecord,
  EvidenceUpdate,
  IssuanceWrite,
  NewEvidence,
  PassportStore,
  ReputationRecord,
  SessionRecord,
  StampRecord,
  UserRecord,
  UserRole,
} from "@/server/passport/store";
import type { Address } from "@/lib/types";

/**
 * In-memory store with the same uniqueness rules as the database schema.
 * Used by tests; never used to serve real requests.
 */
export class MemoryPassportStore implements PassportStore {
  users: UserRecord[] = [];
  sessions: SessionRecord[] = [];
  evidence: EvidenceRecord[] = [];
  stamps: StampRecord[] = [];
  reputation: ReputationRecord[] = [];

  private now = () => new Date();

  async findUserByAddress(address: Address) {
    return this.users.find((user) => user.address === address.toLowerCase()) ?? null;
  }

  async findUserById(id: string) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async upsertUser(address: Address) {
    const existing = await this.findUserByAddress(address);
    if (existing) return existing;
    const user: UserRecord = {
      id: randomUUID(),
      address: address.toLowerCase() as Address,
      displayName: null,
      role: "contributor",
      createdAt: this.now(),
    };
    this.users.push(user);
    return user;
  }

  /** Test helper: change a user's role. */
  setRole(userId: string, role: UserRole) {
    const user = this.users.find((item) => item.id === userId);
    if (user) user.role = role;
  }

  async createSession(input: Omit<SessionRecord, "id" | "createdAt" | "revokedAt">) {
    if (this.sessions.some((session) => session.nonce === input.nonce)) throw new NonceReusedError();
    const session: SessionRecord = { ...input, id: randomUUID(), createdAt: this.now(), revokedAt: null };
    this.sessions.push(session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session) return null;
    const user = this.users.find((item) => item.id === session.userId);
    return user ? { session, user } : null;
  }

  async revokeSession(id: string, at: Date) {
    const session = this.sessions.find((item) => item.id === id);
    if (session && !session.revokedAt) session.revokedAt = at;
  }

  async createEvidence(input: NewEvidence) {
    if (this.evidence.some((item) => item.dedupeKey === input.dedupeKey)) throw new DuplicateEvidenceError();
    const record: EvidenceRecord = {
      ...input,
      id: randomUUID(),
      reviewerNote: null,
      reviewerId: null,
      reviewedAt: null,
      verifiedAt: null,
      createdAt: this.now(),
    };
    this.evidence.push(record);
    return { ...record };
  }

  async findEvidence(id: string) {
    const record = this.evidence.find((item) => item.id === id);
    return record ? { ...record } : null;
  }

  async listEvidence(filter: { userId?: string; status?: EvidenceRecord["status"]; limit: number }) {
    return this.evidence
      .filter((item) => (!filter.userId || item.userId === filter.userId) && (!filter.status || item.status === filter.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filter.limit)
      .map((item) => ({ ...item }));
  }

  async updateEvidenceIfStatus(id: string, expectedStatus: EvidenceRecord["status"], update: EvidenceUpdate) {
    const record = this.evidence.find((item) => item.id === id);
    if (!record || record.status !== expectedStatus) return null;
    Object.assign(record, update);
    return { ...record };
  }

  async listStamps(userId: string) {
    return this.stamps.filter((stamp) => stamp.userId === userId).map((stamp) => ({ ...stamp }));
  }

  async listReputation(userId: string) {
    return this.reputation.filter((event) => event.userId === userId).map((event) => ({ ...event }));
  }

  async listVerifiedEvidence(userId: string) {
    return this.evidence
      .filter((item) => item.userId === userId && item.status === "verified")
      .map(({ id, kind, occurredAt }) => ({ id, kind, occurredAt }));
  }

  async writeIssuance(write: IssuanceWrite) {
    const created: StampRecord[] = [];
    const now = this.now();

    if (
      write.contribution &&
      !this.reputation.some((event) => event.evidenceId === write.evidenceId && event.kind === "contribution-verified")
    ) {
      this.reputation.push({
        id: randomUUID(),
        userId: write.userId,
        kind: "contribution-verified",
        points: write.contribution.points,
        source: write.contribution.source,
        reason: "Verified contribution",
        evidenceId: write.evidenceId,
        stampId: null,
        createdAt: now,
      });
    }

    for (const stamp of write.stamps) {
      const duplicate = this.stamps.some(
        (item) =>
          (item.userId === write.userId && item.category === stamp.category) ||
          (item.evidenceId === write.evidenceId && item.category === stamp.category),
      );
      if (duplicate) continue;
      const record: StampRecord = {
        id: randomUUID(),
        userId: write.userId,
        category: stamp.category,
        evidenceId: write.evidenceId,
        issuedAt: now,
        issuedById: write.issuedById,
      };
      this.stamps.push(record);
      this.reputation.push({
        id: randomUUID(),
        userId: write.userId,
        kind: "stamp-issued",
        points: stamp.points,
        source: "stamps",
        reason: "Stamp issued",
        evidenceId: null,
        stampId: record.id,
        createdAt: now,
      });
      created.push({ ...record });
    }
    return created;
  }

  async rankOf(userId: string) {
    const totals = new Map<string, number>();
    for (const event of this.reputation) totals.set(event.userId, (totals.get(event.userId) ?? 0) + event.points);
    const mine = totals.get(userId) ?? 0;
    if (mine <= 0) return null;
    return [...totals.values()].filter((total) => total > mine).length + 1;
  }
}
