import "server-only";
import {
  Prisma,
  type PrismaClient,
  type Evidence as EvidenceRow,
  type PassportStamp as StampRow,
  type ReputationEvent as ReputationRow,
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
  NewEvidence,
  PassportStore,
  ReputationRecord,
  SessionRecord,
  StampRecord,
  UserRecord,
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
  occurredAt: row.occurredAt,
  statusReason: row.statusReason,
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

const mapReputation = (row: ReputationRow): ReputationRecord => ({
  id: row.id,
  userId: row.userId,
  kind: fromDb(row.kind),
  points: row.points,
  source: row.source,
  reason: row.reason,
  evidenceId: row.evidenceId,
  stampId: row.stampId,
  createdAt: row.createdAt,
});

function evidenceUpdateData(update: EvidenceUpdate): Prisma.EvidenceUpdateManyMutationInput {
  const { status, ...rest } = update;
  return { ...rest, ...(status ? { status: toDb(status) as EvidenceRow["status"] } : {}) };
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
          occurredAt: input.occurredAt,
          statusReason: input.statusReason,
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

  async listReputation(userId: string) {
    const rows = await this.db.reputationEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapReputation);
  }

  async listVerifiedEvidence(userId: string) {
    const rows = await this.db.evidence.findMany({
      where: { userId, status: "VERIFIED" },
      select: { id: true, kind: true, occurredAt: true },
    });
    return rows.map((row) => ({ id: row.id, kind: fromDb<EvidenceKind>(row.kind), occurredAt: row.occurredAt }));
  }

  async writeIssuance(write: IssuanceWrite) {
    return this.db.$transaction(async (tx) => {
      if (write.contribution) {
        // Unique (evidenceId, kind): a second call inserts nothing.
        await tx.reputationEvent.createMany({
          data: [
            {
              userId: write.userId,
              kind: "CONTRIBUTION_VERIFIED",
              points: write.contribution.points,
              source: write.contribution.source,
              reason: "Verified contribution",
              evidenceId: write.evidenceId,
            },
          ],
          skipDuplicates: true,
        });
      }

      const created: StampRecord[] = [];
      for (const stamp of write.stamps) {
        // ON CONFLICT DO NOTHING on (userId, category) and (evidenceId, category):
        // only stamps that did not exist yet come back.
        const rows = await tx.passportStamp.createManyAndReturn({
          data: [
            {
              userId: write.userId,
              category: toDb(stamp.category) as StampRow["category"],
              evidenceId: write.evidenceId,
              issuedById: write.issuedById,
            },
          ],
          skipDuplicates: true,
        });
        for (const row of rows) {
          await tx.reputationEvent.create({
            data: {
              userId: write.userId,
              kind: "STAMP_ISSUED",
              points: stamp.points,
              source: "stamps",
              reason: "Stamp issued",
              stampId: row.id,
            },
          });
          created.push(mapStamp(row));
        }
      }
      return created;
    });
  }

  async rankOf(userId: string) {
    const totals = await this.db.reputationEvent.groupBy({ by: ["userId"], _sum: { points: true } });
    const mine = totals.find((row) => row.userId === userId)?._sum.points ?? 0;
    if (mine <= 0) return null;
    return totals.filter((row) => (row._sum.points ?? 0) > mine).length + 1;
  }
}
