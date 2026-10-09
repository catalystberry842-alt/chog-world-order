import { explorerTxUrl } from "@/lib/contracts/campaign-payments";
import { isPaymentTokenKey, paymentTokens } from "@/lib/collabs/tokens";
import type { PaymentView } from "@/lib/collabs/types";
import type { PaymentRecord } from "@/server/payments/store";

export function toPaymentView(payment: PaymentRecord): PaymentView {
  const token = isPaymentTokenKey(payment.tokenKey) ? paymentTokens[payment.tokenKey] : paymentTokens.MON;
  return {
    id: payment.id,
    deliverableId: payment.deliverableId,
    campaignId: payment.campaignId,
    status: payment.status,
    chainId: payment.chainId,
    contractAddress: payment.contractAddress,
    token: { key: token.key, symbol: token.symbol, decimals: token.decimals, address: payment.tokenAddress },
    amount: payment.amount.toString(),
    creatorAddress: payment.creatorAddress,
    payerAddress: payment.payerAddress,
    deliverableRef: payment.deliverableRef,
    submittedTxHash: payment.submittedTxHash,
    txHash: payment.txHash,
    logIndex: payment.logIndex,
    blockNumber: payment.blockNumber?.toString() ?? null,
    explorerUrl: payment.txHash ? explorerTxUrl(payment.txHash) : null,
    statusReason: payment.failureReason,
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
  };
}
