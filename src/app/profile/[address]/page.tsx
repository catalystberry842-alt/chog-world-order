import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ContributionHistory } from "@/components/passport/contribution-history";
import { PassportCover } from "@/components/passport/passport-cover";
import { ReputationPreview } from "@/components/passport/reputation-preview";
import { StampCollection } from "@/components/passport/stamp-collection";
import { PageContainer, SectionHeading } from "@/components/ui/page-header";
import { SampleDataNotice } from "@/components/ui/sample-data-badge";
import { ProfileSkeleton, LoadingLabel } from "@/components/ui/skeletons";
import { EmptyState, ErrorState } from "@/components/ui/state-panels";
import {
  getContributions,
  getContributorAddresses,
  getEarnedStamps,
  getRankedContributor,
  getStampCatalogue,
  isValidAddress,
} from "@/lib/data";
import { shortAddress } from "@/lib/format";

export async function generateStaticParams() {
  const addresses = await getContributorAddresses();
  return addresses.map((address) => ({ address }));
}

export async function generateMetadata({ params }: PageProps<"/profile/[address]">): Promise<Metadata> {
  const { address } = await params;
  const contributor = isValidAddress(address) ? await getRankedContributor(address) : undefined;
  return {
    title: contributor?.displayName ?? shortAddress(address),
    description: "Public Chog Passport: stamps, reputation, and verified activity history.",
  };
}

export default function ProfilePage({ params }: PageProps<"/profile/[address]">) {
  return (
    <PageContainer className="gap-8 md:gap-10">
      <Link href="/leaderboard" className="w-fit text-sm font-medium text-white/60 hover:text-white">
        ← Leaderboard
      </Link>
      <Suspense
        fallback={
          <>
            <ProfileSkeleton />
            <LoadingLabel>Loading profile…</LoadingLabel>
          </>
        }
      >
        <Profile params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Profile({ params }: Pick<PageProps<"/profile/[address]">, "params">) {
  const { address: rawAddress } = await params;
  const address = decodeURIComponent(rawAddress);

  if (!isValidAddress(address)) {
    return (
      <ErrorState
        title="That doesn't look like a wallet address"
        description={
          <>
            Profiles live at <span className="font-mono">/profile/0x…</span> followed by a 40-character hex
            address. Check the link and try again.
          </>
        }
        action={
          <Link href="/leaderboard" className="btn btn-ghost btn-sm">
            Browse contributors
          </Link>
        }
      />
    );
  }

  const [contributor, catalogue, earned, contributions] = await Promise.all([
    getRankedContributor(address),
    getStampCatalogue(),
    getEarnedStamps(address),
    getContributions(address),
  ]);

  if (!contributor) {
    return (
      <div className="flex flex-col gap-6">
        <header className="glass flex flex-col gap-2 rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-[0.2em] text-blush-300 uppercase">Public profile</p>
          <h1 className="font-display text-3xl font-semibold">{shortAddress(address)}</h1>
          <p className="font-mono text-sm break-all text-white/55">{address}</p>
        </header>
        <EmptyState
          title="No passport activity yet"
          description="This address hasn't recorded any contributions, stamps, or collabs. If it's yours, open the Passport page to get started."
          action={
            <Link href="/passport" className="btn btn-primary btn-sm">
              Open passport
            </Link>
          }
        />
      </div>
    );
  }

  const reviewed = contributions.filter((c) => c.status === "peer-reviewed" || c.status === "onchain-verified");

  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">{contributor.displayName}&apos;s public profile</h1>
      <PassportCover contributor={contributor} />

      <SampleDataNotice>
        Sample profile. This contributor and their history are mock data. “Peer reviewed” items show how reviewed
        records will look; none are verified on-chain.
      </SampleDataNotice>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-labelledby="activity-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="activity-heading"
            title="Activity history"
            description={`${reviewed.length} of ${contributions.length} records reviewed`}
          />
          <ContributionHistory contributions={contributions} />
        </section>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <ReputationPreview score={contributor.score} rank={contributor.rank} />
        </aside>
      </div>

      <section aria-labelledby="profile-stamps-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="profile-stamps-heading"
          title="Stamps"
          description={`${earned.length} earned. Stamps are records; minting as NFTs is optional and not available yet.`}
        />
        {earned.length > 0 ? (
          <StampCollection catalogue={catalogue} earned={earned} showLocked={false} />
        ) : (
          <EmptyState compact title="No stamps yet" description="Stamps are awarded for reviewed contributions." />
        )}
      </section>
    </div>
  );
}
