import { PassportStamp } from "@/components/passport/passport-stamp";
import type { EarnedStamp } from "@/lib/data";
import type { StampDefinition } from "@/lib/types";

/**
 * The stamp page of a passport: every stamp in the catalogue, with earned
 * stamps in colour and locked stamps showing how to earn them.
 */
export function StampCollection({
  catalogue,
  earned,
  showLocked = true,
}: {
  catalogue: StampDefinition[];
  earned: EarnedStamp[];
  showLocked?: boolean;
}) {
  const earnedById = new Map(earned.map((stamp) => [stamp.id, stamp.award.awardedOn]));
  const stamps = showLocked ? catalogue : catalogue.filter((stamp) => earnedById.has(stamp.id));
  const sorted = [...stamps].sort((a, b) => Number(earnedById.has(b.id)) - Number(earnedById.has(a.id)));

  return (
    <div className="paper relative overflow-hidden rounded-[2rem] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)] sm:p-8">
      <div className="relative mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-hand text-2xl text-ink/80">Stamps collected</p>
        <p className="text-sm font-semibold text-ink/60">
          {earned.length} of {catalogue.length}
        </p>
      </div>
      <ul className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {sorted.map((stamp) => {
          const awardedOn = earnedById.get(stamp.id);
          return (
            <li key={stamp.id} className="group flex flex-col items-center gap-2">
              <PassportStamp stamp={stamp} awardedOn={awardedOn} />
              <p className="max-w-[11rem] text-center text-xs leading-snug text-ink/60">
                {awardedOn ? stamp.description : stamp.criteria}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
