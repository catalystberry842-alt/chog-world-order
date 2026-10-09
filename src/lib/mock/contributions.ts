/**
 * MOCK DATA — sample contribution history for Phase 1.
 *
 * These records are invented. "peer-reviewed" here means "pretend a reviewer
 * accepted it" so the UI has realistic states to show. No record is marked
 * "onchain-verified", because nothing in Phase 1 is verified on Monad.
 */
import type { Address, Contribution } from "@/lib/types";

let sequence = 0;

function c(
  holder: string,
  entry: Omit<Contribution, "id" | "contributor" | "source">,
): Contribution {
  sequence += 1;
  return {
    id: `mock-contribution-${String(sequence).padStart(3, "0")}`,
    contributor: `0xc4060000000000000000000000000000000000${holder}` as Address,
    source: "mock",
    ...entry,
  };
}

export const mockContributions: Contribution[] = [
  // Margin Note
  c("01", {
    title: "Passport stamp illustration set",
    summary: "Drew ten crayon stamp motifs used across the passport prototype.",
    category: "design",
    status: "peer-reviewed",
    basePoints: 80,
    date: "2026-09-18",
    evidence: { kind: "design-file", label: "Figma file · 10 frames" },
  }),
  c("01", {
    title: "Onboarding comic: your first Monad transaction",
    summary: "Six-panel comic explaining wallets, gas, and confirmations for newcomers.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 50,
    date: "2026-08-04",
    evidence: { kind: "post", label: "Comic thread · 6 panels" },
  }),
  c("01", {
    title: "Sticker pack for wallet launch",
    summary: "Delivered twelve sticker designs through a Collab Board campaign.",
    category: "design",
    status: "peer-reviewed",
    basePoints: 60,
    date: "2026-06-01",
    evidence: { kind: "design-file", label: "Sticker sheet · SVG + PNG" },
  }),
  c("01", {
    title: "Weekly art jam hosting",
    summary: "Co-hosted four community art jams with prompt boards and recaps.",
    category: "community",
    status: "peer-reviewed",
    basePoints: 40,
    date: "2026-07-20",
    evidence: { kind: "event", label: "4 events · recap notes" },
  }),
  c("01", {
    title: "Chog emote set",
    summary: "Twenty Discord emotes in the crayon style. Waiting on review.",
    category: "design",
    status: "pending-review",
    basePoints: 30,
    date: "2026-10-02",
    evidence: { kind: "design-file", label: "Emote pack · 20 PNG" },
  }),

  // Stamp Duty
  c("02", {
    title: "Invariant test suite for an AMM fork",
    summary: "Wrote 42 Foundry invariant tests that caught a rounding bug before launch.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 90,
    date: "2026-08-26",
    evidence: { kind: "pull-request", label: "PR · +1,840 lines of tests" },
  }),
  c("02", {
    title: "Reentrancy review checklist",
    summary: "Public checklist for reviewing Solidity contracts targeting Monad.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 45,
    date: "2026-06-30",
    evidence: { kind: "document", label: "Checklist · 3,200 words" },
  }),
  c("02", {
    title: "Gas snapshot CI action",
    summary: "Open-source GitHub Action that comments gas diffs on pull requests.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 70,
    date: "2026-05-12",
    evidence: { kind: "pull-request", label: "Repository · v1.2 release" },
  }),
  c("02", {
    title: "Audit office hours",
    summary: "Answered contract security questions for small teams twice a month.",
    category: "community",
    status: "self-reported",
    basePoints: 40,
    date: "2026-09-15",
    evidence: { kind: "event", label: "Self-reported · 6 sessions" },
  }),

  // Pink Margin
  c("03", {
    title: "Builder call notes archive",
    summary: "Turned twelve weekly builder calls into searchable written notes.",
    category: "community",
    status: "peer-reviewed",
    basePoints: 70,
    date: "2026-09-05",
    evidence: { kind: "document", label: "Notes archive · 12 calls" },
  }),
  c("03", {
    title: "New-member welcome flow",
    summary: "Designed the Discord onboarding questions and role picker.",
    category: "community",
    status: "peer-reviewed",
    basePoints: 45,
    date: "2026-07-14",
    evidence: { kind: "document", label: "Flow spec · Discord setup" },
  }),
  c("03", {
    title: "Contributor spotlight series",
    summary: "Weekly short interviews with contributors across the ecosystem.",
    category: "content",
    status: "pending-review",
    basePoints: 40,
    date: "2026-09-29",
    evidence: { kind: "post", label: "Series · 5 posts" },
  }),
  c("03", {
    title: "Meetup co-organiser",
    summary: "Helped run an in-person meetup with 80 attendees.",
    category: "community",
    status: "self-reported",
    basePoints: 50,
    date: "2026-08-22",
    evidence: { kind: "event", label: "Self-reported · 1 event" },
  }),

  // Night Scribble
  c("04", {
    title: "Parallel execution, explained slowly",
    summary: "Long-form explainer on optimistic parallel execution for non-engineers.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 70,
    date: "2026-09-10",
    evidence: { kind: "document", label: "Article · 4,100 words" },
  }),
  c("04", {
    title: "wagmi on Monad quickstart",
    summary: "Step-by-step guide to connecting a Next.js app to Monad with wagmi and viem.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 60,
    date: "2026-07-30",
    evidence: { kind: "document", label: "Tutorial · code samples" },
  }),
  c("04", {
    title: "Docs typo and link sweep",
    summary: "Fixed 63 broken links and outdated snippets across ecosystem docs.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 35,
    date: "2026-06-18",
    evidence: { kind: "pull-request", label: "3 PRs · merged" },
  }),
  c("04", {
    title: "Glossary for new builders",
    summary: "120-term glossary covering EVM, Monad, and DeFi vocabulary.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 45,
    date: "2026-04-09",
    evidence: { kind: "document", label: "Glossary · 120 terms" },
  }),
  c("04", {
    title: "Research notes on MEV",
    summary: "Reading notes on MEV under fast block times.",
    category: "research",
    status: "self-reported",
    basePoints: 30,
    date: "2026-08-15",
    evidence: { kind: "document", label: "Self-reported · notes" },
  }),

  // Gas Garden
  c("05", {
    title: "Dapp retention dashboard",
    summary: "Cohort retention for the top 30 dapps by weekly active addresses.",
    category: "research",
    status: "peer-reviewed",
    basePoints: 75,
    date: "2026-08-06",
    evidence: { kind: "document", label: "Dashboard · 14 charts" },
  }),
  c("05", {
    title: "Gas usage report, Q3",
    summary: "Quarterly report on gas trends and contract hotspots.",
    category: "research",
    status: "peer-reviewed",
    basePoints: 60,
    date: "2026-10-01",
    evidence: { kind: "document", label: "Report · 22 pages" },
  }),
  c("05", {
    title: "Data office hours",
    summary: "Helped five projects write their first analytics queries.",
    category: "community",
    status: "pending-review",
    basePoints: 30,
    date: "2026-09-21",
    evidence: { kind: "event", label: "5 sessions · notes pending" },
  }),

  // Purple Pixel
  c("06", {
    title: "Open-source connect-wallet component",
    summary: "Accessible wallet modal with EIP-6963 discovery and keyboard support.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 80,
    date: "2026-08-15",
    evidence: { kind: "pull-request", label: "Repository · 140 stars" },
  }),
  c("06", {
    title: "Next.js + Monad starter kit",
    summary: "Template with wagmi, viem, and Tailwind preconfigured for Monad.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 60,
    date: "2026-06-25",
    evidence: { kind: "pull-request", label: "Repository · template" },
  }),
  c("06", {
    title: "Transaction toast library",
    summary: "Tiny library for pending, confirmed, and failed transaction toasts.",
    category: "development",
    status: "peer-reviewed",
    basePoints: 45,
    date: "2026-05-02",
    evidence: { kind: "pull-request", label: "npm package · v0.4" },
  }),
  c("06", {
    title: "UI kit icon set",
    summary: "Forty line icons for wallet and DeFi interfaces.",
    category: "design",
    status: "self-reported",
    basePoints: 30,
    date: "2026-09-12",
    evidence: { kind: "design-file", label: "Self-reported · icon set" },
  }),

  // Loop Clip
  c("07", {
    title: "Meetup recap reel",
    summary: "Two-minute recap video of a community meetup, delivered via the Collab Board.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 55,
    date: "2026-09-08",
    evidence: { kind: "video", label: "Video · 2:04" },
    campaignId: "meetup-recap-reel",
  }),
  c("07", {
    title: "60-second Monad explainer",
    summary: "Short animated explainer on what makes Monad fast.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 50,
    date: "2026-07-28",
    evidence: { kind: "video", label: "Video · 0:58" },
  }),
  c("07", {
    title: "Motion pack for stamp reveals",
    summary: "Animated stamp-reveal loops. Submitted, not yet reviewed.",
    category: "design",
    status: "pending-review",
    basePoints: 35,
    date: "2026-10-04",
    evidence: { kind: "video", label: "6 loops · MP4" },
  }),

  // Quiet Fork
  c("08", {
    title: "Spanish translation of the quickstart",
    summary: "Translated the wagmi on Monad quickstart into Spanish.",
    category: "content",
    status: "peer-reviewed",
    basePoints: 35,
    date: "2026-09-19",
    evidence: { kind: "document", label: "Translation · 2,300 words" },
  }),
  c("08", {
    title: "Portuguese glossary draft",
    summary: "First pass at a Portuguese version of the builder glossary.",
    category: "content",
    status: "pending-review",
    basePoints: 30,
    date: "2026-10-05",
    evidence: { kind: "document", label: "Draft · 80 terms" },
  }),
];
