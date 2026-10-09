import { Badge } from "@/components/ui/badge";
import type { DeliverableView } from "@/lib/collabs/types";
import { formatDate, shortAddress } from "@/lib/format";

const tone = { submitted: "yellow", accepted: "mint", rejected: "danger" } as const;
const label = { submitted: "Awaiting review", accepted: "Accepted", rejected: "Rejected" } as const;

/** Every submission with its content hash and full review history. */
export function DeliverableHistory({ deliverables }: { deliverables: DeliverableView[] }) {
  if (deliverables.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3" aria-label="Submissions">
      {[...deliverables].reverse().map((item) => (
        <li key={item.id} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Revision {item.revision}</p>
            <Badge tone={tone[item.status]}>{label[item.status]}</Badge>
          </div>
          <a
            href={item.contentUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-1 block text-sm break-all text-monad-300 hover:text-monad-200"
          >
            {item.contentUrl}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="mt-1 font-mono text-[11px] break-all text-white/45">SHA-256 {item.contentHash}</p>
          {item.notes && <p className="mt-2 text-sm text-white/65">{item.notes}</p>}
          <p className="mt-1 text-xs text-white/45">
            Submitted <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time> by{" "}
            <span className="font-mono">{shortAddress(item.creatorAddress)}</span>
          </p>
          {item.reviews.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              {item.reviews.map((review) => (
                <li key={review.createdAt} className="text-sm">
                  <span className={review.decision === "accepted" ? "text-crayon-mint" : "text-red-300"}>
                    {review.decision === "accepted" ? "Accepted" : "Rejected"}
                  </span>{" "}
                  <span className="text-white/45">
                    by <span className="font-mono">{shortAddress(review.reviewerAddress)}</span> on{" "}
                    <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                  </span>
                  <p className="text-white/70">{review.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
