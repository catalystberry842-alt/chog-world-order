import { describe, expect, it } from "vitest";
import { getPassportByAddress, getPassportContributions, getPassportStamps } from "@/server/api/handlers";
import { normalizeAddress } from "@/lib/passport/address";
import { makeServices, readJson, request, signInNewWallet } from "./helpers/setup";

describe("normalizeAddress", () => {
  it.each([
    ["0x1234567890abcdef1234567890abcdef12345678", "0x1234567890abcdef1234567890abcdef12345678"],
    ["0x1234567890ABCDEF1234567890ABCDEF12345678", "0x1234567890abcdef1234567890abcdef12345678"],
    ["  0x1234567890abcdef1234567890abcdef12345678 ", "0x1234567890abcdef1234567890abcdef12345678"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });

  it.each([
    "",
    "not-an-address",
    "0x123",
    "1234567890abcdef1234567890abcdef12345678",
    "0x1234567890abcdef1234567890abcdef1234567g",
    "0x1234567890abcdef1234567890abcdef123456789",
    "vitalik.eth",
    "0x1234567890abcdef1234567890abcdef12345678; drop table",
  ])("rejects %j", (input) => {
    expect(normalizeAddress(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(normalizeAddress(undefined)).toBeNull();
    expect(normalizeAddress(123)).toBeNull();
  });
});

describe("passport API address handling", () => {
  const routes = [getPassportByAddress, getPassportStamps, getPassportContributions];

  it.each(["nope", "0x123", "0xZZ34567890abcdef1234567890abcdef12345678"])("answers 400 for %j", async (address) => {
    const services = makeServices();
    for (const route of routes) {
      const response = await route(request(`/api/passports/${address}`), services, address);
      expect(response.status).toBe(400);
      expect((await readJson(response)).error?.code).toBe("invalid_address");
    }
  });

  it("answers 404 for a valid address with no passport", async () => {
    const services = makeServices();
    const address = "0x00000000000000000000000000000000000000aa";
    const response = await getPassportByAddress(request(`/api/passports/${address}`), services, address);
    expect(response.status).toBe(404);
  });

  it("finds a passport regardless of address letter case", async () => {
    const services = makeServices();
    const { account } = await signInNewWallet(services);
    for (const address of [account.address, account.address.toLowerCase()]) {
      const response = await getPassportByAddress(request(`/api/passports/${address}`), services, address);
      expect(response.status).toBe(200);
      const passport = (await readJson(response)).passport!;
      expect(passport.address).toBe(account.address.toLowerCase());
      expect(passport.reputation.total).toBe(0);
      expect(passport.stamps).toEqual([]);
    }
  });

  it("never exposes reviewer notes, dedupe keys, or session data", async () => {
    const services = makeServices();
    const { account } = await signInNewWallet(services);
    const response = await getPassportByAddress(request(`/api/passports/${account.address}`), services, account.address);
    const text = await response.text();
    for (const secret of ["reviewerNote", "dedupeKey", "tokenHash", "nonce", "userId", "reviewerId"]) {
      expect(text).not.toContain(secret);
    }
  });
});
