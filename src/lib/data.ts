/**
 * Read helpers for pages.
 *
 * Campaigns are MOCK DATA (the Collab Board backend is a later phase).
 * Sample passports are MOCK DATA too and are always labelled as samples.
 * Real passports are read on the server through `src/server/passport`.
 */
import { mockCampaigns } from "@/lib/mock/campaigns";
import { getMockLeaderboard, getMockPassport, mockPassportAddresses } from "@/lib/mock/passports";
import type { LeaderboardEntry, PublicPassport } from "@/lib/passport/types";
import type { Address, Campaign } from "@/lib/types";

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

// Sample passports (mock) ---------------------------------------------------

export async function getSamplePassport(address: string): Promise<PublicPassport | undefined> {
  return getMockPassport(address);
}

export async function getSampleLeaderboard(): Promise<LeaderboardEntry[]> {
  return getMockLeaderboard();
}

export async function getSamplePassportAddresses(): Promise<Address[]> {
  return mockPassportAddresses;
}

/** The sample contributor used to preview a filled-in passport. */
export async function getFeaturedSampleAddress(): Promise<Address> {
  return mockPassportAddresses[0];
}
