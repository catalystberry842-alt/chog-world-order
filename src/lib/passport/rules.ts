import { consistentContributorWeeks, stampForEvidenceKind } from "@/lib/passport/stamps";
import type { EvidenceKind, StampCategory } from "@/lib/passport/types";

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

/**
 * Decides which stamps one newly verified evidence record earns.
 *
 * Stamps are badges and carry no points; reputation is computed separately
 * by the reputation engine (`src/lib/reputation/engine.ts`).
 *
 * Pure and idempotent: callers pass what the user already holds, and the plan
 * never repeats a category. Database unique constraints enforce the same rule.
 */
export function planStamps(input: {
  evidence: VerifiedEvidenceFact;
  verifiedSoFar: VerifiedEvidenceFact[];
  heldStamps: Set<StampCategory>;
}): PlannedStamp[] {
  const { evidence, verifiedSoFar, heldStamps } = input;
  const stamps: PlannedStamp[] = [];

  const categoryStamp = stampForEvidenceKind[evidence.kind];
  if (!heldStamps.has(categoryStamp)) stamps.push({ category: categoryStamp, evidenceId: evidence.id });

  if (!heldStamps.has("consistent-contributor")) {
    const weeks = new Set(verifiedSoFar.map((item) => isoWeekKey(item.occurredAt)));
    weeks.add(isoWeekKey(evidence.occurredAt));
    if (weeks.size >= consistentContributorWeeks) {
      stamps.push({ category: "consistent-contributor", evidenceId: evidence.id });
    }
  }
  return stamps;
}
