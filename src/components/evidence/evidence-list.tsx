import { EvidenceReference } from "@/components/evidence/evidence-reference";
import { VerificationStatusBadge } from "@/components/evidence/verification-status-badge";
import { EmptyState } from "@/components/ui/state-panels";
import { formatDate } from "@/lib/format";
import { evidenceKindLabels, verificationMethodLabels } from "@/lib/passport/labels";
import type { PublicEvidence } from "@/lib/passport/types";

const dot = {
  verified: "bg-crayon-mint",
  pending: "bg-crayon-yellow",
  rejected: "bg-red-400",
  unavailable: "bg-white/30",
} as const;

/**
 * Contribution history: one card per evidence record with its date, source,
 * verification method, status, and the points it earned.
 */
export function EvidenceList({
  evidence,
  emptyTitle = "No contributions yet",
  emptyDescription = "Contributions appear here once evidence is submitted and verified.",
}: {
  evidence: PublicEvidence[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (evidence.length === 0) {
    return <EmptyState compact title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[1.1rem] before:w-px before:bg-white/10">
      {evidence.map((item) => (
        <li key={item.id} className="relative flex gap-4">
          <span
            aria-hidden="true"
            className={`relative z-10 mt-5 ml-3 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-night-950 ${
              item.source === "mock" ? "bg-white/30" : dot[item.status]
            }`}
          />
          <article className="glass flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
              <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
              <span aria-hidden="true">·</span>
              <span>{evidenceKindLabels[item.kind]}</span>
              <VerificationStatusBadge status={item.status} source={item.source} />
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <h4 className="font-medium text-white">{item.title}</h4>
              <p className="shrink-0 font-mono text-sm text-white/80 tabular-nums">
                {item.status === "verified" ? `+${item.points} pts` : "0 pts"}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-white/65">{item.summary}</p>
            {item.statusReason && (
              <p
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  item.status === "rejected"
                    ? "bg-red-500/10 text-red-200"
                    : item.status === "pending"
                      ? "bg-crayon-yellow/[0.07] text-crayon-yellow/90"
                      : "bg-white/[0.04] text-white/60"
                }`}
              >
                {item.statusReason}
              </p>
            )}
            <dl className="grid gap-x-4 gap-y-1 text-xs text-white/50 sm:grid-cols-[auto_1fr]">
              <dt>Evidence</dt>
              <dd className="min-w-0 text-white/70">
                <EvidenceReference reference={item.reference} />
              </dd>
              <dt>Source</dt>
              <dd className="text-white/70">
                {item.source === "mock" ? "Sample data (not verified)" : verificationMethodLabels[item.method]}
              </dd>
              {item.payment && (
                <>
                  <dt>Payment</dt>
                  <dd className="text-white/70">
                    {item.payment.status === "confirmed" ? (
                      <>
                        <span className="text-crayon-mint">Paid {item.payment.amount}</span>
                        {item.payment.explorerUrl && (
                          <>
                            {" · "}
                            <a
                              href={item.payment.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-monad-300 hover:text-monad-200"
                            >
                              view transaction<span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-crayon-yellow">Payment {item.payment.status.replace(/-/g, " ")}</span>
                    )}
                  </dd>
                </>
              )}
              <dt>Submitted</dt>
              <dd className="text-white/70">
                <time dateTime={item.submittedAt}>{formatDate(item.submittedAt)}</time>
                {item.verifiedAt && (
                  <>
                    {" · verified "}
                    <time dateTime={item.verifiedAt}>{formatDate(item.verifiedAt)}</time>
                  </>
                )}
              </dd>
            </dl>
          </article>
        </li>
      ))}
    </ol>
  );
}
