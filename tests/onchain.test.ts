import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
} from "viem";
import { createOnchainHandler, type OnchainClient } from "@/server/verification/onchain";
import type { SupportedApp } from "@/server/verification/supported-apps";

const wallet = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const contract = "0x3333333333333333333333333333333333333333" as Address;
const hash = `0x${"cd".repeat(32)}` as Hash;
const event = parseAbiItem("event Interacted(address indexed user, uint256 amount)");

// Test fixture only: a fictional app definition used to exercise the verifier.
const app: SupportedApp = { id: "test-app", name: "Test App", chainId: 143, contracts: [contract], event, walletArg: "user" };

function log(user: Address, address: Address = contract) {
  return {
    address,
    topics: encodeEventTopics({ abi: [event], eventName: "Interacted", args: { user } }),
    data: encodeAbiParameters([{ type: "uint256" }], [42n]),
    blockNumber: 100n,
    blockHash: `0x${"00".repeat(32)}`,
    logIndex: 0,
    transactionHash: hash,
    transactionIndex: 0,
    removed: false,
  };
}

function client(receipt: Partial<Record<string, unknown>> | Error, head = 105n): OnchainClient {
  return {
    getTransactionReceipt: (async () => {
      if (receipt instanceof Error) throw receipt;
      return { status: "success", from: wallet, to: contract, blockNumber: 100n, logs: [log(wallet)], ...receipt };
    }) as unknown as OnchainClient["getTransactionReceipt"],
    getBlockNumber: (async () => head) as OnchainClient["getBlockNumber"],
    getBlock: (async () => ({ timestamp: 1_790_000_000n })) as unknown as OnchainClient["getBlock"],
  };
}

const claim = { kind: "onchain-interaction" as const, title: "t", summary: "s", reference: hash, appId: "test-app" };

async function verify(options: Parameters<typeof createOnchainHandler>[0]) {
  const handler = createOnchainHandler(options);
  return handler.verifyOnSubmit(handler.prepare(claim), { wallet });
}

describe("on-chain verification", () => {
  it("is unavailable without an RPC client, never verified", async () => {
    expect((await verify({ client: null, apps: [app] })).status).toBe("unavailable");
  });

  it("is unavailable for apps that are not on the supported list", async () => {
    expect((await verify({ client: client({}), apps: [] })).status).toBe("unavailable");
  });

  it("verifies a successful transaction from the wallet to the app with the expected event", async () => {
    const outcome = await verify({ client: client({}), apps: [app] });
    expect(outcome.status).toBe("verified");
    expect(outcome.occurredAt?.toISOString()).toBe(new Date(1_790_000_000_000).toISOString());
  });

  it.each([
    ["reverted", { status: "reverted" }],
    ["sent by another wallet", { from: other }],
    ["sent to another contract", { to: other }],
    ["missing the event", { logs: [] }],
    ["event names another wallet", { logs: [log(other)] }],
    ["event emitted by another contract", { logs: [log(wallet, other)] }],
  ])("rejects a transaction %s", async (_label, receipt) => {
    expect((await verify({ client: client(receipt), apps: [app] })).status).toBe("rejected");
  });

  it("stays pending when the receipt is not found yet or confirmations are missing", async () => {
    const notFound = new TransactionReceiptNotFoundError({ hash });
    expect((await verify({ client: client(notFound), apps: [app] })).status).toBe("pending");
    expect((await verify({ client: client({}, 100n), apps: [app] })).status).toBe("pending");
  });

  it("stays pending (not verified) when the RPC call fails", async () => {
    expect((await verify({ client: client(new Error("network down")), apps: [app] })).status).toBe("pending");
  });

  it("rejects malformed transaction hashes before anything is stored", () => {
    const handler = createOnchainHandler({ client: null, apps: [app] });
    expect(() => handler.prepare({ ...claim, reference: "0x1234" })).toThrow();
  });
});
