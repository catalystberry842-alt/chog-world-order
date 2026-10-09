"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, erc20Abi, UserRejectedRequestError, type Address, type Hash, type Hex } from "viem";
import { useConfig } from "wagmi";
import { getConnection, readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { Badge } from "@/components/ui/badge";
import { describeWalletError } from "@/components/wallet/wallet-errors";
import { ApiError } from "@/lib/client/passport-api";
import { collabsApi } from "@/lib/client/collabs-api";
import { campaignPaymentsAbi } from "@/lib/contracts/campaign-payments";
import { formatTokenUnits } from "@/lib/collabs/rules";
import type { CampaignView, PaymentStatus, PaymentView } from "@/lib/collabs/types";
import { shortAddress } from "@/lib/format";
import { targetChain } from "@/lib/wagmi";

type WagmiConfig = ReturnType<typeof useConfig>;

/** Server errors keep their message; wallet errors become one readable sentence. */
const describe = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof BaseError && error.walk((cause) => cause instanceof UserRejectedRequestError)) {
    return "You cancelled the transaction in your wallet. Nothing was sent.";
  }
  return describeWalletError(error);
};

/**
 * Makes sure the connected wallet is the expected one and is on Monad,
 * asking the wallet to switch networks if needed.
 */
async function prepareWallet(config: WagmiConfig, expected: string, chainId: number) {
  const connection = getConnection(config);
  if (!connection.address) throw new Error("Connect your wallet first.");
  if (connection.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Switch your wallet to ${shortAddress(expected)}, the wallet that owns this campaign.`);
  }
  if (connection.chainId !== chainId) {
    if (chainId !== targetChain.id) throw new Error(`This deployment expects chain ${chainId}, which this app does not support.`);
    await switchChain(config, { chainId: targetChain.id });
  }
}

// ---------------------------------------------------------------------------
// Campaign registration
// ---------------------------------------------------------------------------

/**
 * Publishing a campaign with on-chain payments enabled: the owner's wallet
 * calls registerCampaign(salt), then the server verifies the event and
 * publishes. If the tab closes mid-way, "Check registration" finds it.
 */
export function RegistrationPanel({ campaign, ownerAddress, onChanged }: { campaign: CampaignView; ownerAddress: string; onChanged: () => void }) {
  const config = useConfig();
  const [step, setStep] = useState<"idle" | "preparing" | "wallet" | "verifying">("idle");
  const registration = campaign.registration;

  const register = useMutation({
    mutationFn: async () => {
      setStep("preparing");
      const { registration: instructions } = await collabsApi.publish(campaign.id);
      if (!instructions) return; // Payments are off on this deployment: published directly.
      await prepareWallet(config, ownerAddress, instructions.chainId);
      setStep("wallet");
      const hash = await writeContract(config, {
        address: instructions.contractAddress as Address,
        abi: campaignPaymentsAbi,
        functionName: "registerCampaign",
        args: [instructions.salt as Hex],
        chainId: targetChain.id,
      });
      setStep("verifying");
      await collabsApi.checkRegistration(campaign.id, hash);
    },
    onSettled: () => {
      setStep("idle");
      onChanged();
    },
  });
  const check = useMutation({ mutationFn: () => collabsApi.checkRegistration(campaign.id), onSuccess: onChanged });

  const pending = registration.status === "pending";
  const busy = register.isPending || check.isPending;
  const label =
    step === "preparing" ? "Preparing…" : step === "wallet" ? "Confirm in your wallet…" : step === "verifying" ? "Verifying on Monad…" : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-white/75">
        {pending
          ? "Registration sent. The campaign is published once the CampaignRegistered event is confirmed on Monad."
          : registration.status === "failed"
            ? "The last registration attempt could not be verified."
            : "Publishing registers this campaign in the CampaignPayments contract from your wallet. Gas is paid in MON."}
      </p>
      {registration.txHash && <p className="font-mono text-xs break-all text-white/45">Transaction {registration.txHash}</p>}
      {registration.error && <p className="text-sm text-crayon-yellow">{registration.error}</p>}
      <div className="flex flex-wrap gap-2">
        {pending && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check registration"}
          </button>
        )}
        <button type="button" className={pending ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"} disabled={busy} onClick={() => register.mutate()}>
          {label ?? (pending ? "Send registration again" : registration.status === "failed" ? "Try again" : "Publish and register")}
        </button>
      </div>
      {pending && !busy && (
        <p className="text-xs text-white/45">Only send again if the first transaction never reached Monad: a campaign can be registered once.</p>
      )}
      {(register.error || check.error) && (
        <p role="alert" className="text-sm text-red-300">
          {describe(register.error ?? check.error)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const paymentTone: Record<PaymentStatus, "mint" | "yellow" | "danger" | "neutral"> = {
  "awaiting-transaction": "neutral",
  "pending-confirmation": "yellow",
  confirmed: "mint",
  failed: "danger",
  mismatch: "danger",
};

const paymentLabel: Record<PaymentStatus, string> = {
  "awaiting-transaction": "Not paid",
  "pending-confirmation": "Confirming",
  confirmed: "Paid",
  failed: "Failed",
  mismatch: "Mismatch",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={paymentTone[status]}>{paymentLabel[status]}</Badge>;
}

const isOpen = (payment: PaymentView) =>
  payment.status === "pending-confirmation" || (payment.status === "awaiting-transaction" && payment.submittedTxHash !== null);

/**
 * The payment's latest server view. Seeded from the dashboard, updated by the
 * pay flow, and re-checked every few seconds while it is still open.
 */
function usePaymentStatus(paymentId: string | null, initial: PaymentView | null) {
  const query = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: async () => (await collabsApi.payment(paymentId!)).payment,
    enabled: paymentId !== null,
    initialData: initial && initial.id === paymentId ? initial : undefined,
    staleTime: (state) => (state.state.data && isOpen(state.state.data) ? 0 : Infinity),
    refetchInterval: (state) => (state.state.data && isOpen(state.state.data) ? 4_000 : false),
  });
  return query.data ?? initial;
}

/** Status line shared by the owner and creator views. */
export function PaymentSummary({ payment }: { payment: PaymentView }) {
  const amount = formatTokenUnits(payment.amount, { symbol: payment.token.symbol, decimals: payment.token.decimals });
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <PaymentBadge status={payment.status} />
        <span className="text-white/75">
          {amount} to <span className="font-mono">{shortAddress(payment.creatorAddress)}</span>
        </span>
      </div>
      {payment.status === "confirmed" && payment.explorerUrl && (
        <a href={payment.explorerUrl} target="_blank" rel="noreferrer" className="w-fit text-xs text-monad-300 underline-offset-2 hover:underline">
          View the payment on the Monad explorer
        </a>
      )}
      {payment.status !== "confirmed" && payment.statusReason && <p className="text-xs text-white/55">{payment.statusReason}</p>}
      {payment.status === "awaiting-transaction" && payment.submittedTxHash && (
        <p className="font-mono text-xs break-all text-white/45">Reported transaction {payment.submittedTxHash} (not yet verified)</p>
      )}
    </div>
  );
}

/**
 * Owner view of one accepted deliverable's payment. The wallet signs and
 * sends; the server alone decides whether the payment happened.
 */
export function PaymentPanel({
  deliverableId,
  ownerAddress,
  payment: initial,
  onChanged,
}: {
  deliverableId: string;
  ownerAddress: string;
  payment: PaymentView | null;
  onChanged: () => void;
}) {
  const config = useConfig();
  const [step, setStep] = useState<"idle" | "preparing" | "approve" | "approving" | "wallet" | "verifying">("idle");
  const queryClient = useQueryClient();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const paymentId = initial?.id ?? createdId;
  const payment = usePaymentStatus(paymentId, initial);
  const show = (view: PaymentView) => {
    queryClient.setQueryData(["payment", view.id], view);
    setCreatedId(view.id);
  };

  const pay = useMutation({
    mutationFn: async () => {
      setStep("preparing");
      const instructions = await collabsApi.preparePayment(deliverableId);
      show(instructions.payment);
      const call = instructions.call;
      if (!call) return; // Already waiting for confirmations.
      await prepareWallet(config, ownerAddress, call.chainId);

      if (instructions.approval) {
        const { token, spender, amount } = instructions.approval;
        const allowance = await readContract(config, {
          address: token as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [ownerAddress as Address, spender as Address],
          chainId: targetChain.id,
        });
        if (allowance < BigInt(amount)) {
          setStep("approve");
          const approval = await writeContract(config, {
            address: token as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender as Address, BigInt(amount)],
            chainId: targetChain.id,
          });
          setStep("approving");
          const receipt = await waitForTransactionReceipt(config, { hash: approval, chainId: targetChain.id });
          if (receipt.status !== "success") throw new Error("The token approval reverted. No payment was sent.");
        }
      }

      setStep("wallet");
      let hash: Hash;
      if (call.functionName === "payNative") {
        const [campaignId, creator, ref] = call.args;
        hash = await writeContract(config, {
          address: call.address as Address,
          abi: campaignPaymentsAbi,
          functionName: "payNative",
          args: [campaignId as Hex, creator as Address, ref as Hex],
          value: BigInt(call.value),
          chainId: targetChain.id,
        });
      } else {
        const [campaignId, token, creator, amount, ref] = call.args;
        hash = await writeContract(config, {
          address: call.address as Address,
          abi: campaignPaymentsAbi,
          functionName: "payToken",
          args: [campaignId as Hex, token as Address, creator as Address, BigInt(amount), ref as Hex],
          chainId: targetChain.id,
        });
      }
      setStep("verifying");
      const reported = await collabsApi.reportPayment(instructions.payment.id, hash);
      show(reported.payment);
    },
    onSettled: () => {
      setStep("idle");
      onChanged();
    },
  });

  const recheck = useMutation({
    mutationFn: async () => (await collabsApi.payment(payment!.id)).payment,
    onSuccess: show,
  });

  const status = payment?.status ?? "awaiting-transaction";
  const canPay = status === "awaiting-transaction" || status === "failed";
  /** A hash was reported but no matching event has been found yet. */
  const reported = status === "awaiting-transaction" && Boolean(payment?.submittedTxHash);
  const label =
    step === "preparing"
      ? "Preparing…"
      : step === "approve"
        ? "Approve the token in your wallet…"
        : step === "approving"
          ? "Waiting for the approval…"
          : step === "wallet"
            ? "Confirm the payment in your wallet…"
            : step === "verifying"
              ? "Verifying on Monad…"
              : status === "failed"
                ? "Try the payment again"
                : "Pay creator";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Payment">
      {payment ? <PaymentSummary payment={payment} /> : <p className="text-sm text-white/65">Not paid yet.</p>}
      {status === "mismatch" && (
        <p className="text-sm text-red-300">
          A payment with the wrong recipient, token, or amount was recorded for this deliverable. Do not pay again until it is resolved.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canPay && (
          <button
            type="button"
            className={reported && !pay.isPending ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
            disabled={pay.isPending}
            onClick={() => pay.mutate()}
          >
            {reported && step === "idle" ? "Send a new transaction" : label}
          </button>
        )}
        {payment && (status === "pending-confirmation" || reported) && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
            {recheck.isPending ? "Checking…" : "Check now"}
          </button>
        )}
      </div>
      {(pay.error || recheck.error) && (
        <p role="alert" className="text-sm text-red-300">
          {describe(pay.error ?? recheck.error)}
        </p>
      )}
      {reported && !pay.isPending && (
        <p className="text-xs text-crayon-yellow">
          Only send a new transaction if your wallet shows the first one was dropped or replaced. Two successful transactions pay the
          creator twice.
        </p>
      )}
      {canPay && !reported && (
        <p className="text-xs text-white/45">
          Paid directly from your wallet to the creator through the CampaignPayments contract. Payment is marked as done only after the
          server verifies the event on Monad.
        </p>
      )}
    </div>
  );
}
