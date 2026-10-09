import type { Metadata } from "next";
import Link from "next/link";
import { MyPassport } from "@/components/passport/my-passport";
import { PassportView } from "@/components/passport/passport-view";
import { PageContainer, PageHeader, SectionHeading } from "@/components/ui/page-header";
import { SampleDataBadge } from "@/components/ui/sample-data-badge";
import { getFeaturedSampleAddress, getSamplePassport } from "@/lib/data";
import { supportedApps } from "@/server/verification/supported-apps";

export const metadata: Metadata = {
  title: "Passport",
  description: "Your Chog Passport: wallet-based identity, crayon stamps for verified activity, reputation, and contribution history.",
};

export default async function PassportPage() {
  const sample = await getSamplePassport(await getFeaturedSampleAddress());
  const apps = supportedApps.map((app) => ({ id: app.id, name: app.name }));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Chog Passport"
        title="A passport for the work you do on Monad"
        description="Stamps for verified activity, a score you can audit, and a history projects can check before they hire you."
      />

      <MyPassport supportedApps={apps} />

      {sample && (
        <section aria-labelledby="sample-heading" className="flex flex-col gap-8 border-t border-white/[0.06] pt-10">
          <SectionHeading
            id="sample-heading"
            title="Sample passport"
            description="What a well-used passport looks like, including records still waiting for verification."
            action={<SampleDataBadge label="Sample data · not verified" />}
          />
          <PassportView
            passport={sample}
            audience="owner"
            idPrefix="sample"
            coverActions={
              <Link href={`/profile/${sample.address}`} className="btn btn-ghost btn-sm">
                Public profile
              </Link>
            }
          />
        </section>
      )}
    </PageContainer>
  );
}
