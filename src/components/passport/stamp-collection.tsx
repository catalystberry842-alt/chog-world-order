import { PassportStamp } from "@/components/passport/passport-stamp";
import { StampCard } from "@/components/passport/stamp-card";
import { orderedStamps } from "@/lib/passport/stamps";
import type { PublicStamp } from "@/lib/passport/types";

/**
 * The stamp page of a passport. Earned stamps show their evidence; locked
 * stamps show how to earn them.
 */
export function StampCollection({ stamps, showLocked = true }: { stamps: PublicStamp[]; showLocked?: boolean }) {
  const earned = new Map(stamps.map((stamp) => [stamp.category, stamp]));
  const locked = showLocked ? orderedStamps.filter((definition) => !earned.has(definition.category)) : [];

  return (
    <div className="paper relative overflow-hidden rounded-[2rem] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)] sm:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-hand text-2xl text-ink/80">Stamps collected</p>
        <p className="text-sm font-semibold text-ink/60">
          {earned.size} of {orderedStamps.length}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
        {stamps.map((stamp) => (
          <li key={stamp.id}>
            <StampCard stamp={stamp} />
          </li>
        ))}
        {locked.map((definition) => (
          <li key={definition.category} className="flex flex-col items-center gap-2 text-center">
            <PassportStamp stamp={definition} />
            <p className="max-w-[13rem] text-xs leading-snug text-ink/60">{definition.criteria}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
