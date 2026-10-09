import { randomUUID } from "node:crypto";
import {
  ProofAlreadyUsedError,
  type ChainEventInput,
  type PaymentIntentInput,
  type PaymentRecord,
  type PaymentStatus,
  type PaymentStore,
  type PaymentUpdate,
} from "@/server/payments/store";

/** In-memory payment store with the same uniqueness rules as the database. Tests only. */
export class MemoryPaymentStore implements PaymentStore {
  payments: PaymentRecord[] = [];
  events: (ChainEventInput & { id: string; outcome: string | null })[] = [];
  cursors = new Map<string, bigint>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createOrGetIntent(input: PaymentIntentInput) {
    const existing = this.payments.find((payment) => payment.deliverableId === input.deliverableId);
    if (existing) return { ...existing };
    const record: PaymentRecord = {
      ...input,
      id: randomUUID(),
      status: "awaiting-transaction",
      submittedTxHash: null,
      txHash: null,
      logIndex: null,
      blockNumber: null,
      blockHash: null,
      failureReason: null,
      confirmedAt: null,
      createdAt: this.now(),
    };
    this.payments.push(record);
    return { ...record };
  }

  async findPayment(id: string) {
    const payment = this.payments.find((item) => item.id === id);
    return payment ? { ...payment } : null;
  }

  async findPaymentByDeliverable(deliverableId: string) {
    const payment = this.payments.find((item) => item.deliverableId === deliverableId);
    return payment ? { ...payment } : null;
  }

  async findPaymentByRef(chainCampaignId: string, deliverableRef: string) {
    const payment = this.payments.find(
      (item) => item.chainCampaignId === chainCampaignId.toLowerCase() && item.deliverableRef === deliverableRef.toLowerCase(),
    );
    return payment ? { ...payment } : null;
  }

  async listPaymentsByDeliverables(deliverableIds: string[]) {
    return this.payments.filter((item) => deliverableIds.includes(item.deliverableId)).map((item) => ({ ...item }));
  }

  async updatePaymentIfStatus(id: string, expected: PaymentStatus[], update: PaymentUpdate) {
    const payment = this.payments.find((item) => item.id === id);
    if (!payment || !expected.includes(payment.status)) return null;
    if (
      update.txHash &&
      update.logIndex !== undefined &&
      this.payments.some((item) => item.id !== id && item.txHash === update.txHash && item.logIndex === update.logIndex)
    ) {
      throw new ProofAlreadyUsedError();
    }
    Object.assign(payment, update);
    return { ...payment };
  }

  async recordChainEvent(event: ChainEventInput) {
    const existing = this.events.find(
      (item) => item.chainId === event.chainId && item.txHash === event.txHash && item.logIndex === event.logIndex,
    );
    if (existing) return { id: existing.id, created: false, outcome: existing.outcome };
    const record = { ...event, id: randomUUID(), outcome: null };
    this.events.push(record);
    return { id: record.id, created: true, outcome: null };
  }

  async setChainEventOutcome(id: string, outcome: string) {
    const event = this.events.find((item) => item.id === id);
    if (event) event.outcome = outcome;
  }

  async getCursor(key: string) {
    return this.cursors.get(key) ?? null;
  }

  async setCursor(key: string, block: bigint) {
    this.cursors.set(key, block);
  }
}
