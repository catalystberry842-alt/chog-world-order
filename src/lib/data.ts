/**
 * Read helpers for pages.
 *
 * Sample passports are MOCK DATA and always labelled as samples.
 * Campaign samples live in `src/lib/collabs/samples.ts`.
 * Real passports are read on the server through `src/server/passport`.
 */
import { getMockPassport, mockPassportAddresses } from "@/lib/mock/passports";
import type { PublicPassport } from "@/lib/passport/types";
import type { Address } from "@/lib/types";

// Sample passports (mock) ---------------------------------------------------

export async function getSamplePassport(address: string): Promise<PublicPassport | undefined> {
  return getMockPassport(address);
}

export async function getSamplePassportAddresses(): Promise<Address[]> {
  return mockPassportAddresses;
}

/** The sample contributor used to preview a filled-in passport. */
export async function getFeaturedSampleAddress(): Promise<Address> {
  return mockPassportAddresses[0];
}
