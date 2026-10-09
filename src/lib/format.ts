import type { CampaignBudget } from "@/lib/types";

export function shortAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const numberFormat = new Intl.NumberFormat("en-US");

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatTokenAmount(amount: number, token: string) {
  return `${numberFormat.format(amount)} ${token}`;
}

export function formatBudget(budget: CampaignBudget) {
  if (budget.model === "fixed" && budget.perCreator) {
    return `${formatTokenAmount(budget.perCreator, budget.token)} per creator`;
  }
  return `${formatTokenAmount(budget.total, budget.token)} pool`;
}

// Dates are stored as calendar days and rendered in UTC so the server and the
// browser always agree on the output.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatMonth(isoDate: string) {
  return monthFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
