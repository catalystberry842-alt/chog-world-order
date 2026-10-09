import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { verifyMessage } from "viem";
import { monad } from "viem/chains";
import type { PublicEvidence, PublicPassport } from "@/lib/passport/types";
import type { ServerConfig } from "@/server/config";
import { MemoryCollabStore } from "@/server/collabs/memory-store";
import { MemoryPaymentStore } from "@/server/payments/memory-store";
import type { ChainReader } from "@/server/payments/chain";
import { paymentsContractConfig } from "@/lib/contracts/campaign-payments";
import { MemoryPassportStore } from "@/server/passport/memory-store";
import type { PassportStore } from "@/server/passport/store";
import type { Services } from "@/server/services";
import { createHandlerRegistry } from "@/server/verification/registry";
import type { OnchainClient } from "@/server/verification/onchain";
import type { SupportedApp } from "@/server/verification/supported-apps";
import { getNonce, postSignIn } from "@/server/api/handlers";

export const ORIGIN = "http://localhost:3000";

export const testConfig: ServerConfig = {
  databaseUrl: "memory://test",
  appOrigin: ORIGIN,
  sessionSecret: "test-secret-test-secret-test-secret-0123",
  monadRpcUrl: null,
  paymentsContract: { enabled: false, reason: "not configured in tests" },
  paymentConfirmations: 2,
  paymentsDeployBlock: null,
  cronSecret: "test-cron-secret-test-cron-secret-0123",
};

export function makeServices(
  options: {
    store?: PassportStore | null;
    onchainClient?: OnchainClient | null;
    apps?: SupportedApp[];
    now?: Date;
    /** CampaignPayments address; omit to leave payments disabled. */
    paymentsContract?: string;
    chain?: ChainReader | null;
    confirmations?: number;
  } = {},
): Services & { memory: MemoryPassportStore; collabMemory: MemoryCollabStore; paymentMemory: MemoryPaymentStore } {
  // With a fixed start time the clock still ticks 1 ms per read, like a real clock,
  // so records created in sequence get distinct, ordered timestamps.
  const now = (() => {
    if (!options.now) return () => new Date();
    let tick = 0;
    const base = options.now.getTime();
    return () => new Date(base + tick++);
  })();
  const memory = new MemoryPassportStore();
  const collabMemory = new MemoryCollabStore(now);
  const paymentMemory = new MemoryPaymentStore(now);
  const store = options.store === undefined ? memory : options.store;
  return {
    memory,
    collabMemory,
    paymentMemory,
    config: {
      ...testConfig,
      paymentsContract: options.paymentsContract ? paymentsContractConfig(options.paymentsContract) : testConfig.paymentsContract,
      paymentConfirmations: options.confirmations ?? testConfig.paymentConfirmations,
      paymentsDeployBlock: BigInt(0),
    },
    store,
    collabs: options.store === null ? null : collabMemory,
    payments: options.store === null ? null : paymentMemory,
    chain: options.chain ?? null,
    handlers: createHandlerRegistry({ onchainClient: options.onchainClient ?? null, apps: options.apps ?? [] }),
    // Real EOA signature verification (test keys are generated per run, never persisted).
    verifySignature: (input) => verifyMessage(input),
    now,
  };
}

export function request(path: string, init: RequestInit & { cookie?: string; origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("origin", origin);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

export const post = (path: string, body: unknown, options: { cookie?: string; origin?: string | null } = {}) =>
  request(path, { method: "POST", body: JSON.stringify(body), ...options });

function cookiePairs(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => !pair.endsWith("="));
}

/** Signs in a freshly generated wallet through the real SIWE flow. Returns its session cookie. */
export async function signInNewWallet(services: Services) {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceResponse = await getNonce(request("/api/auth/nonce"), services);
  const { nonce } = (await nonceResponse.json()) as { nonce: string };
  const nonceCookie = cookiePairs(nonceResponse).join("; ");

  const message = createSiweMessage({
    address: account.address,
    chainId: monad.id,
    domain: new URL(ORIGIN).host,
    nonce,
    uri: ORIGIN,
    version: "1",
    issuedAt: services.now(),
  });
  const signature = await account.signMessage({ message });
  const response = await postSignIn(post("/api/auth/verify", { message, signature }, { cookie: nonceCookie }), services);
  if (response.status !== 200) throw new Error(`sign-in failed: ${response.status} ${await response.text()}`);
  return {
    account,
    address: account.address.toLowerCase(),
    cookie: cookiePairs(response).join("; "),
    signedIn: { message, signature, nonceCookie },
  };
}

/** Shape of the JSON bodies the API returns, for typed assertions. */
export type ApiBody = {
  error?: { code: string; message: string };
  evidence?: PublicEvidence;
  issuedStamps?: string[];
  issued?: { id: string; category: string }[];
  passport?: PublicPassport;
};

export const readJson = async (response: Response) => (await response.json()) as ApiBody;
