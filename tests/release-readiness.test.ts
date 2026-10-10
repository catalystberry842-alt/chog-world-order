/**
 * Mainnet release readiness: behaviour that depends on Monad's real RPC limits
 * and finality, plus the operator controls (pause, indexer status, logging).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  getIndexerStatus,
  postApplication,
  postApplicationReview,
  postCampaign,
  postDeliverable,
  postDeliverableReview,
  postPaymentIntent,
  postPaymentTransaction,
  postPublish,
  postRegistration,
  runIndexerRequest,
} from "@/server/api/collab-handlers";
import { CURSOR_KEY, runIndexer } from "@/server/payments/indexer";
import { alert, log } from "@/server/log";
import { readConfig } from "@/server/config";
import { FakeChain } from "./helpers/fake-chain";
import { makeServices, post, request, signInNewWallet } from "./helpers/setup";

const NOW = new Date("2026-10-09T12:00:00Z");
const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });

const campaignInput = {
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
  deadline: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
};

async function setup(options: { finalizedLag?: number; confirmations?: number } = {}) {
  const chain = new FakeChain(CONTRACT);
  chain.finalizedLag = options.finalizedLag ?? 0;
  const services = makeServices({ now: NOW, paymentsContract: CONTRACT, chain: chain.reader(), confirmations: options.confirmations ?? 2 });
  const owner = await signInNewWallet(services);
  const creator = await signInNewWallet(services);
  const draft = async () => (await body(await postCampaign(post("/api/campaigns", campaignInput, { cookie: owner.cookie }), services))).json.campaign.id as string;
  const publish = async (id: string) => body(await postPublish(post(`/api/campaigns/${id}/publish`, {}, { cookie: owner.cookie }), services, id));
  const register = async (id: string, txHash?: string) =>
    body(await postRegistration(post(`/api/campaigns/${id}/registration`, txHash ? { txHash } : {}, { cookie: owner.cookie }), services, id));
  return { chain, services, owner, creator, draft, publish, register };
}

describe("Monad finality", () => {
  it("does not confirm a payment or registration until the block is finalized, even with enough depth", async () => {
    const { chain, owner, draft, publish, register } = await setup({ finalizedLag: 2, confirmations: 2 });
    const id = await draft();
    const { registration } = (await publish(id)).json;
    const tx = chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(1); // 2 confirmations from `latest`, but `finalized` is still 1 block behind the tx
    expect((await register(id, tx)).json.campaign.registration).toMatchObject({ status: "pending", error: "Waiting for Monad to finalize the block." });
    chain.advance(1);
    expect((await register(id, tx)).json.campaign.status).toBe("published");
  });
});

describe("interrupted registration without a transaction hash", () => {
  it("confirms from finalized contract state, then the indexer fills in the verified hash", async () => {
    const { chain, services, owner, draft, publish, register } = await setup({ finalizedLag: 2 });
    const id = await draft();
    const { registration } = (await publish(id)).json;
    expect((await register(id)).json.campaign.registration.error).toBe("No registration found on Monad yet.");

    const tx = chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    expect((await register(id)).json.campaign.registration.error).toBe("Registered on Monad. Waiting for the block to be finalized.");

    chain.advance(2);
    const published = (await register(id)).json.campaign;
    expect(published).toMatchObject({ status: "published", registration: { status: "confirmed", txHash: null } });

    chain.advance(2);
    const run = await runIndexer(services);
    expect(run).toMatchObject({ status: "ok", outcomes: { "registered-hash-recorded": 1 } });
    expect((await services.collabMemory.findCampaign(id))?.registrationTxHash).toBe(tx.toLowerCase());
  });

  it("never scans logs for the lookup, so public RPC range limits cannot break it", async () => {
    const { chain, draft, publish, register } = await setup();
    chain.maxLogRange = BigInt(100);
    chain.head = BigInt(5_000_000);
    const id = await draft();
    await publish(id);
    chain.logCalls = [];
    expect((await register(id)).status).toBe(200);
    expect(chain.logCalls).toHaveLength(0);
  });
});

describe("indexer on a range-limited RPC", () => {
  it("reads in chunks within the RPC limit, saves progress per chunk, and never stalls", async () => {
    const { chain, services, owner, draft, publish } = await setup();
    chain.maxLogRange = BigInt(100);
    services.config.indexer = { maxBlockRange: BigInt(100), maxChunksPerRun: 5, reconcileBlocks: BigInt(500) };
    services.config.paymentsDeployBlock = BigInt(0);

    const id = await draft();
    const { registration } = (await publish(id)).json;
    chain.head = BigInt(1_250);
    chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(1);

    const cursors: string[] = [];
    for (let run = 0; run < 4; run += 1) {
      const result = await runIndexer(services);
      expect(result.status).toBe("ok");
      cursors.push((await services.paymentMemory.getCursor(CURSOR_KEY))!.toString());
    }
    expect(chain.logCalls.every((call) => call.toBlock - call.fromBlock + BigInt(1) <= BigInt(100))).toBe(true);
    // 5 chunks of 100 blocks per run: the cursor advances every run until it catches up.
    expect(cursors.map(Number)).toEqual([499, 999, 1251, 1251]);
    expect((await services.collabMemory.findCampaign(id))?.status).toBe("published");
  });

  it("keeps the last completed chunk when the RPC fails mid-run", async () => {
    const { chain, services } = await setup();
    services.config.indexer = { maxBlockRange: BigInt(100), maxChunksPerRun: 10, reconcileBlocks: BigInt(0) };
    services.config.paymentsDeployBlock = BigInt(0);
    await runIndexer(services); // primes the contract check
    await services.paymentMemory.setCursor(CURSOR_KEY, BigInt(99));
    const reader = chain.reader();
    let calls = 0;
    const getLogs = reader.getLogs;
    reader.getLogs = (async (...args: Parameters<typeof getLogs>) => {
      calls += 1;
      if (calls === 3) throw new Error("RPC unavailable");
      return getLogs(...args);
    }) as typeof getLogs;
    const result = await runIndexer({ ...services, chain: reader });
    expect(result).toMatchObject({ status: "error", reason: "RPC unavailable", cursor: "299" });
    expect(await services.paymentMemory.getCursor(CURSOR_KEY)).toBe(BigInt(299));
  });
});

describe("payments pause switch", () => {
  it("stops new instructions but keeps verifying transactions already sent", async () => {
    const { chain, services, owner, creator, draft, publish } = await setup();
    const id = await draft();
    const { registration } = (await publish(id)).json;
    chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(2);
    await runIndexer(services);
    const app = (await body(await postApplication(post(`/api/campaigns/${id}/applications`, { proposal: "I have done this kind of work before and can deliver it on time." }, { cookie: creator.cookie }), services, id))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit" }, { cookie: owner.cookie }), services, app.id);
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://example.com/work", contentHash: `0x${"ab".repeat(32)}` }, { cookie: creator.cookie }), services, app.id))).json.deliverable;
    await postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets the criteria" }, { cookie: owner.cookie }), services, deliverable.id);
    const instructions = (await body(await postPaymentIntent(post(`/api/deliverables/${deliverable.id}/payment`, {}, { cookie: owner.cookie }), services, deliverable.id))).json;

    // The owner sends the transaction, then operators pause payments.
    const tx = chain.mine({
      from: owner.account.address,
      events: [
        chain.paidEvent({
          campaignId: instructions.call.args[0] as Hex,
          creator: instructions.call.args[1] as Address,
          token: "0x0000000000000000000000000000000000000000",
          amount: BigInt(instructions.call.value),
          payer: owner.account.address,
          deliverableRef: instructions.call.args[2] as Hex,
        }),
      ],
    });
    chain.advance(1);
    services.config.paymentsPaused = true;

    const blocked = await body(await postPaymentIntent(post(`/api/deliverables/${deliverable.id}/payment`, {}, { cookie: owner.cookie }), services, deliverable.id));
    expect(blocked.status).toBe(503);
    expect(blocked.json.error.code).toBe("payments_paused");
    const newDraft = await draft();
    expect((await publish(newDraft)).json.error.code).toBe("payments_paused");

    const reported = await body(await postPaymentTransaction(post(`/api/payments/${instructions.payment.id}/transaction`, { txHash: tx }, { cookie: owner.cookie }), services, instructions.payment.id));
    expect(reported.json.payment.status).toBe("confirmed");
  });

  it("is read from PAYMENTS_PAUSED, along with the indexer limits", () => {
    const config = readConfig({ PAYMENTS_PAUSED: "true", INDEXER_MAX_BLOCK_RANGE: "1000", ALERT_WEBHOOK_URL: "http://insecure" } as unknown as NodeJS.ProcessEnv);
    expect(config.paymentsPaused).toBe(true);
    expect(config.indexer.maxBlockRange).toBe(BigInt(1000));
    expect(config.alertWebhookUrl).toBeNull();
    const defaults = readConfig({} as unknown as NodeJS.ProcessEnv);
    expect(defaults).toMatchObject({ paymentsPaused: false, indexer: { maxBlockRange: BigInt(100), maxChunksPerRun: 50, reconcileBlocks: BigInt(500) } });
  });
});

describe("operator endpoints", () => {
  it("reports indexer status only with the operator secret", async () => {
    const { services } = await setup();
    const call = (authorization?: string) => getIndexerStatus(request("/api/indexer/status", { headers: authorization ? { authorization } : {} }), services);
    expect((await call()).status).toBe(401);
    const status = await body(await call(`Bearer ${services.config.cronSecret}`));
    expect(status.status).toBe(200);
    expect(status.json).toMatchObject({ status: "ok", paymentsPaused: false, contract: CONTRACT.toLowerCase(), cursor: null });
    expect(Number(status.json.lagBlocks)).toBeGreaterThan(0);
  });

  it("logs every run and alerts on failures without leaking secrets", async () => {
    const { chain, services } = await setup();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(line));
    const run = (authorization = `Bearer ${services.config.cronSecret}`) => runIndexerRequest(request("/api/indexer/run", { method: "POST", headers: { authorization } }), services);
    expect((await run()).status).toBe(200);
    chain.failNextCalls = 5;
    expect((await run()).status).toBe(502);
    const events = lines.map((line) => JSON.parse(line).event);
    expect(events).toEqual(["indexer.run", "indexer.run_failed"]);
    expect(lines.join("\n")).not.toContain(services.config.cronSecret!);
  });
});

describe("structured logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("redacts secret-looking fields", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    log("info", "test", { cookie: "cwo_session=abc", nested: { signature: "0xsig", sessionToken: "t", ok: 1 }, amount: BigInt(5) });
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ event: "test", cookie: "[redacted]", nested: { signature: "[redacted]", sessionToken: "[redacted]", ok: 1 }, amount: "5" });
  });

  it("posts alerts to an https webhook and never throws when it fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/alert");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      throw new Error("webhook down");
    });
    await expect(alert("indexer.run_failed", new Error("RPC unavailable"), { authorization: "Bearer x", cursor: "10" })).resolves.toBeUndefined();
    expect(JSON.parse(sent[0])).toMatchObject({ event: "indexer.run_failed", message: "RPC unavailable", authorization: "[redacted]", cursor: "10" });
  });
});
