import "server-only";
import {
  Prisma,
  type PrismaClient,
  type Evidence as EvidenceRow,
  type PassportStamp as StampRow,
  type ReputationEvent as ReputationRow,
  type ReputationSnapshot as SnapshotRow,
  type User as UserRow,
  type WalletSession as SessionRow,
} from "@/generated/prisma/client";
import type { Address } from "@/lib/types";
import type { EvidenceKind, StampCategory, VerificationMethod, VerificationStatus } from "@/lib/passport/types";
import { DuplicateEvidenceError, NonceReusedError } from "@/server/errors";
import type {
  EvidenceRecord,
  EvidenceUpdate,
  IssuanceWrite,
  LeaderboardRow,
  NewEvidence,
  PassportStore,
  ReputationEventKind,
  ReputationRecord,
  ReputationWrite,
  SessionRecord,
  SnapshotRecord,
  SnapshotWrite,
  StampRecord,
  UserRecord,
  VerifiedEvidenceRow,
} from "@/server/passport/store";

// Enum mapping between database (UPPER_SNAKE) and domain (kebab-case) values.
const toDb = (value: string) => value.toUpperCase().replace(/-/g, "_");
const fromDb = <T extends string>(value: string) => value.toLowerCase().replace(/_/g, "-") as T;

const isUniqueViolation = (error: unknown, field: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  JSON.stringify(error.meta ?? {}).includes(field);

const mapUser = (row: UserRow): UserRecord => ({
  id: row.id,
  address: row.address as Address,
  displayName: row.displayName,
  role: fromDb(row.role),
  createdAt: row.createdAt,
});

const mapSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  userId: row.userId,
  tokenHash: row.tokenHash,
  nonce: row.nonce,
  chainId: row.chainId,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
});

const mapEvidence = (row: EvidenceRow): EvidenceRecord => ({
  id: row.id,
  userId: row.userId,
  kind: fromDb<EvidenceKind>(row.kind),
  method: fromDb<VerificationMethod>(row.verificationMethod),
  status: fromDb<VerificationStatus>(row.status),
  title: row.title,
  summary: row.summary,
  reference: row.reference,
  dedupeKey: row.dedupeKey,
  chainId: row.chainId,
  txHash: row.txHash,
  appId: row.appId,
  category: row.category,
  occurredAt: row.occurredAt,
  statusReason: row.statusReason,
  verificationData: (row.verificationData as Record<string, string | number> | null) ?? null,
  reviewerNote: row.reviewerNote,
  reviewerId: row.reviewerId,
  reviewedAt: row.reviewedAt,
  verifiedAt: row.verifiedAt,
  createdAt: row.createdAt,
});

const mapStamp = (row: StampRow): StampRecord => ({
  id: row.id,
  userId: row.userId,
  category: fromDb<StampCategory>(row.category),
  evidenceId: row.evidenceId,
  issuedAt: row.issuedAt,
  issuedById: row.issuedById,
});

const eventKindToDb: Record<ReputationEventKind, ReputationRow["kind"]> = {
  contribution: "CONTRIBUTION",
  consistency: "CONSISTENCY_BONUS",
  adjustment: "ADJUSTMENT",
  reversal: "REVERSAL",
};
const eventKindFromDb = Object.fromEntries(Object.entries(eventKindToDb).map(([k, v]) => [v, k])) as Record<
  ReputationRow["kind"],
  ReputationEventKind
>;

const mapReputation = (row: ReputationRow): ReputationRecord => ({
  id: row.id,
  userId: row.userId,
  kind: eventKindFromDb[row.kind],
  points: row.points,
  category: row.category,
  reason: row.reason,
  planKey: row.planKey,
  dedupeKey: row.dedupeKey,
  calculationVersion: row.calculationVersion,
  evidenceId: row.evidenceId,
  periodKey: row.periodKey,
  reversesEventId: row.reversesEventId,
  actorId: row.actorId,
  createdAt: row.createdAt,
});

const mapSnapshot = (row: SnapshotRow): SnapshotRecord => ({
  id: row.id,
  userId: row.userId,
  total: row.total,
  breakdown: row.breakdown as Record<string, number>,
  tier: row.tier,
  calculationVersion: row.calculationVersion,
  cause: fromDb(row.cause),
  eventCount: row.eventCount,
  triggeredById: row.triggeredById,
  createdAt: row.createdAt,
});

