/**
 * The whole campaign-to-payment flow against the real CampaignPayments
 * contract on a local anvil chain, with negative cases at each step.
 * Skipped unless ANVIL_RPC_URL is set:
 *
 *   npm run contracts:build
 *   anvil --chain-id 143 &
 *   ANVIL_RPC_URL=http://127.0.0.1:8545 npx vitest run tests/full-flow.e2e.test.ts
 *
 * The chain is local and the wallets are generated per run; nothing touches Monad.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseEther,
  parseEventLogs,
  type AbiEvent,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import {
  getCampaignById,
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
} from "@/server/api/collab-handlers";
import { getPassportByAddress, getReputationEvents, postEvidence, postSignIn } from "@/server/api/handlers";
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments";
import { runIndexer } from "@/server/payments/indexer";
import type { ChainReader } from "@/server/payments/chain";
import type { OnchainClient } from "@/server/verification/onchain";
import { makeServices, post, request, signInNewWallet } from "./helpers/setup";

const rpc = process.env.ANVIL_RPC_URL;
const localMonad = defineChain({
  id: 143,
  name: "anvil (chain id 143)",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc ?? ""] } },
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });
const proposal = "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI.";

const createLocalClient = () => createPublicClient({ chain: localMonad, transport: http(rpc), cacheTime: 0 });

describe.skipIf(!rpc)("campaign to payment to Passport, end to end", () => {
  let publicClient: ReturnType<typeof createLocalClient>;
  const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain: localMonad, transport: http(rpc) });
  const fund = (address: Address) =>
    publicClient.request({ method: "anvil_setBalance" as never, params: [address, `0x${parseEther("1000").toString(16)}`] as never });
  const mined = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

  let contract: Address;
  let services: ReturnType<typeof makeServices>;
  let owner: Awaited<ReturnType<typeof signInNewWallet>>;
  let creator: Awaited<ReturnType<typeof signInNewWallet>>;
  let outsider: Awaited<ReturnType<typeof signInNewWallet>>;

  beforeAll(async () => {
    publicClient = createLocalClient();
    const admin = (await signInNewWallet(makeServices())).account;
    await fund(admin.address);
    const artifact = JSON.parse(readFileSync("contracts/out/CampaignPayments.sol/CampaignPayments.json", "utf8"));
    const deployed = await mined(
      await wallet(admin).deployContract({ abi: campaignPaymentsAbi, bytecode: artifact.bytecode.object as Hex, args: [admin.address] }),
    );
    contract = deployed.contractAddress!;
    const creatorPaid = campaignPaymentsAbi.find((item) => item.type === "event" && item.name === "CreatorPaid") as AbiEvent;
    services = makeServices({
      paymentsContract: contract,
      chain: publicClient as unknown as ChainReader,
      onchainClient: publicClient as unknown as OnchainClient,
      // A reviewed app whose event names the acting wallet in `payer`.
      apps: [{ id: "campaign-payments", name: "CampaignPayments", chainId: 143, contracts: [contract], event: creatorPaid, walletArg: "payer" }],
      confirmations: 1,
    });
    services.config.paymentsDeployBlock = deployed.blockNumber;
  });

  it("runs the whole flow and rejects every shortcut along the way", async () => {
    // 1. Wallet authentication (real SIWE signatures).
    owner = await signInNewWallet(services);
    creator = await signInNewWallet(services);
    outsider = await signInNewWallet(services);
    await fund(owner.account.address);

    const replay = await postSignIn(
      post("/api/auth/verify", { message: owner.signedIn.message, signature: owner.signedIn.signature }, { cookie: owner.signedIn.nonceCookie }),
      services,
    );
    expect(replay.status, "a replayed sign-in must fail").toBeGreaterThanOrEqual(400);

    // 2. The project creates and publishes a campaign (registered on-chain).
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
      amountPerCreator: "2.5",
      slots: 2,
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    expect((await postCampaign(post("/api/campaigns", campaignInput), services)).status, "unauthenticated create").toBe(401);
    expect(
      (await postCampaign(post("/api/campaigns", campaignInput, { cookie: owner.cookie, origin: "https://evil.example" }), services)).status,
      "cross-site create",
    ).toBe(403);
    const campaign = (await body(await postCampaign(post("/api/campaigns", campaignInput, { cookie: owner.cookie }), services))).json.campaign;
    const id = campaign.id as string;

    expect((await body(await getCampaignById(request(`/api/campaigns/${id}`, { cookie: outsider.cookie }), services, id))).status, "draft hidden").toBe(404);
    const hijack = await patchCampaign(
      request(`/api/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(campaignInput), cookie: outsider.cookie }),
      services,
      id,
    );
    expect([403, 404]).toContain(hijack.status);
    expect([403, 404]).toContain((await postPublish(post(`/api/campaigns/${id}/publish`, {}, { cookie: outsider.cookie }), services, id)).status);

    const { registration } = (await body(await postPublish(post(`/api/campaigns/${id}/publish`, {}, { cookie: owner.cookie }), services, id))).json;
    const registerHash = await wallet(owner.account).writeContract({
      address: contract,
      abi: campaignPaymentsAbi,
      functionName: "registerCampaign",
      args: [registration.salt],
      chain: localMonad,
      account: owner.account,
    });
    await mined(registerHash);
    expect((await postRegistration(post(`/api/campaigns/${id}/registration`, {}, { cookie: outsider.cookie }), services, id)).status).toBe(403);
    const published = await body(await postRegistration(post(`/api/campaigns/${id}/registration`, { txHash: registerHash }, { cookie: owner.cookie }), services, id));
    expect(published.json.campaign).toMatchObject({ status: "published", registration: { status: "confirmed", txHash: registerHash } });

    // 3. A creator applies (once).
    const apply = (who: typeof creator) =>
      postApplication(post(`/api/campaigns/${id}/applications`, { proposal }, { cookie: who.cookie }), services, id);
    expect((await apply(owner)).status, "owner cannot apply to own campaign").toBe(403);
    const application = (await body(await apply(creator))).json.application;
    expect((await apply(creator)).status, "duplicate application").toBe(409);

    // 4. The project accepts the application; nobody else can.
    const decide = (who: typeof creator) =>
      postApplicationReview(post(`/api/applications/${application.id}/review`, { decision: "accept", reason: "Good fit for the brief" }, { cookie: who.cookie }), services, application.id);
    expect((await decide(creator)).status, "creator cannot accept themselves").toBe(403);
    expect((await decide(outsider)).status).toBe(403);
    expect((await body(await decide(owner))).json.application.status).toBe("accepted");

    // 5. The creator submits a deliverable; an outsider cannot submit on their application.
    const work = { contentUrl: "https://github.com/lanternfish/pools/pull/42", contentHash: `0x${"ab".repeat(32)}` };
    expect([403, 404]).toContain(
      (await postDeliverable(post(`/api/applications/${application.id}/deliverables`, work, { cookie: outsider.cookie }), services, application.id)).status,
    );
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${application.id}/deliverables`, work, { cookie: creator.cookie }), services, application.id))).json.deliverable;
    expect(services.memory.reputation, "no points for submitting").toHaveLength(0);

    // 6. The project approves the deliverable; the creator cannot approve their own work.
    const approve = (who: typeof creator) =>
      postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets every criterion" }, { cookie: who.cookie }), services, deliverable.id);
    expect((await approve(creator)).status, "self-approval").toBe(403);
    expect((await approve(outsider)).status).toBe(403);
    expect((await body(await approve(owner))).json.deliverable.status).toBe("accepted");
    expect((await approve(owner)).status, "approved twice").toBe(409);
    const campaignEvents = () => services.memory.reputation.filter((event) => event.category === "campaign");
    expect(campaignEvents()).toHaveLength(1);

    // 7. The owner authorizes a payment; nobody else gets payment instructions.
    const intent = (who: typeof creator) => postPaymentIntent(post(`/api/deliverables/${deliverable.id}/payment`, {}, { cookie: who.cookie }), services, deliverable.id);
    expect((await intent(creator)).status).toBe(403);
    expect((await intent(outsider)).status).toBe(403);
    const instructions = (await body(await intent(owner))).json;
    expect(instructions.call).toMatchObject({ functionName: "payNative", address: contract.toLowerCase(), value: parseEther("2.5").toString() });
    const [campaignId, recipient, ref] = instructions.call.args as [Hex, Address, Hex];
    expect(recipient).toBe(creator.address);
    const paymentId = instructions.payment.id as string;
    const report = async (txHash: Hex, who = owner) =>
      body(await postPaymentTransaction(post(`/api/payments/${paymentId}/transaction`, { txHash }, { cookie: who.cookie }), services, paymentId));

    // Negative: a failed (reverted) transaction is never a payment.
    const reverted = await wallet(owner.account).sendTransaction({
      to: contract,
      data: encodeFunctionData({ abi: campaignPaymentsAbi, functionName: "payToken", args: [campaignId, "0x000000000000000000000000000000000000dEaD", recipient, BigInt(1), ref] }),
      gas: BigInt(200_000),
      chain: localMonad,
      account: owner.account,
    });
    expect((await mined(reverted)).status).toBe("reverted");
    expect((await report(reverted)).json.payment).toMatchObject({ status: "failed", statusReason: "The transaction reverted." });
    // Negative: a real but unrelated transaction hash is not proof of payment.
    expect((await report(registerHash)).json.payment.status).toBe("failed");
    // Negative: only the owner may report.
    expect((await report(registerHash, outsider)).status).toBe(403);

    // 8. The payment contract emits the expected event.
    const before = await publicClient.getBalance({ address: creator.account.address });
    const instructionsAgain = (await body(await intent(owner))).json; // re-opened after the failure
    expect(instructionsAgain.payment.status).toBe("awaiting-transaction");
    const payHash = await wallet(owner.account).writeContract({
      address: contract,
      abi: campaignPaymentsAbi,
      functionName: "payNative",
      args: [campaignId, recipient, ref],
      value: BigInt(instructions.call.value),
      chain: localMonad,
      account: owner.account,
    });
    const receipt = await mined(payHash);
    const [paid] = parseEventLogs({ abi: campaignPaymentsAbi, logs: receipt.logs, eventName: "CreatorPaid" });
    expect(paid.args).toMatchObject({ campaignId, creator: creator.account.address, amount: parseEther("2.5"), payer: owner.account.address, deliverableRef: ref });
    expect((await publicClient.getBalance({ address: creator.account.address })) - before).toBe(parseEther("2.5"));

    // 9. The backend verifies and records the payment.
    const confirmed = (await report(payHash)).json.payment;
    expect(confirmed).toMatchObject({ status: "confirmed", txHash: payHash, logIndex: paid.logIndex, blockNumber: receipt.blockNumber.toString() });
    expect((await body(await getPayment(request(`/api/payments/${paymentId}`, { cookie: creator.cookie }), services, paymentId))).json.payment.status).toBe("confirmed");
    expect((await getPayment(request(`/api/payments/${paymentId}`, { cookie: outsider.cookie }), services, paymentId)).status).toBe(403);

    // Negative: duplicate payments and duplicate events.
    // The contract refuses a second payment for the same deliverable...
    await expect(
      wallet(owner.account).writeContract({
        address: contract,
        abi: campaignPaymentsAbi,
        functionName: "payNative",
        args: [campaignId, recipient, ref],
        value: BigInt(instructions.call.value),
        chain: localMonad,
        account: owner.account,
      }),
    ).rejects.toThrow(/DeliverableAlreadyPaid/);
    // ...and even if it is forced on-chain without simulation, it reverts and is never a payment.
    const forced = await wallet(owner.account).sendTransaction({
      to: contract,
      data: encodeFunctionData({ abi: campaignPaymentsAbi, functionName: "payNative", args: [campaignId, recipient, ref] }),
      value: BigInt(instructions.call.value),
      gas: BigInt(200_000),
      chain: localMonad,
      account: owner.account,
    });
    expect((await mined(forced)).status).toBe("reverted");
    // Each event is processed once: the indexer finds the ones verified on demand and changes nothing, twice.
    for (let run = 0; run < 2; run += 1) {
      const result = await runIndexer(services);
      expect(result).toMatchObject({ status: "ok", eventsNew: 0 });
    }
    expect((await services.paymentMemory.findPayment(paymentId))?.txHash).toBe(payHash.toLowerCase());
    expect(services.paymentMemory.events.filter((event) => event.eventName === "CreatorPaid")).toHaveLength(1);
    expect(services.paymentMemory.events.find((event) => event.eventName === "CreatorPaid")?.outcome).toBe("confirmed-payment");

    // 10. The Passport shows the contribution, its payment, and exactly one reputation event.
    const passport = (await body(await getPassportByAddress(request(`/api/passports/${creator.address}`), services, creator.address))).json.passport;
    const contribution = passport.contributions.find((item: Json) => item.kind === "campaign-deliverable");
    expect(contribution).toMatchObject({ status: "verified", payment: { status: "confirmed", txHash: payHash } });
    expect(passport.stamps.map((stamp: Json) => stamp.category)).toContain("collaborator");
    const events = (await body(await getReputationEvents(request(`/api/reputation/${creator.address}/events`), services, creator.address))).json.events;
    const campaignEvent = events.filter((event: Json) => event.category === "campaign");
    expect(campaignEvent).toHaveLength(1);
    expect(campaignEvent[0]).toMatchObject({ kind: "contribution", points: 10, evidence: { id: contribution.id } });
    expect(campaignEvents(), "payments and reruns add no reputation").toHaveLength(1);
    expect(JSON.stringify(passport)).not.toMatch(/reviewerNote|tokenHash|sessionToken/);
  });

  it("rejects invalid evidence", async () => {
    const creatorWallet = await signInNewWallet(services);
    const base = { title: "Paid a creator", summary: "Interaction with the CampaignPayments contract on Monad." };

    // Client-supplied points, status, or address are rejected outright.
    expect((await body(await postEvidence(post("/api/evidence", { ...base, kind: "code-contribution", reference: "https://github.com/a/b/pull/1", points: 500 }, { cookie: creatorWallet.cookie }), services))).status).toBe(400);
    expect((await body(await postEvidence(post("/api/evidence", { ...base, kind: "code-contribution", reference: "https://github.com/a/b/pull/2", status: "verified" }, { cookie: creatorWallet.cookie }), services))).status).toBe(400);
    // Campaign work can only come from Collab Board acceptance.
    const claim = await body(await postEvidence(post("/api/evidence", { ...base, kind: "campaign-deliverable", reference: "https://github.com/a/b/pull/3" }, { cookie: creatorWallet.cookie }), services));
    expect(claim.status).toBe(400);
    expect(claim.json.error.code).toBe("not_claimable");

    // Someone else's transaction cannot be claimed: the event's payer is not this wallet.
    const payer = await signInNewWallet(services);
    await fund(payer.account.address);
    const salt = `0x${"42".repeat(32)}` as Hex;
    await mined(await wallet(payer.account).writeContract({ address: contract, abi: campaignPaymentsAbi, functionName: "registerCampaign", args: [salt], chain: localMonad, account: payer.account }));
    const onchainId = await publicClient.readContract({ address: contract, abi: campaignPaymentsAbi, functionName: "computeCampaignId", args: [payer.account.address, salt] });
    const theirs = await wallet(payer.account).writeContract({
      address: contract,
      abi: campaignPaymentsAbi,
      functionName: "payNative",
      args: [onchainId, creatorWallet.account.address, `0x${"07".repeat(32)}`],
      value: BigInt(1),
      chain: localMonad,
      account: payer.account,
    });
    await mined(theirs);
    const stolen = await body(await postEvidence(post("/api/evidence", { ...base, kind: "onchain-interaction", reference: theirs, appId: "campaign-payments" }, { cookie: creatorWallet.cookie }), services));
    expect(stolen.status).toBe(201);
    expect(stolen.json.evidence.status).toBe("rejected");
    expect(services.memory.reputation.filter((event) => event.userId === (services.memory.users.find((user) => user.address === creatorWallet.address)?.id))).toHaveLength(0);

    // A made-up hash is never verified either.
    const fake = await body(await postEvidence(post("/api/evidence", { ...base, kind: "onchain-interaction", reference: `0x${"ee".repeat(32)}`, appId: "campaign-payments" }, { cookie: creatorWallet.cookie }), services));
    expect(["pending", "rejected"]).toContain(fake.json.evidence.status);

    // The stranger's rejected claim does not block the real sender, whose own claim is accepted for verification.
    const own = await body(await postEvidence(post("/api/evidence", { ...base, kind: "onchain-interaction", reference: theirs, appId: "campaign-payments" }, { cookie: payer.cookie }), services));
    expect(own.status).toBe(201);
    expect(["verified", "pending"]).toContain(own.json.evidence.status);
  });
});
