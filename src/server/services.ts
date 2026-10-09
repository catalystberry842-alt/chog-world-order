import "server-only";
import { createPublicClient, http, verifyMessage, type Address, type Hex } from "viem";
import { monad } from "viem/chains";
import { readConfig, type ServerConfig } from "@/server/config";
import { getPrisma } from "@/server/db";
import { PrismaPassportStore } from "@/server/passport/prisma-store";
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
  handlers: HandlerRegistry;
  verifySignature: SignatureVerifier;
  now: () => Date;
};

let override: Services | null = null;
let cached: Services | null = null;

function build(): Services {
  const config = readConfig();
  const publicClient = config.monadRpcUrl
    ? createPublicClient({ chain: monad, transport: http(config.monadRpcUrl) })
    : null;

  return {
    config,
    store: config.databaseUrl ? new PrismaPassportStore(getPrisma(config.databaseUrl)) : null,
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
