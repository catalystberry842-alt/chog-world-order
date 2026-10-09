import { EvidenceReference } from "@/components/evidence/evidence-reference";
import { PassportStamp } from "@/components/passport/passport-stamp";
import { formatDate } from "@/lib/format";
import { stampCatalogue } from "@/lib/passport/stamps";
import type { PublicStamp } from "@/lib/passport/types";

/** An earned stamp with its category, description, issue date, and evidence reference. */
export function StampCard({ stamp }: { stamp: PublicStamp }) {
  const definition = stampCatalogue[stamp.category];
  return (
    <article className="flex h-full flex-col items-center gap-2 text-center">
      <PassportStamp stamp={definition} issuedAt={stamp.issuedAt} showLabel={false} />
      <h4 className="text-base leading-tight font-semibold">{definition.name}</h4>
      <p className="text-[11px] tracking-wide text-ink/60 uppercase">
        {stamp.source === "mock" ? "Sample · " : "Issued "}
        <time dateTime={stamp.issuedAt}>{formatDate(stamp.issuedAt)}</time>
      </p>
      <p className="max-w-[13rem] text-xs leading-snug text-ink/70">{definition.description}</p>
      <p className="max-w-[13rem] text-[11px] leading-snug text-ink/55">
        Evidence: <EvidenceReference reference={stamp.evidence.reference} tone="paper" />
      </p>
    </article>
  );
}
