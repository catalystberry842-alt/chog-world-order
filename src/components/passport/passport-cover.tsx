import { Avatar } from "@/components/ui/avatar";
import { formatMonth, formatNumber, shortAddress } from "@/lib/format";
import type { RankedContributor } from "@/lib/types";

/** Identity card at the top of a passport or public profile. */
export function PassportCover({ contributor, actions }: { contributor: RankedContributor; actions?: React.ReactNode }) {
  const stats = [
    { label: "Reputation", value: formatNumber(contributor.score.total) },
    { label: "Rank", value: `#${contributor.rank}` },
    { label: "Stamps", value: contributor.stampCount },
    { label: "Collabs done", value: contributor.collabsCompleted },
  ];

  return (
    <section className="glass relative overflow-hidden rounded-[2rem] p-6 md:p-8" aria-label="Passport cover">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-monad-500/25 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={contributor.displayName} hue={contributor.avatarHue} size="lg" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">Chog Passport</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight">{contributor.displayName}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
              <span>@{contributor.handle}</span>
              <span className="font-mono" title={contributor.address}>
                {shortAddress(contributor.address)}
              </span>
              <span>Since {formatMonth(contributor.joined)}</span>
            </p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <p className="relative mt-5 max-w-2xl leading-relaxed text-white/75">{contributor.bio}</p>
      <ul className="relative mt-4 flex flex-wrap gap-2" aria-label="Skills">
        {contributor.skills.map((skill) => (
          <li key={skill} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/75">
            {skill}
          </li>
        ))}
      </ul>
      <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-night-950/40 px-4 py-3 ring-1 ring-white/[0.06]">
            <dt className="text-xs text-white/55">{stat.label}</dt>
            <dd className="font-display text-2xl font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
