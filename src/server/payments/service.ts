import { type Address, type Hex } from "viem";
import {
  campaignPaymentsAbi,
  campaignSalt,
  computeCampaignId,
  deliverableRef,
  NATIVE_TOKEN_ADDRESS,
} from "@/lib/contracts/campaign-payments";
import { isPaymentTokenKey, paymentTokens } from "@/lib/collabs/tokens";
import type { PaymentInstructions, RegistrationInstructions } from "@/lib/collabs/types";
import { sameAddress } from "@/lib/passport/address";
import { requireStore, type AuthContext } from "@/server/auth/session";
import { requireCollabs } from "@/server/collabs/service";
import type { CampaignWithCounts } from "@/server/collabs/store";
import { conflict, forbidden, notFound, serviceUnavailable } from "@/server/errors";
import type { ChainReader } from "@/server/payments/chain";
import { ProofAlreadyUsedError, type PaymentRecord, type PaymentStore } from "@/server/payments/store";
import {
  checkPaymentTx,
  checkRegistrationTx,
  findRegistrationEvent,
  paymentMismatch,
  registrationDepth,
  type PaymentEvent,
  type RegistrationEvent,
  type TxCheck,
} from "@/server/payments/verify";
import type { Services } from "@/server/services";
import { toPaymentView } from "@/server/payments/view";

export { toPaymentView };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function paymentsSetup(services: Services) {
  const contract = services.config.paymentsContract;
  if (!contract.enabled) throw serviceUnavailable(`On-chain payments are not available: ${contract.reason}`, "payments_not_configured");
  if (!services.payments) throw serviceUnavailable("Payments need a database (DATABASE_URL).", "not_configured");
  return { contract: contract.address, store: services.payments };
}

function requireChain(services: Services): ChainReader {
  if (!services.chain) {
    throw serviceUnavailable("On-chain verification is not available: MONAD_RPC_URL is not configured.", "rpc_not_configured");
  }
  return services.chain;
}

// ---------------------------------------------------------------------------
// Campaign registration
// ---------------------------------------------------------------------------

/**
 * Starts on-chain registration for a validated draft. The campaign stays a
 * draft (registration "pending") until the CampaignRegistered event is
 * verified. Calling it again returns the same instructions, so an
 * interrupted publication can simply be resumed.
 */
export async function startRegistration(services: Services, auth: AuthContext, campaign: CampaignWithCounts) {
  const { contract } = paymentsSetup(services);
  const collabs = requireCollabs(services);
  const salt = campaignSalt(campaign.id);
  const chainCampaignId = computeCampaignId(contract, auth.user.address as Address, salt).toLowerCase();

  if (campaign.registrationStatus !== "pending" || campaign.chainCampaignId !== chainCampaignId) {
    const updated = await collabs.updateCampaignIfStatus(campaign.id, "draft", {
      registrationStatus: "pending",
      chainCampaignId,
      registrationError: null,
    });
    if (!updated) throw conflict("not_draft", "Only draft campaigns can be published.");
  }
  const instructions: RegistrationInstructions = {
    chainId: services.config.paymentsContract.enabled ? services.config.paymentsContract.chainId : 0,
    contractAddress: contract,
    salt,
    chainCampaignId,
  };
  return instructions;
}

async function publishRegistered(services: Services, campaign: CampaignWithCounts, event: RegistrationEvent) {
  const collabs = requireCollabs(services);
  const now = services.now();
  await collabs.updateCampaignIfStatus(campaign.id, "draft", {
    status: "published",
    publishedAt: now,
    registrationStatus: "confirmed",
    registeredAt: now,
    registrationTxHash: event.txHash,
    registrationError: null,
  });
}

