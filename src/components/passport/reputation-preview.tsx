import Link from "next/link";
import { contributionCategoryLabels } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import { contributionCategories } from "@/lib/reputation";
import type { ScoreBreakdown } from "@/lib/types";

export const scoreSegments = [
  ...contributionCategories.map((category) => ({ key: category, label: contributionCategoryLabels[category] })),
  { key: "collabs", label: "Collabs" },
  { key: "stamps", label: "Stamps" },
] as const;

export const segmentColor: Record<(typeof scoreSegments)[number]["key"], string> = {
  development: "bg-crayon-sky",
  design: "bg-blush-400",
  content: "bg-crayon-yellow",
  community: "bg-crayon-orange",
  research: "bg-crayon-mint",
  collabs: "bg-monad-400",
  stamps: "bg-monad-200",
};

/** Horizontal stacked bar showing where a score comes from. */
export function ScoreBar({ score, className = "" }: { score: ScoreBreakdown; className?: string }) {
  return (
    <div className={`flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`} aria-hidden="true">
      {scoreSegments.map((segment) => {
        const value = score[segment.key];
        if (!value || !score.total) return null;
        return (
          <span
            key={segment.key}
            className={segmentColor[segment.key]}
            style={{ width: `${(value / score.total) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

/** Score total with a per-source breakdown table. */
export function ReputationPreview({ score, rank }: { score: ScoreBreakdown; rank?: number }) {
  return (
    <section className="glass flex flex-col gap-5 rounded-3xl p-6" aria-labelledby="reputation-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="reputation-heading" className="text-sm font-medium text-white/60">
            Reputation score
          </h3>
          <p className="font-display text-5xl font-semibold tracking-tight">{formatNumber(score.total)}</p>
        </div>
        {rank !== undefined && (
          <span className="rounded-2xl bg-monad-500/15 px-3 py-2 text-center text-xs text-monad-200 ring-1 ring-monad-400/30">
            Rank
            <span className="block font-display text-xl font-semibold text-white">#{rank}</span>
          </span>
        )}
      </div>
      <ScoreBar score={score} />
      <dl className="grid gap-2 text-sm">
        {scoreSegments.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-white/70">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${segmentColor[segment.key]}`} />
              {segment.label}
            </dt>
            <dd className="font-mono tabular-nums">{formatNumber(score[segment.key])}</dd>
          </div>
        ))}
      </dl>
      <Link href="/leaderboard#how-scores-work" className="text-sm font-medium text-monad-300 hover:text-monad-200">
        How scores are calculated →
      </Link>
    </section>
  );
}
