import { verificationLabels, stampTierLabels } from "@/lib/labels";
import { pointsPerCompletedCollab, pointsPerStampTier, statusMultiplier } from "@/lib/reputation";
import type { StampTier, VerificationStatus } from "@/lib/types";

const statuses = Object.keys(statusMultiplier) as VerificationStatus[];
const tiers = Object.keys(pointsPerStampTier) as StampTier[];

/** The full scoring formula, rendered from the same constants the code uses. */
export function ScoringRules() {
  return (
    <section id="how-scores-work" aria-labelledby="scoring-heading" className="glass scroll-mt-24 rounded-3xl p-6">
      <h2 id="scoring-heading" className="font-display text-xl font-semibold">
        How scores work
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        A score is a plain sum. No hidden weights, no decay, no paid boosts. Every number below comes straight from
        the code that calculates the leaderboard.
      </p>
      <p className="mt-4 rounded-2xl bg-night-950/50 px-4 py-3 font-mono text-xs leading-relaxed text-monad-200 ring-1 ring-white/[0.06] sm:text-sm">
        score = Σ (contribution points × status multiplier) + {pointsPerCompletedCollab} × collabs completed + Σ stamp
        points
      </p>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        <div>
          <h3 className="text-sm font-medium text-white/80">Status multiplier</h3>
          <dl className="mt-2 grid gap-1.5 text-sm">
            {statuses.map((status) => (
              <div key={status} className="flex justify-between gap-3">
                <dt className="text-white/60">{verificationLabels[status]}</dt>
                <dd className="font-mono">×{statusMultiplier[status]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-medium text-white/80">Stamps</h3>
          <dl className="mt-2 grid gap-1.5 text-sm">
            {tiers.map((tier) => (
              <div key={tier} className="flex justify-between gap-3">
                <dt className="text-white/60">{stampTierLabels[tier]}</dt>
                <dd className="font-mono">+{pointsPerStampTier[tier]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-medium text-white/80">Collabs</h3>
          <p className="mt-2 text-sm text-white/60">
            Each campaign completed and paid through the Collab Board adds{" "}
            <span className="font-mono text-white">+{pointsPerCompletedCollab}</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