async function applyRegistrationCheck(services: Services, campaign: CampaignWithCounts, check: TxCheck<RegistrationEvent>, hint?: string) {
  const collabs = requireCollabs(services);
  if (check.kind === "confirmed") return publishRegistered(services, campaign, check.event);
  if (check.kind === "pending") {
    await collabs.updateCampaignIfStatus(campaign.id, "draft", {
      registrationStatus: "pending",
      registrationError: check.reason,
      ...(hint ? { registrationTxHash: hint } : {}),
    });
    return;
  }
  await collabs.updateCampaignIfStatus(campaign.id, "draft", {
    registrationStatus: "failed",
    registrationError: check.reason,
    ...(hint ? { registrationTxHash: hint } : {}),
  });
}

/**
 * Verifies a campaign's registration and publishes it when confirmed.
 * With a transaction hash, that transaction is checked; without one (for
 * example after the tab was closed mid-transaction), the chain is searched
 * for the campaign's CampaignRegistered event.
 */
export async function confirmRegistration(services: Services, auth: AuthContext, campaignId: string, txHash?: string) {
  const { contract } = paymentsSetup(services);
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.findCampaign(campaignId);
  if (!campaign) throw notFound("Campaign not found.");
  if (campaign.ownerId !== auth.user.id) throw forbidden("Only the campaign owner can do this.");
  if (campaign.registrationStatus === "confirmed") return;
  if (!campaign.chainCampaignId || campaign.status !== "draft") {
    throw conflict("not_pending", "This campaign has no registration in progress. Publish it first.");
  }
  const chain = requireChain(services);
  const owner = (await store.findUserById(campaign.ownerId))!.address;
  const minConfirmations = services.config.paymentConfirmations;

  if (txHash) {
    const check = await checkRegistrationTx(chain, contract, { chainCampaignId: campaign.chainCampaignId, owner }, txHash, minConfirmations);
    return applyRegistrationCheck(services, campaign, check, txHash);
  }
  const event = await findRegistrationEvent(chain, contract, campaign.chainCampaignId as Hex, services.config.paymentsDeployBlock ?? BigInt(0));
  if (!event) {
    return applyRegistrationCheck(services, campaign, { kind: "pending", reason: "No registration found on Monad yet." });
  }
  if (!sameAddress(event.owner, owner)) {
    return applyRegistrationCheck(services, campaign, { kind: "failed", reason: "Registered by a different wallet." });
  }
  return applyRegistrationCheck(services, campaign, await registrationDepth(chain, event, minConfirmations));
}

