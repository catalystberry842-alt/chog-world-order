import "server-only";
import { createPublicClient, http, verifyMessage, type Address, type Hex } from "viem";
import { monad } from "viem/chains";
import { readConfig, type ServerConfig } from "@/server/config";
import { getPrisma } from "@/server/db";
import type { CollabStore } from "@/server/collabs/store";
import { PrismaCollabStore } from "@/server/collabs/prisma-store";
import { PrismaPassportStore } from "@/server/passport/prisma-store";
import { PrismaPaymentStore } from "@/server/payments/prisma-store";
import type { PaymentStore } from "@/server/payments/store";
import type { ChainReader } from "@/server/payments/chain";
import type { PassportStore } from "@/server/passport/store";
import type { OnchainClient } from "@/server/verification/onchain";
import { createHandlerRegistry, type HandlerRegistry } from "@/server/verification/registry";
import { supportedApps } from "@/server/verification/supported-apps";

export type SignatureVerifier = (input: { address: Address; message: string; signature: Hex }) => Promise<boolean>;

/** Everything request handlers depend on. Tests replace it with `setServicesForTesting`. */
export type Services = {
  config: ServerConfig;
  /** Null when DATABASE_URL is not configured. */
  store: PassportStore | null;
  /** Collab Board store. Null when DATABASE_URL is not configured. */
  collabs: CollabStore | null;
  /** Payment intents, indexed chain events, and the indexer cursor. Null without a database. */
  payments: PaymentStore | null;
  /** Read-only Monad client. Null when MONAD_RPC_URL is not configured. Never signs anything. */
  chain: ChainReader | null;
  handlers: HandlerRegistry;
  verifySignature: SignatureVerifier;
  now: () => Date;
};

let override: Services | null = null;
let cached: Services | null = null;

function build(): Services {
  const config = readConfig();
  const publicClient = config.monadRpcUrl
    ? createPublicClient({ chain: monad, transport: http(config.monadRpcUrl), cacheTime: 0 }) // fresh head for confirmation counts
    : null;

  return {
    config,
    store: config.databaseUrl ? new PrismaPassportStore(getPrisma(config.databaseUrl)) : null,
    collabs: config.databaseUrl ? new PrismaCollabStore(getPrisma(config.databaseUrl)) : null,
    payments: config.databaseUrl ? new PrismaPaymentStore(getPrisma(config.databaseUrl)) : null,
    chain: publicClient as ChainReader | null,
    handlers: createHandlerRegistry({ onchainClient: publicClient as OnchainClient | null, apps: supportedApps }),
    // With an RPC endpoint, smart-contract wallets (ERC-1271/6492) verify too.
    // Without one, only plain EOA signatures can be checked.
    verifySignature: publicClient
      ? (input) => publicClient.verifyMessage(input)
      : (input) => verifyMessage(input),
    now: () => new Date(),
  };
}

export function getServices(): Services {
  if (override) return override;
  cached ??= build();
  return cached;
}

export function setServicesForTesting(services: Services | null) {
  override = services;
}
