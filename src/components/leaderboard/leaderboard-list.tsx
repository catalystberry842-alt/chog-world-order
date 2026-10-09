import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatNumber, shortAddress } from "@/lib/format";
import type { LeaderboardPage } from "@/lib/passport/types";
import { reputationCategoryLabels, type ReputationCategory } from "@/lib/reputation/config";

export const leaderboardFilters: (ReputationCategory | null)[] = [
  null,
  "campaign",
  "code",
  "research",
  "content",
  "protocol",
  "consistency",
];

const href = (category: ReputationCategory | null, page: number) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/leaderboard${query ? `?${query}` : ""}`;
};

export function LeaderboardFilters({ active }: { active: ReputationCategory | null }) {
  return (
    <nav aria-label="Filter by category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {leaderboardFilters.map((category) => {
        const selected = category === active;
        return (
          <Link
            key={category ?? "all"}
            href={href(category, 1)}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition ${
              selected
                ? "border-monad-400/60 bg-monad-500/25 text-white"
                : "border-white/10 bg-white/[0.03] text-white/65 hover:text-white"
            }`}
          >
            {category ? reputationCategoryLabels[category] : "Overall"}
          </Link>
        );
      })}
    </nav>
  );
}

/** Ranked contributors from the database, with links to their public passports. */
export function LeaderboardList({ data }: { data: LeaderboardPage }) {
  const pages = Math.max(1, Math.ceil(data.totalEntries / data.pageSize));
  const label = data.category ? reputationCategoryLabels[data.category] : "Reputation";

  return (
    <div className="flex flex-col gap-4">
      <div className="glass overflow-hidden rounded-3xl">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {label} leaderboard, page {data.page} of {pages}
          </caption>
          <thead className="hidden sm:table-header-group">
            <tr className="border-b border-white/[0.06] text-left text-xs text-white/45">
              <th scope="col" className="px-5 py-3 font-medium">Rank</th>
              <th scope="col" className="py-3 font-medium">Contributor</th>
              <th scope="col" className="py-3 text-right font-medium">Verified</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">{label}</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => {
              const name = entry.displayName ?? shortAddress(entry.address);
              return (
                <tr key={entry.address} className="border-b border-white/[0.04] last:border-0">
                  <td className="w-16 px-5 py-4 font-semibold tabular-nums text-white/70">#{entry.rank}</td>
                  <td className="py-4 pr-3">
                    <Link href={`/profile/${entry.address}`} className="flex min-w-0 items-center gap-3 hover:text-monad-200">
                      <Avatar name={name} hue={entry.avatarHue} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block text-xs text-white/50">
                          {entry.tier}
                          <span className="font-mono"> · {shortAddress(entry.address)}</span>
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden py-4 text-right tabular-nums text-white/70 sm:table-cell">
                    {entry.verifiedContributionCount}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="block font-semibold tabular-nums">{formatNumber(entry.points)}</span>
                    {data.category && (
                      <span className="block text-xs text-white/45 tabular-nums">{formatNumber(entry.total)} total</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
          {data.page > 1 ? (
            <Link href={href(data.category, data.page - 1)} className="btn btn-ghost btn-sm">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-white/55">
            Page {data.page} of {pages}
          </span>
          {data.page < pages ? (
            <Link href={href(data.category, data.page + 1)} className="btn btn-ghost btn-sm">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
