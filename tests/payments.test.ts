import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  getPayment,
  patchCampaign,
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
import { getPassportByAddress } from "@/server/api/handlers";
import { NATIVE_TOKEN_ADDRESS } from "@/lib/contracts/campaign-payments";
import { runIndexer } from "@/server/payments/indexer";
import { FakeChain, newTxHash } from "./helpers/fake-chain";
import { makeServices, post, request, signInNewWallet } from "./helpers/setup";

const NOW = new Date("2026-10-09T12:00:00Z");
const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_CONTRACT = "0x2222222222222222222222222222222222222222" as Address;
const AMOUNT = BigInt(250) * BigInt(10) ** BigInt(18);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const campaignBody = {
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
  slots: 3,
  deadline: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
};

async function setup(options: { confirmations?: number } = {}) {
  const chain = new FakeChain(CONTRACT);
  const services = makeServices({ now: NOW, paymentsContract: CONTRACT, chain: chain.reader(), confirmations: options.confirmations ?? 2 });
  const owner = await signInNewWallet(services);
  const creator = await signInNewWallet(services);
  const other = await signInNewWallet(services);

  const draft = async () =>
    (await body(await postCampaign(post("/api/campaigns", campaignBody, { cookie: owner.cookie }), services))).json.campaign.id as string;
  const publish = async (id: string, who = owner) => body(await postPublish(post(`/api/campaigns/${id}/publish`, {}, { cookie: who.cookie }), services, id));
  const register = async (id: string, txHash?: string, who = owner) =>
    body(await postRegistration(post(`/api/campaigns/${id}/registration`, txHash ? { txHash } : {}, { cookie: who.cookie }), services, id));

  /** Draft → publish → registration mined with enough confirmations → confirmed. */
  const registered = async () => {
    const id = await draft();
    const { registration } = (await publish(id)).json;
    const tx = chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(1);
    const result = await register(id, tx);
    expect(result.json.campaign.status).toBe("published");
    return { id, chainCampaignId: registration.chainCampaignId as Hex };
  };

  /** A registered campaign with an accepted deliverable from `who`. */
  const accepted = async (who = creator, campaign?: { id: string; chainCampaignId: Hex }) => {
    const { id, chainCampaignId } = campaign ?? (await registered());
    const app = (await body(await postApplication(post(`/api/campaigns/${id}/applications`, { proposal: "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI." }, { cookie: who.cookie }), services, id))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit for the brief" }, { cookie: owner.cookie }), services, app.id);
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://github.com/o/r/pull/1", contentHash: hash(Math.floor(Math.random() * 1e9)) }, { cookie: who.cookie }), services, app.id))).json.deliverable;
    await postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets every criterion" }, { cookie: owner.cookie }), services, deliverable.id);
    return { campaignId: id, chainCampaignId, deliverableId: deliverable.id as string };
  };

  const intent = async (deliverableId: string, who = owner) =>
    body(await postPaymentIntent(post(`/api/deliverables/${deliverableId}/payment`, {}, { cookie: who.cookie }), services, deliverableId));
  const report = async (paymentId: string, txHash: string, who = owner) =>
    body(await postPaymentTransaction(post(`/api/payments/${paymentId}/transaction`, { txHash }, { cookie: who.cookie }), services, paymentId));
  const status = async (paymentId: string, who = owner) =>
    body(await getPayment(request(`/api/payments/${paymentId}`, { cookie: who.cookie }), services, paymentId));

  /** Mines a CreatorPaid transaction; fields default to the correct payment. */
  const pay = (instructions: Json, overrides: Partial<{ creator: Address; amount: bigint; payer: Address; token: Address; deliverableRef: Hex; logAddress: Address; to: Address; status: "success" | "reverted" }> = {}) => {
    const payment = instructions.payment;
    return chain.mine({
      from: overrides.payer ?? owner.account.address,
      to: overrides.to,
      status: overrides.status,
      events: [
        chain.paidEvent(
          {
            campaignId: instructions.call.args[0],
            creator: overrides.creator ?? (payment.creatorAddress as Address),
            token: overrides.token ?? NATIVE_TOKEN_ADDRESS,
            amount: overrides.amount ?? BigInt(payment.amount),
            payer: overrides.payer ?? owner.account.address,
            deliverableRef: overrides.deliverableRef ?? (payment.deliverableRef as Hex),
          },
          overrides.logAddress,
        ),
      ],
    });
  };

  return { chain, services, owner, creator, other, draft, publish, register, registered, accepted, intent, report, status, pay };
}

describe("campaign registration", () => {
  it("keeps a published campaign as a pending draft until the registration event is confirmed", async () => {
    const { chain, owner, draft, publish, register } = await setup();
    const id = await draft();
    const published = await publish(id);
    expect(published.status).toBe(200);
    expect(published.json.campaign.status).toBe("draft");
    expect(published.json.campaign.registration.status).toBe("pending");
    const { registration } = published.json;
    expect(registration).toMatchObject({ chainId: 143, contractAddress: CONTRACT.toLowerCase() });

    const tx = chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    const shallow = await register(id, tx);
    expect(shallow.json.campaign.status).toBe("draft");
    expect(shallow.json.campaign.registration.status).toBe("pending");
    expect(shallow.json.campaign.registration.error).toMatch(/confirmations \(1\/2\)/);

    chain.advance(1);
    const confirmed = await register(id, tx);
    expect(confirmed.json.campaign.status).toBe("published");
    expect(confirmed.json.campaign.registration).toMatchObject({ status: "confirmed", txHash: tx });
  });

  it("recovers an interrupted registration without a transaction hash", async () => {
    const { chain, owner, draft, publish, register } = await setup();
    const id = await draft();
    const { registration } = (await publish(id)).json;
    expect((await register(id)).json.campaign.registration.status).toBe("pending");

    chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(2);
    expect((await register(id)).json.campaign.status).toBe("published");
  });

  it("publishes through the indexer when the browser never reports back", async () => {
    const { chain, services, owner, draft, publish } = await setup();
    const id = await draft();
    const { registration } = (await publish(id)).json;
    chain.mine({ from: owner.account.address, events: [chain.registeredEvent(registration.chainCampaignId, owner.account.address, registration.salt)] });
    chain.advance(1);
    const result = await runIndexer(services);
    expect(result).toMatchObject({ status: "ok", outcomes: { registered: 1 } });
    expect((await services.collabMemory.findCampaign(id))?.status).toBe("published");
  });

  it("rejects reverted transactions, wrong contracts, and other owners", async () => {
    const { chain, owner, other, draft, publish, register } = await setup();

    const reverted = await draft();
    const r1 = (await publish(reverted)).json.registration;
    const tx1 = chain.mine({ from: owner.account.address, status: "reverted", events: [chain.registeredEvent(r1.chainCampaignId, owner.account.address, r1.salt)] });
    chain.advance(2);
    expect((await register(reverted, tx1)).json.campaign.registration).toMatchObject({ status: "failed", error: "The transaction reverted." });

    const wrongContract = await draft();
    const r2 = (await publish(wrongContract)).json.registration;
    const tx2 = chain.mine({ from: owner.account.address, to: OTHER_CONTRACT, events: [chain.registeredEvent(r2.chainCampaignId, owner.account.address, r2.salt, OTHER_CONTRACT)] });
    chain.advance(2);
    const res2 = (await register(wrongContract, tx2)).json.campaign;
    expect(res2.status).toBe("draft");
    expect(res2.registration.status).toBe("failed");

    // Sent to the right contract, but the event comes from a look-alike contract.
    const lookalike = await draft();
    const r3 = (await publish(lookalike)).json.registration;
    const tx3 = chain.mine({ from: owner.account.address, events: [chain.registeredEvent(r3.chainCampaignId, owner.account.address, r3.salt, OTHER_CONTRACT)] });
    chain.advance(2);
    expect((await register(lookalike, tx3)).json.campaign.registration.status).toBe("failed");

    const wrongOwner = await draft();
    const r4 = (await publish(wrongOwner)).json.registration;
    const tx4 = chain.mine({ from: other.account.address, events: [chain.registeredEvent(r4.chainCampaignId, other.account.address, r4.salt)] });
    chain.advance(2);
    const res4 = (await register(wrongOwner, tx4)).json.campaign;
    expect(res4.status).toBe("draft");
    expect(res4.registration.status).toBe("failed");
  });

  it("only lets the owner confirm, and blocks edits while registration is pending", async () => {
    const { services, owner, other, draft, publish, register } = await setup();
    const id = await draft();
    await publish(id);
    expect((await register(id, undefined, other)).status).toBe(403);
    const edit = await patchCampaign(request(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(campaignBody), cookie: owner.cookie }), services, id);
    expect(edit.status).toBe(409);
  });
});

