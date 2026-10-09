import { describe, expect, it } from "vitest";
import {
  getCampaignById,
  getCampaigns,
  patchCampaign,
  postApplication,
  postApplicationReview,
  postCampaign,
  postDeliverable,
  postDeliverableReview,
  postPublish,
} from "@/server/api/collab-handlers";
import { parseBudget } from "@/lib/collabs/rules";
import { paymentTokens } from "@/lib/collabs/tokens";
import { makeServices, post, request, signInNewWallet } from "./helpers/setup";

const NOW = new Date("2026-10-09T12:00:00Z");
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

const campaignBody = (overrides: Record<string, unknown> = {}) => ({
  projectName: "Lanternfish DEX",
  title: "Invariant tests for pool contracts",
  summary: "Write invariant and fuzz tests for our pool contracts before the audit.",
  description: "We need a strong invariant test suite with handlers and ghost variables before our external audit starts.",
  category: "development",
  objectives: ["Catch rounding bugs before audit"],
  deliverables: ["Foundry invariant suite"],
  eligibility: ["Public Solidity testing work"],
  acceptanceCriteria: ["Suite runs in CI and covers swap math"],
  requiredSkills: ["Solidity", "Foundry"],
  paymentToken: "MON",
  amountPerCreator: "250",
  slots: 1,
  deadline: inDays(30),
  ...overrides,
});

const proposal = "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI.";
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });

async function setup() {
  const services = makeServices({ now: NOW });
  const owner = await signInNewWallet(services);
  const creator = await signInNewWallet(services);
  const other = await signInNewWallet(services);

  const create = async (overrides: Record<string, unknown> = {}, who = owner) =>
    body(await postCampaign(post("/api/campaigns", campaignBody(overrides), { cookie: who.cookie }), services));
  const publish = async (id: string, who = owner) =>
    body(await postPublish(post(`/api/campaigns/${id}/publish`, {}, { cookie: who.cookie }), services, id));
  const apply = async (id: string, who = creator, extra: Record<string, unknown> = {}) =>
    body(await postApplication(post(`/api/campaigns/${id}/applications`, { proposal, ...extra }, { cookie: who.cookie }), services, id));
  const decideApp = async (id: string, decision: "accept" | "reject", who = owner) =>
    body(await postApplicationReview(post(`/api/applications/${id}/review`, { decision, reason: "Good fit for the brief" }, { cookie: who.cookie }), services, id));
  const deliver = async (appId: string, n: number, who = creator) =>
    body(await postDeliverable(post(`/api/applications/${appId}/deliverables`, { contentUrl: `https://github.com/o/r/pull/${n}`, contentHash: hash(n) }, { cookie: who.cookie }), services, appId));
  const decideDeliverable = async (id: string, decision: "accept" | "reject", who = owner, reason = "Meets every criterion") =>
    body(await postDeliverableReview(post(`/api/deliverables/${id}/review`, { decision, reason }, { cookie: who.cookie }), services, id));

  /** A published campaign with an accepted application from `creator`. */
  const ready = async () => {
    const campaign = (await create()).json.campaign;
    await publish(campaign.id);
    const app = (await apply(campaign.id)).json.application;
    await decideApp(app.id, "accept");
    return { campaignId: campaign.id as string, appId: app.id as string };
  };

  return { services, owner, creator, other, create, publish, apply, decideApp, deliver, decideDeliverable, ready };
}

describe("campaign ownership", () => {
  it("creates drafts owned by the signed-in wallet and ignores owner fields in the body", async () => {
    const { services, owner, other, create } = await setup();
    const spoof = await body(
      await postCampaign(post("/api/campaigns", { ...campaignBody(), ownerId: "someone-else" }, { cookie: owner.cookie }), services),
    );
    expect(spoof.status).toBe(400);
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.json.campaign.ownerAddress).toBe(owner.address);
    expect(created.json.campaign.status).toBe("draft");
    expect(services.collabMemory.campaigns[0].ownerId).not.toBe((await services.memory.findUserByAddress(other.address as `0x${string}`))!.id);
  });

  it("requires a session to create a campaign", async () => {
    const { services } = await setup();
    expect((await postCampaign(post("/api/campaigns", campaignBody()), services)).status).toBe(401);
  });

  it("prevents other users from editing or publishing someone else's campaign", async () => {
    const { services, other, create, publish } = await setup();
    const { id } = (await create()).json.campaign;
    const edit = await patchCampaign(post(`/api/campaigns/${id}`, campaignBody({ title: "Hijacked campaign title" }), { cookie: other.cookie }), services, id);
    expect(edit.status).toBe(403);
    expect((await publish(id, other)).status).toBe(403);
    expect(services.collabMemory.campaigns[0].title).toBe("Invariant tests for pool contracts");
  });

  it("hides drafts from everyone but the owner", async () => {
    const { services, owner, other, create } = await setup();
    const { id } = (await create()).json.campaign;
    expect((await getCampaignById(request(`/api/campaigns/${id}`, { cookie: other.cookie }), services, id)).status).toBe(404);
    expect((await getCampaignById(request(`/api/campaigns/${id}`, { cookie: owner.cookie }), services, id)).status).toBe(200);
    const list = await body(await getCampaigns(request("/api/campaigns"), services));
    expect(list.json.total).toBe(0);
  });

  it("refuses edits after publication", async () => {
    const { services, owner, create, publish } = await setup();
    const { id } = (await create()).json.campaign;
    await publish(id);
    const edit = await patchCampaign(post(`/api/campaigns/${id}`, campaignBody(), { cookie: owner.cookie }), services, id);
    expect(edit.status).toBe(409);
  });
});

