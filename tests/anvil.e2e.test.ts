/**
 * End to end against the real CampaignPayments contract on a local anvil
 * chain. Skipped unless ANVIL_RPC_URL is set. Run with:
 *
 *   npm run contracts:build
 *   anvil --chain-id 143 &
 *   ANVIL_RPC_URL=http://127.0.0.1:8545 npx vitest run tests/anvil.e2e.test.ts
 *
 * Nothing touches Monad: the chain is local and the wallets are generated
 * per run and funded with anvil_setBalance.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Address, type Hex, type PrivateKeyAccount } from "viem";
import {
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
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments";
import { runIndexer } from "@/server/payments/indexer";
import type { ChainReader } from "@/server/payments/chain";
import { makeServices, post, signInNewWallet } from "./helpers/setup";

const rpc = process.env.ANVIL_RPC_URL;
const localMonad = defineChain({ id: 143, name: "anvil (chain id 143)", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc ?? ""] } } });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = async (response: Response) => ({ status: response.status, json: (await response.json()) as Json });

describe.skipIf(!rpc)("CampaignPayments on anvil", () => {
  it("registers through the real contract and rejects proofs that are not the expected payment", async () => {
    const publicClient = createPublicClient({ chain: localMonad, transport: http(rpc), cacheTime: 0 });
    const fund = (address: Address) =>
      publicClient.request({ method: "anvil_setBalance" as never, params: [address, `0x${parseEther("1000").toString(16)}`] as never });
    const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain: localMonad, transport: http(rpc) });
    const send = async (account: PrivateKeyAccount, call: Parameters<ReturnType<typeof wallet>["writeContract"]>[0]) => {
      const hash = await wallet(account).writeContract(call);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    };

    // Deploy from a throwaway admin.
    const bootstrap = makeServices();
    const admin = (await signInNewWallet(bootstrap)).account;
    await fund(admin.address);
    const artifact = JSON.parse(readFileSync("contracts/out/CampaignPayments.sol/CampaignPayments.json", "utf8"));
    const deployHash = await wallet(admin).deployContract({ abi: campaignPaymentsAbi, bytecode: artifact.bytecode.object as Hex, args: [admin.address] });
    const contract = (await publicClient.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;

    const services = makeServices({ paymentsContract: contract, chain: publicClient as unknown as ChainReader, confirmations: 1 });
    const owner = await signInNewWallet(services);
    const creator = await signInNewWallet(services);
    await fund(owner.account.address);

    // Draft → publish → registerCampaign from the owner's wallet → verified → published.
    const campaign = (
      await body(
        await postCampaign(
          post(
            "/api/campaigns",
            {
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
            },
            { cookie: owner.cookie },
          ),
          services,
        ),
      )
    ).json.campaign;
    const { registration } = (await body(await postPublish(post(`/api/campaigns/${campaign.id}/publish`, {}, { cookie: owner.cookie }), services, campaign.id))).json;
    const onchainId = await publicClient.readContract({ address: contract, abi: campaignPaymentsAbi, functionName: "computeCampaignId", args: [owner.account.address, registration.salt] });
    expect(onchainId.toLowerCase()).toBe(registration.chainCampaignId);

    const registerHash = await send(owner.account, { address: contract, abi: campaignPaymentsAbi, functionName: "registerCampaign", args: [registration.salt], chain: localMonad, account: owner.account });
    const registered = await body(await postRegistration(post(`/api/campaigns/${campaign.id}/registration`, { txHash: registerHash }, { cookie: owner.cookie }), services, campaign.id));
    expect(registered.json.campaign.status).toBe("published");

    // Accepted deliverable → intent → payNative from the owner's wallet → verified.
    const app = (await body(await postApplication(post(`/api/campaigns/${campaign.id}/applications`, { proposal: "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI." }, { cookie: creator.cookie }), services, campaign.id))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit" }, { cookie: owner.cookie }), services, app.id);
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://github.com/o/r/pull/1", contentHash: `0x${"ab".repeat(32)}` }, { cookie: creator.cookie }), services, app.id))).json.deliverable;
    await postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets every criterion" }, { cookie: owner.cookie }), services, deliverable.id);

    const instructions = (await body(await postPaymentIntent(post(`/api/deliverables/${deliverable.id}/payment`, {}, { cookie: owner.cookie }), services, deliverable.id))).json;
    const [campaignId, recipient, ref] = instructions.call.args as [Hex, Address, Hex];

    const report = async (txHash: Hex) =>
      (await body(await postPaymentTransaction(post(`/api/payments/${instructions.payment.id}/transaction`, { txHash }, { cookie: owner.cookie }), services, instructions.payment.id))).json.payment;

    // A real transaction to the contract that is not this payment proves nothing.
    expect(await report(registerHash)).toMatchObject({ status: "failed", statusReason: expect.stringMatching(/no CreatorPaid event/) });

    // A wrong amount goes through on-chain (the contract does not know the budget) but the server rejects it.
    const wrongHash = await wallet(owner.account).writeContract({ address: contract, abi: campaignPaymentsAbi, functionName: "payNative", args: [campaignId, recipient, ref], value: BigInt(instructions.call.value) - BigInt(1), chain: localMonad, account: owner.account });
    await publicClient.waitForTransactionReceipt({ hash: wrongHash });
    expect(await report(wrongHash)).toMatchObject({ status: "mismatch", statusReason: expect.stringMatching(/base units instead of/) });
    expect(await runIndexer(services)).toMatchObject({ status: "ok" });
    expect((await services.paymentMemory.findPayment(instructions.payment.id))?.status).toBe("mismatch");
  });

  it("confirms a correct native payment and the indexer agrees", async () => {
    const publicClient = createPublicClient({ chain: localMonad, transport: http(rpc), cacheTime: 0 });
    const fund = (address: Address) =>
      publicClient.request({ method: "anvil_setBalance" as never, params: [address, `0x${parseEther("1000").toString(16)}`] as never });
    const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain: localMonad, transport: http(rpc) });

    const bootstrap = makeServices();
    const admin = (await signInNewWallet(bootstrap)).account;
    await fund(admin.address);
    const artifact = JSON.parse(readFileSync("contracts/out/CampaignPayments.sol/CampaignPayments.json", "utf8"));
    const deployHash = await wallet(admin).deployContract({ abi: campaignPaymentsAbi, bytecode: artifact.bytecode.object as Hex, args: [admin.address] });
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const contract = deployReceipt.contractAddress!;

    const services = makeServices({ paymentsContract: contract, chain: publicClient as unknown as ChainReader, confirmations: 1 });
    services.config.paymentsDeployBlock = deployReceipt.blockNumber;
    const owner = await signInNewWallet(services);
    const creator = await signInNewWallet(services);
    await fund(owner.account.address);

    const campaign = (
      await body(
        await postCampaign(
          post(
            "/api/campaigns",
            {
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
            },
            { cookie: owner.cookie },
          ),
          services,
        ),
      )
    ).json.campaign;
    const { registration } = (await body(await postPublish(post(`/api/campaigns/${campaign.id}/publish`, {}, { cookie: owner.cookie }), services, campaign.id))).json;
    const registerHash = await wallet(owner.account).writeContract({ address: contract, abi: campaignPaymentsAbi, functionName: "registerCampaign", args: [registration.salt], chain: localMonad, account: owner.account });
    await publicClient.waitForTransactionReceipt({ hash: registerHash });

    // The browser never reports the hash: the indexer publishes the campaign.
    expect(await runIndexer(services)).toMatchObject({ status: "ok", outcomes: { registered: 1 } });
    expect((await services.collabMemory.findCampaign(campaign.id))?.status).toBe("published");

    const app = (await body(await postApplication(post(`/api/campaigns/${campaign.id}/applications`, { proposal: "I have written invariant suites for two AMMs and can deliver handlers, ghost variables, and CI." }, { cookie: creator.cookie }), services, campaign.id))).json.application;
    await postApplicationReview(post(`/api/applications/${app.id}/review`, { decision: "accept", reason: "Good fit" }, { cookie: owner.cookie }), services, app.id);
    const deliverable = (await body(await postDeliverable(post(`/api/applications/${app.id}/deliverables`, { contentUrl: "https://github.com/o/r/pull/1", contentHash: `0x${"ef".repeat(32)}` }, { cookie: creator.cookie }), services, app.id))).json.deliverable;
    await postDeliverableReview(post(`/api/deliverables/${deliverable.id}/review`, { decision: "accept", reason: "Meets every criterion" }, { cookie: owner.cookie }), services, deliverable.id);

    const instructions = (await body(await postPaymentIntent(post(`/api/deliverables/${deliverable.id}/payment`, {}, { cookie: owner.cookie }), services, deliverable.id))).json;
    const [campaignId, recipient, ref] = instructions.call.args as [Hex, Address, Hex];
    const before = await publicClient.getBalance({ address: creator.account.address });
    const payHash = await wallet(owner.account).writeContract({ address: contract, abi: campaignPaymentsAbi, functionName: "payNative", args: [campaignId, recipient, ref], value: BigInt(instructions.call.value), chain: localMonad, account: owner.account });
    await publicClient.waitForTransactionReceipt({ hash: payHash });
    expect((await publicClient.getBalance({ address: creator.account.address })) - before).toBe(parseEther("2.5"));

    const paid = (await body(await postPaymentTransaction(post(`/api/payments/${instructions.payment.id}/transaction`, { txHash: payHash }, { cookie: owner.cookie }), services, instructions.payment.id))).json.payment;
    expect(paid).toMatchObject({ status: "confirmed", txHash: payHash });

    const rerun = await runIndexer(services);
    expect(rerun).toMatchObject({ status: "ok" });
    if (rerun.status === "ok") expect(rerun.outcomes.duplicate).toBeGreaterThanOrEqual(1);
  });
});
