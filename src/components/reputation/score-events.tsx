import { EvidenceReference } from "@/components/evidence/evidence-reference";
import { EmptyState } from "@/components/ui/state-panels";
import { formatDate } from "@/lib/format";
import type { PublicReputationEvent } from "@/lib/passport/types";
import { reputationCategoryLabels } from "@/lib/reputation/config";

/**
 * The ledger behind a score: every event with its points, reason, rules
 * version, and the evidence that supports it. Reversed events stay visible.
 */
export function ScoreEvents({ events, limit = 12 }: { events: PublicReputationEvent[]; limit?: number }) {
  if (events.length === 0) {
    return (
      <EmptyState
        compact
        title="No score events yet"
        description="Events appear when verified evidence earns points. Connecting a wallet earns nothing."
      />
    );
  }

  const row = (event: PublicReputationEvent) => (
    <li key={event.id} className={`flex gap-3 py-3 ${event.reversed ? "opacity-50" : ""}`}>
      <span
        className={`w-14 shrink-0 text-right font-mono text-sm tabular-nums ${
          event.points > 0 ? "text-crayon-mint" : event.points < 0 ? "text-red-300" : "text-white/40"
        }`}
      >
        {event.points > 0 ? `+${event.points}` : event.points}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm text-white/85">
          {event.reason}
          {event.reversed && <span className="ml-2 text-xs text-white/50">(reversed)</span>}
        </p>
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-white/45">
          <span>{reputationCategoryLabels[event.category]}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <span>rules {event.calculationVersion}</span>
        </p>
        {event.evidence && (
          <p className="text-xs text-white/55">
            {event.evidence.title} · <EvidenceReference reference={event.evidence.reference} />
          </p>
        )}
      </div>
    </li>
  );

  const visible = events.slice(0, limit);
  const rest = events.slice(limit);
  return (
    <div className="glass rounded-3xl px-5 py-2">
      <ol className="divide-y divide-white/[0.06]">{visible.map(row)}</ol>
      {rest.length > 0 && (
        <details className="border-t border-white/[0.06] py-3">
          <summary className="cursor-pointer text-sm font-medium text-monad-300">Show {rest.length} older events</summary>
          <ol className="divide-y divide-white/[0.06]">{rest.map(row)}</ol>
        </details>
      )}
    </div>
  );
}