describe("budgets and deadlines", () => {
  it.each(["0", "-5", "abc", "", "1e5", "10.1234567890123456789", "2000000", " 1 0 "])("rejects budget %j", async (amount) => {
    const { create } = await setup();
    const result = await create({ amountPerCreator: amount });
    expect(result.status).toBe(400);
  });

  it("rejects too many decimals for the token", () => {
    expect(parseBudget("1.1234567", { ...paymentTokens.MON, decimals: 6 }).ok).toBe(false);
    expect(parseBudget("1.5", paymentTokens.MON)).toEqual({ ok: true, baseUnits: BigInt("1500000000000000000") });
  });

  it("rejects payment tokens that are not configured", async () => {
    const { create } = await setup();
    expect((await create({ paymentToken: "DOGE" })).status).toBe(400);
    if (!paymentTokens.USDC.enabled) expect((await create({ paymentToken: "USDC" })).status).toBe(400);
  });

  it("refuses to publish with a past, too-soon, or too-distant deadline", async () => {
    const { create, publish } = await setup();
    for (const deadline of [inDays(-1), inDays(0.5), inDays(400)]) {
      const { id } = (await create({ deadline })).json.campaign;
      const result = await publish(id);
      expect(result.status).toBe(400);
      expect(result.json.error.code).toBe("not_publishable");
    }
  });

  it("refuses to publish without deliverables or acceptance criteria", async () => {
    const { create, publish } = await setup();
    const { id } = (await create({ deliverables: [], acceptanceCriteria: [] })).json.campaign;
    expect((await publish(id)).status).toBe(400);
  });

  it("refuses applications and deliverables after the deadline", async () => {
    const { services, create, publish, apply, ready, deliver } = await setup();
    const { id } = (await create()).json.campaign;
    await publish(id);
    const { appId } = await ready();
    // Move every campaign's deadline into the past.
    for (const campaign of services.collabMemory.campaigns) campaign.deadline = new Date(NOW.getTime() - 1000);
    const late = await apply(id);
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("deadline_passed");
    const lateWork = await deliver(appId, 1);
    expect(lateWork.status).toBe(409);
    expect(lateWork.json.error.code).toBe("deadline_passed");
  });
});

describe("applications", () => {
  it("prevents duplicate applications to the same campaign", async () => {
    const { services, create, publish, apply } = await setup();
    const { id } = (await create()).json.campaign;
    await publish(id);
    expect((await apply(id)).status).toBe(201);
    const second = await apply(id);
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("duplicate_application");
    expect(services.collabMemory.applications).toHaveLength(1);
  });

  it("refuses applications to drafts and to one's own campaign", async () => {
    const { owner, create, publish, apply } = await setup();
    const { id } = (await create()).json.campaign;
    expect((await apply(id)).status).toBe(404);
    await publish(id);
    expect((await apply(id, owner)).status).toBe(403);
  });

  it("only accepts the applicant's own verified Passport evidence", async () => {
    const { create, publish, apply } = await setup();
    const { id } = (await create()).json.campaign;
    await publish(id);
    const result = await apply(id, undefined, { evidenceIds: ["someone-elses-evidence"] });
    expect(result.status).toBe(400);
    expect(result.json.error.code).toBe("invalid_evidence");
  });

  it("lets only the campaign owner review applications", async () => {
    const { services, creator, other, create, publish, apply, decideApp } = await setup();
    const { id } = (await create()).json.campaign;
    await publish(id);
    const app = (await apply(id)).json.application;
    expect((await decideApp(app.id, "accept", other)).status).toBe(403);
    expect((await decideApp(app.id, "accept", creator)).status).toBe(403);
    expect(services.collabMemory.applications[0].status).toBe("pending");
    expect((await decideApp(app.id, "accept")).status).toBe(200);
    expect((await decideApp(app.id, "reject")).status).toBe(409);
  });

  it("never accepts more creators than slots", async () => {
    const { other, create, publish, apply, decideApp } = await setup();
    const { id } = (await create({ slots: 1 })).json.campaign;
    await publish(id);
    const first = (await apply(id)).json.application;
    const second = (await apply(id, other)).json.application;
    expect((await decideApp(first.id, "accept")).status).toBe(200);
    const full = await decideApp(second.id, "accept");
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe("campaign_full");
  });
});

