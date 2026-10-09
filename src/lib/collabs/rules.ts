import { formatUnits, parseUnits } from "viem";
import type { PaymentToken } from "@/lib/collabs/tokens";

/** Limits for campaign budgets and deadlines. */
export const campaignLimits = {
  maxPerCreatorTokens: 1_000_000,
  maxSlots: 500,
  /** Earliest deadline at publication. */
  minDeadlineLeadMs: 24 * 60 * 60 * 1000,
  maxDeadlineLeadMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export type BudgetResult = { ok: true; baseUnits: bigint } | { ok: false; reason: string };

/**
 * Parses a human amount ("400", "12.5") into token base units. Rejects
 * empty, negative, zero, non-numeric, over-precise, and over-limit values.
 */
export function parseBudget(amount: string, token: PaymentToken): BudgetResult {
  const value = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, reason: "Enter a positive number, like 400 or 12.5." };
  const decimals = value.split(".")[1]?.length ?? 0;
  if (decimals > token.decimals) {
    return { ok: false, reason: `${token.symbol} supports at most ${token.decimals} decimal places.` };
  }
  const baseUnits = parseUnits(value, token.decimals);
  if (baseUnits <= BigInt(0)) return { ok: false, reason: "The amount must be greater than zero." };
  if (baseUnits > parseUnits(String(campaignLimits.maxPerCreatorTokens), token.decimals)) {
    return { ok: false, reason: `The amount per creator cannot exceed ${campaignLimits.maxPerCreatorTokens.toLocaleString("en-US")} ${token.symbol}.` };
  }
  return { ok: true, baseUnits };
}

export function formatTokenUnits(baseUnits: bigint | string, token: Pick<PaymentToken, "decimals" | "symbol">) {
  const value = formatUnits(typeof baseUnits === "string" ? BigInt(baseUnits) : baseUnits, token.decimals);
  const [whole, fraction] = value.split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${fraction ? `${grouped}.${fraction.slice(0, 6)}` : grouped} ${token.symbol}`;
}

/** Deadline must be at least a day away and at most a year away at publication. */
export function checkDeadline(deadline: Date, now: Date): string | null {
  const lead = deadline.getTime() - now.getTime();
  if (Number.isNaN(deadline.getTime())) return "Enter a valid deadline.";
  if (lead < campaignLimits.minDeadlineLeadMs) return "The deadline must be at least 24 hours from now.";
  if (lead > campaignLimits.maxDeadlineLeadMs) return "The deadline must be within one year.";
  return null;
}

export const contentHashPattern = /^0x[0-9a-f]{64}$/;
