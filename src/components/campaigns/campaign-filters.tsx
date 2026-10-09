import Link from "next/link";
import type { CampaignListQuery } from "@/lib/collabs/types";
import { campaignCategoryLabels } from "@/lib/labels";
import type { CampaignCategory } from "@/lib/types";

const categories = Object.keys(campaignCategoryLabels) as CampaignCategory[];

export function campaignsHref(query: Partial<CampaignListQuery>) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const value = params.toString();
  return `/collabs${value ? `?${value}` : ""}`;
}

/**
 * Search, sort, and category filters. A plain GET form, so it works without
 * JavaScript and every result page has a shareable URL.
 */
export function CampaignFilters({ query }: { query: CampaignListQuery }) {
  return (
    <div className="glass flex flex-col gap-4 rounded-3xl p-4 sm:p-5">
      <form method="get" action="/collabs" className="flex flex-col gap-3 lg:flex-row" role="search">
        {query.category && <input type="hidden" name="category" value={query.category} />}
        <label htmlFor="campaign-search" className="sr-only">
          Search campaigns
        </label>
        <input
          id="campaign-search"
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder="Search by title, project, or skill"
          className="field flex-1"
          autoComplete="off"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <label htmlFor="campaign-sort" className="sr-only">
            Sort by
          </label>
          <select id="campaign-sort" name="sort" defaultValue={query.sort} className="field">
            <option value="newest">Newest</option>
            <option value="budget">Highest budget</option>
            <option value="deadline">Deadline soonest</option>
          </select>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </div>
      </form>
      <nav aria-label="Category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[null, ...categories].map((category) => {
          const active = query.category === category;
          return (
            <Link
              key={category ?? "all"}
              href={campaignsHref({ ...query, category, page: 1 })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition ${
                active
                  ? "border-monad-400/60 bg-monad-500/25 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/65 hover:text-white"
              }`}
            >
              {category ? campaignCategoryLabels[category] : "All"}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
