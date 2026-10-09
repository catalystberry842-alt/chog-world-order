/**
 * MOCK DATA adapter: turns the sample campaigns into CampaignView objects.
 * Used only when no database is configured, and always labelled "Sample".
 */
import { parseUnits } from "viem";
import type { CampaignListPage, CampaignListQuery, CampaignView } from "@/lib/collabs/types";
import { mockCampaigns } from "@/lib/mock/campaigns";
import type { Campaign } from "@/lib/types";

const statusMap = { open: "published", "in-review": "closed", completed: "completed" } as const;

function toView(campaign: Campaign): CampaignView {
  const perCreator = campaign.budget.perCreator ?? Math.floor(campaign.budget.total / campaign.slots.total);
  return {
    id: campaign.id,
    title: campaign.title,
    projectName: campaign.project.name,
    summary: campaign.summary,
    description: campaign.description.join("\n\n"),
    category: campaign.category,
    status: statusMap[campaign.status],
    objectives: [campaign.summary],
    deliverables: campaign.deliverables,
    eligibility: campaign.requirements,
    acceptanceCriteria: ["Meets every listed deliverable", "Original work"],
    requiredSkills: campaign.tags,
    paymentToken: "USDC",
    amountPerCreator: parseUnits(String(perCreator), 6).toString(),
    slots: campaign.slots,
    applicants: campaign.applicants,
    deadline: `${campaign.deadline}T23:59:00.000Z`,
    publishedAt: `${campaign.postedOn}T12:00:00.000Z`,
    ownerAddress: null,
    registration: { status: "not-registered", txHash: null, chainCampaignId: null, error: null },
    source: "mock",
  };
}

export const sampleCampaigns: CampaignView[] = mockCampaigns.map(toView);

export function getSampleCampaign(id: string) {
  return sampleCampaigns.find((campaign) => campaign.id === id);
}

export const SAMPLE_PAGE_SIZE = 9;

/** Same search, filter, sort, and pagination rules as the database query. */
export function listSampleCampaigns(query: CampaignListQuery): CampaignListPage {
  const needle = query.q.trim().toLowerCase();
  const rows = sampleCampaigns
    .filter((campaign) => !query.category || campaign.category === query.category)
    .filter(
      (campaign) =>
        !needle ||
        [campaign.title, campaign.summary, campaign.projectName, ...campaign.requiredSkills].join(" ").toLowerCase().includes(needle),
    )
    .sort((a, b) =>
      query.sort === "budget"
        ? Number(BigInt(b.amountPerCreator) - BigInt(a.amountPerCreator))
        : query.sort === "deadline"
          ? a.deadline.localeCompare(b.deadline)
          : (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
  const page = Math.max(1, query.page);
  return {
    campaigns: rows.slice((page - 1) * SAMPLE_PAGE_SIZE, page * SAMPLE_PAGE_SIZE),
    page,
    pageSize: SAMPLE_PAGE_SIZE,
    total: rows.length,
    source: "mock",
  };
}
