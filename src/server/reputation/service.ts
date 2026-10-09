import { randomUUID } from "node:crypto";
import { normalizeAddress } from "@/lib/passport/address";
import type {
  LeaderboardPage,
  PublicReputation,
  PublicReputationEvent,
  ReputationCategory,
} from "@/lib/passport/types";
import { reputationConfig, type ReputationConfig } from "@/lib/reputation/config";
import {
  computeReputationPlan,
  reconcileLedger,
  sumLedger,
  type LedgerEvent,
} from "@/lib/reputation/engine";
import { tierFor } from "@/lib/reputation/tiers";
import { requireRole, requireStore } from "@/server/auth/session";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { evidenceReference } from "@/server/passport/evidence-reference";
import type {
  PassportStore,
  ReputationRecord,
  ReputationWrite,
  SnapshotCause,
  UserRecord,
} from "@/server/passport/store";
import type { Services } from "@/server/services";

const toLedger = (record: ReputationRecord): LedgerEvent => ({
  id: record.id,
  kind: record.kind,
  planKey: record.planKey,
  points: record.points,
  category: record.category as ReputationCategory,
  reversesEventId: record.reversesEventId,
});

function snapshotFor(
  events: { category: string; points: number }[],
  cause: SnapshotCause,
  actorId: string | null,
  config: ReputationConfig,
) {
  const breakdown = sumLedger(events);
  const { total, ...categories } = breakdown;
  return {
    total,
    breakdown: categories,
    tier: tierFor(total, config).title,
    calculationVersion: config.version,
    cause,
    eventCount: events.length,
    triggeredById: actorId,
  };
}

/**
 * Recomputes a user's automatic reputation from their verified evidence and
 * brings the ledger in line with it. Deterministic and idempotent: running it
 * again with the same evidence and config writes nothing.
 *
 * Points always come from the configured rules, never from a request.
 */
export async function recalculateReputation(
  services: Services,
  userId: string,
  options: { cause: SnapshotCause; actorId: string | null; config?: ReputationConfig },
) {
  const store = requireStore(services);
  const config = options.config ?? reputationConfig;

  return store.updateLedger(userId, ({ ledger, verified }) => {
    const plan = computeReputationPlan(userId, verified, config);
    const byId = new Map(ledger.map((event) => [event.id, event]));
    const writes: ReputationWrite[] = reconcileLedger(ledger.map(toLedger), plan).map((change) => {
      if (change.type === "reverse") {
        const original = byId.get(change.eventId);
        return {
          kind: "reversal",
          points: change.points,
          category: change.category,
          reason: change.reason,
          planKey: null,
          dedupeKey: `reversal:${change.eventId}`,
          calculationVersion: config.version,
          evidenceId: original?.evidenceId ?? null,
          periodKey: original?.periodKey ?? null,
          reversesEventId: change.eventId,
          actorId: options.actorId,
        };
      }
      const { event, revision } = change;
      return {
        kind: event.kind,
        points: event.points,
        category: event.category,
        reason: event.reason,
        planKey: event.planKey,
        dedupeKey: revision === 0 ? event.planKey : `${event.planKey}#${revision}`,
        calculationVersion: config.version,
        evidenceId: event.evidenceId,
        periodKey: event.periodKey,
        reversesEventId: null,
        actorId: null,
      };
    });

    const changed = writes.length > 0;
    const snapshot =
      changed || options.cause === "recalculation"
        ? snapshotFor([...ledger, ...writes], options.cause, options.actorId, config)
        : null;
    return { writes, snapshot };
  });
}

/**
 * An authorized manual correction. Admin only, never on one's own score,
 * always with a reason, recorded with the admin's identity. It adds a ledger
 * event; it never edits or removes one.
 */
