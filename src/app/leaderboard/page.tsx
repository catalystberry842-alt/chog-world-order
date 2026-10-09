import type { Metadata } from "next";
import Link from "next/link";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";
import { ScoringRules } from "@/components/leaderboard/scoring-rules";
import { Avatar } from "@/components/ui/avatar";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SampleDataBadge, SampleDataNotice } from "@/components/ui/sample-data-badge";
import { EmptyState } from "@/components/ui/state-panels";
import { getLeaderboard } from "@/lib/data";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Contributor rankings with a transparent score breakdown for every point.",
};

export default async function LeaderboardPage() {
  const contributors = await getLeaderboard();
  const podium = contributors.slice(0, 3);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Contribution reputation"
        title="Who's doing the work"
        description="Rankings come from reviewed contributions, stamps, and completed collabs. Open any row to see exactly where the points came from."
        badges={<SampleDataBadge label="Sample contributors" />}
      />

      {contributors.length === 0 ? (
        <EmptyState
          title="No contributors ranked yet"
          description="Rankings appear once the first contributions are reviewed."
        />
      ) : (
        <>
          <ol className="grid gap-4 sm:grid-cols-3" aria-label="Top three">
            {podium.map((contributor) => (
              <li key={contributor.address}>
                <Link
                  href={`/profile/${contributor.address}`}
                  className={`glass flex h-full flex-col items-center gap-3 rounded-3xl p-6 text-center transition hover:border-white/20 ${
                    contributor.rank === 1 ? "sm:-translate-y-2 sm:border-crayon-yellow/30" : ""
                  }`}
                >
                  <span className="font-hand text-3xl text-white/60">#{contributor.rank}</span>
                  <Avatar name={contributor.displayName} hue={contributor.avatarHue} size="lg" />
                  <span className="font-display text-lg font-semibold">{contributor.displayName}</span>
                  <span className="text-xs text-white/50">{contributor.skills.slice(0, 2).join(" · ")}</span>
                  <span className="font-display text-3xl font-semibold">{formatNumber(contributor.score.total)}</span>
                </Link>
              </li>
            ))}
          </ol>

          <SampleDataNotice>
            These contributors and scores are mock data. In the live version, only reviewed or on-chain verified
            contributions earn full points.
          </SampleDataNotice>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <LeaderboardList contributors={contributors} />
            <div className="lg:sticky lg:top-24">
              <ScoringRules />
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
