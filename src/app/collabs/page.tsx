import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { CampaignFilters, campaignsHref } from "@/components/campaigns/campaign-filters";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SampleDataBadge } from "@/components/ui/sample-data-badge";
import { CardGridSkeleton, LoadingLabel } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/state-panels";
import { listSampleCampaigns } from "@/lib/collabs/samples";
import type { CampaignListQuery } from "@/lib/collabs/types";
import { campaignListQuerySchema } from "@/server/api/schemas";
import { listCampaigns } from "@/server/collabs/service";
import { getServices } from "@/server/services";

export const metadata: Metadata = {
  title: "Collab Board",
  description: "Discover paid campaigns from Monad projects and apply with your Chog Passport.",
};

export default function CollabsPage({ searchParams }: PageProps<"/collabs">) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Collab Board"
        title="Paid work from projects building on Monad"
        description="Find a campaign that fits your skills, apply with your Passport, and get paid directly by the project when your work is accepted."
        actions={
          <Link href="/collabs/dashboard" className="btn btn-primary">
            Post a campaign
          </Link>
        }
      />
      <Suspense
        fallback={
          <>
            <CardGridSkeleton />
            <LoadingLabel>Loading campaigns…</LoadingLabel>
          </>
        }
      >
        <Board searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/collabs">, "searchParams">) {
  const raw = await searchParams;
  const parsed = campaignListQuerySchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  );
  const query: CampaignListQuery = parsed.success
    ? { ...parsed.data, category: parsed.data.category ?? null }
    : { q: "", category: null, sort: "newest", page: 1 };

  const services = getServices();
  let page;
  if (services.collabs) {
    await connection(); // database reads happen at request time
    page = await listCampaigns(services, query);
  } else {
    page = listSampleCampaigns(query);
  }
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const filtered = Boolean(query.q || query.category);

  return (
    <div className="flex flex-col gap-6">
      <CampaignFilters query={query} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60" aria-live="polite">
          {page.total === 1 ? "1 campaign" : `${page.total} campaigns`}
          {filtered ? " match your search" : ""}
        </p>
        {page.source === "mock" && <SampleDataBadge label="Sample campaigns · no database configured" />}
      </div>

      {page.campaigns.length === 0 ? (
        <EmptyState
          title={filtered ? "No campaigns match" : "No campaigns yet"}
          description={
            filtered
              ? "Try another search term or category."
              : "Projects haven't published any campaigns. Be the first to post one."
          }
          action={
            filtered ? (
              <Link href="/collabs" className="btn btn-ghost btn-sm">
                Clear filters
              </Link>
            ) : (
              <Link href="/collabs/dashboard" className="btn btn-primary btn-sm">
                Post a campaign
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.campaigns.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
          {page.page > 1 ? (
            <Link href={campaignsHref({ ...query, page: page.page - 1 })} className="btn btn-ghost btn-sm">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-white/55">
            Page {page.page} of {pages}
          </span>
          {page.page < pages ? (
            <Link href={campaignsHref({ ...query, page: page.page + 1 })} className="btn btn-ghost btn-sm">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