export async function adjustReputation(
  services: Services,
  actor: UserRecord,
  rawAddress: string,
  input: { points: number; reason: string },
) {
  const store = requireStore(services);
  requireRole(actor, ["admin"]);
  const address = normalizeAddress(rawAddress);
  if (!address) throw badRequest("That is not a valid wallet address.", "invalid_address");
  const target = await store.findUserByAddress(address);
  if (!target) throw notFound("No passport exists for this address.");
  if (target.id === actor.id) throw forbidden("You cannot adjust your own reputation.");

  const [event] = await store.updateLedger(target.id, ({ ledger }) => {
    const write: ReputationWrite = {
      kind: "adjustment",
      points: input.points,
      category: "adjustment",
      reason: input.reason,
      planKey: null,
      dedupeKey: `adjustment:${randomUUID()}`,
      calculationVersion: reputationConfig.version,
      evidenceId: null,
      periodKey: null,
      reversesEventId: null,
      actorId: actor.id,
    };
    return { writes: [write], snapshot: snapshotFor([...ledger, write], "adjustment", actor.id, reputationConfig) };
  });
  return event;
}

/** Public reputation view: score, tier, breakdown, consistency weeks, and the events behind them. */
export async function buildPublicReputation(store: PassportStore, userId: string): Promise<PublicReputation> {
  const ledger = await store.listReputation(userId);
  const breakdown = sumLedger(ledger);
  const reversed = new Set(ledger.map((event) => event.reversesEventId).filter(Boolean));

  const evidenceIds = [...new Set(ledger.map((event) => event.evidenceId).filter((id): id is string => Boolean(id)))];
  const evidence = new Map(
    (await Promise.all(evidenceIds.map((id) => store.findEvidence(id))))
      .filter((record) => record !== null)
      .map((record) => [record.id, record]),
  );

  const events: PublicReputationEvent[] = [...ledger].reverse().map((event) => {
    const record = event.evidenceId ? evidence.get(event.evidenceId) : undefined;
    return {
      id: event.id,
      kind: event.kind,
      category: event.category as ReputationCategory,
      points: event.points,
      reason: event.reason,
      periodKey: event.periodKey,
      calculationVersion: event.calculationVersion,
      createdAt: event.createdAt.toISOString(),
      evidence:
        record && record.status === "verified"
          ? { id: record.id, kind: record.kind, title: record.title, reference: evidenceReference(record) }
          : null,
      reversed: reversed.has(event.id),
    };
  });

  const consistency = events
    .filter((event) => event.kind === "consistency" && !event.reversed && event.periodKey)
    .map((event) => ({ week: event.periodKey as string, points: event.points }))
    .sort((a, b) => b.week.localeCompare(a.week));

  return {
    total: breakdown.total,
    breakdown,
    tier: tierFor(breakdown.total),
    calculationVersion: reputationConfig.version,
    consistency,
    events,
  };
}

export async function getReputation(services: Services, rawAddress: string) {
  const store = requireStore(services);
  const address = normalizeAddress(rawAddress);
  if (!address) throw badRequest("That is not a valid wallet address.", "invalid_address");
  const user = await store.findUserByAddress(address);
  if (!user) return null;
  const [reputation, rank, snapshots] = await Promise.all([
    buildPublicReputation(store, user.id),
    store.rankOf(user.id),
    store.listSnapshots(user.id, 20),
  ]);
  return {
    address,
    rank,
    reputation,
    history: snapshots.map((snapshot) => ({
      total: snapshot.total,
      tier: snapshot.tier,
      cause: snapshot.cause,
      calculationVersion: snapshot.calculationVersion,
      createdAt: snapshot.createdAt.toISOString(),
    })),
  };
}

export const LEADERBOARD_PAGE_SIZE = 20;

export async function getLeaderboard(
  services: Services,
  input: { category: ReputationCategory | null; page: number },
): Promise<LeaderboardPage> {
  const store = requireStore(services);
  const page = Math.max(1, Math.floor(input.page));
  const { rows, total } = await store.leaderboard({
    category: input.category,
    skip: (page - 1) * LEADERBOARD_PAGE_SIZE,
    take: LEADERBOARD_PAGE_SIZE,
  });
  return {
    entries: rows.map((row, index) => ({
      address: row.address,
      displayName: row.displayName,
      avatarHue: parseInt(row.address.slice(2, 8), 16) % 360 || 0,
      rank: (page - 1) * LEADERBOARD_PAGE_SIZE + index + 1,
      points: row.points,
      total: row.total,
      tier: tierFor(row.total).title,
      verifiedContributionCount: row.verifiedCount,
    })),
    page,
    pageSize: LEADERBOARD_PAGE_SIZE,
    totalEntries: total,
    category: input.category,
  };
}
