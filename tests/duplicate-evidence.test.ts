import { describe, expect, it } from "vitest";
import { postEvidence, postEvidenceReview, postIssueStamps } from "@/server/api/handlers";
import { makeServices, post, readJson, signInNewWallet } from "./helpers/setup";

const claim = (reference: string, overrides: Record<string, unknown> = {}) => ({
  kind: "community-contribution",
  title: "Builder call notes",
  summary: "Notes from twelve weekly builder calls.",
  reference,
  occurredAt: "2026-09-01",
  ...overrides,
});

async function setup() {
  const services = makeServices({ now: new Date("2026-10-09T12:00:00Z") });
  const alice = await signInNewWallet(services);
  const bob = await signInNewWallet(services);
  const reviewer = await signInNewWallet(services);
  const reviewerUser = await services.memory.findUserByAddress(reviewer.address as `0x${string}`);
  services.memory.setRole(reviewerUser!.id, "reviewer");
  return { services, alice, bob, reviewer };
}

async function submit(services: ReturnType<typeof makeServices>, cookie: string, body: unknown) {
  const response = await postEvidence(post("/api/evidence", body, { cookie }), services);
  return { status: response.status, body: await readJson(response) };
}

async function approve(services: ReturnType<typeof makeServices>, cookie: string, id: string) {
  return postEvidenceReview(post(`/api/evidence/${id}/review`, { decision: "approve" }, { cookie }), services, id);
}

describe("duplicate evidence", () => {
  it("rejects the same link submitted twice by the same wallet", async () => {
    const { services, alice } = await setup();
    expect((await submit(services, alice.cookie, claim("https://example.org/notes/12"))).status).toBe(201);
    const second = await submit(services, alice.cookie, claim("https://example.org/notes/12"));
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe("duplicate_evidence");
    expect(services.memory.evidence).toHaveLength(1);
  });

  it("treats cosmetic URL variations from another wallet as the same evidence", async () => {
    const { services, alice, bob } = await setup();
    await submit(services, alice.cookie, claim("https://example.org/notes/12"));
    for (const variant of [
      "https://WWW.Example.org/notes/12/",
      "https://example.org/notes/12?utm_source=x#top",
    ]) {
      const response = await submit(services, bob.cookie, claim(variant));
      expect(response.status).toBe(409);
    }
    expect(services.memory.evidence).toHaveLength(1);
  });

  it("treats a transaction hash in different letter case as the same evidence", async () => {
    const { services, alice } = await setup();
    const hash = `0x${"ab".repeat(32)}`;
    const onchain = (reference: string) =>
      claim(reference, { kind: "onchain-interaction", appId: "example-app", title: "Swap on example app" });
    expect((await submit(services, alice.cookie, onchain(hash))).status).toBe(201);
    expect((await submit(services, alice.cookie, onchain(hash.toUpperCase().replace("0X", "0x")))).status).toBe(409);
  });

  it("never issues a second stamp when issuance is repeated for the same evidence", async () => {
    const { services, alice, reviewer } = await setup();
    const { body } = await submit(services, alice.cookie, claim("https://example.org/notes/1"));
    const id = body.evidence!.id;

    const review = await approve(services, reviewer.cookie, id);
    expect(review.status).toBe(200);
    expect((await readJson(review)).issuedStamps).toEqual(["community-contributor"]);

    for (let i = 0; i < 3; i += 1) {
      const again = await postIssueStamps(post("/api/stamps/issue", { evidenceId: id }, { cookie: reviewer.cookie }), services);
      expect(again.status).toBe(200);
      expect((await readJson(again)).issued).toEqual([]);
    }
    // Approving again is refused too.
    expect((await approve(services, reviewer.cookie, id)).status).toBe(409);

    expect(services.memory.stamps).toHaveLength(1);
    const contributionEvents = services.memory.reputation.filter((event) => event.kind === "contribution-verified");
    expect(contributionEvents).toHaveLength(1);
    expect(services.memory.reputation.filter((event) => event.kind === "stamp-issued")).toHaveLength(1);
  });

  it("gives one stamp per category even with several verified records", async () => {
    const { services, alice, reviewer } = await setup();
    for (const n of [1, 2, 3]) {
      const { body } = await submit(services, alice.cookie, claim(`https://example.org/notes/${n}`, { occurredAt: "2026-09-01" }));
      await approve(services, reviewer.cookie, body.evidence!.id);
    }
    expect(services.memory.stamps.map((stamp) => stamp.category)).toEqual(["community-contributor"]);
    expect(services.memory.reputation.filter((event) => event.kind === "contribution-verified")).toHaveLength(3);
  });

  it("issues Consistent Contributor once, after verified work in four distinct weeks", async () => {
    const { services, alice, reviewer } = await setup();
    const dates = ["2026-09-01", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"];
    for (const [index, date] of dates.entries()) {
      const { body } = await submit(services, alice.cookie, claim(`https://example.org/weekly/${index}`, { occurredAt: date }));
      await approve(services, reviewer.cookie, body.evidence!.id);
      const consistent = services.memory.stamps.filter((stamp) => stamp.category === "consistent-contributor");
      // Weeks: 09-01 & 09-02 share a week, so the 4th distinct week arrives with 09-23 (index 4).
      expect(consistent).toHaveLength(index >= 4 ? 1 : 0);
    }
  });
});
