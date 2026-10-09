import { isAddress } from "viem";
import type { Address } from "@/lib/types";

/**
 * Validates a wallet address and returns its lowercase form, or null.
 * Lowercase is the canonical form used for storage and comparison.
 */
export function normalizeAddress(value: unknown): Address | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  return trimmed.toLowerCase() as Address;
}

export function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}
