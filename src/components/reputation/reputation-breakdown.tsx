import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { PublicReputation } from "@/lib/passport/types";
import {
  reputationCategories,
  reputationCategoryLabels,
  type ReputationCategory,
} from "@/lib/reputation/config";
import type { ReputationBreakdown } from "@/lib/reputation/engine";

export const reputationColor: Record<ReputationCategory, string> = {
  campaign: "bg-crayon-yellow",
  protocol: "bg-crayon-sky",
  content: "bg-blush-400",
  research: "bg-crayon-mint",
  code: "bg-monad-400",
  consistency: "bg-crayon-orange",
  adjustment: "bg-white/40",
};

/** Stacked bar of positive points per category. */
export function ReputationBar({ breakdown, className = "" }: { breakdown: ReputationBreakdown; className?: string }) {
  const positive = reputationCategories.filter((category) => breakdown[category] > 0);
  const sum = positive.reduce((total, category) => total + breakdown[category], 0);
  return (
    <div className={`flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`} aria-hidden="true">
      {sum > 0 &&
        positive.map((category) => (
          <span
            key={category}
            className={reputationColor[category]}
            style={{ width: `${(breakdown[category] / sum) * 100}%` }}
          />
        ))}
    </div>
  );
}

/** Score, tier progress, rank, per-category breakdown, and consistency history. */
export function ReputationCard({
  reputation,
  rank,
  verifiedCount,
  sample = false,
}: {
  reputation: PublicReputation;
  rank: number | null;
  verifiedCount: number;
  sample?: boolean;
}) {
  const { tier, breakdown } = reputation;
  const progress = tier.next
    ? Math.min(100, Math.max(0, ((reputation.total - tier.minScore) / (tier.next.minScore - tier.minScore)) * 100))
    : 100;

  return (
    <section className="glass flex flex-col gap-5 rounded-3xl p-6" aria-labelledby="reputation-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="reputation-heading" className="text-sm font-medium text-white/60">
            Reputation score
          </h3>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">{formatNumber(reputation.total)}</p>
          <p className="mt-1 text-xs text-white/50">
            {verifiedCount} verified {verifiedCount === 1 ? "contribution" : "contributions"}
          </p>
        </div>
        <span className="rounded-2xl bg-monad-500/15 px-3 py-2 text-center text-xs text-monad-200 ring-1 ring-monad-400/30">
          {sample ? "Sample rank" : "Rank"}
          <span className="block text-xl font-semibold text-white tabular-nums">{rank ? `#${rank}` : "—"}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-blush-300">{tier.title}</p>
          <p className="text-xs text-white/50">
            {tier.next ? `${tier.next.minScore - reputation.total} to ${tier.next.title}` : "Top tier"}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
          <div className="h-full rounded-full bg-blush-400" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <ReputationBar breakdown={breakdown} />
      <dl className="grid gap-2 text-sm">
        {reputationCategories.map((category) => (
          <div key={category} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-white/70">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${reputationColor[category]}`} />
              {reputationCategoryLabels[category]}
            </dt>
            <dd className="font-mono tabular-nums">{formatNumber(breakdown[category])}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-4">
        <h4 className="text-sm font-medium text-white/70">Consistency history</h4>
        {reputation.consistency.length === 0 ? (
          <p className="text-xs text-white/45">No qualifying weeks yet. A week qualifies with one point-earning verified contribution.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Qualifying weeks">
            {reputation.consistency.slice(0, 12).map((week) => (
              <li
                key={week.week}
                className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-white/70 tabular-nums"
                title={week.points > 0 ? `+${week.points} points` : "Monthly cap reached"}
              >
                {week.week} · {week.points > 0 ? `+${week.points}` : "capped"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-white/40">Rules version {reputation.calculationVersion}</p>
      <Link href="/leaderboard#how-scores-work" className="text-sm font-medium text-monad-300 hover:text-monad-200">
        How scores are calculated →
      </Link>
    </section>
  );
}
