export type PaymentStatus = "awaiting-transaction" | "pending-confirmation" | "confirmed" | "failed" | "mismatch";

export type PaymentRecord = {
  id: string;
  campaignId: string;
  deliverableId: string;
  chainId: number;
  contractAddress: string;
  chainCampaignId: string;
  tokenAddress: string;
  tokenKey: string;
  /** Expected amount, base units. */
  amount: bigint;
  creatorAddress: string;
  payerAddress: string;
  deliverableRef: string;
  status: PaymentStatus;
  submittedTxHash: string | null;
  txHash: string | null;
  logIndex: number | null;
  blockNumber: bigint | null;
  blockHash: string | null;
  failureReason: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
};

export type PaymentIntentInput = Pick<
  PaymentRecord,
  | "campaignId"
  | "deliverableId"
  | "chainId"
  | "contractAddress"
  | "chainCampaignId"
  | "tokenAddress"
  | "tokenKey"
  | "amount"
  | "creatorAddress"
  | "payerAddress"
  | "deliverableRef"
>;

export type PaymentUpdate = Partial<
  Pick<
    PaymentRecord,
    | "status"
    | "submittedTxHash"
    | "txHash"
    | "logIndex"
    | "blockNumber"
    | "blockHash"
    | "failureReason"
    | "confirmedAt"
    | "tokenAddress"
    | "tokenKey"
    | "amount"
    | "creatorAddress"
    | "payerAddress"
    | "chainCampaignId"
    | "contractAddress"
  >
>;

export type ChainEventInput = {
  chainId: number;
  contractAddress: string;
  eventName: string;
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  args: Record<string, string>;
};

/** Thrown when a (txHash, logIndex) pair is already the proof of another payment. */
export class ProofAlreadyUsedError extends Error {
  constructor() {
    super("This on-chain payment is already recorded for another deliverable.");
  }
}

export interface PaymentStore {
  /** Creates the intent for a deliverable, or returns the existing one (one per deliverable). */
  createOrGetIntent(input: PaymentIntentInput): Promise<PaymentRecord>;
  findPayment(id: string): Promise<PaymentRecord | null>;
  findPaymentByDeliverable(deliverableId: string): Promise<PaymentRecord | null>;
  findPaymentByRef(chainCampaignId: string, deliverableRef: string): Promise<PaymentRecord | null>;
  listPaymentsByDeliverables(deliverableIds: string[]): Promise<PaymentRecord[]>;
  /** Updates only if the payment is in one of `expected`. Throws ProofAlreadyUsedError on a reused proof. */
  updatePaymentIfStatus(id: string, expected: PaymentStatus[], update: PaymentUpdate): Promise<PaymentRecord | null>;

  /** Stores a raw event once. `created` is false when the log was already recorded. */
  recordChainEvent(event: ChainEventInput): Promise<{ id: string; created: boolean; outcome: string | null }>;
  setChainEventOutcome(id: string, outcome: string): Promise<void>;
  getCursor(key: string): Promise<bigint | null>;
  setCursor(key: string, block: bigint): Promise<void>;
}