/** Indexer: a confirmed-depth CampaignRegistered event. Returns what happened, for the event log. */
export async function applyRegistrationEvent(services: Services, event: RegistrationEvent): Promise<string> {
  const collabs = requireCollabs(services);
  const store = requireStore(services);
  const campaign = await collabs.findCampaignByChainId(event.campaignId);
  if (!campaign) return "unmatched";
  if (campaign.registrationStatus === "confirmed") return "duplicate";
  const owner = await store.findUserById(campaign.ownerId);
  if (!owner || !sameAddress(owner.address, event.owner)) return "owner-mismatch";
  if (campaign.status !== "draft") return "ignored";
  await publishRegistered(services, campaign, event);
  return "registered";
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

async function ownerContext(services: Services, auth: AuthContext, deliverableId: string) {
  const collabs = requireCollabs(services);
  const deliverable = await collabs.findDeliverable(deliverableId);
  if (!deliverable) throw notFound("Deliverable not found.");
  const campaign = await collabs.findCampaign(deliverable.campaignId);
  if (!campaign) throw notFound("Campaign not found.");
  if (campaign.ownerId !== auth.user.id) throw forbidden("Only the campaign owner can pay for this campaign.");
  return { deliverable, campaign };
}

/**
 * Builds the payment the owner's wallet must sign. Verifies ownership, that
 * the deliverable was accepted, that the campaign is registered on-chain,
 * and that the token is supported, then fixes the expected recipient,
 * token, amount, and deliverable reference.
 */
export async function preparePayment(services: Services, auth: AuthContext, deliverableId: string): Promise<PaymentInstructions> {
  const { contract, store: payments } = paymentsSetup(services);
  const passports = requireStore(services);
  const { deliverable, campaign } = await ownerContext(services, auth, deliverableId);
  if (deliverable.status !== "accepted") throw conflict("not_accepted", "Only accepted deliverables can be paid.");
  if (campaign.registrationStatus !== "confirmed" || !campaign.chainCampaignId) {
    throw conflict("not_registered", "This campaign is not registered on-chain yet.");
  }
  if (!isPaymentTokenKey(campaign.paymentToken)) throw conflict("unsupported_token", "Unsupported payment token.");
  const token = paymentTokens[campaign.paymentToken];
  if (!token.enabled) throw conflict("unsupported_token", `${token.symbol} payments are not configured.`);
  const tokenAddress = token.address ?? NATIVE_TOKEN_ADDRESS;
  if (token.address) {
    const chain = requireChain(services);
    const supported = await chain.readContract({ address: contract, abi: campaignPaymentsAbi, functionName: "isSupportedToken", args: [token.address] });
    if (!supported) throw conflict("unsupported_token", `${token.symbol} is not approved in the payments contract.`);
  }
  const creator = await passports.findUserById(deliverable.creatorId);
  if (!creator) throw notFound("Creator not found.");

  let payment = await payments.createOrGetIntent({
    campaignId: campaign.id,
    deliverableId,
    chainId: services.config.paymentsContract.enabled ? services.config.paymentsContract.chainId : 0,
    contractAddress: contract,
    chainCampaignId: campaign.chainCampaignId,
    tokenAddress,
    tokenKey: token.key,
    amount: campaign.amountPerCreator,
    creatorAddress: creator.address,
    payerAddress: auth.user.address,
    deliverableRef: deliverableRef(deliverableId).toLowerCase(),
  });

  if (payment.status === "confirmed") throw conflict("already_paid", "This deliverable has already been paid.");
  if (payment.status === "mismatch") {
    throw conflict("payment_mismatch", "A payment with the wrong recipient, token, or amount was recorded. Contact support before paying again.");
  }
  if (payment.status === "failed") {
    payment =
      (await payments.updatePaymentIfStatus(payment.id, ["failed"], {
        status: "awaiting-transaction",
        submittedTxHash: null,
        failureReason: null,
      })) ?? payment;
  }

  const ref = payment.deliverableRef;
  const call =
    payment.status === "pending-confirmation"
      ? null
      : token.address
        ? {
            chainId: payment.chainId,
            address: contract,
            functionName: "payToken" as const,
            args: [payment.chainCampaignId, token.address, payment.creatorAddress, payment.amount.toString(), ref],
            value: "0",
          }
        : {
            chainId: payment.chainId,
            address: contract,
            functionName: "payNative" as const,
            args: [payment.chainCampaignId, payment.creatorAddress, ref],
            value: payment.amount.toString(),
          };
  return {
    payment: toPaymentView(payment),
    call,
    approval: token.address && call ? { token: token.address, spender: contract, amount: payment.amount.toString() } : null,
  };
}

async function applyPaymentCheck(payments: PaymentStore, payment: PaymentRecord, check: TxCheck<PaymentEvent>, now: Date) {
  const open: PaymentRecord["status"][] = ["awaiting-transaction", "pending-confirmation", "failed"];
  const proof = (event: PaymentEvent) => ({
    txHash: event.txHash.toLowerCase(),
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash.toLowerCase(),
  });
  try {
    switch (check.kind) {
      case "confirmed":
        return await payments.updatePaymentIfStatus(payment.id, open, {
          ...proof(check.event),
          status: "confirmed",
          confirmedAt: now,
          failureReason: null,
        });
      case "pending":
        return await payments.updatePaymentIfStatus(payment.id, open, {
          ...(check.event ? { ...proof(check.event), status: "pending-confirmation" as const } : {}),
          failureReason: check.reason,
        });
      case "mismatch":
        return await payments.updatePaymentIfStatus(payment.id, open, { ...proof(check.event), status: "mismatch", failureReason: check.reason });
      case "failed":
        return await payments.updatePaymentIfStatus(payment.id, ["awaiting-transaction", "failed"], { status: "failed", failureReason: check.reason });
    }
  } catch (error) {
    if (error instanceof ProofAlreadyUsedError) {
      return payments.updatePaymentIfStatus(payment.id, open, { status: "failed", failureReason: error.message });
    }
    throw error;
  }
}

/**
 * Records the transaction hash the owner's wallet returned and verifies it.
 * The hash alone never marks a payment as paid.
 */
export async function reportPaymentTransaction(services: Services, auth: AuthContext, paymentId: string, txHash: string) {
  const { contract, store: payments } = paymentsSetup(services);
  const payment = await payments.findPayment(paymentId);
  if (!payment) throw notFound("Payment not found.");
  await ownerContext(services, auth, payment.deliverableId);
  if (payment.status === "confirmed" || payment.status === "mismatch") return toPaymentView(payment);

  const hinted =
    (await payments.updatePaymentIfStatus(payment.id, ["awaiting-transaction", "pending-confirmation", "failed"], {
      submittedTxHash: txHash.toLowerCase(),
    })) ?? payment;
  if (!services.chain) return toPaymentView(hinted);
  const check = await checkPaymentTx(services.chain, contract, hinted, txHash, services.config.paymentConfirmations);
  return toPaymentView((await applyPaymentCheck(payments, hinted, check, services.now())) ?? hinted);
}

/** Current payment status for the owner or the creator, re-verified while it is still open. */
export async function getPaymentStatus(services: Services, auth: AuthContext, paymentId: string) {
  const { contract, store: payments } = paymentsSetup(services);
  const collabs = requireCollabs(services);
  const payment = await payments.findPayment(paymentId);
  if (!payment) throw notFound("Payment not found.");
  const deliverable = await collabs.findDeliverable(payment.deliverableId);
  const campaign = deliverable ? await collabs.findCampaign(deliverable.campaignId) : null;
  if (!deliverable || !campaign) throw notFound("Payment not found.");
  if (campaign.ownerId !== auth.user.id && deliverable.creatorId !== auth.user.id) throw forbidden("Not your payment.");

  const hash = payment.txHash ?? payment.submittedTxHash;
  if (services.chain && hash && (payment.status === "awaiting-transaction" || payment.status === "pending-confirmation")) {
    const check = await checkPaymentTx(services.chain, contract, payment, hash, services.config.paymentConfirmations);
    return toPaymentView((await applyPaymentCheck(payments, payment, check, services.now())) ?? payment);
  }
  return toPaymentView(payment);
}

/** Indexer: a confirmed-depth CreatorPaid event. Returns what happened, for the event log. */
export async function applyPaymentEvent(services: Services, event: PaymentEvent): Promise<string> {
  const payments = services.payments;
  if (!payments) return "no-store";
  const payment = await payments.findPaymentByRef(event.campaignId, event.deliverableRef);
  if (!payment) return "unmatched";
  if (payment.status === "confirmed") {
    return payment.txHash === event.txHash.toLowerCase() && payment.logIndex === event.logIndex ? "duplicate" : "extra-payment";
  }
  if (payment.status === "mismatch") return "after-mismatch";
  const mismatch = paymentMismatch(payment, event);
  const check: TxCheck<PaymentEvent> = mismatch
    ? { kind: "mismatch", reason: mismatch, event }
    : { kind: "confirmed", event, confirmations: BigInt(0) };
  const updated = await applyPaymentCheck(payments, payment, check, services.now());
  return updated?.status === "confirmed" ? "confirmed-payment" : mismatch ? "mismatch" : "not-applied";
}

/** Payments for a set of deliverables (owner dashboard, creator panel, passports). */
export async function paymentsForDeliverables(services: Services, deliverableIds: string[]) {
  if (!services.payments || deliverableIds.length === 0) return [];
  return (await services.payments.listPaymentsByDeliverables(deliverableIds)).map(toPaymentView);
}
