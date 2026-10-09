import Link from "next/link";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { PassportStamp } from "@/components/passport/passport-stamp";
import { ChogIllustration } from "@/components/ui/chog-illustration";
import { PageContainer, SectionHeading } from "@/components/ui/page-header";
import { SampleDataBadge } from "@/components/ui/sample-data-badge";
import { getCampaigns, getStampCatalogue } from "@/lib/data";

const pillars = [
  {
    title: "Chog Passport",
    href: "/passport",
    copy: "One wallet, one public record. Illustrated stamps, reviewed activity, and contribution history. Minting an NFT is optional, never required.",
    accent: "from-monad-500/30",
  },
  {
    title: "Contribution Reputation",
    href: "/leaderboard",
    copy: "A transparent score built from useful work across Monad. Every point traces back to a contribution, a stamp, or a completed collab.",
    accent: "from-blush-400/25",
  },
  {
    title: "Collab Board",
    href: "/collabs",
    copy: "Projects post paid campaigns. Creators apply with their passport, deliver the work, and get paid when it's accepted.",
    accent: "from-crayon-mint/20",
  },
];

const journey = [
  { step: "Contribute", copy: "Ship code, art, writing, research, or community work." },
  { step: "Verify", copy: "Reviewers check the evidence. Status is always shown." },
  { step: "Build reputation", copy: "Reviewed work adds points and earns stamps." },
  { step: "Get hired", copy: "Apply to campaigns with your passport attached." },
  { step: "Complete work", copy: "Deliver to the brief and submit for acceptance." },
  { step: "Get paid", copy: "Accepted work is paid in USDC or MON." },
];

export default async function HomePage() {
  const [campaigns, catalogue] = await Promise.all([getCampaigns(), getStampCatalogue()]);
  const featured = campaigns.filter((campaign) => campaign.status === "open").slice(0, 3);
  const heroStamps = catalogue.filter((stamp) => ["chog-heart", "builder", "crayon-artist", "first-collab"].includes(stamp.id));

  return (
    <PageContainer className="gap-20 md:gap-28">
      {/* Hero */}
      <section className="grid items-center gap-12 pt-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col gap-6">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blush-400" />
            Built for the Monad ecosystem
          </p>
          <h1 className="font-display text-5xl leading-[0.98] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Your work, <span className="crayon-underline text-monad-300">stamped</span> and paid.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-white/70">
            Chog World Order turns useful contributions into a passport people can trust, then connects that
            reputation to paid collaborations with Monad projects.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/passport" className="btn btn-primary">
              Open your passport
            </Link>
            <Link href="/collabs" className="btn btn-ghost">
              Browse paid collabs
            </Link>
          </div>
          <p className="text-sm text-white/45">No sign-up form. No seed phrases. Just connect a wallet.</p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-monad-500/25 blur-3xl" />
          <div className="paper relative rotate-[-2deg] rounded-[2rem] p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-hand text-2xl leading-none">Chog Passport</p>
                <p className="mt-1 text-xs tracking-widest text-ink/50 uppercase">Monad · Contributor</p>
              </div>
              <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold tracking-wide text-paper uppercase">
                Sample
              </span>
            </div>
            <ChogIllustration className="mx-auto my-3 h-40 w-auto" />
            <div className="grid grid-cols-4 gap-2">
              {heroStamps.map((stamp) => (
                <PassportStamp key={stamp.id} stamp={stamp} awardedOn="2026-09-01" size="sm" showLabel={false} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section aria-labelledby="pillars-heading" className="flex flex-col gap-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">Three parts, one record</p>
          <h2 id="pillars-heading" className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Identity, reputation, and paid work in one place
          </h2>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar, index) => (
            <li key={pillar.title}>
              <Link
                href={pillar.href}
                className={`glass group flex h-full flex-col gap-4 rounded-3xl bg-gradient-to-b ${pillar.accent} to-transparent p-6 transition hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transition-none`}
              >
                <span className="font-hand text-3xl text-white/50">0{index + 1}</span>
                <h3 className="font-display text-2xl font-semibold">{pillar.title}</h3>
                <p className="leading-relaxed text-white/65">{pillar.copy}</p>
                <span className="mt-auto text-sm font-medium text-monad-300 group-hover:text-monad-200">
                  Explore →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Journey */}
      <section aria-labelledby="journey-heading" className="paper rounded-[2rem] p-6 sm:p-10">
        <div className="flex flex-col gap-2">
          <p className="font-hand text-2xl text-ink/70">The loop</p>
          <h2 id="journey-heading" className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            From first contribution to first paycheck
          </h2>
        </div>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-6 lg:gap-4">
          {journey.map((item, index) => (
            <li key={item.step} className="relative flex flex-col gap-2">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink font-display font-semibold"
                style={{ background: ["#bfb2fd", "#ffb3dc", "#7fe0b8", "#ffd166", "#7cc6ff", "#ff9f68"][index] }}
              >
                {index + 1}
              </span>
              <h3 className="font-display text-lg font-semibold">{item.step}</h3>
              <p className="text-sm leading-relaxed text-ink/70">{item.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Featured campaigns */}
      <section aria-labelledby="featured-heading" className="flex flex-col gap-6">
        <SectionHeading
          id="featured-heading"
          title="Open collabs"
          description="Paid campaigns from projects building on Monad."
          action={
            <div className="flex items-center gap-3">
              <SampleDataBadge />
              <Link href="/collabs" className="text-sm font-medium text-monad-300 hover:text-monad-200">
                View all →
              </Link>
            </div>
          }
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      </section>

      {/* Principles */}
      <section className="glass grid gap-8 rounded-[2rem] p-6 sm:p-10 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Honest by design</h2>
          <p className="leading-relaxed text-white/65">
            Reputation only works if people can check it. Every record shows exactly how it was verified.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["Visible status", "Self-reported, pending, peer reviewed, or verified on-chain. Always labelled."],
            ["Open formula", "Scores are a plain sum you can recompute by hand."],
            ["NFTs optional", "Stamps are records first. Minting is a choice, not a gate."],
            ["Your keys stay yours", "We never ask for seed phrases or private keys."],
          ].map(([title, copy]) => (
            <li key={title} className="rounded-2xl bg-night-950/40 p-4 ring-1 ring-white/[0.06]">
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{copy}</p>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
