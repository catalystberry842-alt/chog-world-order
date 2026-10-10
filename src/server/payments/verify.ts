import { parseEventLogs, TransactionReceiptNotFoundError, type Address, type Hash, type Hex, type Log } from "viem";
import { campaignPaymentsAbi, computeCampaignId, PAYMENTS_CHAIN_ID } from "@/lib/contracts/campaign-payments";
import { sameAddress } from "@/lib/passport/address";
import type { ChainReader } from "@/server/payments/chain";
import type { PaymentRecord } from "@/server/payments/store";

export type LogPosition = { txHash: Hash; logIndex: number; blockNumber: bigint; blockHash: Hex };

export type RegistrationEvent = LogPosition & { name: "CampaignRegistered"; campaignId: Hex; owner: Address; salt: Hex };

export type PaymentEvent = LogPosition & {
  name: "CreatorPaid";
  campaignId: Hex;
  creator: Address;
  token: Address;
  amount: bigint;
  payer: Address;
  deliverableRef: Hex;
};

export type ContractEvent = RegistrationEvent | PaymentEvent;

const txHashPattern = /^0x[0-9a-fA-F]{64}$/;

/**
 * Decodes CampaignRegistered and CreatorPaid events emitted by `contract`.
 * Logs from any other address are ignored, so look-alike events from other
 * contracts can never count.
 */
export function decodeContractEvents(logs: Log[], contract: Address): ContractEvent[] {
  const own = logs.filter((log) => sameAddress(log.address, contract) && !log.removed);
  const parsed = parseEventLogs({ abi: campaignPaymentsAbi, logs: own, eventName: ["CampaignRegistered", "CreatorPaid"], strict: true });
  return parsed.flatMap((log): ContractEvent[] => {
    if (log.transactionHash === null || log.logIndex === null || log.blockNumber === null || log.blockHash === null) return [];
    const position = { txHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, blockHash: log.blockHash };
    if (log.eventName === "CampaignRegistered") {
      return [{ ...position, name: "CampaignRegistered", campaignId: log.args.campaignId, owner: log.args.owner, salt: log.args.salt }];
    }
    return [
      {
        ...position,
        name: "CreatorPaid",
        campaignId: log.args.campaignId,
        creator: log.args.creator,
        token: log.args.token,
        amount: log.args.amount,
        payer: log.args.payer,
        deliverableRef: log.args.deliverableRef,
      },
    ];
  });
}

/** Why a payment event does not match the expected payment, or null when it matches. */
export function paymentMismatch(expected: PaymentRecord, event: PaymentEvent): string | null {
  if (event.campaignId.toLowerCase() !== expected.chainCampaignId.toLowerCase()) return "Wrong campaign.";
  if (event.deliverableRef.toLowerCase() !== expected.deliverableRef.toLowerCase()) return "Wrong deliverable reference.";
  if (!sameAddress(event.creator, expected.creatorAddress)) return "Paid to a different address than the accepted creator.";
  if (!sameAddress(event.token, expected.tokenAddress)) return "Paid in a different token than the campaign's.";
  if (event.amount !== expected.amount) return `Paid ${event.amount} base units instead of ${expected.amount}.`;
  if (!sameAddress(event.payer, expected.payerAddress)) return "Paid by a different wallet than the campaign owner.";
  return null;
}

export type TxCheck<T> =
  | { kind: "confirmed"; event: T; confirmations: bigint }
  | { kind: "pending"; reason: string; event?: T }
  | { kind: "failed"; reason: string }
  | { kind: "mismatch"; reason: string; event: T };

const verifiedChains = new WeakMap<object, boolean>();

/** Refuses to verify anything if the RPC is not Monad mainnet. */
export async function assertPaymentsChain(chain: ChainReader) {
  if (verifiedChains.get(chain)) return;
  const id = await chain.getChainId();
  if (id !== PAYMENTS_CHAIN_ID) throw new Error(`RPC is on chain ${id}, expected ${PAYMENTS_CHAIN_ID}.`);
  verifiedChains.set(chain, true);
}

const verifiedContracts = new WeakMap<object, Set<string>>();

/**
 * Proves the configured address is CampaignPayments on Monad before anyone is
 * asked to send funds to it: the RPC must be on chain 143, the address must
 * hold code, and the contract's own computeCampaignId must agree with ours
 * (it hashes block.chainid and address(this)). A typo pointing at a wallet
 * or another contract fails here instead of receiving MON.
 */
export async function assertPaymentsContract(chain: ChainReader, contract: Address) {
  await assertPaymentsChain(chain);
  const known = verifiedContracts.get(chain);
  if (known?.has(contract.toLowerCase())) return;
  const code = await chain.getCode({ address: contract });
  if (!code || code === "0x") throw new Error(`No contract code at ${contract} on Monad.`);
  const probeOwner = "0x000000000000000000000000000000000000c0de" as Address;
  const probeSalt = `0x${"11".repeat(32)}` as Hex;
  let onchain: Hex;
  try {
    onchain = await chain.readContract({ address: contract, abi: campaignPaymentsAbi, functionName: "computeCampaignId", args: [probeOwner, probeSalt] });
  } catch {
    throw new Error(`The contract at ${contract} does not behave like CampaignPayments.`);
  }
  if (onchain.toLowerCase() !== computeCampaignId(contract, probeOwner, probeSalt).toLowerCase()) {
    throw new Error(`The contract at ${contract} is not the expected CampaignPayments deployment.`);
  }
  verifiedContracts.set(chain, (known ?? new Set()).add(contract.toLowerCase()));
}

