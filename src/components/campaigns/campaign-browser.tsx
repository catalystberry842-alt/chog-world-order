"use client";

import { useId, useMemo, useState } from "react";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { EmptyState } from "@/components/ui/state-panels";
import { budgetRangeLabels, defaultCampaignFilters, filterCampaigns } from "@/lib/campaign-filters";
import { campaignCategoryLabels, campaignStatusLabels } from "@/lib/labels";
import type {
  BudgetRange,
  Campaign,
  CampaignCategory,
  CampaignFilters,
  CampaignSort,
  CampaignStatus,
} from "@/lib/types";

const categories = Object.keys(campaignCategoryLabels) as CampaignCategory[];
const statuses = Object.keys(campaignStatusLabels) as CampaignStatus[];
const budgetRanges = Object.keys(budgetRangeLabels) as BudgetRange[];
const sortLabels: Record<CampaignSort, string> = {
  newest: "Newest",
  budget: "Highest budget",
  deadline: "Deadline soonest",
};

/** Search, filter, and sort campaigns entirely on the client. */
export function CampaignBrowser({ campaigns }: { campaigns: Campaign[] }) {
  const [filters, setFilters] = useState<CampaignFilters>(defaultCampaignFilters);
  const ids = { search: useId(), status: useId(), budget: useId(), sort: useId() };

  const results = useMemo(() => filterCampaigns(campaigns, filters), [campaigns, filters]);

  const categoryCounts = useMemo(() => {
    const scoped = filterCampaigns(campaigns, { ...filters, category: "all" });
    return new Map(categories.map((category) => [category, scoped.filter((c) => c.category === category).length]));
  }, [campaigns, filters]);

  const update = <K extends keyof CampaignFilters>(key: K, value: CampaignFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const isFiltered =
    filters.query !== "" ||
    filters.category !== defaultCampaignFilters.category ||
    filters.status !== defaultCampaignFilters.status ||
    filters.budget !== defaultCampaignFilters.budget;

  return (
    <div className="flex flex-col gap-6">
      <div className="glass flex flex-col gap-4 rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <label htmlFor={ids.search} className="sr-only">
              Search campaigns
            </label>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-white/40"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id={ids.search}
              type="search"
              value={filters.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Search by title, project, or tag"
              className="field pl-10"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[30rem]">
            <div>
              <label htmlFor={ids.status} className="sr-only">
                Status
              </label>
              <select
                id={ids.status}
                className="field"
                value={filters.status}
                onChange={(event) => update("status", event.target.value as CampaignFilters["status"])}
              >
                <option value="all">Any status</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {campaignStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.budget} className="sr-only">
                Budget
              </label>
              <select
                id={ids.budget}
                className="field"
                value={filters.budget}
                onChange={(event) => update("budget", event.target.value as BudgetRange)}
              >
                {budgetRanges.map((range) => (
                  <option key={range} value={range}>
                    {budgetRangeLabels[range]}
                    {range === "any" ? "" : " USDC"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.sort} className="sr-only">
                Sort by
              </label>
              <select
                id={ids.sort}
                className="field"
                value={filters.sort}
                onChange={(event) => update("sort", event.target.value as CampaignSort)}
              >
                {(Object.keys(sortLabels) as CampaignSort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {sortLabels[sort]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div role="group" aria-label="Category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <CategoryChip
            label="All"
            count={[...categoryCounts.values()].reduce((sum, n) => sum + n, 0)}
            active={filters.category === "all"}
            onClick={() => update("category", "all")}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category}
              label={campaignCategoryLabels[category]}
              count={categoryCounts.get(category) ?? 0}
              active={filters.category === category}
              onClick={() => update("category", category)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60" aria-live="polite">
          {results.length === 1 ? "1 campaign" : `${results.length} campaigns`}
          {isFiltered ? " match your filters" : ""}
        </p>
        {isFiltered && (
          <button
            type="button"
            className="text-sm font-medium text-monad-300 hover:text-monad-200"
            onClick={() => setFilters(defaultCampaignFilters)}
          >
            Reset filters
          </button>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No campaigns match"
          description="Try a different search term, widen the budget range, or include campaigns that are in review or completed."
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(defaultCampaignFilters)}>
              Reset filters
            </button>
          }
        />
      )}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${
        active
          ? "border-monad-400/60 bg-monad-500/25 text-white"
          : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:text-white"
      }`}
    >
      {label}
      <span className={`text-xs tabular-nums ${active ? "text-monad-200" : "text-white/40"}`}>{count}</span>
    </button>
  );
}
