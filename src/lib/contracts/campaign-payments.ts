/**
 * CampaignPayments contract: address, chain, and the identifiers the app and
 * the contract must agree on. Shared by the server and the browser.
 */
import { encodeAbiParameters, isAddress, keccak256, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { monad } from "viem/chains";
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments-abi";

export { campaignPaymentsAbi };

/** The only chain payments are accepted on. */
export const PAYMENTS_CHAIN_ID = monad.id;

export type PaymentsContractConfig =
  | { enabled: true; address: Address; chainId: number }
  | { enabled: false; reason: string };

/**
 * Reads and validates the configured contract address. Never falls back to a
 * guessed address: without a valid, non-zero address, payments are disabled.
 */
export function paymentsContractConfig(
  rawAddress: string | undefined = process.env.NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS,
): PaymentsContractConfig {
  const value = rawAddress?.trim();
  if (!value) return { enabled: false, reason: "No CampaignPayments contract address is configured." };
  if (!isAddress(value, { strict: false }) || value.toLowerCase() === zeroAddress) {
    return { enabled: false, reason: "The configured CampaignPayments address is not a valid contract address." };
  }
  return { enabled: true, address: value.toLowerCase() as Address, chainId: PAYMENTS_CHAIN_ID };
}

/** Salt the app uses to register a campaign: a hash of its database ID. */
export function campaignSalt(campaignDbId: string): Hex {
  return keccak256(toBytes(`chog-world-order:campaign:${campaignDbId}`));
}

/** Mirrors CampaignPayments.computeCampaignId: keccak256(abi.encode(chainId, contract, owner, salt)). */
export function computeCampaignId(contract: Address, owner: Address, salt: Hex, chainId: number = PAYMENTS_CHAIN_ID): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes32" }],
      [BigInt(chainId), contract, owner, salt],
    ),
  );
}

/** Reference of an accepted deliverable, carried in the CreatorPaid event. */
export function deliverableRef(deliverableId: string): Hex {
  return keccak256(toBytes(`chog-world-order:deliverable:${deliverableId}`));
}

/** Token address used on-chain: zero for native MON. */
export const NATIVE_TOKEN_ADDRESS: Address = zeroAddress;

export const explorerTxUrl = (hash: string) => `https://monadscan.com/tx/${hash}`;
