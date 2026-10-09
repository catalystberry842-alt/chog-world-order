/**
 * MOCK DATA — builds the labelled sample passports.
 *
 * Mock evidence is replayed through the same stamp rules and reputation engine
 * the server uses, so sample stamps and scores behave exactly like real ones.
 * Samples are never ranked on the public leaderboard.
 * Every record produced here has `source: "mock"`.
 */
import { mockContributors, type MockContributor } from "@/lib/mock/contributors";
import { mockEvidence, type MockEvidence } from "@/lib/mock/evidence";
import { sameAddress } from "@/lib/passport/address";
import { planStamps, type VerifiedEvidenceFact } from "@/lib/passport/rules";
import { methodForEvidenceKind } from "@/lib/passport/stamps";
import type {
  EvidenceReference,
  PublicEvidence,
  PublicPassport,
  PublicReputation,
  PublicReputationEvent,
  PublicStamp,
  StampCategory,
} from "@/lib/passport/types";
import { reputationConfig } from "@/lib/reputation/config";
import { computeReputationPlan, sumLedger } from "@/lib/reputation/engine";
import { tierFor } from "@/lib/reputation/tiers";

const toIso = (day: string) => `${day}T12:00:00.000Z`;

function reference(record: MockEvidence): EvidenceReference {
  return { label: record.referenceLabel, url: null, txHash: null, chainId: null };
}

function buildPassport(contributor: MockContributor): Omit<PublicPassport, "rank"> {
  const records = mockEvidence
    .filter((record) => sameAddress(record.holder, contributor.address))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const verifiedRecords = records.filter((item) => item.status === "verified");

  // Stamps: same rules as real passports.
  const verified: VerifiedEvidenceFact[] = [];
  const held = new Set<StampCategory>();
  const stamps: PublicStamp[] = [];
  for (const record of verifiedRecords) {
    const fact = { id: record.id, kind: record.kind, occurredAt: new Date(toIso(record.occurredAt)) };
    verified.push(fact);
    for (const stamp of planStamps({ evidence: fact, verifiedSoFar: verified, heldStamps: held })) {
      held.add(stamp.category);
      stamps.push({
        id: `${record.id}-${stamp.category}`,
        category: stamp.category,
        issuedAt: toIso(record.verifiedAt ?? record.occurredAt),
        evidence: { id: record.id, kind: record.kind, title: record.title, reference: reference(record) },
        source: "mock",
      });
    }
  }

  // Reputation: same engine as real passports.
  const plan = computeReputationPlan(
    contributor.address,
    verifiedRecords.map((record) => ({
      id: record.id,
      kind: record.kind,
      occurredAt: new Date(toIso(record.occurredAt)),
      verifiedAt: new Date(toIso(record.verifiedAt ?? record.occurredAt)),
    })),
  );
  const breakdown = sumLedger(plan);
  const byId = new Map(records.map((record) => [record.id, record]));
  const events: PublicReputationEvent[] = plan
    .map((event, index) => {
      const record = event.evidenceId ? byId.get(event.evidenceId) : undefined;
      return {
        id: `mock-event-${contributor.handle}-${index}`,
        kind: event.kind,
        category: event.category,
        points: event.points,
        reason: event.reason,
        periodKey: event.periodKey,
        calculationVersion: reputationConfig.version,
        createdAt: toIso(record?.verifiedAt ?? record?.occurredAt ?? contributor.joined),
        evidence: record ? { id: record.id, kind: record.kind, title: record.title, reference: reference(record) } : null,
        reversed: false,
      };
    })
    .reverse();
  const reputation: PublicReputation = {
    total: breakdown.total,
    breakdown,
    tier: tierFor(breakdown.total),
    calculationVersion: reputationConfig.version,
    consistency: events
      .filter((event) => event.kind === "consistency" && event.periodKey)
      .map((event) => ({ week: event.periodKey as string, points: event.points }))
      .sort((a, b) => b.week.localeCompare(a.week)),
    events,
  };
  const earned = new Map<string, number>();
  for (const event of plan) {
    if (event.kind === "contribution" && event.evidenceId) earned.set(event.evidenceId, event.points);
  }

  const contributions: PublicEvidence[] = records
    .map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      summary: record.summary,
      reference: reference(record),
      status: record.status,
      method: methodForEvidenceKind[record.kind],
      statusReason: record.statusReason,
      occurredAt: toIso(record.occurredAt),
      submittedAt: toIso(record.occurredAt),
      verifiedAt: record.verifiedAt ? toIso(record.verifiedAt) : null,
      points: earned.get(record.id) ?? 0,
      verificationData: null,
      source: "mock" as const,
    }))
    .reverse();

  return {
    address: contributor.address,
    profile: {
      displayName: contributor.displayName,
      handle: contributor.handle,
      bio: contributor.bio,
      skills: contributor.skills,
      avatarHue: contributor.avatarHue,
    },
    joinedAt: toIso(contributor.joined),
    reputation,
    verifiedContributionCount: verifiedRecords.length,
    stamps: stamps.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    contributions,
    source: "mock",
  };
}

// Sample ranks are relative to the other samples only and are labelled as such.
const ranked: PublicPassport[] = mockContributors
  .map(buildPassport)
  .sort((a, b) => b.reputation.total - a.reputation.total)
  .map((passport, index) => ({ ...passport, rank: passport.reputation.total > 0 ? index + 1 : null }));

export function getMockPassport(address: string): PublicPassport | undefined {
  return ranked.find((passport) => sameAddress(passport.address, address));
}

export const mockPassportAddresses = mockContributors.map((contributor) => contributor.address);
