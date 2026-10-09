import { isAddress, type Address } from "viem";

export type PaymentTokenKey = "MON" | "USDC";

export type PaymentToken = {
  key: PaymentTokenKey;
  symbol: string;
  decimals: number;
  /** ERC-20 contract on Monad, or null for native MON. */
  address: Address | null;
  /** False when the token's contract address is not configured. */
  enabled: boolean;
};

function configuredAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed, { strict: false }) ? (trimmed.toLowerCase() as Address) : null;
}

/**
 * Payment tokens a campaign can use.
 *
 * MON (native) is always available. ERC-20 tokens are enabled only when their
 * Monad contract address is configured: addresses are never guessed. Each
 * ERC-20 must also be approved in the CampaignPayments contract before
 * payments in it can succeed.
 */
export const paymentTokens: Record<PaymentTokenKey, PaymentToken> = {
  MON: { key: "MON", symbol: "MON", decimals: 18, address: null, enabled: true },
  USDC: (() => {
    const address = configuredAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS);
    return { key: "USDC" as const, symbol: "USDC", decimals: 6, address, enabled: address !== null };
  })(),
};

export const paymentTokenKeys = Object.keys(paymentTokens) as PaymentTokenKey[];

export function isPaymentTokenKey(value: string): value is PaymentTokenKey {
  return (paymentTokenKeys as string[]).includes(value);
}
