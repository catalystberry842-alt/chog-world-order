import type {
  EvidenceKind,
  ReputationBreakdown,
  ReputationSource,
  StampCategory,
} from "@/lib/passport/types";
import { reputationSources } from "@/lib/passport/types";

/**
 * Reputation is a plain sum of ledger events. Points are fixed per kind of
 * verified evidence and per stamp, so nobody (contributor or reviewer) can
 * choose how many points a record is worth.
 */
export const pointsForEvidence: Record<EvidenceKind, number> = {
  "onchain-interaction": 10,
  "community-contribution": 25,
  "code-contribution": 40,
  "research-contribution": 35,
  "campaign-deliverable": 50,
};

export const sourceForEvidence: Record<EvidenceKind, Exclude<ReputationSource, "stamps">> = {
  "onchain-interaction": "onchain",
  "community-contribution": "community",
  "code-contribution": "code",
  "research-contribution": "research",
  "campaign-deliverable": "campaigns",
};

export const pointsForStamp: Record<StampCategory, number> = {
  "monad-explorer": 15,
  "community-contributor": 15,
  builder: 15,
  researcher: 15,
  collaborator: 15,
  "consistent-contributor": 30,
};

export const reputationSourceLabels: Record<ReputationSource, string> = {
  onchain: "On-chain",
  community: "Community",
  code: "Code",
  research: "Research",
  campaigns: "Campaigns",
  stamps: "Stamps",
};

export function emptyBreakdown(): ReputationBreakdown {
  return { onchain: 0, community: 0, code: 0, research: 0, campaigns: 0, stamps: 0, total: 0 };
}

/** Sums ledger events into a breakdown. Unknown sources are ignored. */
export function breakdownFromEvents(events: { source: string; points: number }[]): ReputationBreakdown {
  const breakdown = emptyBreakdown();
  for (const event of events) {
    if ((reputationSources as readonly string[]).includes(event.source)) {
      breakdown[event.source as ReputationSource] += event.points;
    }
  }
  breakdown.total = reputationSources.reduce((sum, source) => sum + breakdown[source], 0);
  return breakdown;
}
