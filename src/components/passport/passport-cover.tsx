import { Avatar } from "@/components/ui/avatar";
import { formatMonth, formatNumber, shortAddress } from "@/lib/format";
import type { PublicPassport } from "@/lib/passport/types";

/** Identity card at the top of a passport or public profile. */
export function PassportCover({ passport, actions }: { passport: PublicPassport; actions?: React.ReactNode }) {
  const name = passport.profile.displayName ?? shortAddress(passport.address);
  const stats = [
    { label: "Reputation", value: formatNumber(passport.reputation.total) },
    { label: "Rank", value: passport.rank ? `#${passport.rank}` : "—" },
    { label: "Verified contributions", value: passport.verifiedContributionCount },
    { label: "Stamps", value: passport.stamps.length },
  ];

  return (
    <section className="glass relative overflow-hidden rounded-[2rem] p-6 md:p-8" aria-label="Passport cover">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-monad-500/25 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={name} hue={passport.profile.avatarHue} size="lg" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">Chog Passport</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight break-words">{name}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
              {passport.profile.handle && <span>@{passport.profile.handle}</span>}
              <span className="font-mono break-all">{passport.address}</span>
              <span>Since {formatMonth(passport.joinedAt)}</span>
            </p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {passport.profile.bio && <p className="relative mt-5 max-w-2xl leading-relaxed text-white/75">{passport.profile.bio}</p>}
      {passport.profile.skills.length > 0 && (
        <ul className="relative mt-4 flex flex-wrap gap-2" aria-label="Skills">
          {passport.profile.skills.map((skill) => (
            <li key={skill} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/75">
              {skill}
            </li>
          ))}
        </ul>
      )}
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
