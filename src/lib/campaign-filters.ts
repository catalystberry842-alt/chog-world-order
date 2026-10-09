import type { BudgetRange, Campaign, CampaignFilters } from "@/lib/types";

export const defaultCampaignFilters: CampaignFilters = {
  query: "",
  category: "all",
  status: "open",
  budget: "any",
  sort: "newest",
};

export const budgetRangeLabels: Record<BudgetRange, string> = {
  any: "Any budget",
  "under-1k": "Under 1,000",
  "1k-5k": "1,000 – 5,000",
  "over-5k": "Over 5,000",
};

function matchesBudget(campaign: Campaign, range: BudgetRange) {
  const total = campaign.budget.total;
  switch (range) {
    case "any":
      return true;
    case "under-1k":
      return total < 1000;
    case "1k-5k":
      return total >= 1000 && total <= 5000;
    case "over-5k":
      return total > 5000;
  }
}

function matchesQuery(campaign: Campaign, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    campaign.title,
    campaign.summary,
    campaign.project.name,
    campaign.project.handle,
    ...campaign.tags,
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((term) => haystack.includes(term));
}

/** Pure filter + sort so the logic can move server-side later unchanged. */
export function filterCampaigns(campaigns: Campaign[], filters: CampaignFilters) {
  const result = campaigns.filter(
    (campaign) =>
      (filters.category === "all" || campaign.category === filters.category) &&
      (filters.status === "all" || campaign.status === filters.status) &&
      matchesBudget(campaign, filters.budget) &&
      matchesQuery(campaign, filters.query),
  );

  return result.sort((a, b) => {
    switch (filters.sort) {
      case "budget":
        return b.budget.total - a.budget.total;
      case "deadline":
        return a.deadline.localeCompare(b.deadline);
      case "newest":
        return b.postedOn.localeCompare(a.postedOn);
    }
  });
}
