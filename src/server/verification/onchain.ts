import {
  parseEventLogs,
  TransactionReceiptNotFoundError,
  type Hash,
  type PublicClient,
} from "viem";
import { monad } from "viem/chains";
import { sameAddress } from "@/lib/passport/address";
import { badRequest } from "@/server/errors";
import type { SupportedApp } from "@/server/verification/supported-apps";
import type { VerificationHandler, VerificationOutcome } from "@/server/verification/types";

/** The subset of a viem PublicClient the verifier needs. Tests pass a stub. */
export type OnchainClient = Pick<PublicClient, "getTransactionReceipt" | "getBlockNumber" | "getBlock">;

export type OnchainHandlerOptions = {
  /** Null when no RPC endpoint is configured: every claim is "unavailable". */
  client: OnchainClient | null;
  apps: SupportedApp[];
  chainId?: number;
  /** Blocks that must exist after the transaction's block. */
  minConfirmations?: bigint;
};

const txHashPattern = /^0x[0-9a-fA-F]{64}$/;

/**
 * Verified interactions with supported Monad applications.
 *
 * A claim is verified only when all of these hold, checked with viem against
 * the chain (never against data in the request):
 * 1. the transaction receipt exists and the transaction succeeded,
 * 2. it was sent by the signed-in wallet,
 * 3. it was sent to one of the app's listed contracts,
 * 4. that contract emitted the app's expected event (naming the wallet when
 *    the app defines `walletArg`),
 * 5. it has the required confirmations.
 */
export function createOnchainHandler(options: OnchainHandlerOptions): VerificationHandler {
  const chainId = options.chainId ?? monad.id;
  const minConfirmations = options.minConfirmations ?? BigInt(1);

  return {
    kinds: ["onchain-interaction"],
    method: "onchain-receipt",
    reviewerApproves: false,

    prepare(claim) {
      const hash = claim.reference.trim();
      if (!txHashPattern.test(hash)) {
        throw badRequest("Use a transaction hash: 0x followed by 64 hex characters.", "invalid_reference");
      }
      const appId = claim.appId?.trim().toLowerCase();
      if (!appId || !/^[a-z0-9-]{2,64}$/.test(appId)) {
        throw badRequest("Choose the application you interacted with.", "invalid_app");
      }
      const txHash = hash.toLowerCase();
      return { reference: txHash, dedupeKey: `onchain:${chainId}:${txHash}`, chainId, txHash, appId };
    },

    async verifyOnSubmit(prepared, { wallet }): Promise<VerificationOutcome> {
      const app = options.apps.find((item) => item.id === prepared.appId && item.chainId === chainId);
      if (!app) {
        return { status: "unavailable", reason: "This application is not a supported verification source yet." };
      }
      if (!options.client) {
        return { status: "unavailable", reason: "On-chain verification is not configured on this server." };
      }
      const client = options.client;
      const hash = prepared.txHash as Hash;

      let receipt: Awaited<ReturnType<OnchainClient["getTransactionReceipt"]>>;
      try {
        receipt = await client.getTransactionReceipt({ hash });
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) {
          return { status: "pending", reason: "Transaction not found on Monad yet. It can be re-checked later." };
        }
        return { status: "pending", reason: "Could not reach the Monad RPC. It can be re-checked later." };
      }

      if (receipt.status !== "success") {
        return { status: "rejected", reason: "The transaction reverted." };
      }
      if (!sameAddress(receipt.from, wallet)) {
        return { status: "rejected", reason: "The transaction was not sent by your wallet." };
      }
      if (!receipt.to || !app.contracts.some((contract) => sameAddress(contract, receipt.to as string))) {
        return { status: "rejected", reason: `The transaction was not sent to a ${app.name} contract.` };
      }

      const appLogs = receipt.logs.filter((log) => app.contracts.some((contract) => sameAddress(contract, log.address)));
      const events = parseEventLogs({ abi: [app.event], logs: appLogs, strict: true });
      const matching = app.walletArg
        ? events.filter((event) => {
            const value = (event.args as Record<string, unknown>)[app.walletArg as string];
            return typeof value === "string" && sameAddress(value, wallet);
          })
        : events;
      if (matching.length === 0) {
        return { status: "rejected", reason: `The expected ${app.event.name} event from ${app.name} was not found.` };
      }

      const head = await client.getBlockNumber();
      if (head - receipt.blockNumber < minConfirmations) {
        return { status: "pending", reason: "Waiting for block confirmations. It can be re-checked shortly." };
      }

      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      return {
        status: "verified",
        reason: `Receipt, sender, contract, and ${app.event.name} event checked on Monad.`,
        occurredAt: new Date(Number(block.timestamp) * 1000),
        data: {
          app: app.id,
          event: app.event.name,
          blockNumber: Number(receipt.blockNumber),
          confirmations: Number(head - receipt.blockNumber),
        },
      };
    },
  };
}
