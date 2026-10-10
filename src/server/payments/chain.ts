import { createPublicClient, http, type PublicClient } from "viem";
import { monad } from "viem/chains";

/**
 * The read-only RPC methods the payment verifier and indexer use. The app
 * never holds keys and never sends transactions: users sign in their wallets.
 */
export type ChainReader = Pick<
  PublicClient,
  "getTransactionReceipt" | "getBlockNumber" | "getLogs" | "getChainId" | "getCode" | "readContract"
>;

/**
 * The app's Monad mainnet client. `cacheTime: 0` so confirmation counts always
 * use the current head rather than a block number cached for seconds.
 */
export function createMonadClient(rpcUrl: string) {
  return createPublicClient({ chain: monad, transport: http(rpcUrl), cacheTime: 0 });
}
