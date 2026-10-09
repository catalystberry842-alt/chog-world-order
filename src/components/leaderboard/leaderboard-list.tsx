"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ScoreBar, scoreSegments, segmentColor } from "@/components/passport/reputation-preview";
import { Avatar } from "@/components/ui/avatar";
import { formatNumber, shortAddress } from "@/lib/format";
import type { RankedContributor } from "@/lib/types";

type SortKey = "total" | (typeof scoreSegments)[number]["key"];

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "total", label: "Overall" },
  ...scoreSegments.map((segment) => ({ key: segment.key, label: segment.label })),
];

/** Ranked contributors with a stacked score bar and an expandable breakdown. */
export function LeaderboardList({ contributors }: { contributors: RankedContributor[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");

  const sorted = useMemo(
    () =>
      [...contributors].sort(
        (a, b) => b.score[sortKey] - a.score[sortKey] || b.score.total - a.score.total,
      ),
    [contributors, sortKey],
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Rank by" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sortOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={sortKey === option.key}
            onClick={() => setSortKey(option.key)}
            className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${
              sortKey === option.key
                ? "border-monad-400/60 bg-monad-500/25 text-white"
                : "border-white/10 bg-white/[0.03] text-white/65 hover:text-white"
            }`}
          >
            {option.key !== "total" && (
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${segmentColor[option.key]}`} />
            )}
            {option.label}
          </button>
        ))}
      </div>

      <ol className="flex flex-col gap-3">
        {sorted.map((contributor, index) => {
          const position = index + 1;
          const value = contributor.score[sortKey];
          return (
            <li key={contributor.address}>
              <details className="glass group rounded-3xl open:border-monad-400/30">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:gap-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold ${
                      position === 1
                        ? "bg-crayon-yellow text-ink"
                        : position <= 3
                          ? "bg-blush-400 text-ink"
                          : "bg-white/[0.06] text-white/75"
                    }`}
                  >
                    {position}
                  </span>
                  <Avatar name={contributor.displayName} hue={contributor.avatarHue} size="sm" className="hidden sm:inline-flex" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate font-medium">{contributor.displayName}</span>
                      <span className="font-mono text-xs text-white/45">{shortAddress(contributor.address)}</span>
                    </span>
                    <ScoreBar score={contributor.score} className="max-w-md" />
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-xl font-semibold tabular-nums">{formatNumber(value)}</span>
                    <span className="block text-xs text-white/45">
                      {sortKey === "total" ? "points" : `${sortOptions.find((o) => o.key === sortKey)?.label} pts`}
                    </span>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0 text-white/40 transition group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m5 8 5 5 5-5" />
                  </svg>
                </summary>

                <div className="grid gap-5 border-t border-white/[0.06] p-4 sm:p-5 md:grid-cols-[1fr_auto]">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Score breakdown for {contributor.displayName}</caption>
                    <thead>
                      <tr className="text-left text-xs text-white/45">
                        <th scope="col" className="pb-2 font-medium">
                          Source
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Points
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreSegments.map((segment) => (
                        <tr key={segment.key} className="border-t border-white/[0.04]">
                          <th scope="row" className="py-1.5 text-left font-normal text-white/70">
                            <span className="flex items-center gap-2">
                              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${segmentColor[segment.key]}`} />
                              {segment.label}
                            </span>
                          </th>
                          <td className="py-1.5 text-right font-mono tabular-nums">
                            {formatNumber(contributor.score[segment.key])}
                          </td>
                          <td className="py-1.5 text-right font-mono text-white/50 tabular-nums">
                            {contributor.score.total
                              ? Math.round((contributor.score[segment.key] / contributor.score.total) * 100)
                              : 0}
                            %
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-white/10 font-medium">
                        <th scope="row" className="py-2 text-left">
                          Total
                        </th>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {formatNumber(contributor.score.total)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex flex-col gap-3 text-sm text-white/60 md:w-56">
                    <p>
                      {contributor.contributionCount} contributions · {contributor.stampCount} stamps ·{" "}
                      {contributor.collabsCompleted} collabs completed
                    </p>
                    <Link href={`/profile/${contributor.address}`} className="btn btn-ghost btn-sm w-full">
                      View profile
                    </Link>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
