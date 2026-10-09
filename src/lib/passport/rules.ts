import { pointsForEvidence, pointsForStamp, sourceForEvidence } from "@/lib/passport/reputation";
import { consistentContributorWeeks, stampForEvidenceKind } from "@/lib/passport/stamps";
import type { EvidenceKind, ReputationSource, StampCategory } from "@/lib/passport/types";

/** ISO-8601 week key in UTC, e.g. "2026-W41". */
export function isoWeekKey(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type VerifiedEvidenceFact = { id: string; kind: EvidenceKind; occurredAt: Date };

export type PlannedStamp = { category: StampCategory; evidenceId: string };
export type PlannedReputation = {
  kind: "contribution-verified" | "stamp-issued";
  source: ReputationSource;
  points: number;
  reason: string;
  evidenceId: string;
  /** Set for stamp events; the stamp id is only known after it is created. */
  stampCategory?: StampCategory;
};

/**
 * Decides what one newly verified evidence record earns.
 *
 * Pure and idempotent: callers pass what the user already holds, and the
 * plan never repeats a stamp category or a contribution event. The database
 * unique constraints enforce the same rules a second time.
 *
 * @param evidence      the record that was just verified
 * @param verifiedSoFar every verified record of the user, including `evidence`
 * @param heldStamps    stamp categories the user already holds
 * @param alreadyCredited true when this evidence already produced its contribution event
 */
export function planIssuance(input: {
  evidence: VerifiedEvidenceFact;
  verifiedSoFar: VerifiedEvidenceFact[];
  heldStamps: Set<StampCategory>;
  alreadyCredited: boolean;
}): { stamps: PlannedStamp[]; reputation: PlannedReputation[] } {
  const { evidence, verifiedSoFar, heldStamps, alreadyCredited } = input;
  const stamps: PlannedStamp[] = [];
  const reputation: PlannedReputation[] = [];

  if (!alreadyCredited) {
    reputation.push({
      kind: "contribution-verified",
      source: sourceForEvidence[evidence.kind],
      points: pointsForEvidence[evidence.kind],
      reason: "Verified contribution",
      evidenceId: evidence.id,
    });
  }

  const categoryStamp = stampForEvidenceKind[evidence.kind];
  if (!heldStamps.has(categoryStamp)) {
    stamps.push({ category: categoryStamp, evidenceId: evidence.id });
  }

  if (!heldStamps.has("consistent-contributor")) {
    const weeks = new Set(verifiedSoFar.map((item) => isoWeekKey(item.occurredAt)));
    weeks.add(isoWeekKey(evidence.occurredAt));
    if (weeks.size >= consistentContributorWeeks) {
      stamps.push({ category: "consistent-contributor", evidenceId: evidence.id });
    }
  }

  for (const stamp of stamps) {
    reputation.push({
      kind: "stamp-issued",
      source: "stamps",
      points: pointsForStamp[stamp.category],
      reason: "Stamp issued",
      evidenceId: evidence.id,
      stampCategory: stamp.category,
    });
  }

  return { stamps, reputation };
}
