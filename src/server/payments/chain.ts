import type { PublicClient } from "viem";

/**
 * The read-only RPC methods the payment verifier and indexer use. The app
 * never holds keys and never sends transactions: users sign in their wallets.
 */
export type ChainReader = Pick<
  PublicClient,
  "getTransactionReceipt" | "getBlockNumber" | "getLogs" | "getChainId" | "getCode" | "readContract"
>;
