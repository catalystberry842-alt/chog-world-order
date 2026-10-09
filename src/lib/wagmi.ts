import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monad } from "viem/chains";

/**
 * Wallet configuration.
 *
 * Only browser (injected) wallets are supported in Phase 1. EIP-6963 discovery
 * is on by default, so every installed wallet shows up as its own option.
 * Connecting shares an address with the app. It is not a sign-in: no message
 * is signed and no session is created.
 */
export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: http(),
  },
  ssr: true,
});

export const targetChain = monad;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
