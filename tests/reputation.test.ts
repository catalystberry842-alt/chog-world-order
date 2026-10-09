import { describe, expect, it } from "vitest";
import {
  getLeaderboardPage,
  getReputationByAddress,
  getReputationEvents,
  postAdjustment,
  postEvidence,
  postEvidenceReview,
  postRecalculate,
  postRecalculateAll,
} from "@/server/api/handlers";
import { reputationConfig, type ReputationConfig } from "@/lib/reputation/config";
import { computeReputationPlan, reconcileLedger, sumLedger, type EngineEvidence } from "@/lib/reputation/engine";
import { tierFor } from "@/lib/reputation/tiers";
import { recalculateReputation } from "@/server/reputation/service";
import { makeServices, post, readJson, request, signInNewWallet } from "./helpers/setup";

const day = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00Z`);
let seq = 0;
const ev = (kind: EngineEvidence["kind"], occurred: string, verifiedHour = 12 + (seq % 10)): EngineEvidence => {
  seq += 1;
  return { id: `e${String(seq).padStart(3, "0")}`, kind, occurredAt: day(occurred), verifiedAt: new Date(day(occurred, verifiedHour).getTime() + seq) };
};
const total = (events: { category: string; points: number }[]) => sumLedger(events).total;

describe("reputation engine: weights", () => {
  it.each([
    ["campaign-deliverable", 10],
    ["onchain-interaction", 3],
    ["community-contribution", 5],
    ["research-contribution", 5],
    ["code-contribution", 8],
  ] as const)("%s earns %i points", (kind, points) => {
    const plan = computeReputationPlan("u1", [ev(kind, "2026-09-01")]);
    expect(plan.find((event) => event.kind === "contribution")?.points).toBe(points);
  });

  it("adds a consistency bonus for the first point-earning contribution of a week", () => {
    const plan = computeReputationPlan("u1", [ev("code-contribution", "2026-09-01"), ev("code-contribution", "2026-09-02")]);
    expect(plan.filter((event) => event.kind === "consistency").map((event) => event.points)).toEqual([2]);
    expect(total(plan)).toBe(8 + 8 + 2);
  });

  it("caps the consistency bonus at 8 points per month", () => {
    // Five ISO weeks whose Thursdays all fall in October 2026 (1, 8, 15, 22, 29).
    const weeks = ["2026-09-28", "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"];
    const plan = computeReputationPlan("u1", weeks.map((date) => ev("code-contribution", date)));
    const bonuses = plan.filter((event) => event.kind === "consistency");
    expect(bonuses.map((event) => event.points)).toEqual([2, 2, 2, 2, 0]);
    expect(bonuses.reduce((sum, event) => sum + event.points, 0)).toBe(8);
  });
});

describe("reputation engine: daily and monthly limits", () => {
  it("records contributions over the daily limit with 0 points", () => {
    const { daily } = reputationConfig.limits.protocol;
    const plan = computeReputationPlan(
      "u1",
      Array.from({ length: daily + 2 }, () => ev("onchain-interaction", "2026-09-03")),
    );
    const contributions = plan.filter((event) => event.kind === "contribution");
    expect(contributions.filter((event) => event.points > 0)).toHaveLength(daily);
    expect(contributions.slice(daily).every((event) => event.points === 0 && /Daily limit/.test(event.reason))).toBe(true);
  });

  it("records contributions over the monthly limit with 0 points", () => {
    const { monthly, daily } = reputationConfig.limits.research;
    const dates = Array.from({ length: monthly + 2 }, (_, index) => `2026-09-${String(1 + Math.floor(index / daily)).padStart(2, "0")}`);
    const plan = computeReputationPlan("u1", dates.map((date) => ev("research-contribution", date)));
    const contributions = plan.filter((event) => event.kind === "contribution");
    expect(contributions.filter((event) => event.points > 0)).toHaveLength(monthly);
    expect(contributions.at(-1)?.reason).toMatch(/Monthly limit/);
  });

  it("applies limits per category independently", () => {
    const plan = computeReputationPlan("u1", [
      ...Array.from({ length: 3 }, () => ev("onchain-interaction", "2026-09-04")),
      ev("code-contribution", "2026-09-04"),
    ]);
    expect(plan.find((event) => event.category === "code")?.points).toBe(8);
  });

  it("honours a custom configuration", () => {
    const strict: ReputationConfig = {
      ...reputationConfig,
      version: "test",
      limits: { ...reputationConfig.limits, code: { daily: 1, monthly: 1 } },
    };
    const plan = computeReputationPlan("u1", [ev("code-contribution", "2026-09-05"), ev("code-contribution", "2026-09-20")], strict);
    expect(plan.filter((event) => event.kind === "contribution").map((event) => event.points)).toEqual([8, 0]);
  });
});

describe("reputation engine: determinism", () => {
  const evidence = [
    ev("code-contribution", "2026-09-01"),
    ev("onchain-interaction", "2026-09-01"),
    ev("onchain-interaction", "2026-09-01"),
    ev("onchain-interaction", "2026-09-01"),
    ev("research-contribution", "2026-09-10"),
    ev("campaign-deliverable", "2026-09-17"),
  ];

  it("gives the same events regardless of input order", () => {
    const a = computeReputationPlan("u1", evidence);
    const b = computeReputationPlan("u1", [...evidence].reverse());
    const c = computeReputationPlan("u1", [evidence[3], evidence[0], evidence[5], evidence[1], evidence[4], evidence[2]]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("agrees with incremental issuance: earlier events never change when later evidence arrives", () => {
    const full = computeReputationPlan("u1", evidence);
    for (let n = 1; n <= evidence.length; n += 1) {
      const partial = computeReputationPlan("u1", evidence.slice(0, n));
      for (const event of partial) {
        expect(full.find((item) => item.planKey === event.planKey)).toEqual(event);
      }
    }
  });

  it("reconciles a matching ledger to no changes", () => {
    const plan = computeReputationPlan("u1", evidence);
    const ledger = plan.map((event, index) => ({ ...event, id: `l${index}`, reversesEventId: null }));
    expect(reconcileLedger(ledger, plan)).toEqual([]);
  });
});

describe("tiers", () => {
  it.each([
    [0, "Curious Chog"],
    [9, "Curious Chog"],
    [10, "Chog Scout"],
    [39, "Chog Scout"],
    [40, "Chog Contributor"],
    [100, "Chog Builder"],
    [249, "Chog Builder"],
    [250, "Chog Legend"],
    [10_000, "Chog Legend"],
    [-5, "Curious Chog"],
  ])("score %i is %s", (score, title) => {
    expect(tierFor(score).title).toBe(title);
  });

  it("reports the next tier", () => {
    expect(tierFor(12).next).toEqual({ title: "Chog Contributor", minScore: 40 });
    expect(tierFor(300).next).toBeNull();
  });

  it("uses configurable thresholds", () => {
    const config = { ...reputationConfig, tiers: [{ title: "A", minScore: 0 }, { title: "B", minScore: 5 }] };
    expect(tierFor(5, config).title).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// Service + API
// ---------------------------------------------------------------------------

const claim = (reference: string, overrides: Record<string, unknown> = {}) => ({
  kind: "code-contribution",
  title: "Merged pull request",
  summary: "Fixed a bug in the wallet connector.",
  reference,
  occurredAt: "2026-09-01",
  ...overrides,
});

async function setup() {
  const services = makeServices({ now: new Date("2026-10-09T12:00:00Z") });
  const alice = await signInNewWallet(services);
  const bob = await signInNewWallet(services);
  const reviewer = await signInNewWallet(services);
  const admin = await signInNewWallet(services);
  const user = async (address: string) => (await services.memory.findUserByAddress(address as `0x${string}`))!;
  services.memory.setRole((await user(reviewer.address)).id, "reviewer");
  services.memory.setRole((await user(admin.address)).id, "admin");

  const submitAndApprove = async (who: { cookie: string }, body: unknown, reviewerCookie = reviewer.cookie) => {
    const submitted = await readJson(await postEvidence(post("/api/evidence", body, { cookie: who.cookie }), services));
    const id = submitted.evidence!.id;
    const review = await postEvidenceReview(post(`/api/evidence/${id}/review`, { decision: "approve" }, { cookie: reviewerCookie }), services, id);
    return { id, review };
  };
  return { services, alice, bob, reviewer, admin, user, submitAndApprove };
}

const score = async (services: ReturnType<typeof makeServices>, address: string) => {
  const response = await getReputationByAddress(request(`/api/reputation/${address}`), services, address);
  return (await response.json()) as { reputation: { total: number; tier: { title: string }; breakdown: Record<string, number> }; rank: number | null };
};

describe("reputation service", () => {
  it("scores only verified evidence: pending and rejected earn nothing", async () => {
    const { services, alice, reviewer } = await setup();
    await postEvidence(post("/api/evidence", claim("https://github.com/o/r/pull/1"), { cookie: alice.cookie }), services);
    const rejected = await readJson(await postEvidence(post("/api/evidence", claim("https://github.com/o/r/pull/2"), { cookie: alice.cookie }), services));
    await postEvidenceReview(
      post(`/api/evidence/${rejected.evidence!.id}/review`, { decision: "reject" }, { cookie: reviewer.cookie }),
      services,
      rejected.evidence!.id,
    );
    expect(services.memory.reputation).toHaveLength(0);
    expect((await score(services, alice.address)).reputation.total).toBe(0);
  });

  it("awards weight + consistency bonus once a reviewer approves", async () => {
    const { services, alice, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/3"));
    const result = await score(services, alice.address);
    expect(result.reputation.total).toBe(8 + 2);
    expect(result.reputation.breakdown.code).toBe(8);
    expect(result.reputation.breakdown.consistency).toBe(2);
    expect(result.rank).toBe(1);
  });

  it("produces no reputation for a self-approved contribution", async () => {
    const { services, reviewer, submitAndApprove } = await setup();
    const { review } = await submitAndApprove(reviewer, claim("https://github.com/o/r/pull/4"));
    expect(review.status).toBe(403);
    expect(services.memory.reputation).toHaveLength(0);
  });

  it("produces one reputation event for duplicate evidence", async () => {
    const { services, alice, bob, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/5"));
    const dup = await postEvidence(post("/api/evidence", claim("https://github.com/O/R/pull/5/files"), { cookie: bob.cookie }), services);
    expect(dup.status).toBe(409);
    expect(services.memory.reputation.filter((event) => event.kind === "contribution")).toHaveLength(1);
  });

  it("rejects invalid evidence before anything is stored or scored", async () => {
    const { services, alice } = await setup();
    for (const body of [
      claim("not a url"),
      claim("http://insecure.example/pr/1"),
      claim("0x1234", { kind: "onchain-interaction", appId: "app" }),
      claim("https://github.com/o/r/pull/9", { occurredAt: "2031-01-01" }),
      claim("https://github.com/o/r/pull/9", { points: 50 }),
    ]) {
      const response = await postEvidence(post("/api/evidence", body, { cookie: alice.cookie }), services);
      expect(response.status).toBe(400);
    }
    expect(services.memory.evidence).toHaveLength(0);
    expect(services.memory.reputation).toHaveLength(0);
  });

  it("applies daily limits through the full flow", async () => {
    const { services, alice, submitAndApprove } = await setup();
    const { daily } = reputationConfig.limits.code;
    for (let n = 0; n < daily + 1; n += 1) {
      await submitAndApprove(alice, claim(`https://github.com/o/r/pull/${100 + n}`, { occurredAt: "2026-09-08" }));
    }
    const reversed = new Set(services.memory.reputation.map((event) => event.reversesEventId));
    const contributions = services.memory.reputation.filter((event) => event.kind === "contribution" && !reversed.has(event.id));
    expect(services.memory.reputation.filter((event) => event.kind === "reversal")).toHaveLength(0);
    expect(contributions.filter((event) => event.points === 8)).toHaveLength(daily);
    expect(contributions.filter((event) => event.points === 0)).toHaveLength(1);
    expect((await score(services, alice.address)).reputation.total).toBe(daily * 8 + 2);
  });

  it("is idempotent: recalculating twice writes nothing new", async () => {
    const { services, alice, user, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/6"));
    const before = services.memory.reputation.length;
    const userId = (await user(alice.address)).id;
    expect(await recalculateReputation(services, userId, { cause: "recalculation", actorId: null })).toHaveLength(0);
    expect(await recalculateReputation(services, userId, { cause: "recalculation", actorId: null })).toHaveLength(0);
    expect(services.memory.reputation).toHaveLength(before);
  });

  it("keeps full history when a rules change is recalculated: reverses, never edits or deletes", async () => {
    const { services, alice, user, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/7"));
    const userId = (await user(alice.address)).id;
    const original = services.memory.reputation.map((event) => ({ ...event }));

    const newRules: ReputationConfig = { ...reputationConfig, version: "test-v2", weights: { ...reputationConfig.weights, code: 12 } };
    const created = await recalculateReputation(services, userId, { cause: "recalculation", actorId: null, config: newRules });

    // Every original event is still there, unchanged.
    for (const event of original) expect(services.memory.reputation).toContainEqual(event);
    // The code event was reversed once and re-issued under the new version.
    const reversal = created.find((event) => event.kind === "reversal");
    expect(reversal?.points).toBe(-8);
    const reissued = created.find((event) => event.kind === "contribution");
    expect(reissued).toMatchObject({ points: 12, calculationVersion: "test-v2", dedupeKey: expect.stringMatching(/#1$/) });
    // Ledger total equals a fresh calculation under the new rules.
    expect(total(services.memory.reputation)).toBe(12 + 2);
    // Snapshot recorded for the recalculation.
    expect(services.memory.snapshots.at(-1)).toMatchObject({ total: 14, cause: "recalculation", calculationVersion: "test-v2" });
    // A second run with the same rules changes nothing.
    expect(await recalculateReputation(services, userId, { cause: "recalculation", actorId: null, config: newRules })).toHaveLength(0);
  });

  it("refuses duplicate ledger keys at the store level", async () => {
    const { services, alice, user, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/8"));
    const userId = (await user(alice.address)).id;
    const existing = services.memory.reputation[0];
    await expect(
      services.memory.updateLedger(userId, () => ({ writes: [{ ...existing, actorId: null }], snapshot: null })),
    ).rejects.toThrow(/unique/);
  });
});

describe("unauthorized score changes", () => {
  it("has no API that accepts points for recalculation", async () => {
    const { services, admin, alice } = await setup();
    const response = await postRecalculate(
      post(`/api/reputation/${alice.address}/recalculate`, { points: 1000 }, { cookie: admin.cookie }),
      services,
      alice.address,
    );
    expect(response.status).toBe(400);
  });

  it("lets nobody but an admin adjust a score, and never their own", async () => {
    const { services, alice, bob, reviewer, admin } = await setup();
    const adjust = (cookie: string | undefined, target: string) =>
      postAdjustment(post(`/api/reputation/${target}/adjustments`, { points: 50, reason: "Manual correction for test" }, { cookie }), services, target);

    expect((await adjust(undefined, bob.address)).status).toBe(401);
    expect((await adjust(alice.cookie, alice.address)).status).toBe(403);
    expect((await adjust(alice.cookie, bob.address)).status).toBe(403);
    expect((await adjust(reviewer.cookie, bob.address)).status).toBe(403);
    expect((await adjust(admin.cookie, admin.address)).status).toBe(403);
    expect(services.memory.reputation).toHaveLength(0);

    const ok = await adjust(admin.cookie, bob.address);
    expect(ok.status).toBe(201);
    const event = services.memory.reputation[0];
    const adminUser = await services.memory.findUserByAddress(admin.address as `0x${string}`);
    expect(event).toMatchObject({ kind: "adjustment", points: 50, actorId: adminUser!.id, reason: "Manual correction for test" });
    expect(services.memory.snapshots.at(-1)).toMatchObject({ cause: "adjustment", total: 50 });
  });

  it("bounds adjustments and requires a reason", async () => {
    const { services, bob, admin } = await setup();
    for (const body of [{ points: 0, reason: "valid reason here" }, { points: 500, reason: "valid reason here" }, { points: 5, reason: "short" }, { points: 5 }]) {
      const response = await postAdjustment(post(`/api/reputation/${bob.address}/adjustments`, body, { cookie: admin.cookie }), services, bob.address);
      expect(response.status).toBe(400);
    }
  });

  it("restricts recalculation to reviewers and admins, and bulk recalculation to admins", async () => {
    const { services, alice, reviewer, admin } = await setup();
    const one = (cookie: string) =>
      postRecalculate(post(`/api/reputation/${alice.address}/recalculate`, {}, { cookie }), services, alice.address);
    expect((await one(alice.cookie)).status).toBe(403);
    expect((await one(reviewer.cookie)).status).toBe(200);
    expect((await postRecalculateAll(post("/api/reputation/recalculate", {}, { cookie: reviewer.cookie }), services)).status).toBe(403);
    expect((await postRecalculateAll(post("/api/reputation/recalculate", {}, { cookie: admin.cookie }), services)).status).toBe(200);
  });

  it("rejects cross-site score writes", async () => {
    const { services, bob, admin } = await setup();
    const response = await postAdjustment(
      post(`/api/reputation/${bob.address}/adjustments`, { points: 5, reason: "valid reason here" }, { cookie: admin.cookie, origin: "https://evil.example" }),
      services,
      bob.address,
    );
    expect(response.status).toBe(403);
  });
});

describe("reputation read APIs", () => {
  it("lists supporting events with evidence references", async () => {
    const { services, alice, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/10"));
    const response = await getReputationEvents(request(`/api/reputation/${alice.address}/events`), services, alice.address);
    const body = (await response.json()) as { events: { kind: string; points: number; evidence: { reference: { url: string } } | null }[] };
    const contribution = body.events.find((event) => event.kind === "contribution");
    expect(contribution?.evidence?.reference.url).toBe("https://github.com/o/r/pull/10");
  });

  it("validates addresses", async () => {
    const services = makeServices();
    expect((await getReputationByAddress(request("/api/reputation/0x12"), services, "0x12")).status).toBe(400);
  });

  it("ranks only users with points, filters by category, and paginates", async () => {
    const { services, alice, bob, submitAndApprove } = await setup();
    await submitAndApprove(alice, claim("https://github.com/o/r/pull/20"));
    await submitAndApprove(bob, claim("https://example.org/research/1", { kind: "research-contribution" }));
    const page = async (query: string) => {
      const response = await getLeaderboardPage(request(`/api/leaderboard${query}`), services);
      return { status: response.status, body: (await response.json()) as { entries: { address: string; points: number }[]; totalEntries: number } };
    };
    const overall = await page("");
    expect(overall.body.entries.map((entry) => entry.address)).toEqual([alice.address, bob.address]);
    const research = await page("?category=research");
    expect(research.body.entries.map((entry) => entry.address)).toEqual([bob.address]);
    expect((await page("?page=2")).body.entries).toEqual([]);
    expect((await page("?category=nfts")).status).toBe(400);
  });

  it("returns 503 for the leaderboard without a database instead of mock data", async () => {
    const response = await getLeaderboardPage(request("/api/leaderboard"), makeServices({ store: null }));
    expect(response.status).toBe(503);
  });
});
