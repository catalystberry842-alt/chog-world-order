import type { EvidenceReference } from "@/lib/passport/types";
import type { EvidenceRecord } from "@/server/passport/store";

const EXPLORER_TX_URL = "https://monadscan.com/tx/";

/** Public pointer to a piece of evidence. Never includes the dedupe key or reviewer data. */
export function evidenceReference(record: Pick<EvidenceRecord, "kind" | "reference" | "txHash" | "chainId">): EvidenceReference {
  if (record.kind === "onchain-interaction" && record.txHash) {
    return {
      label: `Transaction ${record.txHash.slice(0, 10)}…${record.txHash.slice(-6)}`,
      url: `${EXPLORER_TX_URL}${record.txHash}`,
      txHash: record.txHash,
      chainId: record.chainId,
    };
  }
  if (record.kind === "campaign-deliverable") {
    return { label: `Deliverable · ${record.reference}`, url: null, txHash: null, chainId: null };
  }
  // Off-chain references were canonicalised to https URLs at submission.
  const url = record.reference.startsWith("https://") ? record.reference : null;
  const label = url ? url.replace(/^https:\/\//, "").slice(0, 80) : record.reference.slice(0, 80);
  return { label, url, txHash: null, chainId: null };
}
