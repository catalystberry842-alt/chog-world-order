# Chog World Order

Passports, contribution reputation, and paid collaborations for people building in the Monad ecosystem.

**Contribute → Verify → Build reputation → Get hired → Complete work → Get paid.**

- **Chog Passport**: a wallet-based identity with illustrated crayon stamps, verified activity, and contribution history. NFT ownership is optional.
- **Contribution Reputation**: a transparent score where every point traces back to a contribution, a stamp, or a completed collab.
- **Collab Board**: projects publish paid campaigns, creators apply, submit work, and get paid.

## Status: Phase 1 (frontend foundation)

This phase is the frontend only. Keep these limits in mind:

- **All data is mock data.** Campaigns, contributors, stamps, and scores live in `src/lib/mock/` and are labelled as sample data in the UI. No contribution is marked as verified on-chain.
- **Wallet connection is real but is not authentication.** Browser wallets connect through wagmi/viem on Monad mainnet (chain 143). This only shares a public address. Nothing is signed, no session is created, and the app never asks for seed phrases or private keys.
- **No backend, contracts, or payments yet.** Campaign applications pass validation but are never sent. There is no database, no token, and no deployed contract.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Partial Prefetching) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Wallet | wagmi 3, viem 2, TanStack Query 5 (injected / EIP-6963 wallets) |
| Planned | PostgreSQL + Prisma, Solidity + Foundry + OpenZeppelin |

## Requirements

- Node.js 22 or newer (20.9+ is the minimum for Next.js 16)
- npm 10+
- A browser wallet extension, if you want to try connecting a wallet. Every page works without one.

## Install and run

```bash
npm install        # or: npm ci, to install exactly what's in the lockfile
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

No environment variables are needed in Phase 1.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | Generate route types, then run `tsc --noEmit` |

## Routes

| Path | What it shows |
| --- | --- |
| `/` | Landing page: the three pillars, the contributor journey, featured campaigns |
| `/passport` | Wallet connection prompt, then a sample passport: stamps, reputation preview, contribution history |
| `/collabs` | Campaign discovery with search, category chips, status, budget range, and sorting |
| `/collabs/[id]` | Campaign brief, requirements, budget, deadline, and the application form |
| `/leaderboard` | Rankings by overall score or by category, with a per-contributor breakdown and the full formula |
| `/profile/[address]` | Public profile for any address. Handles invalid addresses and addresses with no activity |

Sample profiles use obviously fake addresses such as `0xc406000000000000000000000000000000000001`.

## Project structure

```text
src/
  app/                      Routes (App Router), plus error.tsx and not-found.tsx
  components/
    layout/                 Site header (desktop + mobile nav) and footer
    ui/                     Badges, avatar, page headers, empty/error/loading states,
                            crayon SVG filters, mascot illustration
    passport/               PassportStamp, StampCollection, PassportCover,
                            ReputationPreview / ScoreBar, ContributionHistory
    campaigns/              CampaignCard, CampaignBrowser (search + filters),
                            ApplicationPanel, status badge, project mark
    leaderboard/            LeaderboardList, ScoringRules
    wallet/                 wagmi providers, ConnectButton, WalletDialog,
                            hydration-safe useWallet hook
  lib/
    types.ts                Shared data types
    data.ts                 Data-access layer (mock today, Prisma in Phase 2)
    mock/                   MOCK DATA: campaigns, contributors, contributions, stamps
    reputation.ts           Scoring formula and weights
    campaign-filters.ts     Pure search, filter, and sort logic
    wagmi.ts                Wallet config (Monad mainnet, injected connector)
    format.ts, labels.ts    Formatting helpers and display labels
```

Pages read data only through `src/lib/data.ts`, so switching to a database means changing that one module.

## How reputation is calculated

```text
score = Σ (contribution base points × status multiplier)
      + 50 × collabs completed
      + Σ stamp points (common 10, rare 25, legendary 50)
```

| Status | Multiplier |
| --- | --- |
| Verified on-chain | ×1 |
| Peer reviewed | ×1 |
| Self-reported | ×0.25 |
| Pending review | ×0 |

The weights live in `src/lib/reputation.ts`. The leaderboard's "How scores work" panel is rendered from the same constants.
