import type { Metadata } from "next";
import Link from "next/link";
import { ContributionHistory } from "@/components/passport/contribution-history";
import { PassportCover } from "@/components/passport/passport-cover";
import { PassportWalletPanel } from "@/components/passport/passport-wallet-panel";
import { ReputationPreview } from "@/components/passport/reputation-preview";
import { StampCollection } from "@/components/passport/stamp-collection";
import { PageContainer, PageHeader, SectionHeading } from "@/components/ui/page-header";
import { SampleDataBadge, SampleDataNotice } from "@/components/ui/sample-data-badge";
import {
  getContributions,
  getEarnedStamps,
  getRankedContributor,
  getSamplePassportAddress,
  getStampCatalogue,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Passport",
  description: "Your Chog Passport: wallet-based identity, crayon stamps, reputation, and contribution history.",
};

export default async function PassportPage() {
  const sampleAddress = await getSamplePassportAddress();
  const [sample, catalogue, earned, contributions] = await Promise.all([
    getRankedContributor(sampleAddress),
    getStampCatalogue(),
    getEarnedStamps(sampleAddress),
    getContributions(sampleAddress),
  ]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Chog Passport"
        title="A passport for the work you do on Monad"
        description="Stamps for what you've shipped, a score you can audit, and a history projects can check before they hire you."
      />

      <PassportWalletPanel />

      {sample && (
        <section aria-labelledby="sample-heading" className="flex flex-col gap-8">
          <SectionHeading
            id="sample-heading"
            title="Sample passport"
            description="What a well-used passport looks like."
            action={<SampleDataBadge label="Sample data · not on-chain" />}
          />
          <SampleDataNotice>
            Everything below is mock data for a fictional contributor. Statuses like “Peer reviewed” show how real
            records will be labelled. No stamp here is minted and no contribution is verified on-chain.
          </SampleDataNotice>

          <PassportCover
            contributor={sample}
            actions={
              <Link href={`/profile/${sample.address}`} className="btn btn-ghost btn-sm">
                Public profile
              </Link>
            }
          />

          <section aria-labelledby="stamps-heading" className="flex flex-col gap-4">
            <SectionHeading
              id="stamps-heading"
              title="Stamp collection"
              description="Earned stamps are in colour. Locked stamps show how to earn them."
            />
            <StampCollection catalogue={catalogue} earned={earned} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <section aria-labelledby="history-heading" className="flex flex-col gap-4">
              <SectionHeading
                id="history-heading"
                title="Contribution history"
                description="Newest first, with the points each record earned."
              />
              <ContributionHistory contributions={contributions} />
            </section>
            <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
              <SectionHeading title="Reputation preview" />
              <ReputationPreview score={sample.score} rank={sample.rank} />
            </aside>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
