import { evidenceKindLabels } from "@/lib/passport/labels";
import { pointsForEvidence, pointsForStamp } from "@/lib/passport/reputation";
import { stampCatalogue } from "@/lib/passport/stamps";
import { evidenceKinds, stampCategories } from "@/lib/passport/types";

/** The full scoring formula, rendered from the same constants the server uses. */
export function ScoringRules() {
  return (
    <section id="how-scores-work" aria-labelledby="scoring-heading" className="glass scroll-mt-24 rounded-3xl p-6">
      <h2 id="scoring-heading" className="font-display text-xl font-semibold">
        How scores work
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        A score is a plain sum of verified records. Points are fixed per type, so neither contributors nor reviewers
        choose how much something is worth. Pending, rejected, and unverifiable claims earn nothing, and connecting a
        wallet earns nothing.
      </p>
      <p className="mt-4 rounded-2xl bg-night-950/50 px-4 py-3 font-mono text-xs leading-relaxed text-monad-200 ring-1 ring-white/[0.06] sm:text-sm">
        score = Σ points per verified contribution + Σ points per stamp
      </p>
      <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <h3 className="text-sm font-medium text-white/80">Verified contribution</h3>
          <dl className="mt-2 grid gap-1.5 text-sm">
            {evidenceKinds.map((kind) => (
              <div key={kind} className="flex justify-between gap-3">
                <dt className="text-white/60">{evidenceKindLabels[kind]}</dt>
                <dd className="font-mono">+{pointsForEvidence[kind]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-medium text-white/80">Stamp (once per category)</h3>
          <dl className="mt-2 grid gap-1.5 text-sm">
            {stampCategories.map((category) => (
              <div key={category} className="flex justify-between gap-3">
                <dt className="text-white/60">{stampCatalogue[category].name}</dt>
                <dd className="font-mono">+{pointsForStamp[category]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
