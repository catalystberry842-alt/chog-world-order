import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { PageContainer } from "@/components/ui/page-header";
import { LoadingLabel } from "@/components/ui/skeletons";
import { getSampleCampaign, sampleCampaigns } from "@/lib/collabs/samples";
import type { CampaignView } from "@/lib/collabs/types";
import { getCampaign } from "@/server/collabs/service";
import { getServices } from "@/server/services";

export async function generateStaticParams() {
  return sampleCampaigns.map((campaign) => ({ id: campaign.id }));
}

/** Database campaigns first; sample campaigns only when no database is configured. */
async function findCampaign(id: string): Promise<CampaignView | undefined> {
  const services = getServices();
  if (services.collabs) {
    await connection();
    return (await getCampaign(services, id, null)) ?? undefined;
  }
  return getSampleCampaign(id);
}

export async function generateMetadata({ params }: PageProps<"/collabs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const campaign = await findCampaign(id);
  if (!campaign) return { title: "Campaign not found" };
  return { title: campaign.title, description: campaign.summary };
}

export default function CampaignPage({ params }: PageProps<"/collabs/[id]">) {
  return (
    <PageContainer className="gap-8 md:gap-10">
      <Link href="/collabs" className="w-fit text-sm font-medium text-white/60 hover:text-white">
        ← All campaigns
      </Link>
      <Suspense fallback={<CampaignSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Detail({ params }: Pick<PageProps<"/collabs/[id]">, "params">) {
  const { id } = await params;
  const campaign = await findCampaign(id);
  if (!campaign) notFound();
  return <CampaignDetail campaign={campaign} />;
}

function CampaignSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-hidden="true">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="skeleton h-14 w-14 rounded-2xl" />
          <div className="skeleton h-5 w-40" />
        </div>
        <div className="skeleton h-12 w-4/5" />
        <div className="skeleton h-5 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton h-16" />
          ))}
        </div>
        <div className="skeleton h-32 w-full" />
      </div>
      <div className="skeleton h-96" />
      <LoadingLabel>Loading campaign…</LoadingLabel>
    </div>
  );
}
