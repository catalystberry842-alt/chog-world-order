import type { Log } from "viem";
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments";
import type { ChainReader } from "@/server/payments/chain";
import { applyPaymentEvent, applyRegistrationEvent } from "@/server/payments/service";
import { assertPaymentsContract, decodeContractEvents, eventArgs } from "@/server/payments/verify";
import type { Services } from "@/server/services";

const CURSOR_KEY = "campaign-payments";
/** Blocks re-scanned on every run, so events missed during an outage or reorg are picked up. */
export const RECONCILE_WINDOW = BigInt(500);
/** Largest block range requested per getLogs call. */
export const MAX_RANGE = BigInt(2_000);

const contractEvents = campaignPaymentsAbi.filter(
  (item) => item.type === "event" && (item.name === "CampaignRegistered" || item.name === "CreatorPaid"),
);

export type IndexerResult =
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string; cursor: string | null }
  | {
      status: "ok";
      fromBlock: string;
      toBlock: string;
      cursor: string;
      eventsSeen: number;
      eventsNew: number;
      outcomes: Record<string, number>;
      caughtUp: boolean;
    };

/**
 * Indexes CampaignRegistered and CreatorPaid events, then applies them.
 *
 * - Only blocks with the configured number of confirmations are read, so
 *   every applied event already satisfies the confirmation policy.
 * - Each run re-scans the last RECONCILE_WINDOW blocks; raw events are unique
 *   per (chain, tx, log index), so re-processing is harmless.
 * - On any RPC error the cursor is not advanced: the next run retries the
 *   same range. Safe to run after restarts and concurrently with on-demand
 *   verification, because every write is conditional or unique.
 */
export async function runIndexer(services: Services, options: { maxRange?: bigint } = {}): Promise<IndexerResult> {
  const contract = services.config.paymentsContract;
  if (!contract.enabled) return { status: "unavailable", reason: contract.reason };
  if (!services.payments || !services.collabs) return { status: "unavailable", reason: "No database configured." };
  if (!services.chain) return { status: "unavailable", reason: "MONAD_RPC_URL is not configured." };
  // Scanning from block 0 would never catch up with Monad's head.
  if (services.config.paymentsDeployBlock === null) {
    return { status: "unavailable", reason: "CAMPAIGN_PAYMENTS_DEPLOY_BLOCK is not configured." };
  }
  const chain: ChainReader = services.chain;
  const payments = services.payments;
  const maxRange = options.maxRange ?? MAX_RANGE;

  const cursor = await payments.getCursor(CURSOR_KEY);
  try {
    await assertPaymentsContract(chain, contract.address);

    const head = await chain.getBlockNumber();
    const confirmed = head - BigInt(services.config.paymentConfirmations - 1);
    const start = services.config.paymentsDeployBlock;
    let fromBlock = cursor === null ? start : cursor + BigInt(1) - RECONCILE_WINDOW;
    if (fromBlock < start) fromBlock = start;
    if (confirmed < fromBlock) {
      return { status: "ok", fromBlock: fromBlock.toString(), toBlock: confirmed.toString(), cursor: (cursor ?? start).toString(), eventsSeen: 0, eventsNew: 0, outcomes: {}, caughtUp: true };
    }
    const toBlock = fromBlock + maxRange - BigInt(1) < confirmed ? fromBlock + maxRange - BigInt(1) : confirmed;

    const logs = await chain.getLogs({ address: contract.address, events: contractEvents, fromBlock, toBlock });
    const events = decodeContractEvents(logs as Log[], contract.address).sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );

    const outcomes: Record<string, number> = {};
    let eventsNew = 0;
    for (const event of events) {
      const recorded = await payments.recordChainEvent({
        chainId: contract.chainId,
        contractAddress: contract.address,
        eventName: event.name,
        txHash: event.txHash.toLowerCase(),
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash.toLowerCase(),
        args: eventArgs(event),
      });
      if (recorded.created) eventsNew += 1;
      const outcome = event.name === "CampaignRegistered" ? await applyRegistrationEvent(services, event) : await applyPaymentEvent(services, event);
      // The first outcome is kept: later runs only see the event again.
      if (recorded.outcome === null) await payments.setChainEventOutcome(recorded.id, outcome);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }

    const nextCursor = cursor !== null && cursor > toBlock ? cursor : toBlock;
    await payments.setCursor(CURSOR_KEY, nextCursor);
    return {
      status: "ok",
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      cursor: nextCursor.toString(),
      eventsSeen: events.length,
      eventsNew,
      outcomes,
      caughtUp: toBlock === confirmed,
    };
  } catch (error) {
    // Cursor unchanged: the same range is retried next run.
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Indexer failed.",
      cursor: cursor?.toString() ?? null,
    };
  }
}
