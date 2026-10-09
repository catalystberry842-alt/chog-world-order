import { BaseError, UserRejectedRequestError } from "viem";

/** Turns wallet/connector errors into one short, human sentence. */
export function describeWalletError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
      return "You cancelled the request in your wallet. Nothing was shared.";
    }
    if (error.name === "ProviderNotFoundError") {
      return "No browser wallet was found. Install a wallet extension that supports Monad, then try again.";
    }
    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (error.name === "ProviderNotFoundError") {
      return "No browser wallet was found. Install a wallet extension that supports Monad, then try again.";
    }
    return error.message;
  }
  return "Something went wrong while talking to your wallet.";
}
