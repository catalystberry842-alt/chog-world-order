import Link from "next/link";
import { VerificationBadge } from "@/components/passport/verification-badge";
import { EmptyState } from "@/components/ui/state-panels";
import { formatDate } from "@/lib/format";
import { contributionCategoryLabels } from "@/lib/labels";
import { contributionPoints } from "@/lib/reputation";
import type { Contribution } from "@/lib/types";

/** Timeline of contributions with verification status and points earned. */
export function ContributionHistory({ contributions }: { contributions: Contribution[] }) {
  if (contributions.length === 0) {
    return (
      <EmptyState
        compact
        title="No contributions yet"
        description="Contributions will appear here once they are submitted and reviewed."
      />
    );
  }

  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[1.1rem] before:w-px before:bg-white/10">
      {contributions.map((contribution) => {
        const points = contributionPoints(contribution);
        return (
          <li key={contribution.id} className="relative flex gap-4">
            <span
              aria-hidden="true"
              className={`relative z-10 mt-5 ml-3 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-night-950 ${
                contribution.status === "peer-reviewed" ? "bg-monad-400" : "bg-white/30"
              }`}
            />
            <article className="glass flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                <time dateTime={contribution.date}>{formatDate(contribution.date)}</time>
                <span aria-hidden="true">·</span>
                <span>{contributionCategoryLabels[contribution.category]}</span>
                <VerificationBadge status={contribution.status} />
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <h4 className="font-medium text-white">{contribution.title}</h4>
                <p className="shrink-0 font-mono text-sm tabular-nums text-white/80">
                  +{points}
                  <span className="text-white/40"> / {contribution.basePoints} pts</span>
                </p>
              </div>
              <p className="text-sm leading-relaxed text-white/65">{contribution.summary}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
                <span>Evidence: {contribution.evidence.label}</span>
                {contribution.campaignId && (
                  <Link href={`/collabs/${contribution.campaignId}`} className="text-monad-300 hover:text-monad-200">
                    Via Collab Board →
                  </Link>
                )}
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
