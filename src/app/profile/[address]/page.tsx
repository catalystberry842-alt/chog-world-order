import type { Metadata } from "next";
import Link from "next/link";
import { CrayonMark } from "@/components/crayon-mark";
import { PageFrame } from "@/components/page-frame";
import { findContributor, sampleContributors } from "@/lib/placeholders";
import { shortAddress } from "@/lib/site";

type ProfileProps = {
  params: Promise<{ address: string }>;
};

export function generateStaticParams() {
  return sampleContributors.map((person) => ({ address: person.address }));
}

export async function generateMetadata({ params }: ProfileProps): Promise<Metadata> {
  const { address } = await params;
  const person = findContributor(address);
  return {
    title: person?.name ?? shortAddress(address),
    description: "Placeholder public profile for a Chog World Order contributor.",
  };
}

export default async function ProfilePage({ params }: ProfileProps) {
  const { address } = await params;
  const person = findContributor(decodeURIComponent(address));
  const label = person?.name ?? "Unlisted contributor";

  return (
    <PageFrame
      kicker="Public profile"
      title={label}
      summary="This route will be the passport cover for any address. The sheet below is a placeholder, including when the address is not in the sample list."
    >
      <section className="stamp-card grid w-full min-w-0 gap-6 p-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <CrayonMark className="h-28 w-28" />
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-semibold text-crayon">
            {person ? person.focus : "No sample focus yet"}
          </p>
          <p className="font-mono text-sm break-all">{address}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-ink/70">Reputation</dt>
              <dd className="font-semibold">{person ? `${person.score} pts` : "—"}</dd>
            </div>
            <div>
              <dt className="text-ink/70">Stamps</dt>
              <dd className="font-semibold">—</dd>
            </div>
            <div>
              <dt className="text-ink/70">Collabs</dt>
              <dd className="font-semibold">—</dd>
            </div>
          </dl>
          <Link className="w-fit text-sm font-semibold text-crayon underline underline-offset-4" href="/leaderboard">
            Back to standings
          </Link>
        </div>
      </section>
    </PageFrame>
  );
}
