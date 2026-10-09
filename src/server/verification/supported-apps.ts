import type { AbiEvent, Address } from "viem";

/**
 * Monad applications whose transactions can earn the Monad Explorer stamp.
 *
 * An entry says: a successful transaction sent by the claimant to one of
 * `contracts`, which emits `event` from that contract (with `walletArg` equal
 * to the claimant when set), counts as a verified interaction.
 *
 * The list is intentionally empty. Each entry must be reviewed before it is
 * added: contract addresses and event signatures come from the project's own
 * verified sources, never from user input. Until an app is listed, on-chain
 * claims for it are stored with status "unavailable".
 *
 * Example shape (not a real app):
 *   {
 *     id: "example-dex",
 *     name: "Example DEX",
 *     chainId: 143,
 *     contracts: ["0x…router"],
 *     event: parseAbiItem("event Swap(address indexed sender, uint256 amountIn, uint256 amountOut)"),
 *     walletArg: "sender",
 *   }
 */
export type SupportedApp = {
  id: string;
  name: string;
  chainId: number;
  contracts: Address[];
  event: AbiEvent;
  /** Name of an address argument in `event` that must equal the claimant's wallet. */
  walletArg?: string;
};

export const supportedApps: SupportedApp[] = [];
