/**
 * In-memory stand-in for a Monad RPC: receipts, logs, head block, chain id.
 * Logs are ABI-encoded with the real CampaignPayments ABI, so tests exercise
 * the same decoding the server uses.
 */
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toBytes,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { campaignPaymentsAbi, computeCampaignId } from "@/lib/contracts/campaign-payments";
import type { ChainReader } from "@/server/payments/chain";

type FakeLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hash;
  transactionIndex: number;
  removed: boolean;
};

type FakeReceipt = { status: "success" | "reverted"; from: Address; to: Address | null; blockNumber: bigint; logs: FakeLog[] };

let txCounter = 0;
export const newTxHash = (): Hash => keccak256(toBytes(`tx-${++txCounter}-${Math.random()}`));
const blockHash = (n: bigint): Hex => keccak256(toBytes(`block-${n}`));

export class FakeChain {
  head = BigInt(1_000);
  chainId = 143;
  code: Record<string, Hex> = {};
  supportedTokens = new Set<string>();
  receipts = new Map<string, FakeReceipt>();
  logs: FakeLog[] = [];
  failNextCalls = 0;
  /** Set false to simulate a configured address that holds some other contract. */
  isCampaignPayments = true;

  constructor(readonly contract: Address) {
    this.code[contract.toLowerCase()] = "0x6080";
  }

  private maybeFail() {
    if (this.failNextCalls > 0) {
      this.failNextCalls -= 1;
      throw new Error("RPC unavailable");
    }
  }

  /** Mines a transaction with the given logs at head + 1. */
  mine(input: { from: Address; to?: Address | null; status?: "success" | "reverted"; events?: { address?: Address; topics: Hex[]; data: Hex }[] }) {
    this.head += BigInt(1);
    const hash = newTxHash();
    const logs = (input.status === "reverted" ? [] : (input.events ?? [])).map((event, index) => ({
      address: (event.address ?? this.contract).toLowerCase() as Address,
      topics: event.topics,
      data: event.data,
      blockNumber: this.head,
      blockHash: blockHash(this.head),
      logIndex: index,
      transactionHash: hash,
      transactionIndex: 0,
      removed: false,
    }));
    this.receipts.set(hash, {
      status: input.status ?? "success",
      from: input.from,
      to: input.to === undefined ? this.contract : input.to,
      blockNumber: this.head,
      logs,
    });
    this.logs.push(...logs);
    return hash;
  }

  advance(blocks: number) {
    this.head += BigInt(blocks);
  }

  registeredEvent(campaignId: Hex, owner: Address, salt: Hex, address?: Address) {
    return {
      address,
      topics: encodeEventTopics({ abi: campaignPaymentsAbi, eventName: "CampaignRegistered", args: { campaignId, owner } }) as Hex[],
      data: encodeAbiParameters([{ type: "bytes32" }], [salt]),
    };
  }

  paidEvent(args: { campaignId: Hex; creator: Address; token: Address; amount: bigint; payer: Address; deliverableRef: Hex }, address?: Address) {
    return {
      address,
      topics: encodeEventTopics({
        abi: campaignPaymentsAbi,
        eventName: "CreatorPaid",
        args: { campaignId: args.campaignId, creator: args.creator, token: args.token },
      }) as Hex[],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }],
        [args.amount, args.payer, args.deliverableRef],
      ),
    };
  }

  reader(): ChainReader {
    return {
      getChainId: (async () => {
        this.maybeFail();
        return this.chainId;
      }) as ChainReader["getChainId"],
      getBlockNumber: (async () => {
        this.maybeFail();
        return this.head;
      }) as ChainReader["getBlockNumber"],
      getCode: (async ({ address }: { address: Address }) => {
        this.maybeFail();
        return this.code[address.toLowerCase()];
      }) as unknown as ChainReader["getCode"],
      getTransactionReceipt: (async ({ hash }: { hash: Hash }) => {
        this.maybeFail();
        const receipt = this.receipts.get(hash);
        if (!receipt) throw new TransactionReceiptNotFoundError({ hash });
        return receipt;
      }) as unknown as ChainReader["getTransactionReceipt"],
      getLogs: (async (params: { address: Address; fromBlock: bigint; toBlock: bigint | "latest"; args?: { campaignId?: Hex } }) => {
        this.maybeFail();
        const to = params.toBlock === "latest" ? this.head : params.toBlock;
        return this.logs.filter(
          (log) =>
            log.address === params.address.toLowerCase() &&
            log.blockNumber >= params.fromBlock &&
            log.blockNumber <= to &&
            (!params.args?.campaignId || log.topics[1]?.toLowerCase() === params.args.campaignId.toLowerCase()),
        );
      }) as unknown as ChainReader["getLogs"],
      readContract: (async ({ address, functionName, args }: { address: Address; functionName: string; args: [Address, Hex?] }) => {
        this.maybeFail();
        if (!this.isCampaignPayments) throw new Error("execution reverted");
        if (functionName === "isSupportedToken") return this.supportedTokens.has(args[0].toLowerCase());
        // Like the contract: keccak256(abi.encode(block.chainid, address(this), owner, salt)).
        if (functionName === "computeCampaignId") return computeCampaignId(address, args[0], args[1]!, this.chainId);
        throw new Error(`unexpected readContract ${functionName}`);
      }) as unknown as ChainReader["readContract"],
    };
  }
}
