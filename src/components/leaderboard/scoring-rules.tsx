import { reputationCategoryLabels, reputationConfig, type ContributionCategory } from "@/lib/reputation/config";

const contributionCategories = Object.keys(reputationConfig.weights) as ContributionCategory[];

/** The scoring rules, rendered from the same configuration the server uses. */
export function ScoringRules({ id = "how-scores-work" }: { id?: string }) {
  const { weights, limits, consistency, tiers, version } = reputationConfig;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="glass scroll-mt-24 rounded-3xl p-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        How scores work
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        A score is the sum of a public ledger of events. Only verified or approved evidence earns points. Wallet
        balances, NFTs, followers, and transaction volume earn nothing. These weights are starting values for testing,
        not a judgement of quality.
      </p>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Points and limits per contribution</caption>
        <thead>
          <tr className="text-left text-xs text-white/45">
            <th scope="col" className="pb-2 font-medium">Verified contribution</th>
            <th scope="col" className="pb-2 text-right font-medium">Points</th>
            <th scope="col" className="pb-2 text-right font-medium">Per day</th>
            <th scope="col" className="pb-2 text-right font-medium">Per month</th>
          </tr>
        </thead>
        <tbody>
          {contributionCategories.map((category) => (
            <tr key={category} className="border-t border-white/[0.05]">
              <th scope="row" className="py-1.5 text-left font-normal text-white/70">
                {reputationCategoryLabels[category]}
              </th>
              <td className="py-1.5 text-right font-mono">+{weights[category]}</td>
              <td className="py-1.5 text-right font-mono text-white/60">{limits[category].daily}</td>
              <td className="py-1.5 text-right font-mono text-white/60">{limits[category].monthly}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-5 grid gap-2 text-sm leading-relaxed text-white/65">
        <li>
          <span className="text-white/85">Consistency:</span> +{consistency.pointsPerWeek} for each week with a
          point-earning contribution, up to {consistency.monthlyCap} per month.
        </li>
        <li>
          <span className="text-white/85">Limits:</span> contributions over a daily or monthly limit are recorded with 0
          points, so repeated actions cannot farm reputation.
        </li>
        <li>
          <span className="text-white/85">No self-approval:</span> reviewers cannot approve their own evidence, and
          duplicate evidence is rejected.
        </li>
        <li>
          <span className="text-white/85">Corrections:</span> only admins can add a correction, never to their own
          score, always with a public reason. Nothing is edited or deleted; wrong events are reversed.
        </li>
      </ul>

      <h3 className="mt-5 text-sm font-medium text-white/80">Tiers</h3>
      <ol className="mt-2 grid gap-1.5 text-sm">
        {tiers.map((tier) => (
          <li key={tier.title} className="flex justify-between gap-3">
            <span className="text-white/70">{tier.title}</span>
            <span className="font-mono text-white/60">{tier.minScore}+</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-white/40">Rules version {version}. Tiers never depend on NFT ownership.</p>
    </section>
  );
}