describe("deliverables and reputation", () => {
  it("prevents duplicate and concurrent deliverable submissions", async () => {
    const { services, ready, deliver, decideDeliverable } = await setup();
    const { appId } = await ready();
    const first = await deliver(appId, 1);
    expect(first.status).toBe(201);
    const whilePending = await deliver(appId, 2);
    expect(whilePending.status).toBe(409);
    expect(whilePending.json.error.code).toBe("open_submission");
    await decideDeliverable(first.json.deliverable.id, "reject", undefined, "Missing CI configuration");
    const sameContent = await deliver(appId, 1);
    expect(sameContent.status).toBe(409);
    expect(sameContent.json.error.code).toBe("duplicate_deliverable");
    const revision = await deliver(appId, 2);
    expect(revision.status).toBe(201);
    expect(revision.json.deliverable.revision).toBe(2);
    expect(services.collabMemory.deliverables).toHaveLength(2);
  });

  it("only lets the accepted creator submit", async () => {
    const { other, owner, ready, deliver } = await setup();
    const { appId } = await ready();
    expect((await deliver(appId, 1, other)).status).toBe(403);
    expect((await deliver(appId, 1, owner)).status).toBe(403);
  });

  it("lets only the owner review deliverables, with a reason, and keeps the history", async () => {
    const { services, creator, other, ready, deliver, decideDeliverable } = await setup();
    const { appId } = await ready();
    const id = (await deliver(appId, 1)).json.deliverable.id;
    expect((await decideDeliverable(id, "accept", other)).status).toBe(403);
    expect((await decideDeliverable(id, "accept", creator)).status).toBe(403);
    expect((await decideDeliverable(id, "accept", undefined, "")).status).toBe(400);
    const rejected = await decideDeliverable(id, "reject", undefined, "Tests do not cover fees");
    expect(rejected.json.deliverable.reviews).toEqual([
      expect.objectContaining({ decision: "rejected", reason: "Tests do not cover fees" }),
    ]);
    expect((await decideDeliverable(id, "accept")).status).toBe(409);
    expect(services.collabMemory.reviews).toHaveLength(1);
  });

  it("awards reputation only after acceptance, exactly once", async () => {
    const { services, ready, deliver, decideDeliverable } = await setup();
    const { appId } = await ready();
    // Publishing, applying, and submitting earn nothing.
    const id = (await deliver(appId, 1)).json.deliverable.id;
    expect(services.memory.reputation).toHaveLength(0);
    expect(services.memory.evidence).toHaveLength(0);

    expect((await decideDeliverable(id, "accept")).status).toBe(200);
    const campaignEvents = services.memory.reputation.filter((event) => event.category === "campaign");
    expect(campaignEvents).toHaveLength(1);
    expect(campaignEvents[0].points).toBe(10);
    expect(services.memory.stamps.map((stamp) => stamp.category)).toContain("collaborator");

    // A second decision is refused and nothing new is awarded.
    expect((await decideDeliverable(id, "accept")).status).toBe(409);
    expect(services.memory.reputation.filter((event) => event.category === "campaign")).toHaveLength(1);
    // After acceptance, no further submissions.
    expect((await deliver(appId, 9)).json.error.code).toBe("already_accepted");
  });

  it("awards nothing for rejected work", async () => {
    const { services, ready, deliver, decideDeliverable } = await setup();
    const { appId } = await ready();
    const id = (await deliver(appId, 1)).json.deliverable.id;
    await decideDeliverable(id, "reject", undefined, "Does not meet criteria");
    expect(services.memory.reputation).toHaveLength(0);
  });
});

describe("campaign listing", () => {
  it("searches, filters, sorts, and paginates published campaigns", async () => {
    const { services, create, publish } = await setup();
    for (const [index, overrides] of [
      { title: "Sticker pack for a wallet launch", category: "art", amountPerCreator: "50" },
      { title: "Retention dashboard for dapps", category: "research", amountPerCreator: "900" },
      { title: "Invariant tests for pool contracts", category: "development", amountPerCreator: "400" },
    ].entries()) {
      const { id } = (await create({ ...overrides, deadline: inDays(10 + index) })).json.campaign;
      await publish(id);
    }
    const query = async (q: string) => (await body(await getCampaigns(request(`/api/campaigns${q}`), services))).json;
    expect((await query("?q=dashboard")).campaigns.map((c: Json) => c.title)).toEqual(["Retention dashboard for dapps"]);
    expect((await query("?category=art")).total).toBe(1);
    expect((await query("?sort=budget")).campaigns[0].title).toBe("Retention dashboard for dapps");
    expect((await query("?sort=deadline")).campaigns[0].title).toBe("Sticker pack for a wallet launch");
    expect((await query("?page=2")).campaigns).toEqual([]);
    expect((await getCampaigns(request("/api/campaigns?sort=random"), services)).status).toBe(400);
  });

  it("answers 503 without a database instead of serving sample campaigns", async () => {
    const response = await getCampaigns(request("/api/campaigns"), makeServices({ store: null }));
    expect(response.status).toBe(503);
  });
});