/** Event fields as strings, for the raw event log. */
export function eventArgs(event: ContractEvent): Record<string, string> {
  const { txHash, logIndex, blockNumber, blockHash, name, ...args } = event;
  void txHash;
  void logIndex;
  void blockNumber;
  void blockHash;
  void name;
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value).toLowerCase()]));
}

async function confirmedReceipt(chain: ChainReader, contract: Address, txHash: string) {
  if (!txHashPattern.test(txHash)) return { error: { kind: "failed" as const, reason: "Not a transaction hash." } };
  try {
    await assertPaymentsChain(chain);
  } catch (error) {
    return { error: { kind: "pending" as const, reason: error instanceof Error ? error.message : "Wrong chain." } };
  }
  let receipt;
  try {
    receipt = await chain.getTransactionReceipt({ hash: txHash as Hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return { error: { kind: "pending" as const, reason: "Transaction not found on Monad yet." } };
    }
    return { error: { kind: "pending" as const, reason: "Could not reach the Monad RPC. Will retry." } };
  }
  if (receipt.status !== "success") return { error: { kind: "failed" as const, reason: "The transaction reverted." } };
  if (!receipt.to || !sameAddress(receipt.to, contract)) {
    return { error: { kind: "failed" as const, reason: "The transaction was not sent to the CampaignPayments contract." } };
  }
  return { receipt, events: decodeContractEvents(receipt.logs as Log[], contract) };
}

async function confirmationsOf(chain: ChainReader, blockNumber: bigint) {
  const head = await chain.getBlockNumber();
  return head >= blockNumber ? head - blockNumber + BigInt(1) : BigInt(0);
}

/**
 * Verifies a payment transaction against the expected payment. A hash from
 * the browser only tells us where to look: the receipt, contract, event
 * fields, and confirmations decide.
 */
export async function checkPaymentTx(
  chain: ChainReader,
  contract: Address,
  expected: PaymentRecord,
  txHash: string,
  minConfirmations: number,
): Promise<TxCheck<PaymentEvent>> {
  const result = await confirmedReceipt(chain, contract, txHash);
  if ("error" in result && result.error) return result.error;
  const event = result.events.find(
    (item): item is PaymentEvent =>
      item.name === "CreatorPaid" &&
      item.campaignId.toLowerCase() === expected.chainCampaignId.toLowerCase() &&
      item.deliverableRef.toLowerCase() === expected.deliverableRef.toLowerCase(),
  );
  if (!event) return { kind: "failed", reason: "The transaction has no CreatorPaid event for this deliverable." };
  const mismatch = paymentMismatch(expected, event);
  const confirmations = await confirmationsOf(chain, event.blockNumber);
  // Nothing is decided on a block that could still be reorganised away, not even a mismatch.
  if (confirmations < BigInt(minConfirmations)) {
    const waiting = `Waiting for confirmations (${confirmations}/${minConfirmations}).`;
    return mismatch ? { kind: "pending", reason: `${waiting} The event does not match the expected payment yet: ${mismatch}` } : { kind: "pending", reason: waiting, event };
  }
  if (mismatch) return { kind: "mismatch", reason: mismatch, event };
  return { kind: "confirmed", event, confirmations };
}

/** Verifies a registration transaction for the expected campaign ID and owner. */
export async function checkRegistrationTx(
  chain: ChainReader,
  contract: Address,
  expected: { chainCampaignId: string; owner: string },
  txHash: string,
  minConfirmations: number,
): Promise<TxCheck<RegistrationEvent>> {
  const result = await confirmedReceipt(chain, contract, txHash);
  if ("error" in result && result.error) return result.error;
  const event = result.events.find(
    (item): item is RegistrationEvent =>
      item.name === "CampaignRegistered" && item.campaignId.toLowerCase() === expected.chainCampaignId.toLowerCase(),
  );
  if (!event) return { kind: "failed", reason: "The transaction has no CampaignRegistered event for this campaign." };
  const depth = await verifyDepth(chain, event, minConfirmations);
  if (depth.kind !== "confirmed") return depth;
  if (!sameAddress(event.owner, expected.owner)) {
    return { kind: "mismatch", reason: "Registered by a different wallet than the campaign owner.", event };
  }
  return depth;
}

async function verifyDepth<T extends LogPosition>(chain: ChainReader, event: T, minConfirmations: number): Promise<TxCheck<T>> {
  const confirmations = await confirmationsOf(chain, event.blockNumber);
  if (confirmations < BigInt(minConfirmations)) {
    return { kind: "pending", reason: `Waiting for confirmations (${confirmations}/${minConfirmations}).`, event };
  }
  return { kind: "confirmed", event, confirmations };
}

/** Looks up a CampaignRegistered event by campaign ID (for interrupted registrations). */
export async function findRegistrationEvent(
  chain: ChainReader,
  contract: Address,
  chainCampaignId: Hex,
  fromBlock: bigint,
): Promise<RegistrationEvent | null> {
  await assertPaymentsChain(chain);
  const logs = await chain.getLogs({
    address: contract,
    event: campaignPaymentsAbi.find((item) => item.type === "event" && item.name === "CampaignRegistered") as Extract<
      (typeof campaignPaymentsAbi)[number],
      { type: "event"; name: "CampaignRegistered" }
    >,
    args: { campaignId: chainCampaignId },
    fromBlock,
    toBlock: "latest",
  });
  const events = decodeContractEvents(logs as Log[], contract);
  return (events.find((event) => event.name === "CampaignRegistered") as RegistrationEvent | undefined) ?? null;
}

export async function registrationDepth(chain: ChainReader, event: RegistrationEvent, minConfirmations: number) {
  return verifyDepth(chain, event, minConfirmations);
}
