/**
 * Data access layer.
 *
 * Pages and components read data only through these functions. In Phase 1
 * they return MOCK DATA from `src/lib/mock`. In Phase 2 they will query
 * PostgreSQL through Prisma without changing their signatures.
 */
import { isAddress } from "viem";
import { mockCampaigns } from "@/lib/mock/campaigns";
import { mockContributions } from "@/lib/mock/contributions";
import { mockContributors } from "@/lib/mock/contributors";
import { mockStampAwards, stampCatalogue } from "@/lib/mock/stamps";
import { computeScore } from "@/lib/reputation";
import type {
  Address,
  Campaign,
  Contribution,
  Contributor,
  RankedContributor,
  StampAward,
  StampDefinition,
} from "@/lib/types";

export type EarnedStamp = StampDefinition & { award: StampAward };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function isValidAddress(value: string): value is Address {
  return isAddress(value, { strict: false });
}

// Campaigns -----------------------------------------------------------------

export async function getCampaigns(): Promise<Campaign[]> {
  return mockCampaigns;
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  return mockCampaigns.find((campaign) => campaign.id === id);
}

export async function getCampaignIds(): Promise<string[]> {
  return mockCampaigns.map((campaign) => campaign.id);
}

// Stamps --------------------------------------------------------------------

export async function getStampCatalogue(): Promise<StampDefinition[]> {
  return stampCatalogue;
}

function earnedStampsFor(address: string): EarnedStamp[] {
  return mockStampAwards
    .filter((award) => sameAddress(award.holder, address))
    .flatMap((award) => {
      const definition = stampCatalogue.find((stamp) => stamp.id === award.stampId);
      return definition ? [{ ...definition, award }] : [];
    })
    .sort((a, b) => b.award.awardedOn.localeCompare(a.award.awardedOn));
}

export async function getEarnedStamps(address: string): Promise<EarnedStamp[]> {
  return earnedStampsFor(address);
}

// Contributors & reputation ---------------------------------------------------

function contributionsFor(address: string): Contribution[] {
  return mockContributions
    .filter((contribution) => sameAddress(contribution.contributor, address))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function rank(contributors: Contributor[]): RankedContributor[] {
  return contributors
    .map((contributor) => {
      const contributions = contributionsFor(contributor.address);
      const stamps = earnedStampsFor(contributor.address);
      return {
        ...contributor,
        rank: 0,
        score: computeScore({
          contributions,
          collabsCompleted: contributor.collabsCompleted,
          stamps,
        }),
        stampCount: stamps.length,
        contributionCount: contributions.length,
      };
    })
    .sort((a, b) => b.score.total - a.score.total)
    .map((contributor, index) => ({ ...contributor, rank: index + 1 }));
}

export async function getLeaderboard(): Promise<RankedContributor[]> {
  return rank(mockContributors);
}

export async function getContributorAddresses(): Promise<Address[]> {
  return mockContributors.map((contributor) => contributor.address);
}

export async function getRankedContributor(address: string): Promise<RankedContributor | undefined> {
  return rank(mockContributors).find((contributor) => sameAddress(contributor.address, address));
}

export async function getContributions(address: string): Promise<Contribution[]> {
  return contributionsFor(address);
}

/** The contributor used to preview what a filled-in passport looks like. */
export async function getSamplePassportAddress(): Promise<Address> {
  return mockContributors[0].address;
}
