import "server-only";
import { paymentsContractConfig, type PaymentsContractConfig } from "@/lib/contracts/campaign-payments";

export type ServerConfig = {
  /** PostgreSQL connection string. Null means the Passport service is not configured. */
  databaseUrl: string | null;
  /** Public origin, e.g. "https://chog.example". Required for sign-in and write requests. */
  appOrigin: string | null;
  /** Secret (32+ chars) used to sign the sign-in nonce cookie. */
  sessionSecret: string | null;
  /** Monad RPC endpoint for on-chain verification. Null means on-chain evidence is unavailable. */
  monadRpcUrl: string | null;
  /** CampaignPayments contract. Disabled when no valid address is configured. */
  paymentsContract: PaymentsContractConfig;
  /** Blocks a payment or registration needs (including its own) before it counts. */
  paymentConfirmations: number;
  /** Block the contract was deployed in; the indexer starts here. */
  paymentsDeployBlock: bigint | null;
  /** Bearer secret for the scheduled indexer endpoint (32+ chars). */
  cronSecret: string | null;
  /**
   * Operator kill switch (PAYMENTS_PAUSED=true): no new registration or payment
   * instructions are issued. Verification of transactions already sent continues.
   */
  paymentsPaused: boolean;
  indexer: {
    /** Largest eth_getLogs block range per call. The Monad Foundation public RPC allows 100. */
    maxBlockRange: bigint;
    /** getLogs calls per run for new blocks, so one run stays within serverless time limits. */
    maxChunksPerRun: number;
    /** Blocks behind the cursor re-scanned every run, to recover events missed during outages. */
    reconcileBlocks: bigint;
  };
  /** Optional HTTPS endpoint that receives JSON alerts for unexpected errors and indexer failures. */
  alertWebhookUrl: string | null;
};

function readInt(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(env[key]?.trim() ?? "", 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function read(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function readOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Reads configuration from the environment. Invalid values are treated as missing, never guessed. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const secret = read(env, "SESSION_SECRET");
  const cron = read(env, "CRON_SECRET");
  const confirmations = Number.parseInt(read(env, "PAYMENT_CONFIRMATIONS") ?? "2", 10);
  const deployBlock = read(env, "CAMPAIGN_PAYMENTS_DEPLOY_BLOCK");
  return {
    databaseUrl: read(env, "DATABASE_URL"),
    appOrigin: readOrigin(read(env, "APP_ORIGIN")),
    sessionSecret: secret && secret.length >= 32 ? secret : null,
    monadRpcUrl: readOrigin(read(env, "MONAD_RPC_URL")) ? read(env, "MONAD_RPC_URL") : null,
    paymentsContract: paymentsContractConfig(env.NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS),
    paymentConfirmations: Number.isInteger(confirmations) && confirmations >= 1 && confirmations <= 100 ? confirmations : 2,
    paymentsDeployBlock: deployBlock && /^\d+$/.test(deployBlock) ? BigInt(deployBlock) : null,
    cronSecret: cron && cron.length >= 32 ? cron : null,
    paymentsPaused: read(env, "PAYMENTS_PAUSED")?.toLowerCase() === "true",
    indexer: {
      maxBlockRange: BigInt(readInt(env, "INDEXER_MAX_BLOCK_RANGE", 100, 1, 10_000)),
      maxChunksPerRun: readInt(env, "INDEXER_MAX_CHUNKS_PER_RUN", 50, 1, 1_000),
      reconcileBlocks: BigInt(readInt(env, "INDEXER_RECONCILE_BLOCKS", 500, 0, 100_000)),
    },
    alertWebhookUrl: (() => {
      const url = read(env, "ALERT_WEBHOOK_URL");
      return url && url.startsWith("https://") ? url : null;
    })(),
  };
}
