export const site = {
  name: "Chog World Order",
  description:
    "A contribution economy for the Monad ecosystem, combining Chog Passport, contributor reputation, and paid collaborations.",
} as const;

export const nav = [
  { href: "/passport", label: "Passport" },
  { href: "/collabs", label: "Collabs" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export function shortAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
