/**
 * Regression tests for defects found in the October 2026 security review.
 * Each block names the defect it guards against.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Address, type Hash } from "viem";
import { getReputationEvents, postEvidence, postEvidenceReview, postSignIn } from "@/server/api/handlers";
import { postApplication, postApplicationReview, postCampaign, postPublish, postRegistration } from "@/server/api/collab-handlers";
import { readBody } from "@/server/api/http";
import { emptyBodySchema } from "@/server/api/schemas";
import { MAX_PENDING_CLAIMS } from "@/server/passport/service";
import { runIndexer } from "@/server/payments/indexer";
import { canonicalCodeUrl, canonicalUrl } from "@/server/verification/canonical-url";
import type { OnchainClient } from "@/server/verification/onchain";
import type { SupportedApp } from "@/server/verification/supported-apps";
import nextConfig from "../next.config";
import { FakeChain } from "./helpers/fake-chain";
import { makeServices, post, readJson, request, signInNewWallet } from "./helpers/setup";

const NOW = new Date("2026-10-09T09:00:00Z"); // before noon UTC on purpose
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });

const claim = (reference: string, overrides: Record<string, unknown> = {}) => ({
  kind: "community-contribution",
  title: "Builder call notes",
  summary: "Notes from twelve weekly builder calls.",
  reference,
  occurredAt: "2026-09-01",
  ...overrides,
});

async function people(services = makeServices({ now: NOW })) {
  const alice = await signInNewWallet(services);
  const mallory = await signInNewWallet(services);
  const reviewer = await signInNewWallet(services);
  services.memory.setRole((await services.memory.findUserByAddress(reviewer.address as Address))!.id, "reviewer");
  const submit = async (who: typeof alice, input: unknown) => body(await postEvidence(post("/api/evidence", input, { cookie: who.cookie }), services));
  const review = async (id: string, decision: "approve" | "reject") =>
    body(await postEvidenceReview(post(`/api/evidence/${id}/review`, { decision }, { cookie: reviewer.cookie }), services, id));
  return { services, alice, mallory, reviewer, submit, review };
}

describe("evidence squatting (fixed)", () => {
  const event = parseAbiItem("event Interacted(address indexed user, uint256 amount)");
  const contract = "0x3333333333333333333333333333333333333333" as Address;
  const tx = `0x${"cd".repeat(32)}` as Hash;
  const app: SupportedApp = { id: "test-app", name: "Test App", chainId: 143, contracts: [contract], event, walletArg: "user" };

  it("does not let another wallet block a transaction's sender from claiming it", async () => {
    let sender: Address = "0x0000000000000000000000000000000000000001";
    const client: OnchainClient = {
      getTransactionReceipt: (async () => ({
        status: "success",
        from: sender,
        to: contract,
        blockNumber: BigInt(100),
        logs: [
          {
            address: contract,
            topics: encodeEventTopics({ abi: [event], eventName: "Interacted", args: { user: sender } }),
            data: encodeAbiParameters([{ type: "uint256" }], [BigInt(1)]),
            blockNumber: BigInt(100),
            blockHash: `0x${"00".repeat(32)}`,
            logIndex: 0,
            transactionHash: tx,
            transactionIndex: 0,
            removed: false,
          },
        ],
      })) as unknown as OnchainClient["getTransactionReceipt"],
      getBlockNumber: (async () => BigInt(110)) as OnchainClient["getBlockNumber"],
      getBlock: (async () => ({ timestamp: BigInt(1_790_000_000) })) as unknown as OnchainClient["getBlock"],
    };
    const { alice, mallory, submit } = await people(makeServices({ now: NOW, onchainClient: client, apps: [app] }));
    sender = alice.account.address;
    const input = { kind: "onchain-interaction", title: "Swap", summary: "Swapped on Test App.", reference: tx, appId: "test-app" };

    const squat = await submit(mallory, input);
    expect(squat.json.evidence.status).toBe("rejected");
    const real = await submit(alice, input);
    expect(real.status).toBe(201);
    expect(real.json.evidence.status).toBe("verified");
    // The sender still cannot claim it twice.
    expect((await submit(alice, input)).json.error.code).toBe("duplicate_evidence");
  });

  it("releases a rejected link so its real author can claim it", async () => {
    const { alice, mallory, submit, review } = await people();
    const link = "https://forum.example/t/builder-notes/12";
    const squat = await submit(mallory, claim(link));
    await review(squat.json.evidence.id, "reject");
    const real = await submit(alice, claim(link));
    expect(real.status).toBe(201);
  });
});

describe("duplicate points through link variants (fixed)", () => {
  it("treats one link as one contribution whatever kind it is claimed as", async () => {
    const { alice, submit } = await people();
    const link = "https://github.com/monad/docs/pull/12";
    expect((await submit(alice, claim(link))).status).toBe(201);
    expect((await submit(alice, claim(link, { kind: "research-contribution" }))).json.error.code).toBe("duplicate_evidence");
    expect((await submit(alice, claim(link, { kind: "code-contribution" }))).json.error.code).toBe("duplicate_evidence");
  });

  it.each([
    ["https://github.com./Monad/Docs/pull/012", "https://github.com/monad/docs/pull/12"],
    ["https://twitter.com/Chog/status/1", "https://x.com/chog/status/1"],
    ["https://x.com//chog//status/%31", "https://x.com/chog/status/1"],
    ["https://forum.example/t/1?UTM_SOURCE=x&S=1&lang=en", "https://forum.example/t/1?lang=en"],
  ])("normalises %s", (variant, expected) => {
    expect(canonicalCodeUrl(variant)).toBe(expected);
  });

  it("keeps case in file paths, which GitHub treats as case-sensitive", () => {
    expect(canonicalUrl("https://github.com/A/B/blob/main/README.md")).toBe("https://github.com/a/b/blob/main/README.md");
  });

  it("rejects short commit SHAs and accepts full ones in any case", () => {
    expect(() => canonicalCodeUrl("https://github.com/a/b/commit/abcdef1")).toThrow(/40-character/);
    const sha = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
    expect(canonicalCodeUrl(`https://github.com/a/b/commit/${sha}`)).toBe(`https://github.com/a/b/commit/${sha.toLowerCase()}`);
  });
});

describe("reputation farming by backdating (fixed)", () => {
  it("applies daily limits by verification time, not the claimed date", async () => {
    const { services, alice, submit, review } = await people();
    // Five claims dated on five different past days, all verified today: only 3 earn (content daily limit 3).
    for (const day of ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05"]) {
      const created = await submit(alice, claim(`https://forum.example/t/${day}`, { occurredAt: day }));
      await review(created.json.evidence.id, "approve");
    }
    const events = (await body(await getReputationEvents(request(`/api/reputation/${alice.address}/events`), services, alice.address))).json.events;
    const earning = events.filter((event: Json) => event.kind === "contribution" && event.points > 0);
    expect(earning).toHaveLength(3);
    // One verification week, so one consistency bonus.
    expect(events.filter((event: Json) => event.kind === "consistency" && event.points > 0)).toHaveLength(1);
  });
});

describe("evidence submission limits (fixed)", () => {
  it("accepts today's date before noon UTC", async () => {
    const { alice, submit } = await people();
    expect((await submit(alice, claim("https://forum.example/t/today", { occurredAt: "2026-10-09" }))).status).toBe(201);
    expect((await submit(alice, claim("https://forum.example/t/tomorrow", { occurredAt: "2026-10-10" }))).json.error.code).toBe("invalid_date");
  });

  it("caps open claims per wallet so the review queue cannot be flooded", async () => {
    const { alice, submit } = await people();
    for (let i = 0; i < MAX_PENDING_CLAIMS; i += 1) expect((await submit(alice, claim(`https://forum.example/t/${i}`))).status).toBe(201);
    const over = await submit(alice, claim("https://forum.example/t/one-more"));
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("too_many_pending");
  });
});

describe("campaign evidence is written verified in one step (fixed)", () => {
  it("never stores accepted campaign work as pending", async () => {
    const services = makeServices({ now: NOW });
    const writes: string[] = [];
    const original = services.memory.createEvidence.bind(services.memory);
    services.memory.createEvidence = async (input) => {
      writes.push(input.status);
      return original(input);
    };
    const { campaignId, owner, creator } = await openCampaign(services);
    const app = (await body(await postApplication(post(`/api/campaigns/${campaignId}/applications`, { proposal: "I have done this kind of work before and can deliver it on time." }, { cookie: creator.cookie }), services, campaignId))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit" }, { cookie: owner.cookie }), services, app.id);
    const { postDeliverable, postDeliverableReview } = await import("@/server/api/collab-handlers");
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://example.com/work", contentHash: `0x${"ab".repeat(32)}` }, { cookie: creator.cookie }), services, app.id))).json.deliverable;
    await postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets the criteria" }, { cookie: owner.cookie }), services, deliverable.id);
    expect(writes).toEqual(["verified"]);
    const stored = services.memory.evidence.find((item) => item.kind === "campaign-deliverable");
    expect(stored).toMatchObject({ status: "verified", reviewerId: expect.any(String) });
    expect(stored?.verifiedAt).toBeInstanceOf(Date);
  });
});

const campaignInput = (deadline: Date) => ({
  projectName: "Lanternfish DEX",
  title: "Invariant tests for pool contracts",
  summary: "Write invariant and fuzz tests for our pool contracts before the audit.",
  description: "We need a strong invariant test suite with handlers and ghost variables before our external audit starts.",
  category: "development",
  objectives: ["Catch rounding bugs"],
  deliverables: ["Foundry invariant suite"],
  eligibility: ["Public Solidity testing work"],
  acceptanceCriteria: ["Suite runs in CI"],
  requiredSkills: ["Solidity"],
  paymentToken: "MON",
  amountPerCreator: "250",
  slots: 2,
  deadline: deadline.toISOString(),
});

async function openCampaign(services: ReturnType<typeof makeServices>) {
  const owner = await signInNewWallet(services);
  const creator = await signInNewWallet(services);
  const campaign = (await body(await postCampaign(post("/api/campaigns", campaignInput(new Date(NOW.getTime() + 30 * 86_400_000)), { cookie: owner.cookie }), services))).json.campaign;
  await postPublish(post(`/api/campaigns/${campaign.id}/publish`, {}, { cookie: owner.cookie }), services, campaign.id);
  return { campaignId: campaign.id as string, owner, creator };
}

describe("collab board deadlines (fixed)", () => {
  it("does not accept applications after the deadline", async () => {
    const services = makeServices({ now: NOW });
    const { campaignId, owner, creator } = await openCampaign(services);
    const app = (await body(await postApplication(post(`/api/campaigns/${campaignId}/applications`, { proposal: "I have done this kind of work before and can deliver it on time." }, { cookie: creator.cookie }), services, campaignId))).json.application;
    // The deadline passes while the application waits for review.
    services.collabMemory.campaigns.find((item) => item.id === campaignId)!.deadline = new Date(NOW.getTime() - 1);
    const late = await body(await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit" }, { cookie: owner.cookie }), services, app.id));
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("deadline_passed");
  });

  it("re-validates a campaign when its registration is confirmed", async () => {
    let now = NOW.getTime();
    const contract = "0x1111111111111111111111111111111111111111" as Address;
    const chain = new FakeChain(contract);
    const services = makeServices({ now: NOW, paymentsContract: contract, chain: chain.reader(), confirmations: 1 });
    services.now = () => new Date(now++);
    const owner = await signInNewWallet(services);
    const draft = (await body(await postCampaign(post("/api/campaigns", campaignInput(new Date(NOW.getTime() + 2 * 86_400_000)), { cookie: owner.cookie }), services))).json.campaign;
    const { registration } = (await body(await postPublish(post(`/api/campaigns/${draft.id}/publish`, {}, { cookie: owner.cookie }), services, draft.id))).json;
    chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    // The registration is only confirmed after the deadline window has closed.
    now += 3 * 86_400_000;
    const result = await runIndexer(services);
    expect(result).toMatchObject({ status: "ok", outcomes: { "registered-not-publishable": 1 } });
    const stored = await services.collabMemory.findCampaign(draft.id);
    expect(stored?.status).toBe("draft");
    expect(stored?.registrationStatus).toBe("failed");
    expect(stored?.registrationError).toMatch(/Registered on Monad, but not published/);
  });

  it("treats an RPC failure during the registration lookup as pending, not an error", async () => {
    const contract = "0x1111111111111111111111111111111111111111" as Address;
    const chain = new FakeChain(contract);
    const services = makeServices({ now: NOW, paymentsContract: contract, chain: chain.reader() });
    const owner = await signInNewWallet(services);
    const draft = (await body(await postCampaign(post("/api/campaigns", campaignInput(new Date(NOW.getTime() + 30 * 86_400_000)), { cookie: owner.cookie }), services))).json.campaign;
    await postPublish(post(`/api/campaigns/${draft.id}/publish`, {}, { cookie: owner.cookie }), services, draft.id);
    chain.failNextCalls = 5;
    const checked = await body(await postRegistration(post(`/api/campaigns/${draft.id}/registration`, {}, { cookie: owner.cookie }), services, draft.id));
    expect(checked.status).toBe(200);
    expect(checked.json.campaign.registration).toMatchObject({ status: "pending", error: expect.stringMatching(/Could not search Monad/) });
  });
});

describe("indexer configuration (fixed)", () => {
  it("refuses to scan from block 0 when the deploy block is not configured", async () => {
    const contract = "0x1111111111111111111111111111111111111111" as Address;
    const services = makeServices({ now: NOW, paymentsContract: contract, chain: new FakeChain(contract).reader() });
    services.config.paymentsDeployBlock = null;
    expect(await runIndexer(services)).toMatchObject({ status: "unavailable", reason: expect.stringMatching(/CAMPAIGN_PAYMENTS_DEPLOY_BLOCK/) });
  });
});

describe("request handling (fixed)", () => {
  it("refuses oversized bodies before reading them, by declared length or by streamed bytes", async () => {
    const big = "x".repeat(20_000);
    const declared = new Request("http://localhost:3000/api/x", { method: "POST", body: big, headers: { "content-length": String(big.length) } });
    await expect(readBody(declared, emptyBodySchema)).rejects.toMatchObject({ status: 413 });

    // Streamed without a Content-Length, and multi-byte: 6,000 characters are 18,000 bytes.
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`"${"€".repeat(6_000)}"`));
        controller.close();
      },
    });
    const chunked = new Request("http://localhost:3000/api/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readBody(chunked, emptyBodySchema)).rejects.toMatchObject({ status: 413 });
  });

  it("still refuses replayed sign-in messages", async () => {
    const services = makeServices({ now: NOW });
    const alice = await signInNewWallet(services);
    const replay = await postSignIn(post("/api/auth/verify", { message: alice.signedIn.message, signature: alice.signedIn.signature }, { cookie: alice.signedIn.nonceCookie }), services);
    expect(replay.status).toBe(409);
    expect((await readJson(replay)).error?.code).toBe("nonce_used");
  });

  it("sends security headers on every route", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const [rule] = await nextConfig.headers!();
    const headers = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
    expect(rule.source).toBe("/(.*)");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers).toMatchObject({ "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  });
});
