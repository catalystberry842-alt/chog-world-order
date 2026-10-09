import "server-only";
import {
  Prisma,
  type PrismaClient,
  type CampaignPayment as PaymentRow,
} from "@/generated/prisma/client";
import {
  ProofAlreadyUsedError,
  type ChainEventInput,
  type PaymentIntentInput,
  type PaymentRecord,
  type PaymentStatus,
  type PaymentStore,
  type PaymentUpdate,
} from "@/server/payments/store";

const toDb = (value: string) => value.toUpperCase().replace(/-/g, "_") as PaymentRow["status"];
const fromDb = (value: string) => value.toLowerCase().replace(/_/g, "-") as PaymentStatus;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const map = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  campaignId: row.campaignId,
  deliverableId: row.deliverableId,
  chainId: row.chainId,
  contractAddress: row.contractAddress,
  chainCampaignId: row.chainCampaignId,
  tokenAddress: row.tokenAddress,
  tokenKey: row.tokenKey,
  amount: BigInt(row.amount.toFixed(0)),
  creatorAddress: row.creatorAddress,
  payerAddress: row.payerAddress,
  deliverableRef: row.deliverableRef,
  status: fromDb(row.status),
  submittedTxHash: row.submittedTxHash,
  txHash: row.txHash,
  logIndex: row.logIndex,
  blockNumber: row.blockNumber,
  blockHash: row.blockHash,
  failureReason: row.failureReason,
  confirmedAt: row.confirmedAt,
  createdAt: row.createdAt,
});

export class PrismaPaymentStore implements PaymentStore {
  constructor(private readonly db: PrismaClient) {}

  async createOrGetIntent(input: PaymentIntentInput) {
    try {
      return map(
        await this.db.campaignPayment.create({
          data: { ...input, amount: new Prisma.Decimal(input.amount.toString()) },
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.db.campaignPayment.findUnique({ where: { deliverableId: input.deliverableId } });
      if (!existing) throw error;
      return map(existing);
    }
  }

  async findPayment(id: string) {
    const row = await this.db.campaignPayment.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async findPaymentByDeliverable(deliverableId: string) {
    const row = await this.db.campaignPayment.findUnique({ where: { deliverableId } });
    return row ? map(row) : null;
  }

  async findPaymentByRef(chainCampaignId: string, deliverableRef: string) {
    const row = await this.db.campaignPayment.findFirst({
      where: { chainCampaignId: chainCampaignId.toLowerCase(), deliverableRef: deliverableRef.toLowerCase() },
    });
    return row ? map(row) : null;
  }

  async listPaymentsByDeliverables(deliverableIds: string[]) {
    const rows = await this.db.campaignPayment.findMany({ where: { deliverableId: { in: deliverableIds } } });
    return rows.map(map);
  }

  async updatePaymentIfStatus(id: string, expected: PaymentStatus[], update: PaymentUpdate) {
    const { status, amount, ...rest } = update;
    try {
      const result = await this.db.campaignPayment.updateMany({
        where: { id, status: { in: expected.map(toDb) } },
        data: {
          ...rest,
          ...(status ? { status: toDb(status) } : {}),
          ...(amount !== undefined ? { amount: new Prisma.Decimal(amount.toString()) } : {}),
        },
      });
      if (result.count === 0) return null;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ProofAlreadyUsedError();
      throw error;
    }
    return this.findPayment(id);
  }

  async recordChainEvent(event: ChainEventInput) {
    try {
      const row = await this.db.chainEvent.create({ data: event });
      return { id: row.id, created: true, outcome: null };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.db.chainEvent.findUnique({
        where: { chainId_txHash_logIndex: { chainId: event.chainId, txHash: event.txHash, logIndex: event.logIndex } },
      });
      if (!existing) throw error;
      return { id: existing.id, created: false, outcome: existing.outcome };
    }
  }

  async setChainEventOutcome(id: string, outcome: string) {
    await this.db.chainEvent.update({ where: { id }, data: { outcome } });
  }

  async getCursor(key: string) {
    return (await this.db.indexerCursor.findUnique({ where: { id: key } }))?.lastBlock ?? null;
  }

  async setCursor(key: string, block: bigint) {
    await this.db.indexerCursor.upsert({ where: { id: key }, create: { id: key, lastBlock: block }, update: { lastBlock: block } });
  }
}
