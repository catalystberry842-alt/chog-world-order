import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { sampleContributors } from "@/lib/placeholders";
import { shortAddress } from "@/lib/site";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Placeholder standings for contributor reputation.",
};

export default function LeaderboardPage() {
  return (
    <PageFrame
      kicker="Contributor reputation"
      title="Standings, not a scoreboard cult."
      summary="Reputation will rank public contribution. The names below are invented so the route has a shape. Scores are not calculated."
    >
      <ol className="grid gap-3">
        {sampleContributors.map((person, index) => (
          <li key={person.address}>
            <Link
              href={`/profile/${person.address}`}
              className="stamp-card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-center gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink text-sm font-semibold text-ink">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-semibold">{person.name}</span>
                  <span className="block text-sm text-ink/70">
                    {shortAddress(person.address)} · {person.focus}
                  </span>
                </span>
              </span>
              <span className="text-sm font-semibold text-crayon sm:text-right">
                {person.score} sample pts
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </PageFrame>
  );
}
