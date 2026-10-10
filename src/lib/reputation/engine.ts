import { isoWeekKey } from "@/lib/passport/rules";
import type { EvidenceKind } from "@/lib/passport/types";
import {
  categoryForEvidence,
  reputationCategories,
  reputationConfig,
  type ReputationCategory,
  type ReputationConfig,
} from "@/lib/reputation/config";

/** A verified evidence record as the engine sees it. */
export type EngineEvidence = {
  id: string;
  kind: EvidenceKind;
  /** When the activity happened, as claimed (or the block time on-chain). Shown, never used for limits. */
  occurredAt: Date;
  /**
   * When the server verified it. Defines processing order and the daily, monthly,
   * and weekly buckets: a client-chosen date could otherwise spread claims over
   * past months to multiply the caps and consistency bonus.
   */
  verifiedAt: Date;
};

/** One event the rules say should exist. `planKey` is stable across recalculations. */
export type PlannedEvent = {
  planKey: string;
  kind: "contribution" | "consistency";
  category: ReputationCategory;
  points: number;
  reason: string;
  evidenceId: string | null;
  periodKey: string | null;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);

/** Calendar month an ISO week belongs to: the month of its Thursday. */
function monthOfIsoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  return monthKey(day);
}

/**
 * Computes every automatic reputation event for one user.
 *
 * Deterministic: the same evidence and config always give the same events.
 * Evidence is processed in verification order (ties broken by id), so a
 * record's points never depend on evidence verified after it. That makes
 * incremental issuance and full recalculation agree.
 */
export function computeReputationPlan(
  userId: string,
  verified: EngineEvidence[],
  config: ReputationConfig = reputationConfig,
): PlannedEvent[] {
  const ordered = [...verified].sort(
    (a, b) => a.verifiedAt.getTime() - b.verifiedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const perDay = new Map<string, number>();
  const perMonth = new Map<string, number>();
  const bonusPerMonth = new Map<string, number>();
  const qualifiedWeeks = new Set<string>();
  const events: PlannedEvent[] = [];

  for (const evidence of ordered) {
    const category = categoryForEvidence[evidence.kind];
    const limits = config.limits[category];
    const dKey = `${category}:${dayKey(evidence.verifiedAt)}`;
    const mKey = `${category}:${monthKey(evidence.verifiedAt)}`;
    const usedToday = perDay.get(dKey) ?? 0;
    const usedThisMonth = perMonth.get(mKey) ?? 0;

    let points = config.weights[category];
    let reason = `Verified ${category} contribution: +${points}`;
    if (usedToday >= limits.daily) {
      points = 0;
      reason = `Daily limit reached (${limits.daily} ${category} contributions per day). Recorded with 0 points.`;
    } else if (usedThisMonth >= limits.monthly) {
      points = 0;
      reason = `Monthly limit reached (${limits.monthly} ${category} contributions per month). Recorded with 0 points.`;
    } else {
      perDay.set(dKey, usedToday + 1);
      perMonth.set(mKey, usedThisMonth + 1);
    }

    events.push({
      planKey: `contribution:${evidence.id}`,
      kind: "contribution",
      category,
      points,
      reason,
      evidenceId: evidence.id,
      periodKey: dayKey(evidence.verifiedAt),
    });

    // A week qualifies the first time a point-earning contribution lands in it.
    const week = isoWeekKey(evidence.verifiedAt);
    if (points > 0 && !qualifiedWeeks.has(week)) {
      qualifiedWeeks.add(week);
      const month = monthOfIsoWeek(evidence.verifiedAt);
      const used = bonusPerMonth.get(month) ?? 0;
      const remaining = Math.max(0, config.consistency.monthlyCap - used);
      const bonus = Math.min(config.consistency.pointsPerWeek, remaining);
      bonusPerMonth.set(month, used + bonus);
      events.push({
        planKey: `consistency:${userId}:${week}`,
        kind: "consistency",
        category: "consistency",
        points: bonus,
        reason:
          bonus > 0
            ? `Verified contribution in week ${week}: +${bonus}`
            : `Week ${week} qualified, but the monthly consistency cap (${config.consistency.monthlyCap}) is reached.`,
        evidenceId: evidence.id,
        periodKey: week,
      });
    }
  }
  return events;
}

/** A stored ledger event, as far as reconciliation needs it. */
export type LedgerEvent = {
  id: string;
  kind: "contribution" | "consistency" | "adjustment" | "reversal";
  planKey: string | null;
  points: number;
  category: ReputationCategory;
  reversesEventId: string | null;
};

export type LedgerChange =
  | { type: "reverse"; eventId: string; points: number; category: ReputationCategory; reason: string }
  | { type: "create"; event: PlannedEvent; revision: number };

/**
 * Compares the stored ledger with the plan and returns the changes that make
 * the ledger match. Stored events are never edited or deleted: a wrong event
 * is reversed and a corrected one is added, so the full history is kept.
 * Adjustments are not touched.
 */
export function reconcileLedger(ledger: LedgerEvent[], plan: PlannedEvent[]): LedgerChange[] {
  const reversed = new Set(ledger.filter((event) => event.reversesEventId).map((event) => event.reversesEventId));
  const automatic = ledger.filter((event) => event.planKey && (event.kind === "contribution" || event.kind === "consistency"));
  const active = new Map<string, LedgerEvent>();
  const revisions = new Map<string, number>();
  for (const event of automatic) {
    const key = event.planKey as string;
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
    if (!reversed.has(event.id)) active.set(key, event);
  }

  const changes: LedgerChange[] = [];
  const planned = new Set<string>();
  for (const event of plan) {
    planned.add(event.planKey);
    const current = active.get(event.planKey);
    if (current && current.points === event.points) continue;
    if (current) {
      changes.push({
        type: "reverse",
        eventId: current.id,
        points: -current.points,
        category: current.category,
        reason: "Superseded by recalculation",
      });
    }
    changes.push({ type: "create", event, revision: revisions.get(event.planKey) ?? 0 });
  }
  for (const [key, event] of active) {
    if (!planned.has(key)) {
      changes.push({
        type: "reverse",
        eventId: event.id,
        points: -event.points,
        category: event.category,
        reason: "No longer supported by verified evidence",
      });
    }
  }
  return changes;
}

export type ReputationBreakdown = Record<ReputationCategory, number> & { total: number };

export function emptyBreakdown(): ReputationBreakdown {
  return Object.fromEntries([...reputationCategories.map((c) => [c, 0]), ["total", 0]]) as ReputationBreakdown;
}

/** Score = plain sum of ledger events, grouped by category. */
export function sumLedger(events: { category: string; points: number }[]): ReputationBreakdown {
  const breakdown = emptyBreakdown();
  for (const event of events) {
    if ((reputationCategories as readonly string[]).includes(event.category)) {
      breakdown[event.category as ReputationCategory] += event.points;
    }
  }
  breakdown.total = reputationCategories.reduce((sum, category) => sum + breakdown[category], 0);
  return breakdown;
}
