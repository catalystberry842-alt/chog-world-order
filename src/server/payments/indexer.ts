import type { Log } from "viem";
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments";
import type { ChainReader } from "@/server/payments/chain";
import { applyPaymentEvent, applyRegistrationEvent } from "@/server/payments/service";
import { assertPaymentsContract, confirmedHead, decodeContractEvents, eventArgs } from "@/server/payments/verify";
import type { Services } from "@/server/services";

export const CURSOR_KEY = "campaign-payments";

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
      /** Blocks between the cursor and the confirmed head still to index. */
      lagBlocks: string;
      eventsSeen: number;
      eventsNew: number;
      outcomes: Record<string, number>;
      caughtUp: boolean;
    };

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

/**
 * Indexes CampaignRegistered and CreatorPaid events, then applies them.
 *
 * - Only blocks at or below the confirmed head are read: the configured depth
 *   and Monad's `finalized` tag must both cover them.
 * - Logs are requested in chunks of at most `INDEXER_MAX_BLOCK_RANGE` blocks
 *   (the Monad Foundation public RPC allows 100) and the cursor is saved after
 *   every chunk, so a long backlog is worked through across runs.
 * - Each run first re-scans the last `INDEXER_RECONCILE_BLOCKS` blocks behind
 *   the cursor, so events missed during an outage are picked up. Raw events are
 *   unique per (chain, tx, log index) and every write is conditional, so
 *   re-processing is harmless and runs may overlap with on-demand verification.
 * - On an RPC error the run stops; the cursor keeps the last completed chunk.
 */
export async function runIndexer(services: Services): Promise<IndexerResult> {
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
  const { address, chainId } = contract;
  const start = services.config.paymentsDeployBlock;
  const { maxBlockRange, maxChunksPerRun, reconcileBlocks } = services.config.indexer;

  const initialCursor = await payments.getCursor(CURSOR_KEY);
  let cursor = initialCursor;
  const outcomes: Record<string, number> = {};
  let eventsSeen = 0;
  let eventsNew = 0;

  async function scan(fromBlock: bigint, toBlock: bigint) {
    const logs = await chain.getLogs({ address, events: contractEvents, fromBlock, toBlock });
    const events = decodeContractEvents(logs as Log[], address).sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
    for (const event of events) {
      const recorded = await payments.recordChainEvent({
        chainId,
        contractAddress: address,
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
    eventsSeen += events.length;
  }

  let firstBlock: bigint | null = null;
  let lastBlock: bigint | null = null;
  try {
    await assertPaymentsContract(chain, address);
    const { head: confirmed } = await confirmedHead(chain, services.config.paymentConfirmations);

    // 1. Reconcile: re-scan recent blocks behind the cursor.
    if (cursor !== null && reconcileBlocks > BigInt(0)) {
      let from = max(start, cursor - reconcileBlocks + BigInt(1));
      while (from <= cursor) {
        const to = min(from + maxBlockRange - BigInt(1), cursor);
        await scan(from, to);
        firstBlock ??= from;
        lastBlock = to;
        from = to + BigInt(1);
      }
    }

    // 2. Forward: new confirmed blocks, chunk by chunk, saving the cursor after each.
    let from = cursor === null ? start : cursor + BigInt(1);
    for (let chunk = 0; chunk < maxChunksPerRun && from <= confirmed; chunk += 1) {
      const to = min(from + maxBlockRange - BigInt(1), confirmed);
      await scan(from, to);
      await payments.setCursor(CURSOR_KEY, to);
      cursor = to;
      firstBlock ??= from;
      lastBlock = to;
      from = to + BigInt(1);
    }

    const finalCursor = cursor ?? start - BigInt(1);
    const lag = confirmed > finalCursor ? confirmed - finalCursor : BigInt(0);
    return {
      status: "ok",
      fromBlock: (firstBlock ?? from).toString(),
      toBlock: (lastBlock ?? confirmed).toString(),
      cursor: finalCursor.toString(),
      lagBlocks: lag.toString(),
      eventsSeen,
      eventsNew,
      outcomes,
      caughtUp: lag === BigInt(0),
    };
  } catch (error) {
    // The cursor keeps the last completed chunk; the next run continues from there.
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Indexer failed.",
      cursor: cursor?.toString() ?? null,
    };
  }
}

/** Read-only indexer health for operators: cursor, heads, and lag. */
export async function indexerStatus(services: Services) {
  const contract = services.config.paymentsContract;
  if (!contract.enabled || !services.payments || !services.chain || services.config.paymentsDeployBlock === null) {
    return { status: "unavailable" as const, paymentsPaused: services.config.paymentsPaused };
  }
  const cursor = await services.payments.getCursor(CURSOR_KEY);
  try {
    await assertPaymentsContract(services.chain, contract.address);
    const { latest, head } = await confirmedHead(services.chain, services.config.paymentConfirmations);
    const indexedTo = cursor ?? services.config.paymentsDeployBlock - BigInt(1);
    return {
      status: "ok" as const,
      paymentsPaused: services.config.paymentsPaused,
      contract: contract.address,
      deployBlock: services.config.paymentsDeployBlock.toString(),
      cursor: cursor?.toString() ?? null,
      latestBlock: latest.toString(),
      confirmedHead: head.toString(),
      lagBlocks: (head > indexedTo ? head - indexedTo : BigInt(0)).toString(),
    };
  } catch (error) {
    return {
      status: "error" as const,
      paymentsPaused: services.config.paymentsPaused,
      cursor: cursor?.toString() ?? null,
      reason: error instanceof Error ? error.message : "Status check failed.",
    };
  }
}
