/**
 * MOCK DATA — builds the labelled sample passports.
 *
 * Mock evidence is replayed through the same issuance rules the server uses
 * (`planIssuance`), so sample stamps and scores behave exactly like real ones.
 * Every record produced here has `source: "mock"`.
 */
import { mockContributors, type MockContributor } from "@/lib/mock/contributors";
import { mockEvidence, type MockEvidence } from "@/lib/mock/evidence";
import { sameAddress } from "@/lib/passport/address";
import { breakdownFromEvents } from "@/lib/passport/reputation";
import { planIssuance, type VerifiedEvidenceFact } from "@/lib/passport/rules";
import { methodForEvidenceKind } from "@/lib/passport/stamps";
import type {
  EvidenceReference,
  LeaderboardEntry,
  PublicEvidence,
  PublicPassport,
  PublicStamp,
  StampCategory,
} from "@/lib/passport/types";

const toIso = (day: string) => `${day}T12:00:00.000Z`;

function reference(record: MockEvidence): EvidenceReference {
  return { label: record.referenceLabel, url: null, txHash: null, chainId: null };
}

function buildPassport(contributor: MockContributor): Omit<PublicPassport, "rank"> {
  const records = mockEvidence
    .filter((record) => sameAddress(record.holder, contributor.address))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const verified: VerifiedEvidenceFact[] = [];
  const held = new Set<StampCategory>();
  const stamps: PublicStamp[] = [];
  const events: { source: string; points: number; evidenceId: string; kind: string }[] = [];

  for (const record of records.filter((item) => item.status === "verified")) {
    const fact = { id: record.id, kind: record.kind, occurredAt: new Date(toIso(record.occurredAt)) };
    verified.push(fact);
    const plan = planIssuance({ evidence: fact, verifiedSoFar: verified, heldStamps: held, alreadyCredited: false });
    for (const stamp of plan.stamps) {
      held.add(stamp.category);
      stamps.push({
        id: `${record.id}-${stamp.category}`,
        category: stamp.category,
        issuedAt: toIso(record.verifiedAt ?? record.occurredAt),
        evidence: { id: record.id, kind: record.kind, title: record.title, reference: reference(record) },
        source: "mock",
      });
    }
    events.push(...plan.reputation);
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
      points: events
        .filter((event) => event.evidenceId === record.id && event.kind === "contribution-verified")
        .reduce((sum, event) => sum + event.points, 0),
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
    reputation: breakdownFromEvents(events),
    verifiedContributionCount: verified.length,
    stamps: stamps.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    contributions,
    source: "mock",
  };
}

const ranked: PublicPassport[] = mockContributors
  .map(buildPassport)
  .sort((a, b) => b.reputation.total - a.reputation.total)
  .map((passport, index) => ({ ...passport, rank: passport.reputation.total > 0 ? index + 1 : null }));

export function getMockPassport(address: string): PublicPassport | undefined {
  return ranked.find((passport) => sameAddress(passport.address, address));
}

export function getMockLeaderboard(): LeaderboardEntry[] {
  return ranked.map((passport, index) => ({
    address: passport.address,
    profile: passport.profile,
    rank: passport.rank ?? index + 1,
    reputation: passport.reputation,
    stampCount: passport.stamps.length,
    verifiedContributionCount: passport.verifiedContributionCount,
    source: "mock",
  }));
}

export const mockPassportAddresses = mockContributors.map((contributor) => contributor.address);