function evidenceUpdateData(update: EvidenceUpdate): Prisma.EvidenceUpdateManyMutationInput {
  const { status, verificationData, ...rest } = update;
  return {
    ...rest,
    ...(status ? { status: toDb(status) as EvidenceRow["status"] } : {}),
    ...(verificationData !== undefined ? { verificationData: verificationData ?? Prisma.DbNull } : {}),
  };
}

export class PrismaPassportStore implements PassportStore {
  constructor(private readonly db: PrismaClient) {}

  async findUserByAddress(address: Address) {
    const row = await this.db.user.findUnique({ where: { address: address.toLowerCase() } });
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string) {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async upsertUser(address: Address) {
    const lower = address.toLowerCase();
    const row = await this.db.user.upsert({ where: { address: lower }, create: { address: lower }, update: {} });
    return mapUser(row);
  }

  async createSession(input: Omit<SessionRecord, "id" | "createdAt" | "revokedAt">) {
    try {
      return mapSession(await this.db.walletSession.create({ data: input }));
    } catch (error) {
      if (isUniqueViolation(error, "nonce")) throw new NonceReusedError();
      throw error;
    }
  }

  async findSessionByTokenHash(tokenHash: string) {
    const row = await this.db.walletSession.findUnique({ where: { tokenHash }, include: { user: true } });
    return row ? { session: mapSession(row), user: mapUser(row.user) } : null;
  }

  async revokeSession(id: string, at: Date) {
    await this.db.walletSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
  }

  async createEvidence(input: NewEvidence) {
    try {
      const row = await this.db.evidence.create({
        data: {
          userId: input.userId,
          kind: toDb(input.kind) as EvidenceRow["kind"],
          verificationMethod: toDb(input.method) as EvidenceRow["verificationMethod"],
          status: toDb(input.status) as EvidenceRow["status"],
          title: input.title,
          summary: input.summary,
          reference: input.reference,
          dedupeKey: input.dedupeKey,
          chainId: input.chainId,
          txHash: input.txHash,
          appId: input.appId,
          category: input.category,
          occurredAt: input.occurredAt,
          statusReason: input.statusReason,
          verificationData: input.verificationData ?? Prisma.DbNull,
          reviewerId: input.reviewerId ?? null,
          reviewedAt: input.reviewedAt ?? null,
          verifiedAt: input.verifiedAt ?? null,
        },
      });
      return mapEvidence(row);
    } catch (error) {
      if (isUniqueViolation(error, "dedupeKey")) throw new DuplicateEvidenceError();
      throw error;
    }
  }

  async findEvidence(id: string) {
    const row = await this.db.evidence.findUnique({ where: { id } });
    return row ? mapEvidence(row) : null;
  }

  async listEvidence(filter: { userId?: string; status?: VerificationStatus; limit: number }) {
    const rows = await this.db.evidence.findMany({
      where: {
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.status ? { status: toDb(filter.status) as EvidenceRow["status"] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit,
    });
    return rows.map(mapEvidence);
  }

  async updateEvidenceIfStatus(id: string, expectedStatus: VerificationStatus, update: EvidenceUpdate) {
    const result = await this.db.evidence.updateMany({
      where: { id, status: toDb(expectedStatus) as EvidenceRow["status"] },
      data: evidenceUpdateData(update),
    });
    if (result.count === 0) return null;
    return this.findEvidence(id);
  }

  async listStamps(userId: string) {
    const rows = await this.db.passportStamp.findMany({ where: { userId }, orderBy: { issuedAt: "desc" } });
    return rows.map(mapStamp);
  }

  async listVerifiedEvidence(userId: string): Promise<VerifiedEvidenceRow[]> {
    const rows = await this.db.evidence.findMany({
      where: { userId, status: "VERIFIED" },
      select: { id: true, kind: true, occurredAt: true, verifiedAt: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: fromDb<EvidenceKind>(row.kind),
      occurredAt: row.occurredAt,
      verifiedAt: row.verifiedAt ?? row.createdAt,
    }));
  }

  async writeIssuance(write: IssuanceWrite) {
    if (write.stamps.length === 0) return [];
    // ON CONFLICT DO NOTHING on (userId, category) and (evidenceId, category):
    // only stamps that did not exist yet come back.
    const rows = await this.db.passportStamp.createManyAndReturn({
      data: write.stamps.map((category) => ({
        userId: write.userId,
        category: toDb(category) as StampRow["category"],
        evidenceId: write.evidenceId,
        issuedById: write.issuedById,
      })),
      skipDuplicates: true,
    });
    return rows.map(mapStamp);
  }

  async listReputation(userId: string) {
    const rows = await this.db.reputationEvent.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(mapReputation);
  }

  async updateLedger(
    userId: string,
    decide: (state: { ledger: ReputationRecord[]; verified: VerifiedEvidenceRow[] }) => {
      writes: ReputationWrite[];
      snapshot: SnapshotWrite | null;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      // Serialise ledger updates per user for the duration of this transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reputation:${userId}`}))`;
      const [ledgerRows, verifiedRows] = await Promise.all([
        tx.reputationEvent.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        tx.evidence.findMany({
          where: { userId, status: "VERIFIED" },
          select: { id: true, kind: true, occurredAt: true, verifiedAt: true, createdAt: true },
        }),
      ]);
      const { writes, snapshot } = decide({
        ledger: ledgerRows.map(mapReputation),
        verified: verifiedRows.map((row) => ({
          id: row.id,
          kind: fromDb<EvidenceKind>(row.kind),
          occurredAt: row.occurredAt,
          verifiedAt: row.verifiedAt ?? row.createdAt,
        })),
      });
      const created: ReputationRecord[] = [];
      for (const write of writes) {
        const row = await tx.reputationEvent.create({
          data: { ...write, userId, kind: eventKindToDb[write.kind] },
        });
        created.push(mapReputation(row));
      }
      if (snapshot) {
        await tx.reputationSnapshot.create({
          data: { ...snapshot, userId, cause: toDb(snapshot.cause) as SnapshotRow["cause"] },
        });
      }
      return created;
    });
  }

  async listSnapshots(userId: string, limit: number) {
    const rows = await this.db.reputationSnapshot.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map(mapSnapshot);
  }

  async listUsersWithReputationData() {
    const [evidence, events] = await Promise.all([
      this.db.evidence.findMany({ where: { status: "VERIFIED" }, select: { userId: true }, distinct: ["userId"] }),
      this.db.reputationEvent.findMany({ select: { userId: true }, distinct: ["userId"] }),
    ]);
    return [...new Set([...evidence, ...events].map((row) => row.userId))].sort();
  }

  async rankOf(userId: string) {
    const totals = await this.db.reputationEvent.groupBy({ by: ["userId"], _sum: { points: true } });
    const mine = totals.find((row) => row.userId === userId)?._sum.points ?? 0;
    if (mine <= 0) return null;
    return totals.filter((row) => (row._sum.points ?? 0) > mine).length + 1;
  }

  async leaderboard(input: { category: string | null; skip: number; take: number }) {
    const where = input.category ? { category: input.category } : {};
    const [page, all] = await Promise.all([
      this.db.reputationEvent.groupBy({
        by: ["userId"],
        where,
        _sum: { points: true },
        having: { points: { _sum: { gt: 0 } } },
        orderBy: [{ _sum: { points: "desc" } }, { userId: "asc" }],
        skip: input.skip,
        take: input.take,
      }),
      this.db.reputationEvent.groupBy({ by: ["userId"], where, having: { points: { _sum: { gt: 0 } } } }),
    ]);
    const ids = page.map((row) => row.userId);
    const [users, totals, counts] = await Promise.all([
      this.db.user.findMany({ where: { id: { in: ids } } }),
      this.db.reputationEvent.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _sum: { points: true } }),
      this.db.evidence.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: "VERIFIED" }, _count: { _all: true } }),
    ]);
    const rows: LeaderboardRow[] = page.map((row) => {
      const user = users.find((item) => item.id === row.userId);
      return {
        userId: row.userId,
        address: (user?.address ?? "0x") as Address,
        displayName: user?.displayName ?? null,
        points: row._sum.points ?? 0,
        total: totals.find((item) => item.userId === row.userId)?._sum.points ?? 0,
        verifiedCount: counts.find((item) => item.userId === row.userId)?._count._all ?? 0,
      };
    });
    return { rows, total: all.length };
  }
}
