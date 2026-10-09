/**
 * MOCK DATA — sample evidence records for the labelled sample passports.
 *
 * Every record is invented. References are plain labels with no links and no
 * transaction hashes, so nothing here can be mistaken for real activity.
 * "verified" means "pretend a reviewer or the chain confirmed it" and is
 * always rendered with a sample-data label.
 */
import type { EvidenceKind, VerificationStatus } from "@/lib/passport/types";
import type { Address } from "@/lib/types";

export type MockEvidence = {
  id: string;
  holder: Address;
  kind: EvidenceKind;
  status: VerificationStatus;
  title: string;
  summary: string;
  referenceLabel: string;
  statusReason: string | null;
  /** YYYY-MM-DD */
  occurredAt: string;
  /** YYYY-MM-DD, set for verified records */
  verifiedAt: string | null;
};

let sequence = 0;

function e(
  holder: string,
  kind: EvidenceKind,
  status: VerificationStatus,
  occurredAt: string,
  title: string,
  summary: string,
  referenceLabel: string,
  extra: { verifiedAt?: string; statusReason?: string } = {},
): MockEvidence {
  sequence += 1;
  return {
    id: `mock-evidence-${String(sequence).padStart(3, "0")}`,
    holder: `0xc4060000000000000000000000000000000000${holder}` as Address,
    kind,
    status,
    title,
    summary,
    referenceLabel: `${referenceLabel} · sample`,
    statusReason: extra.statusReason ?? null,
    occurredAt,
    verifiedAt: status === "verified" ? (extra.verifiedAt ?? occurredAt) : null,
  };
}

export const mockEvidence: MockEvidence[] = [
  // Margin Note — community art, a campaign, steady weekly activity
  e("01", "community-contribution", "verified", "2026-06-01", "Sticker pack for a wallet launch",
    "Twelve hand-drawn launch stickers for a community wallet.", "Design file · 12 stickers"),
  e("01", "campaign-deliverable", "verified", "2026-06-10", "Campaign: launch-week sticker set",
    "Delivered through a Collab Board campaign and accepted by the project.", "Deliverable · sticker-pack"),
  e("01", "community-contribution", "verified", "2026-07-20", "Weekly art jam hosting",
    "Co-hosted four community art jams with prompt boards and recaps.", "Event notes · 4 sessions"),
  e("01", "community-contribution", "verified", "2026-08-04", "Onboarding comic: your first transaction",
    "Six-panel comic explaining wallets, gas, and confirmations.", "Comic thread · 6 panels"),
  e("01", "onchain-interaction", "verified", "2026-09-02", "Minted a community art edition",
    "Interaction with a supported Monad art app.", "Transaction · sample, not on-chain"),
  e("01", "community-contribution", "pending", "2026-10-02", "Chog emote set",
    "Twenty Discord emotes in the crayon style.", "Emote pack · 20 PNG"),

  // Stamp Duty — builder
  e("02", "code-contribution", "verified", "2026-05-12", "Gas snapshot CI action",
    "Open-source action that comments gas diffs on pull requests.", "Repository release · v1.2"),
  e("02", "code-contribution", "verified", "2026-08-26", "Invariant test suite for an AMM fork",
    "42 Foundry invariant tests that caught a rounding bug before launch.", "Pull request · +1,840 lines"),
  e("02", "research-contribution", "verified", "2026-06-30", "Reentrancy review checklist",
    "Public checklist for reviewing contracts targeting Monad.", "Document · 3,200 words"),
  e("02", "community-contribution", "rejected", "2026-09-15", "Audit office hours",
    "Answered contract security questions for small teams.", "Event log · 6 sessions",
    { statusReason: "No session notes were linked. Resubmit with recordings or notes." }),
  e("02", "onchain-interaction", "verified", "2026-09-20", "Provided liquidity on a supported DEX",
    "Interaction with a supported Monad DeFi app.", "Transaction · sample, not on-chain"),

  // Pink Margin — community
  e("03", "community-contribution", "verified", "2026-07-14", "New-member welcome flow",
    "Discord onboarding questions and role picker.", "Flow spec · Discord setup"),
  e("03", "community-contribution", "verified", "2026-09-05", "Builder call notes archive",
    "Twelve weekly builder calls turned into searchable notes.", "Notes archive · 12 calls"),
  e("03", "research-contribution", "pending", "2026-09-29", "Contributor survey analysis",
    "Survey of 200 contributors on what keeps them active.", "Report draft · 14 pages"),

  // Night Scribble — writer across many weeks
  e("04", "community-contribution", "verified", "2026-04-09", "Glossary for new builders",
    "120-term glossary covering EVM, Monad, and DeFi vocabulary.", "Glossary · 120 terms"),
  e("04", "code-contribution", "verified", "2026-06-18", "Docs link and snippet sweep",
    "Fixed 63 broken links and outdated snippets across ecosystem docs.", "3 pull requests · merged"),
  e("04", "community-contribution", "verified", "2026-07-30", "wagmi on Monad quickstart",
    "Step-by-step guide to connecting a Next.js app to Monad.", "Tutorial · code samples"),
  e("04", "research-contribution", "verified", "2026-09-10", "Parallel execution, explained slowly",
    "Long-form explainer on optimistic parallel execution.", "Article · 4,100 words"),
  e("04", "campaign-deliverable", "verified", "2026-09-24", "Campaign: launch explainer copy",
    "Accepted campaign deliverable for a launch announcement.", "Deliverable · explainer-copy"),

  // Gas Garden — research
  e("05", "research-contribution", "verified", "2026-08-06", "Dapp retention dashboard",
    "Cohort retention for the top 30 dapps by weekly active addresses.", "Dashboard · 14 charts"),
  e("05", "research-contribution", "verified", "2026-10-01", "Gas usage report, Q3",
    "Quarterly report on gas trends and contract hotspots.", "Report · 22 pages"),
  e("05", "onchain-interaction", "unavailable", "2026-09-21", "Swap on an unlisted app",
    "Claimed interaction with an app that is not on the supported list.", "Transaction · sample",
    { statusReason: "This app is not a supported verification source yet." }),

  // Purple Pixel — builder
  e("06", "code-contribution", "verified", "2026-06-25", "Next.js + Monad starter kit",
    "Template with wagmi, viem, and Tailwind preconfigured for Monad.", "Repository · template"),
  e("06", "code-contribution", "verified", "2026-08-15", "Accessible connect-wallet component",
    "Wallet modal with EIP-6963 discovery and keyboard support.", "Pull request · merged"),
  e("06", "code-contribution", "pending", "2026-09-12", "Transaction toast library",
    "Pending, confirmed, and failed transaction toasts.", "npm package · v0.4"),

  // Loop Clip — campaign + community
  e("07", "campaign-deliverable", "verified", "2026-09-08", "Campaign: meetup recap reel",
    "Two-minute recap video, accepted by the project.", "Deliverable · meetup-recap-reel"),
  e("07", "community-contribution", "verified", "2026-07-28", "60-second Monad explainer",
    "Short animated explainer on what makes Monad fast.", "Video · 0:58"),
  e("07", "community-contribution", "pending", "2026-10-04", "Motion pack for stamp reveals",
    "Animated stamp-reveal loops.", "6 loops · MP4"),

  // Quiet Fork — newcomer
  e("08", "community-contribution", "verified", "2026-09-19", "Spanish translation of the quickstart",
    "Translated the wagmi on Monad quickstart into Spanish.", "Translation · 2,300 words"),
  e("08", "community-contribution", "pending", "2026-10-05", "Portuguese glossary draft",
    "First pass at a Portuguese builder glossary.", "Draft · 80 terms"),
];
