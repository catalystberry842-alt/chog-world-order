import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { reputationSourceLabels } from "@/lib/passport/reputation";
import { reputationSources, type ReputationBreakdown, type ReputationSource } from "@/lib/passport/types";

export const reputationColor: Record<ReputationSource, string> = {
  onchain: "bg-crayon-sky",
  community: "bg-blush-400",
  code: "bg-monad-400",
  research: "bg-crayon-mint",
  campaigns: "bg-crayon-yellow",
  stamps: "bg-crayon-orange",
};

/** Stacked bar showing where a score comes from. */
export function ReputationBar({ reputation, className = "" }: { reputation: ReputationBreakdown; className?: string }) {
  return (
    <div className={`flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`} aria-hidden="true">
      {reputationSources.map((source) =>
        reputation[source] && reputation.total ? (
          <span
            key={source}
            className={reputationColor[source]}
            style={{ width: `${(reputation[source] / reputation.total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

/** Score total, rank, and a per-source breakdown table. */
export function ReputationBreakdownCard({
  reputation,
  rank,
  verifiedCount,
}: {
  reputation: ReputationBreakdown;
  rank: number | null;
  verifiedCount: number;
}) {
  return (
    <section className="glass flex flex-col gap-5 rounded-3xl p-6" aria-labelledby="reputation-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="reputation-heading" className="text-sm font-medium text-white/60">
            Reputation score
          </h3>
          <p className="font-display text-5xl font-semibold tracking-tight">{formatNumber(reputation.total)}</p>
          <p className="mt-1 text-xs text-white/50">
            {verifiedCount} verified {verifiedCount === 1 ? "contribution" : "contributions"}
          </p>
        </div>
        <span className="rounded-2xl bg-monad-500/15 px-3 py-2 text-center text-xs text-monad-200 ring-1 ring-monad-400/30">
          Rank
          <span className="block font-display text-xl font-semibold text-white">{rank ? `#${rank}` : "—"}</span>
        </span>
      </div>
      <ReputationBar reputation={reputation} />
      <dl className="grid gap-2 text-sm">
        {reputationSources.map((source) => (
          <div key={source} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-white/70">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${reputationColor[source]}`} />
              {reputationSourceLabels[source]}
            </dt>
            <dd className="font-mono tabular-nums">{formatNumber(reputation[source])}</dd>
          </div>
        ))}
      </dl>
      <Link href="/leaderboard#how-scores-work" className="text-sm font-medium text-monad-300 hover:text-monad-200">
        How scores are calculated →
      </Link>
    </section>
  );
}
