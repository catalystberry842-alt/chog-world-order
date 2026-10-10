import { randomUUID } from "node:crypto";
import { DuplicateEvidenceError, NonceReusedError } from "@/server/errors";
import type {
  EvidenceRecord,
  EvidenceUpdate,
  IssuanceWrite,
  LeaderboardRow,
  NewEvidence,
  PassportStore,
  ReputationRecord,
  ReputationWrite,
  SessionRecord,
  SnapshotRecord,
  SnapshotWrite,
  StampRecord,
  UserRecord,
  UserRole,
  VerifiedEvidenceRow,
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
  snapshots: SnapshotRecord[] = [];

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
      verificationData: input.verificationData ?? null,
      reviewerNote: null,
      reviewerId: input.reviewerId ?? null,
      reviewedAt: input.reviewedAt ?? null,
      verifiedAt: input.verifiedAt ?? null,
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

  async listVerifiedEvidence(userId: string): Promise<VerifiedEvidenceRow[]> {
    return this.evidence
      .filter((item) => item.userId === userId && item.status === "verified")
      .map(({ id, kind, occurredAt, verifiedAt, createdAt }) => ({ id, kind, occurredAt, verifiedAt: verifiedAt ?? createdAt }));
  }

  async writeIssuance(write: IssuanceWrite) {
    const created: StampRecord[] = [];
    for (const category of write.stamps) {
      const duplicate = this.stamps.some(
        (item) =>
          (item.userId === write.userId && item.category === category) ||
          (item.evidenceId === write.evidenceId && item.category === category),
      );
      if (duplicate) continue;
      const record: StampRecord = {
        id: randomUUID(),
        userId: write.userId,
        category,
        evidenceId: write.evidenceId,
        issuedAt: this.now(),
        issuedById: write.issuedById,
      };
      this.stamps.push(record);
      created.push({ ...record });
    }
    return created;
  }

  async listReputation(userId: string) {
    return this.reputation.filter((event) => event.userId === userId).map((event) => ({ ...event }));
  }

  async updateLedger(
    userId: string,
    decide: (state: { ledger: ReputationRecord[]; verified: VerifiedEvidenceRow[] }) => {
      writes: ReputationWrite[];
      snapshot: SnapshotWrite | null;
    },
  ) {
    // Single-threaded: the read-decide-write sequence below cannot interleave.
    const { writes, snapshot } = decide({
      ledger: await this.listReputation(userId),
      verified: await this.listVerifiedEvidence(userId),
    });
    for (const write of writes) {
      if (this.reputation.some((event) => event.dedupeKey === write.dedupeKey)) {
        throw new Error(`unique violation: dedupeKey ${write.dedupeKey}`);
      }
      if (write.reversesEventId && this.reputation.some((event) => event.reversesEventId === write.reversesEventId)) {
        throw new Error(`unique violation: reversesEventId ${write.reversesEventId}`);
      }
    }
    const now = this.now();
    const created = writes.map((write) => ({ ...write, id: randomUUID(), userId, createdAt: now }));
    this.reputation.push(...created);
    if (snapshot) this.snapshots.push({ ...snapshot, id: randomUUID(), userId, createdAt: now });
    return created.map((event) => ({ ...event }));
  }

  async listSnapshots(userId: string, limit: number) {
    return this.snapshots
      .filter((snapshot) => snapshot.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async listUsersWithReputationData() {
    const ids = new Set([
      ...this.evidence.filter((item) => item.status === "verified").map((item) => item.userId),
      ...this.reputation.map((event) => event.userId),
    ]);
    return [...ids].sort();
  }

  private totals(category: string | null) {
    const totals = new Map<string, { points: number; total: number }>();
    for (const event of this.reputation) {
      const entry = totals.get(event.userId) ?? { points: 0, total: 0 };
      entry.total += event.points;
      if (!category || event.category === category) entry.points += event.points;
      totals.set(event.userId, entry);
    }
    return totals;
  }

  async rankOf(userId: string) {
    const totals = this.totals(null);
    const mine = totals.get(userId)?.total ?? 0;
    if (mine <= 0) return null;
    return [...totals.values()].filter((entry) => entry.total > mine).length + 1;
  }

  async leaderboard(input: { category: string | null; skip: number; take: number }) {
    const rows: LeaderboardRow[] = [...this.totals(input.category)]
      .filter(([, entry]) => entry.points > 0)
      .map(([userId, entry]) => {
        const user = this.users.find((item) => item.id === userId);
        return {
          userId,
          address: user?.address ?? ("0x" as Address),
          displayName: user?.displayName ?? null,
          points: entry.points,
          total: entry.total,
          verifiedCount: this.evidence.filter((item) => item.userId === userId && item.status === "verified").length,
        };
      })
      .sort((a, b) => b.points - a.points || (a.userId < b.userId ? -1 : 1));
    return { rows: rows.slice(input.skip, input.skip + input.take), total: rows.length };
  }
}
