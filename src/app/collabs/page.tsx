import type { Metadata } from "next";
import { CampaignBrowser } from "@/components/campaigns/campaign-browser";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SampleDataBadge } from "@/components/ui/sample-data-badge";
import { getCampaigns } from "@/lib/data";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Collab Board",
  description: "Discover paid campaigns from Monad projects and apply with your Chog Passport.",
};

export default async function CollabsPage() {
  const campaigns = await getCampaigns();
  const open = campaigns.filter((campaign) => campaign.status === "open");
  const openBudget = open.reduce((sum, campaign) => sum + campaign.budget.total, 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Collab Board"
        title="Paid work from projects building on Monad"
        description="Find a campaign that fits your skills, apply with your passport, and get paid when your work is accepted."
        badges={<SampleDataBadge label="Sample campaigns · not funded" />}
        actions={
          <dl className="grid grid-cols-2 gap-3">
            <div className="glass rounded-2xl px-4 py-3">
              <dt className="text-xs text-white/55">Open campaigns</dt>
              <dd className="text-2xl font-semibold">{open.length}</dd>
            </div>
            <div className="glass rounded-2xl px-4 py-3">
              <dt className="text-xs text-white/55">Open budget</dt>
              <dd className="text-2xl font-semibold">
                {formatNumber(openBudget)} <span className="text-sm text-white/55">USDC</span>
              </dd>
            </div>
          </dl>
        }
      />
      <CampaignBrowser campaigns={campaigns} />
    </PageContainer>
  );
}
