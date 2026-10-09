import { EvidenceList } from "@/components/evidence/evidence-list";
import { PassportCover } from "@/components/passport/passport-cover";
import { StampCollection } from "@/components/passport/stamp-collection";
import { ScoringRules } from "@/components/leaderboard/scoring-rules";
import { ReputationCard } from "@/components/reputation/reputation-breakdown";
import { ScoreEvents } from "@/components/reputation/score-events";
import { SectionHeading } from "@/components/ui/page-header";
import { SampleDataNotice } from "@/components/ui/sample-data-badge";
import type { PublicPassport } from "@/lib/passport/types";

/**
 * A full passport: cover, stamps, contribution history, and reputation.
 * Works for real and sample passports; samples get a visible notice.
 *
 * @param audience "public" shows verified records only. "owner" also shows
 *                 pending, rejected, and unavailable records.
 */
export function PassportView({
  passport,
  audience,
  coverActions,
  idPrefix = "passport",
}: {
  passport: PublicPassport;
  audience: "public" | "owner";
  coverActions?: React.ReactNode;
  idPrefix?: string;
}) {
  const contributions =
    audience === "owner" ? passport.contributions : passport.contributions.filter((item) => item.status === "verified");

  return (
    <div className="flex flex-col gap-10">
      <PassportCover passport={passport} actions={coverActions} />

      {passport.source === "mock" && (
        <SampleDataNotice>
          Sample passport. This contributor, their stamps, and their history are mock data for illustration. Nothing
          here was verified on-chain or by a reviewer.
        </SampleDataNotice>
      )}

      <section aria-labelledby={`${idPrefix}-stamps`} className="flex flex-col gap-4">
        <SectionHeading
          id={`${idPrefix}-stamps`}
          title="Stamps"
          description="Earned for verified activity. Stamps are records; minting them as NFTs is optional and not required."
        />
        <StampCollection stamps={passport.stamps} />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-labelledby={`${idPrefix}-history`} className="flex flex-col gap-4">
          <SectionHeading
            id={`${idPrefix}-history`}
            title={audience === "owner" ? "Contribution history" : "Verified contributions"}
            description={
              audience === "owner"
                ? "All your claims, including ones still waiting for verification."
                : "Only verified records are shown publicly."
            }
          />
          <EvidenceList
            evidence={contributions}
            emptyTitle={audience === "owner" ? "No contributions yet" : "No verified contributions yet"}
          />
        </section>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <ReputationCard
            reputation={passport.reputation}
            rank={passport.rank}
            verifiedCount={passport.verifiedContributionCount}
            sample={passport.source === "mock"}
          />
        </aside>
      </div>

      <section aria-labelledby={`${idPrefix}-score`} className="flex flex-col gap-4">
        <SectionHeading
          id={`${idPrefix}-score`}
          title="Evidence behind the score"
          description="Every point comes from an event in this ledger. Reversed events stay visible."
        />
        <ScoreEvents events={passport.reputation.events} />
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-monad-300 hover:text-monad-200">
            Read the scoring rules
          </summary>
          <div className="mt-4">
            <ScoringRules id={`${idPrefix}-rules`} />
          </div>
        </details>
      </section>
    </div>
  );
}