describe("payment preparation", () => {
  it("builds the call from server data for the campaign owner only", async () => {
    const { creator, other, accepted, intent } = await setup();
    const { deliverableId, chainCampaignId } = await accepted();

    expect((await intent(deliverableId, creator)).status).toBe(403);
    expect((await intent(deliverableId, other)).status).toBe(403);

    const result = await intent(deliverableId);
    expect(result.status).toBe(200);
    expect(result.json.call).toMatchObject({ chainId: 143, address: CONTRACT.toLowerCase(), functionName: "payNative", value: AMOUNT.toString() });
    expect(result.json.call.args).toEqual([chainCampaignId.toLowerCase(), creator.address, result.json.payment.deliverableRef]);
    expect(result.json.approval).toBeNull();
    expect(result.json.payment.status).toBe("awaiting-transaction");

    // Repeat calls return the same payment.
    expect((await intent(deliverableId)).json.payment.id).toBe(result.json.payment.id);
  });

  it("refuses deliverables that are not accepted", async () => {
    const { services, owner, creator, intent, registered } = await setup();
    const { id } = await registered();
    const app = (await body(await postApplication(post(`/api/campaigns/${id}/applications`, { proposal: "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI." }, { cookie: creator.cookie }), services, id))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit for the brief" }, { cookie: owner.cookie }), services, app.id);
    const submitted = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://github.com/o/r/pull/9", contentHash: hash(9) }, { cookie: creator.cookie }), services, app.id))).json.deliverable;
    const notAccepted = await intent(submitted.id);
    expect(notAccepted.status).toBe(409);
    expect(notAccepted.json.error.code).toBe("not_accepted");

  });

  it("is unavailable when the contract address is not configured", async () => {
    const services = makeServices({ now: NOW });
    const owner = await signInNewWallet(services);
    const response = await body(await postPaymentIntent(post("/api/deliverables/x/payment", {}, { cookie: owner.cookie }), services, "x"));
    expect(response.status).toBe(503);
    expect(response.json.error.code).toBe("payments_not_configured");
  });
});

describe("payment verification", () => {
  it("confirms a correct payment only after enough confirmations, with verified proof", async () => {
    const { chain, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions);

    const pending = (await report(instructions.payment.id, tx)).json.payment;
    expect(pending.status).toBe("pending-confirmation");
    expect(pending.statusReason).toMatch(/1\/2/);

    chain.advance(1);
    const confirmed = (await report(instructions.payment.id, tx)).json.payment;
    expect(confirmed).toMatchObject({ status: "confirmed", txHash: tx, logIndex: 0 });
    expect(confirmed.explorerUrl).toContain(tx);

    const again = await intent(deliverableId);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("already_paid");
  });

  it("never confirms a payment from a client-supplied hash alone", async () => {
    const { chain, accepted, intent, report, status } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const made_up = newTxHash();
    const reported = (await report(instructions.payment.id, made_up)).json.payment;
    expect(reported.status).toBe("awaiting-transaction");
    expect(reported.submittedTxHash).toBe(made_up);
    expect(reported.txHash).toBeNull();
    chain.advance(50);
    expect((await status(instructions.payment.id)).json.payment.status).toBe("awaiting-transaction");
  });

  it("marks payments to the wrong recipient as a mismatch", async () => {
    const { chain, other, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions, { creator: other.account.address });
    chain.advance(2);
    const result = (await report(instructions.payment.id, tx)).json.payment;
    expect(result.status).toBe("mismatch");
    expect(result.statusReason).toMatch(/different address/);
    expect((await intent(deliverableId)).json.error.code).toBe("payment_mismatch");
  });

  it("marks payments of the wrong amount as a mismatch", async () => {
    const { chain, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions, { amount: AMOUNT - BigInt(1) });
    chain.advance(2);
    const result = (await report(instructions.payment.id, tx)).json.payment;
    expect(result.status).toBe("mismatch");
    expect(result.statusReason).toMatch(/base units instead of/);
  });

  it("marks reverted transactions as failed and lets the owner try again", async () => {
    const { chain, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions, { status: "reverted" });
    chain.advance(2);
    const failed = (await report(instructions.payment.id, tx)).json.payment;
    expect(failed).toMatchObject({ status: "failed", statusReason: "The transaction reverted.", txHash: null });

    const retry = (await intent(deliverableId)).json;
    expect(retry.payment.status).toBe("awaiting-transaction");
    expect(retry.call).not.toBeNull();
    const good = pay(retry);
    chain.advance(1);
    expect((await report(retry.payment.id, good)).json.payment.status).toBe("confirmed");
  });

  it("rejects transactions sent to, or events emitted by, another contract", async () => {
    const { chain, accepted, intent, report, pay } = await setup();
    const first = await accepted();
    const a = (await intent(first.deliverableId)).json;
    const txA = pay(a, { to: OTHER_CONTRACT, logAddress: OTHER_CONTRACT });
    chain.advance(2);
    expect((await report(a.payment.id, txA)).json.payment).toMatchObject({ status: "failed", statusReason: expect.stringMatching(/not sent to the CampaignPayments contract/) });

    const txB = pay(a, { logAddress: OTHER_CONTRACT });
    chain.advance(2);
    expect((await report(a.payment.id, txB)).json.payment).toMatchObject({ status: "failed", statusReason: expect.stringMatching(/no CreatorPaid event/) });
  });

  it("does not let one transaction pay for a different deliverable", async () => {
    const { chain, other, accepted, intent, report, pay } = await setup();
    const first = await accepted();
    const second = await accepted(other, { id: first.campaignId, chainCampaignId: first.chainCampaignId });
    const a = (await intent(first.deliverableId)).json;
    const b = (await intent(second.deliverableId)).json;
    const txA = pay(a);
    chain.advance(2);
    expect((await report(a.payment.id, txA)).json.payment.status).toBe("confirmed");
    expect((await report(b.payment.id, txA)).json.payment.status).toBe("failed");
  });

  it("finishes an interrupted confirmation on a later status check", async () => {
    const { chain, creator, accepted, intent, report, status, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions);

    // RPC down when the browser reports the hash: the hint is kept, nothing is confirmed.
    chain.failNextCalls = 1;
    const offline = (await report(instructions.payment.id, tx)).json.payment;
    expect(offline.status).toBe("awaiting-transaction");
    expect(offline.statusReason).toMatch(/Could not reach/);

    chain.advance(1);
    // The creator can also check their own payment.
    expect((await status(instructions.payment.id, creator)).json.payment.status).toBe("confirmed");
  });
});

describe("payment indexer", () => {
  it("confirms payments nobody reported, and is idempotent across reruns", async () => {
    const { chain, services, accepted, intent, status, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    pay(instructions);

    // One block deep: not yet indexed.
    const early = await runIndexer(services);
    expect(early).toMatchObject({ status: "ok" });
    expect((await status(instructions.payment.id)).json.payment.status).toBe("awaiting-transaction");

    chain.advance(1);
    const first = await runIndexer(services);
    expect(first).toMatchObject({ status: "ok", outcomes: { "confirmed-payment": 1 } });
    expect((await status(instructions.payment.id)).json.payment.status).toBe("confirmed");

    const rerun = await runIndexer(services);
    expect(rerun).toMatchObject({ status: "ok", eventsNew: 0 });
    if (rerun.status === "ok") expect(rerun.outcomes.duplicate).toBeGreaterThanOrEqual(1);
    expect(services.paymentMemory.events.filter((event) => event.eventName === "CreatorPaid")).toHaveLength(1);
  });

  it("records extra payments for an already paid deliverable without changing the proof", async () => {
    const { chain, services, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions);
    chain.advance(1);
    await report(instructions.payment.id, tx);
    pay(instructions);
    chain.advance(1);
    const result = await runIndexer(services);
    expect(result).toMatchObject({ status: "ok", outcomes: { "extra-payment": 1 } });
    expect((await services.paymentMemory.findPayment(instructions.payment.id))?.txHash).toBe(tx);
  });

  it("indexes mismatched payments as mismatches and ignores other contracts", async () => {
    const { chain, services, other, accepted, intent, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    pay(instructions, { logAddress: OTHER_CONTRACT });
    pay(instructions, { creator: other.account.address });
    chain.advance(1);
    const result = await runIndexer(services);
    // The registration event plus one payment: the look-alike contract's event is never read.
    expect(result).toMatchObject({ status: "ok", eventsSeen: 2, outcomes: { mismatch: 1, duplicate: 1 } });
    expect((await services.paymentMemory.findPayment(instructions.payment.id))?.status).toBe("mismatch");
  });

  it("does not advance the cursor when the RPC fails, the chain is wrong, or the contract is missing", async () => {
    const { chain, services } = await setup();
    chain.advance(10);
    const first = await runIndexer(services);
    expect(first.status).toBe("ok");
    const cursor = await services.paymentMemory.getCursor("campaign-payments");
    chain.advance(10);

    chain.failNextCalls = 3;
    expect(await runIndexer(services)).toMatchObject({ status: "error", reason: "RPC unavailable" });
    expect(await services.paymentMemory.getCursor("campaign-payments")).toBe(cursor);

    const wrongChain = new FakeChain(CONTRACT);
    wrongChain.chainId = 1;
    expect(await runIndexer({ ...services, chain: wrongChain.reader() })).toMatchObject({ status: "error", reason: expect.stringMatching(/chain 1/) });

    const noCode = new FakeChain(CONTRACT);
    noCode.code = {};
    expect(await runIndexer({ ...services, chain: noCode.reader() })).toMatchObject({ status: "error", reason: expect.stringMatching(/No contract code/) });
    expect(await services.paymentMemory.getCursor("campaign-payments")).toBe(cursor);
  });

  it("requires the cron secret", async () => {
    const { services } = await setup();
    const call = (authorization?: string) =>
      runIndexerRequest(request("/api/indexer/run", { method: "POST", headers: authorization ? { authorization } : {} }), services);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(`Bearer ${services.config.cronSecret}`)).status).toBe(200);
  });
});

describe("payments and the passport", () => {
  it("shows the confirmed payment on the creator's passport without adding reputation", async () => {
    const { chain, services, creator, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const passportOf = async () => (await body(await getPassportByAddress(request(`/api/passports/${creator.address}`), services, creator.address))).json.passport;

    const before = await passportOf();
    expect(before.contributions.length).toBeGreaterThan(0);
    const eventsBefore = services.memory.reputation.length;
    const scoreBefore = before.reputation.total;

    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions);
    chain.advance(1);
    await report(instructions.payment.id, tx);

    const after = await passportOf();
    const paid = after.contributions.find((item: Json) => item.payment?.status === "confirmed");
    expect(paid?.payment).toMatchObject({ status: "confirmed", txHash: tx, tokenSymbol: "MON" });
    expect(services.memory.reputation.length).toBe(eventsBefore);
    expect(after.reputation.total).toBe(scoreBefore);
  });
});

describe("contract validation", () => {
  it("refuses to publish against an address that is not CampaignPayments", async () => {
    const { chain, services, draft, publish } = await setup();
    chain.isCampaignPayments = false;
    const id = await draft();
    const result = await publish(id);
    expect(result.status).toBe(503);
    expect(result.json.error.code).toBe("contract_unverified");
    // Nothing changed: no registration was started.
    expect((await services.collabMemory.findCampaign(id))?.registrationStatus).toBe("not-registered");
  });

  it("refuses payment instructions when the address has no code, the contract is different, or the RPC is on another chain", async () => {
    const { services, owner, accepted } = await setup();
    const { deliverableId } = await accepted();
    const attempt = async (chain: FakeChain) =>
      body(await postPaymentIntent(post(`/api/deliverables/${deliverableId}/payment`, {}, { cookie: owner.cookie }), { ...services, chain: chain.reader() }, deliverableId));

    const empty = new FakeChain(CONTRACT);
    empty.code = {};
    const other = new FakeChain(CONTRACT);
    other.isCampaignPayments = false;
    const wrongChain = new FakeChain(CONTRACT);
    wrongChain.chainId = 10143;
    for (const [chain, reason] of [
      [empty, /No contract code/],
      [other, /does not behave like CampaignPayments/],
      [wrongChain, /chain 10143/],
    ] as const) {
      const result = await attempt(chain);
      expect(result.status).toBe(503);
      expect(result.json.error).toMatchObject({ code: "contract_unverified", message: expect.stringMatching(reason) });
    }
    expect(services.paymentMemory.payments).toHaveLength(0);
  });
});

describe("confirmation policy", () => {
  it("does not judge a mismatching payment until it has enough confirmations", async () => {
    const { chain, accepted, intent, report, status, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions, { amount: AMOUNT * BigInt(2) });

    const shallow = (await report(instructions.payment.id, tx)).json.payment;
    expect(shallow.status).toBe("awaiting-transaction");
    expect(shallow.txHash).toBeNull();
    expect(shallow.statusReason).toMatch(/Waiting for confirmations \(1\/2\).*does not match/);

    chain.advance(1);
    expect((await status(instructions.payment.id)).json.payment).toMatchObject({ status: "mismatch", txHash: tx });
  });

  it("keeps the verified raw event so the indexer treats it as already seen", async () => {
    const { chain, services, creator, accepted, intent, report, pay } = await setup();
    const { deliverableId } = await accepted();
    const instructions = (await intent(deliverableId)).json;
    const tx = pay(instructions);
    chain.advance(1);
    expect((await report(instructions.payment.id, tx)).json.payment.status).toBe("confirmed");

    const stored = services.paymentMemory.events.find((event) => event.txHash === tx);
    expect(stored).toMatchObject({
      eventName: "CreatorPaid",
      logIndex: 0,
      outcome: "confirmed-payment",
      args: { creator: creator.address, amount: AMOUNT.toString(), token: NATIVE_TOKEN_ADDRESS.toLowerCase() },
    });
    expect(stored?.blockNumber).toBeTypeOf("bigint");

    const run = await runIndexer(services);
    expect(run).toMatchObject({ status: "ok" });
    if (run.status === "ok") expect(run.eventsNew).toBe(0);
    expect(services.paymentMemory.events.find((event) => event.txHash === tx)?.outcome).toBe("confirmed-payment");
  });
});
