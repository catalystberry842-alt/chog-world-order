import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LeaderboardFilters, LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { ScoringRules } from "@/components/leaderboard/scoring-rules";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { LoadingLabel } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/state-panels";
import { reputationCategoryLabels } from "@/lib/reputation/config";
import { leaderboardQuerySchema } from "@/server/api/schemas";
import { getLeaderboard } from "@/server/reputation/service";
import { getServices } from "@/server/services";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Contributor rankings from verified contributions, with the evidence behind every score.",
};

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Contribution reputation"
        title="Who's doing the work"
        description="Rankings come only from verified contributions. Open any profile to see every event behind a score."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Suspense fallback={<BoardSkeleton />}>
          <Board searchParams={searchParams} />
        </Suspense>
        <div className="lg:sticky lg:top-24">
          <ScoringRules />
        </div>
      </div>
    </PageContainer>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/leaderboard">, "searchParams">) {
  const raw = await searchParams;
  const query = leaderboardQuerySchema.safeParse({
    category: typeof raw.category === "string" ? raw.category : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const category = query.success ? (query.data.category ?? null) : null;
  const page = query.success ? query.data.page : 1;

  const services = getServices();
  if (!services.store) {
    return (
      <div className="flex flex-col gap-4">
        <LeaderboardFilters active={category} />
        <EmptyState
          title="Leaderboard unavailable"
          description="This deployment has no Passport database, so there are no verified contributors to rank. Sample profiles are never ranked."
          action={
            <Link href="/passport" className="btn btn-ghost btn-sm">
              See a sample passport
            </Link>
          }
        />
      </div>
    );
  }

  await connection(); // read the database at request time
  const data = await getLeaderboard(services, { category, page });

  return (
    <div className="flex flex-col gap-4">
      <LeaderboardFilters active={category} />
      {data.entries.length === 0 ? (
        <EmptyState
          title={page > 1 ? "No more contributors" : "No ranked contributors yet"}
          description={
            category
              ? `Nobody has earned ${reputationCategoryLabels[category].toLowerCase()} points yet.`
              : "Rankings appear once contributions are verified. Connecting a wallet does not earn a place."
          }
          action={
            <Link href="/passport" className="btn btn-primary btn-sm">
              Submit evidence
            </Link>
          }
        />
      ) : (
        <LeaderboardList data={data} />
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="skeleton h-9 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="skeleton h-16 w-full" />
      ))}
      <LoadingLabel>Loading leaderboard…</LoadingLabel>
    </div>
  );
}
